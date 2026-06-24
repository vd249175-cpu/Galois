import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn, ChildProcess } from 'child_process';
import { pathToFileURL } from 'url';

// Register dnote-file as a privileged scheme to load local media and bypass Content Security Policy
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'dnote-file',
    privileges: {
      standard: true,
      bypassCSP: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
const secondaryWindows = new Map<string, BrowserWindow>();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'DNOTE Workspace',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load Vite dev server in development, built index.html in production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Close all secondary windows when main window is closed
    for (const [_, win] of secondaryWindows) {
      win.close();
    }
    secondaryWindows.clear();
  });
}

app.whenReady().then(() => {
  // Handle local protocol dnote-file:/// requests securely using pathToFileURL
  protocol.handle('dnote-file', (request) => {
    try {
      const urlStr = request.url;
      const decodedUrl = decodeURIComponent(urlStr);
      // Replace protocol prefix with a single slash to ensure absolute path on macOS/Linux
      let filePath = decodedUrl.replace(/^dnote-file:\/\/\/?/, '/');
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
        filePath = filePath.substring(1);
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error('[dnote-file] File not found:', filePath);
        return new Response('File Not Found', { status: 404 });
      }

      const stat = fs.statSync(filePath);
      const totalSize = stat.size;
      const rangeHeader = request.headers.get('range');

      // Guess Content-Type based on extension
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.mp4') contentType = 'video/mp4';
      else if (ext === '.webm') contentType = 'video/webm';
      else if (ext === '.ogg') contentType = 'video/ogg';
      else if (ext === '.mp3') contentType = 'audio/mpeg';
      else if (ext === '.wav') contentType = 'audio/wav';
      else if (ext === '.m4a') contentType = 'audio/mp4';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      else if (ext === '.webp') contentType = 'image/webp';

      if (rangeHeader) {
        // Parse Range Header: "bytes=start-end"
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        const chunkStart = Math.max(0, isNaN(start) ? 0 : start);
        const chunkEnd = Math.min(totalSize - 1, isNaN(end) ? totalSize - 1 : end);
        const chunkSize = chunkEnd - chunkStart + 1;

        console.log('[dnote-file Range Read]', { filePath, chunkStart, chunkEnd, chunkSize });

        // Synchronously read the chunk buffer to ensure Electron's Chromium network layer 
        // doesn't close or fail on asynchronous stream lifecycle events.
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(chunkSize);
        fs.readSync(fd, buffer, 0, chunkSize, chunkStart);
        fs.closeSync(fd);

        return new Response(buffer, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize)
          }
        });
      } else {
        // Serve full file using electron's native C++ net.fetch (zero-copy and highly optimized)
        console.log('[dnote-file Full Read]', { filePath, totalSize });
        const fileUrl = pathToFileURL(filePath).toString();
        return net.fetch(fileUrl, { bypassCustomProtocolHandlers: true });
      }
    } catch (err: any) {
      console.error('[dnote-file handler error]', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Filesystem APIs
ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to read file: ${err.message}`);
  }
});

ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  try {
    console.log('[fs:writeFile] Writing file:', filePath, 'content length:', content.length);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err: any) {
    console.error('[fs:writeFile] Error writing file:', filePath, err);
    throw new Error(`Failed to write file: ${err.message}`);
  }
});

ipcMain.handle('fs:deleteFile', async (_, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (err: any) {
    throw new Error(`Failed to delete file: ${err.message}`);
  }
});

ipcMain.handle('fs:listDir', async (_, dirPath: string) => {
  try {
    const items = fs.readdirSync(dirPath);
    return items.map((name) => {
      const fullPath = path.join(dirPath, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        path: fullPath,
        isDir: stat.isDirectory(),
        size: stat.size,
      };
    });
  } catch (err: any) {
    throw new Error(`Failed to list directory: ${err.message}`);
  }
});

// Native folder opener dialog IPC handler
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Project Directory',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Drag and drop media auto-archiving IPC handler
ipcMain.handle('fs:archiveMedia', async (_, { srcPath, projectPath }: { srcPath: string; projectPath: string }) => {
  try {
    const destDir = path.join(projectPath, 'media');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Extract base filename and sanitize it
    const baseName = path.basename(srcPath);
    let destPath = path.join(destDir, baseName);
    
    // Prevent name collisions
    if (fs.existsSync(destPath)) {
      const ext = path.extname(baseName);
      const nameWithoutExt = path.basename(baseName, ext);
      destPath = path.join(destDir, `${nameWithoutExt}_${Date.now()}${ext}`);
    }
    
    fs.copyFileSync(srcPath, destPath);
    // Return relative path from projectPath (e.g., 'media/pic.png') for Markdown embedding
    return path.relative(projectPath, destPath);
  } catch (err: any) {
    throw new Error(`Failed to archive media: ${err.message}`);
  }
});

// IPC Exec/Shell API
// IPC Exec/Shell API helper to run with extended PATH
function getSecureEnv() {
  const userEnv = { ...process.env };
  const homeDir = os.homedir();
  const commonPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${homeDir}/.local/bin`,
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];
  const existingPath = userEnv.PATH || '';
  const allPaths = Array.from(new Set([
    ...existingPath.split(':'),
    ...commonPaths
  ])).filter(Boolean);
  
  userEnv.PATH = allPaths.join(':');
  return userEnv;
}

ipcMain.handle('shell:exec', async (_, command: string, cwd: string) => {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, env: getSecureEnv() }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
});

ipcMain.handle('shell:openTerminal', async (_, dirPath: string) => {
  try {
    if (process.platform === 'darwin') {
      exec(`open -a Terminal "${dirPath}"`);
    } else if (process.platform === 'win32') {
      exec(`start cmd`, { cwd: dirPath });
    } else {
      exec(`x-terminal-emulator`, { cwd: dirPath });
    }
    return true;
  } catch (err: any) {
    throw new Error(`Failed to open terminal: ${err.message}`);
  }
});

ipcMain.handle('shell:openAgentTerminal', async (_, dirPath: string) => {
  try {
    if (process.platform === 'darwin') {
      const escapedPath = dirPath.replace(/"/g, '\\"');
      const applescript = `tell application "Terminal"
        activate
        do script "cd \\"${escapedPath}\\" && clear && agy"
      end tell`;
      exec(`osascript -e '${applescript}'`);
    } else if (process.platform === 'win32') {
      exec(`start cmd /k "cd /d "${dirPath}" && agy"`);
    } else {
      exec(`x-terminal-emulator -e "bash -c 'cd \\"${dirPath}\\" && agy; exec bash'"`);
    }
    return true;
  } catch (err: any) {
    throw new Error(`Failed to open agent terminal: ${err.message}`);
  }
});

// Generic script runner — replaces plugin-specific calculateLattice IPC
// Plugins pass their own scriptPath; CORE stays business-logic-free
ipcMain.handle('shell:runScript', async (_, scriptPath: string, stdinPayload: string, cwd: string) => {
  return new Promise((resolve) => {
    const child = exec(`uv run "${scriptPath}"`, { cwd: cwd || path.dirname(scriptPath), env: getSecureEnv() }, (error, stdout, stderr) => {
      if (error && !stdout) {
        console.error('[shell:runScript Error]', scriptPath, stderr || error.message);
        resolve({ stdout: '[]', stderr: stderr || error.message });
      } else {
        resolve({ stdout, stderr });
      }
    });
    if (stdinPayload) {
      child.stdin?.write(stdinPayload);
      child.stdin?.end();
    }
  });
});

// Resolve the absolute path of a service script inside an APP plugin folder
// e.g. getServiceScriptPath('graph-view', 'lattice.py') => APP/graph-view/services/lattice.py
ipcMain.handle('shell:getServiceScriptPath', async (_, pluginFolder: string, scriptName: string) => {
  return path.join(app.getAppPath(), 'APP', pluginFolder, 'services', scriptName);
});

// IPC Window Manager APIs for Popped-out panels
ipcMain.handle('window:openSecondary', async (_, { id, componentType, title }: { id: string; componentType: string; title: string }) => {
  if (secondaryWindows.has(id)) {
    secondaryWindows.get(id)?.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 600,
    height: 400,
    title: title || 'Workspace Pane',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const queryParams = `?popped=true&areaId=${id}&type=${componentType}`;
  if (process.env.NODE_ENV === 'development') {
    win.loadURL(`http://localhost:5173/${queryParams}`);
  } else {
    win.loadFile(path.join(__dirname, '../index.html'), { hash: queryParams });
  }

  win.on('closed', () => {
    secondaryWindows.delete(id);
    if (mainWindow) {
      mainWindow.webContents.send('window:secondaryClosed', id);
    }
  });

  secondaryWindows.set(id, win);
});

ipcMain.handle('window:closeSecondary', async (_, id: string) => {
  const win = secondaryWindows.get(id);
  if (win) {
    win.close();
  }
});

// Shared Blood state store across windows
let sharedState: Record<string, any> = {};

ipcMain.handle('blood:getInitialState', () => {
  return sharedState;
});

ipcMain.handle('blood:updateState', (event, values: Record<string, any>) => {
  sharedState = { ...sharedState, ...values };
  console.log('[Blood Main Sync] State updated:', JSON.stringify(values));
  
  // Broadcast updates to all other open windows
  const senderWebContents = event.sender;
  
  const broadcast = (win: BrowserWindow) => {
    if (!win.isDestroyed() && win.webContents !== senderWebContents) {
      win.webContents.send('blood:stateChanged', values);
    }
  };
  
  if (mainWindow) {
    broadcast(mainWindow);
  }
  for (const [_, win] of secondaryWindows) {
    broadcast(win);
  }
});

const terminalProcesses = new Map<string, ChildProcess>();

ipcMain.handle('terminal:spawn', (event, id: string, cwd: string) => {
  if (terminalProcesses.has(id)) {
    return true;
  }

  const shell = process.platform === 'win32' ? 'cmd.exe' : 'zsh';
  const shellArgs = process.platform === 'darwin' ? ['-l', '-i'] : (process.platform === 'linux' ? ['-i'] : []);

  try {
    const child = spawn(shell, shellArgs, {
      cwd: cwd || os.homedir(),
      env: getSecureEnv(),
      shell: false
    });

    child.stdout?.on('data', (data) => {
      event.sender.send(`terminal:output:${id}`, data.toString());
    });

    child.stderr?.on('data', (data) => {
      event.sender.send(`terminal:output:${id}`, data.toString());
    });

    child.on('close', () => {
      terminalProcesses.delete(id);
      event.sender.send(`terminal:exit:${id}`);
    });

    terminalProcesses.set(id, child);
    return true;
  } catch (err: any) {
    console.error('[terminal:spawn error]', err);
    throw err;
  }
});

ipcMain.handle('terminal:write', (_, id: string, data: string) => {
  const child = terminalProcesses.get(id);
  if (child && child.stdin && !child.stdin.destroyed) {
    child.stdin.write(data);
    return true;
  }
  return false;
});

ipcMain.handle('terminal:kill', (_, id: string) => {
  const child = terminalProcesses.get(id);
  if (child) {
    child.kill();
    terminalProcesses.delete(id);
    return true;
  }
  return false;
});

app.on('will-quit', () => {
  for (const [_, child] of terminalProcesses) {
    child.kill();
  }
  terminalProcesses.clear();
});

