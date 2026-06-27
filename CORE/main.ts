import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import * as pty from 'node-pty';
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
  const statePath = path.join(app.getPath('userData'), 'window-state.json');
  let bounds: any = { width: 1200, height: 800 };
  if (fs.existsSync(statePath)) {
    try {
      bounds = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } catch (_) {}
  }

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width || 1200,
    height: bounds.height || 800,
    title: 'DNOTE Workspace',
    titleBarStyle: 'hidden',
    backgroundColor: '#121212',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const saveBounds = () => {
    try {
      if (!mainWindow) return;
      const currentBounds = mainWindow.getBounds();
      fs.writeFileSync(statePath, JSON.stringify(currentBounds, null, 2), 'utf-8');
    } catch (_) {}
  };

  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Load Vite dev server in development, built index.html in production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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

app.whenReady().then(async () => {
  await initUserData();
  // Handle local protocol dnote-file:/// requests securely using pathToFileURL
  protocol.handle('dnote-file', (request) => {
    try {
      const urlStr = request.url;
      const decodedUrl = decodeURIComponent(urlStr);
      let filePath = decodedUrl.replace(/^dnote-file:\/\/\/?/, '/').split('#')[0].split('?')[0];
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
        filePath = filePath.substring(1);
      }
      console.log('[dnote-file debug]', { urlStr, decodedUrl, filePath, exists: fs.existsSync(filePath) });

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

        console.log('[dnote-file Range Stream]', { filePath, chunkStart, chunkEnd, chunkSize });

        const stream = fs.createReadStream(filePath, { start: chunkStart, end: chunkEnd });
        return new Response(stream as any, {
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
        console.log('[dnote-file Full Stream]', { filePath, totalSize });
        const stream = fs.createReadStream(filePath);
        return new Response(stream as any, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(totalSize),
            'Accept-Ranges': 'bytes'
          }
        });
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
  app.quit();
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

ipcMain.handle('fs:renameFile', async (_, oldPath: string, newPath: string) => {
  try {
    const parentDir = path.dirname(newPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.renameSync(oldPath, newPath);
    return true;
  } catch (err: any) {
    throw new Error(`Failed to rename file: ${err.message}`);
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
    path.join(homeDir, '.cargo/bin'),
    path.join(homeDir, '.local/bin'),
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
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'APP', pluginFolder, 'services', scriptName);
  }
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
    titleBarStyle: 'hidden',
    backgroundColor: '#121212',
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
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: queryParams });
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

// NOTE: fs.watch project path watcher was intentionally removed.
// Per AGENTS.md §3: business-level file watching must be implemented inside
// APP organ components (e.g. file-tree plugin), not in CORE main process.
// The file-tree plugin broadcasts events.fileSaved.* when it saves files.

function updateSharedStateAndBroadcast(values: Record<string, any>) {
  sharedState = { ...sharedState, ...values };
  
  const broadcast = (win: BrowserWindow) => {
    if (!win.isDestroyed()) {
      win.webContents.send('blood:stateChanged', values);
    }
  };
  
  if (mainWindow) {
    broadcast(mainWindow);
  }
  for (const [_, win] of secondaryWindows) {
    broadcast(win);
  }
}

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

ipcMain.handle('app:getAppPath', () => app.getAppPath());

ipcMain.handle('app:logRendererError', (_, errorMsg: any) => {
  try {
    const logPath = path.join(app.getPath('userData'), 'renderer_error.log');
    fs.appendFileSync(logPath, JSON.stringify(errorMsg) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to log renderer error:', err);
    return false;
  }
});

ipcMain.handle('app:getDevDefault', () => {
  const docsDir = app.getPath('documents');
  const userProject = path.join(docsDir, 'DNOTE Projects', 'Getting Started');
  if (fs.existsSync(userProject)) {
    return userProject;
  }
  return app.isPackaged
    ? path.join(process.resourcesPath, 'template-project')
    : path.join(app.getAppPath(), 'template-project');
});

ipcMain.handle('app:getConfig', () => {
  const configPath = path.join(app.getPath('userData'), 'dnote.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (_) {}
  }
  return {
    theme: "default-light",
    editor: {
      fontSize: 14,
      fontFamily: "Fira Code",
      lineHeight: 1.6,
      autosaveDelay: 500
    },
    graph: {
      showOrphans: true,
      maxNodes: 500
    },
    terminal: {
      shell: "",
      fontSize: 13,
      autoStartAgy: true
    },
    appearance: {
      sidebarIconSize: 14,
      fileTreeTitleSize: 11,
      fileTreeTagSize: 8.5
    }
  };
});

ipcMain.handle('app:setConfig', (_, config: any) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'dnote.config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set config:', err);
    return false;
  }
});

ipcMain.handle('app:getShortcuts', () => {
  const shortcutsPath = path.join(app.getPath('userData'), 'shortcuts.json');
  if (fs.existsSync(shortcutsPath)) {
    try {
      return JSON.parse(fs.readFileSync(shortcutsPath, 'utf-8'));
    } catch (_) {}
  }
  return {
    "editor.save": "meta+s",
    "terminal.clear": "meta+k",
    "sidebar.toggle": "meta+b"
  };
});

ipcMain.handle('app:setShortcuts', (_, shortcuts: any) => {
  try {
    const shortcutsPath = path.join(app.getPath('userData'), 'shortcuts.json');
    fs.mkdirSync(path.dirname(shortcutsPath), { recursive: true });
    fs.writeFileSync(shortcutsPath, JSON.stringify(shortcuts, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set shortcuts:', err);
    return false;
  }
});

ipcMain.handle('app:getLayout', () => {
  const layoutPath = path.join(app.getPath('userData'), 'layout.json');
  if (fs.existsSync(layoutPath)) {
    try {
      return JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
    } catch (_) {}
  }
  return null;
});

ipcMain.handle('app:setLayout', (_, layout: any) => {
  try {
    const layoutPath = path.join(app.getPath('userData'), 'layout.json');
    fs.mkdirSync(path.dirname(layoutPath), { recursive: true });
    fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set layout:', err);
    return false;
  }
});

function copyFolderRecursiveSync(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyFolderRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function initUserData() {
  const configDir = app.getPath('userData');
  
  // 1. Initial settings config file
  const configPath = path.join(configDir, 'dnote.config.json');
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      theme: "default-light",
      editor: {
        fontSize: 14,
        fontFamily: "Fira Code",
        lineHeight: 1.6,
        autosaveDelay: 500
      },
      graph: {
        showOrphans: true,
        maxNodes: 500
      },
      terminal: {
        shell: "",
        fontSize: 13,
        autoStartAgy: true
      }
    };
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  }

  // 2. Initial shortcuts config file
  const shortcutsPath = path.join(configDir, 'shortcuts.json');
  if (!fs.existsSync(shortcutsPath)) {
    const defaultShortcuts = {
      "editor.save": "meta+s",
      "terminal.clear": "meta+k",
      "sidebar.toggle": "meta+b"
    };
    fs.writeFileSync(shortcutsPath, JSON.stringify(defaultShortcuts, null, 2), 'utf-8');
  }

  // 3. Initial project template copy
  const docsDir = app.getPath('documents');
  const dest = path.join(docsDir, 'DNOTE Projects', 'Getting Started');
  if (!fs.existsSync(dest)) {
    const src = app.isPackaged 
      ? path.join(process.resourcesPath, 'template-project')
      : path.join(app.getAppPath(), 'template-project');
    if (fs.existsSync(src)) {
      try {
        copyFolderRecursiveSync(src, dest);
        console.log('[initUserData] Copied template project to documents folder.');
      } catch (err) {
        console.error('[initUserData] Failed to copy template project:', err);
      }
    }
  }
}

// ── PTY Terminal Manager (node-pty) ──────────────────────────────────────────
// Uses a real PTY — same as VS Code, Hyper, Warp. Supports TUI apps (agy, vim, etc.)
const ptyProcesses = new Map<string, pty.IPty>();
const ptyListeners = new Map<string, pty.IDisposable>();

ipcMain.handle('terminal:spawn', (event, id: string, cwd: string, cols: number, rows: number) => {
  let ptyProcess = ptyProcesses.get(id);

  // Clean up any old listener bound to a previous (potentially destroyed) WebContents
  const oldListener = ptyListeners.get(id);
  if (oldListener) {
    oldListener.dispose();
    ptyListeners.delete(id);
  }

  if (ptyProcess) {
    // Re-bind listener to the new active window's WebContents
    const listener = ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:output:${id}`, data);
      }
    });
    ptyListeners.set(id, listener);
    return true;
  }

  let shell = 'zsh';
  if (process.platform === 'win32') {
    shell = 'cmd.exe';
  } else {
    const envShell = process.env.SHELL;
    if (envShell && fs.existsSync(envShell)) {
      shell = envShell;
    } else if (fs.existsSync('/bin/zsh')) {
      shell = '/bin/zsh';
    } else if (fs.existsSync('/bin/bash')) {
      shell = '/bin/bash';
    } else {
      shell = 'zsh';
    }
  }

  let spawnCwd = cwd;
  if (!spawnCwd || !fs.existsSync(spawnCwd)) {
    spawnCwd = os.homedir();
  }

  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: spawnCwd,
      env: getSecureEnv() as Record<string, string>,
    });

    const listener = ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:output:${id}`, data);
      }
    });
    ptyListeners.set(id, listener);

    ptyProcess.onExit(() => {
      ptyProcesses.delete(id);
      const listenerToDispose = ptyListeners.get(id);
      if (listenerToDispose) {
        listenerToDispose.dispose();
        ptyListeners.delete(id);
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:exit:${id}`);
      }
    });

    ptyProcesses.set(id, ptyProcess);
    return true;
  } catch (err: any) {
    console.error('[terminal:spawn pty error]', err);
    throw err;
  }
});

ipcMain.handle('terminal:write', (_, id: string, data: string) => {
  const ptyProcess = ptyProcesses.get(id);
  if (ptyProcess) {
    ptyProcess.write(data);
    return true;
  }
  return false;
});

ipcMain.handle('terminal:resize', (_, id: string, cols: number, rows: number) => {
  const ptyProcess = ptyProcesses.get(id);
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
    return true;
  }
  return false;
});

ipcMain.handle('terminal:kill', (_, id: string) => {
  const ptyProcess = ptyProcesses.get(id);
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcesses.delete(id);
  }
  const listener = ptyListeners.get(id);
  if (listener) {
    listener.dispose();
    ptyListeners.delete(id);
  }
  return true;
});

app.on('will-quit', () => {
  for (const [_, ptyProcess] of ptyProcesses) {
    ptyProcess.kill();
  }
  ptyProcesses.clear();
});
