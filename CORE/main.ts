import { app, BrowserWindow, ipcMain, dialog, protocol, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import * as pty from 'node-pty';
import { inspectProjectEnvironment, repairProjectEnvironment } from './projectEnvironment';
import { inspectPluginEnvironment, repairPluginEnvironment } from './pluginEnvironment';

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
    assertWritableTarget(filePath, 'writeFile');
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
    assertWritableTarget(filePath, 'deleteFile');
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
    assertWritableTarget(oldPath, 'renameFile source');
    assertWritableTarget(newPath, 'renameFile target');
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

ipcMain.handle('fs:pathExists', async (_, targetPath: string) => {
  return Boolean(targetPath && fs.existsSync(targetPath));
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
    assertWritableTarget(destDir, 'archiveMedia');
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

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isInsidePath(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function getReadOnlyAppRoots(): string[] {
  if (!app.isPackaged) return [];
  return Array.from(new Set([
    app.getAppPath(),
    process.resourcesPath,
  ].filter(Boolean).map((rootPath) => path.resolve(rootPath))));
}

function assertWritableTarget(targetPath: string, operation: string) {
  if (!targetPath) {
    throw new Error(`Missing target path for ${operation}`);
  }
  const resolvedTarget = path.resolve(targetPath);
  const readOnlyRoot = getReadOnlyAppRoots().find((rootPath) => isInsidePath(rootPath, resolvedTarget));
  if (readOnlyRoot) {
    throw new Error(
      `${operation} blocked: packaged app resources are read-only. Target ${resolvedTarget} is inside ${readOnlyRoot}.`
    );
  }
}

function getSourcePluginPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'APP') : path.join(app.getAppPath(), 'APP');
}

function getUserExtensionsPath(): string {
  return path.join(app.getPath('userData'), 'extensions');
}

function getBundledExtensionsPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'extensions') : path.join(app.getAppPath(), 'extensions');
}

function canWriteDirectory(dirPath: string): boolean {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const testPath = path.join(dirPath, `.dnote-write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(testPath, 'ok', 'utf-8');
    fs.unlinkSync(testPath);
    return true;
  } catch (_) {
    return false;
  }
}

function listUserExtensions() {
  const seen = new Set<string>();
  const extensions = [
    ...getExtensionDevPaths().flatMap((devPath) => listExtensionsFromDevPath(devPath)),
    ...listExtensionsFromRoot(getUserExtensionsPath(), 'userData'),
  ];
  return extensions.filter((extension) => {
    if (seen.has(extension.id)) return false;
    seen.add(extension.id);
    return true;
  });
}

function listExtensionsFromRoot(rootPath: string, source: 'userData' | 'development') {
  if (!fs.existsSync(rootPath)) return [];
  return fs.readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readExtensionManifest(path.join(rootPath, entry.name), entry.name, source, source === 'development' ? rootPath : undefined))
    .filter(isExtensionRecord);
}

function listExtensionsFromDevPath(devPath: string) {
  const resolvedPath = path.resolve(devPath);
  const manifestPath = path.join(resolvedPath, 'plugin.json');
  if (fs.existsSync(manifestPath)) {
    return [readExtensionManifest(resolvedPath, path.basename(resolvedPath), 'development', resolvedPath)].filter(isExtensionRecord);
  }
  return listExtensionsFromRoot(resolvedPath, 'development');
}

function isExtensionRecord(extension: ReturnType<typeof readExtensionManifest>): extension is NonNullable<ReturnType<typeof readExtensionManifest>> {
  return extension !== null;
}

function readExtensionManifest(extensionDir: string, fallbackId: string, source: 'userData' | 'development', developmentPath?: string) {
  const manifestPath = path.join(extensionDir, 'plugin.json');
  let manifest: any = null;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch (err: any) {
      manifest = { id: fallbackId, error: err.message };
    }
  } else if (source === 'development') {
    return null;
  }
  return {
    id: manifest?.id || fallbackId,
    name: manifest?.name || fallbackId,
    path: extensionDir,
    manifestPath,
    manifest,
    source,
    developmentPath,
    writable: canWriteDirectory(extensionDir),
  };
}

function resolveExtensionRoot(extensionId: string): string {
  const extension = listUserExtensions().find((candidate) => candidate.id === extensionId);
  if (!extension) {
    throw new Error(`Extension not found: ${extensionId}`);
  }
  const extensionRoot = path.resolve(extension.path);
  const allowedRoots = [getUserExtensionsPath(), ...getExtensionDevPaths()].map((dirPath) => path.resolve(dirPath));
  const isAllowed = allowedRoots.some((rootPath) => isInsidePath(rootPath, extensionRoot));
  if (!isAllowed) {
    throw new Error('Extension path must stay inside a registered extensions directory');
  }
  return extensionRoot;
}

function readUserConfig(): any {
  const configPath = path.join(app.getPath('userData'), 'dnote.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (_) {}
  }
  return {};
}

function writeUserConfig(config: any) {
  const configPath = path.join(app.getPath('userData'), 'dnote.config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function getExtensionDevPaths(): string[] {
  const config = readUserConfig();
  const devPaths = config.extensions?.devPaths;
  if (!Array.isArray(devPaths)) return [];
  return Array.from(new Set(devPaths.filter((item: any) => typeof item === 'string' && item.trim()).map((item: string) => path.resolve(item))));
}

function setExtensionDevPaths(devPaths: string[]) {
  const config = readUserConfig();
  const nextConfig = {
    ...config,
    extensions: {
      ...(config.extensions || {}),
      devPaths: Array.from(new Set(devPaths.map((item) => path.resolve(item)))),
    },
  };
  writeUserConfig(nextConfig);
}

function getRuntimeInfo() {
  const extensionPath = getUserExtensionsPath();
  fs.mkdirSync(extensionPath, { recursive: true });

  const sourcePluginPath = getSourcePluginPath();
  const extensionDevPaths = getExtensionDevPaths();
  const canWriteSourcePlugins = !app.isPackaged && canWriteDirectory(sourcePluginPath);
  const writableDirs = [
    extensionPath,
    ...extensionDevPaths,
    ...(canWriteSourcePlugins ? [sourcePluginPath] : []),
  ];

  return {
    mode: app.isPackaged ? 'installed-app' : 'source-dev',
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    userDataPath: app.getPath('userData'),
    extensionPath,
    extensionDevPaths,
    sourcePluginPath,
    canWriteSourcePlugins,
    agentWorkspace: {
      writableDirs,
      readableDirs: Array.from(new Set([extensionPath, ...extensionDevPaths, sourcePluginPath])),
    },
    extensions: listUserExtensions(),
  };
}

async function checkTool(command: string, versionArgs = '--version') {
  try {
    const which = await runShellCommand(`command -v ${quoteShellArg(command)}`, os.homedir(), getSecureEnv());
    let version = '';
    try {
      const result = await runShellCommand(`${quoteShellArg(command)} ${versionArgs}`, os.homedir(), getSecureEnv());
      version = (result.stdout || result.stderr).trim().split('\n')[0] || '';
    } catch (err: any) {
      version = err.message || '';
    }
    return { available: true, path: which.stdout.trim(), version };
  } catch (err: any) {
    return { available: false, error: err.message || `${command} not found` };
  }
}

function runShellCommand(command: string, cwd: string, env: NodeJS.ProcessEnv, stdinPayload?: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = exec(command, { cwd, env }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
    if (stdinPayload) {
      child.stdin?.write(stdinPayload);
      child.stdin?.end();
    }
  });
}

ipcMain.handle('shell:exec', async (_, command: string, cwd: string) => {
  return runShellCommand(command, cwd, getSecureEnv());
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
    const runtimeInfo = getRuntimeInfo();
    const extraDirs = runtimeInfo.agentWorkspace.readableDirs
      .filter((workspaceDir: string) => workspaceDir && workspaceDir !== dirPath);

    if (process.platform === 'darwin') {
      const escapedPath = dirPath.replace(/"/g, '\\"');
      const addDirScripts = extraDirs
        .map((workspaceDir: string) => {
          const escapedWorkspaceDir = workspaceDir.replace(/"/g, '\\"');
          return `delay 1
        do script "/add-dir ${escapedWorkspaceDir}" in selected tab of front window`;
        })
        .join('\n        ');
      const applescript = `tell application "Terminal"
        activate
        do script "cd \\"${escapedPath}\\" && clear && agy"
        ${addDirScripts}
      end tell`;
      exec(`osascript -e ${quoteShellArg(applescript)}`);
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

function getPluginFolderFromPath(scriptPath: string): string | null {
  const parts = scriptPath.split(path.sep);
  const servicesIndex = parts.indexOf('services');
  if (servicesIndex > 0) {
    return parts[servicesIndex - 1];
  }
  return null;
}

function getGlobalInterpreter(ext: string): string {
  const configPath = path.join(app.getPath('userData'), 'dnote.config.json');
  let config: any = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (_) {}
  }
  
  const userInterpreters = config.interpreters || {};
  
  if (ext === '.py') {
    return userInterpreters.python || 'uv run';
  } else if (ext === '.js' || ext === '.mjs') {
    return userInterpreters.node || 'node';
  } else if (ext === '.ts' || ext === '.mts') {
    return userInterpreters.typescript || 'node --experimental-strip-types';
  } else if (ext === '.sh') {
    return userInterpreters.bash || 'bash';
  }
  return '';
}

function getInterpreterFromManifest(configPath: string, ext: string): string | null {
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const pluginInterpreters = config.interpreters || {};
    const val = ext === '.py' ? pluginInterpreters.python
              : ext === '.js' || ext === '.mjs' ? pluginInterpreters.node
              : ext === '.ts' || ext === '.mts' ? pluginInterpreters.typescript
              : ext === '.sh' ? pluginInterpreters.bash : undefined;
    return val || null;
  } catch (_) {
    return null;
  }
}

function getOwningExtensionManifestPaths(scriptPath?: string): string[] {
  const resolvedScriptPath = scriptPath ? path.resolve(scriptPath) : '';
  if (!resolvedScriptPath) return [];
  return listUserExtensions()
    .filter((extension) => isInsidePath(path.resolve(extension.path), resolvedScriptPath))
    .map((extension) => extension.manifestPath);
}

function getMatchingExtensionManifestPaths(pluginFolder: string): string[] {
  return listUserExtensions()
    .filter((extension) => extension.id === pluginFolder || path.basename(path.resolve(extension.path)) === pluginFolder)
    .map((extension) => extension.manifestPath);
}

function getPluginInterpreter(ext: string, pluginFolder: string, scriptPath?: string): string {
  return getPluginInterpreterResolution(ext, pluginFolder, scriptPath).interpreter;
}

function getPluginInterpreterResolution(ext: string, pluginFolder: string, scriptPath?: string) {
  const appPath = app.isPackaged ? path.join(process.resourcesPath, 'APP') : path.join(app.getAppPath(), 'APP');
  const userExtPath = path.join(app.getPath('userData'), 'extensions');
  
  const searchPaths = [
    ...getOwningExtensionManifestPaths(scriptPath),
    path.join(appPath, pluginFolder, 'plugin.json'),
    ...getMatchingExtensionManifestPaths(pluginFolder),
    path.join(userExtPath, pluginFolder, 'plugin.json'),
  ];

  for (const configPath of Array.from(new Set(searchPaths))) {
    const interpreter = getInterpreterFromManifest(configPath, ext);
    if (interpreter) {
      return {
        interpreter,
        source: configPath,
        fallback: false,
      };
    }
  }

  return {
    interpreter: getGlobalInterpreter(ext),
    source: 'global/default',
    fallback: true,
  };
}

function getProjectInterpreter(ext: string, projectPath: string): string {
  const projectConfigPath = path.join(projectPath, '.dnote', 'config.json');
  if (fs.existsSync(projectConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
      const userInterpreters = config.interpreters || {};
      const val = ext === '.py' ? userInterpreters.python
                : ext === '.js' || ext === '.mjs' ? userInterpreters.node
                : ext === '.ts' || ext === '.mts' ? userInterpreters.typescript
                : ext === '.sh' ? userInterpreters.bash : undefined;
      if (val) {
        if (val.startsWith('.')) {
          return `"${path.resolve(projectPath, val)}"`;
        }
        return val;
      }
    } catch (_) {}
  }

  if (ext === '.py') {
    const macVenv = path.join(projectPath, '.venv', 'bin', 'python');
    const winVenv = path.join(projectPath, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(macVenv)) {
      return `"${macVenv}"`;
    } else if (fs.existsSync(winVenv)) {
      return `"${winVenv}"`;
    }
  }

  return getGlobalInterpreter(ext);
}

// Generic script runner — replaces plugin-specific calculateLattice IPC
// Plugins pass their own scriptPath; CORE stays business-logic-free
ipcMain.handle('shell:runScript', async (_, scriptPath: string, stdinPayload: string, cwd: string, envExtra?: Record<string, string>) => {
  return new Promise((resolve) => {
    const ext = path.extname(scriptPath).toLowerCase();
    let interpreter = '';
    
    const isProjectScript = cwd && scriptPath.startsWith(cwd);
    
    if (isProjectScript) {
      interpreter = getProjectInterpreter(ext, cwd);
    } else {
      const pluginFolder = getPluginFolderFromPath(scriptPath);
      if (pluginFolder) {
        interpreter = getPluginInterpreter(ext, pluginFolder, scriptPath);
      } else {
        interpreter = getGlobalInterpreter(ext);
      }
    }

    const command = interpreter ? `${interpreter} "${scriptPath}"` : `"${scriptPath}"`;

    const env = { ...getSecureEnv(), ...envExtra };
    const child = exec(command, { cwd: cwd || path.dirname(scriptPath), env }, (error, stdout, stderr) => {
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

interface ProjectScriptRunRequest {
  command?: string;
  scriptName?: string;
  cwd?: string;
  stdin?: string;
  envExtra?: Record<string, string>;
  useUv?: boolean;
}

// Unified notebook-project script bridge. APP organs provide intent and context;
// CORE owns PATH/interpreter setup and process execution mechanics.
ipcMain.handle('shell:runProjectScript', async (_, projectPath: string, request: ProjectScriptRunRequest) => {
  if (!projectPath || !request) {
    throw new Error('Missing projectPath or script request');
  }

  const normalizedProjectPath = path.resolve(projectPath);
  assertWritableTarget(normalizedProjectPath, 'runProjectScript projectPath');
  const cwd = path.resolve(request.cwd || (request.scriptName ? path.join(normalizedProjectPath, 'script') : normalizedProjectPath));
  if (!isInsidePath(normalizedProjectPath, cwd)) {
    throw new Error('Project script cwd must stay inside the notebook project');
  }

  const env = {
    ...getSecureEnv(),
    DNOTE_PROJECT_PATH: normalizedProjectPath,
    ...(request.envExtra || {}),
  };

  let command = request.command || '';
  if (!command && request.scriptName) {
    const scriptPath = path.resolve(cwd, request.scriptName);
    if (!isInsidePath(cwd, scriptPath)) {
      throw new Error('Project scriptName must stay inside its script directory');
    }
    command = request.useUv === false
      ? quoteShellArg(scriptPath)
      : `uv run ${quoteShellArg(scriptPath)}`;
  }
  if (!command) {
    throw new Error('Missing project script command');
  }

  return runShellCommand(command, cwd, env, request.stdin);
});

// Resolve the absolute path of a service script inside an APP plugin folder
// e.g. getServiceScriptPath('graph-view', 'lattice.py') => APP/graph-view/services/lattice.py
ipcMain.handle('shell:getServiceScriptPath', async (_, pluginFolder: string, scriptName: string) => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'APP', pluginFolder, 'services', scriptName);
  }
  return path.join(app.getAppPath(), 'APP', pluginFolder, 'services', scriptName);
});

ipcMain.handle('shell:getExtensionServiceScriptPath', async (_, extensionId: string, scriptName: string) => {
  const extensionRoot = resolveExtensionRoot(extensionId);
  const scriptPath = path.resolve(extensionRoot, 'services', scriptName);
  if (!isInsidePath(path.join(extensionRoot, 'services'), scriptPath)) {
    throw new Error('Extension service script must stay inside its services directory');
  }
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Extension service script not found: ${scriptName}`);
  }
  return scriptPath;
});

ipcMain.handle('shell:diagnoseExtensionService', async (_, extensionId: string, serviceName: string) => {
  const extension = listUserExtensions().find((candidate) => candidate.id === extensionId);
  if (!extension) {
    throw new Error(`Extension not found: ${extensionId}`);
  }

  const scriptPath = path.resolve(extension.path, 'services', serviceName);
  if (!isInsidePath(path.join(extension.path, 'services'), scriptPath)) {
    throw new Error('Extension service script must stay inside its services directory');
  }

  const ext = path.extname(scriptPath).toLowerCase();
  const pluginFolder = getPluginFolderFromPath(scriptPath) || extension.id;
  const resolution = getPluginInterpreterResolution(ext, pluginFolder, scriptPath);

  return {
    extensionId: extension.id,
    extensionPath: extension.path,
    manifestPath: extension.manifestPath,
    serviceName,
    scriptPath,
    scriptExists: fs.existsSync(scriptPath),
    runtime: extension.manifest?.services?.find((service: any) => service?.name === serviceName)?.runtime || ext.replace('.', '') || 'script',
    interpreter: resolution.interpreter,
    interpreterSource: resolution.source,
    usingFallbackInterpreter: resolution.fallback,
    cwd: getDefaultNotebookProjectPath(),
  };
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

ipcMain.handle('app:getRuntimeInfo', () => getRuntimeInfo());

ipcMain.handle('app:ensureExtensionsDir', () => {
  const extensionPath = getUserExtensionsPath();
  fs.mkdirSync(extensionPath, { recursive: true });
  return extensionPath;
});

ipcMain.handle('app:listExtensions', () => listUserExtensions());

ipcMain.handle('app:seedExtensions', () => {
  seedSideLoadedExtensions();
  return listUserExtensions();
});

ipcMain.handle('app:addExtensionDevPath', (_, devPath: string) => {
  const resolvedPath = path.resolve(devPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Extension development path does not exist: ${resolvedPath}`);
  }
  const devPaths = getExtensionDevPaths();
  setExtensionDevPaths([...devPaths, resolvedPath]);
  return listUserExtensions();
});

ipcMain.handle('app:removeExtensionDevPath', (_, devPath: string) => {
  const resolvedPath = path.resolve(devPath);
  const devPaths = getExtensionDevPaths().filter((item) => item !== resolvedPath);
  setExtensionDevPaths(devPaths);
  return listUserExtensions();
});

ipcMain.handle('app:openPath', async (_, targetPath: string) => {
  const error = await shell.openPath(targetPath);
  if (error) {
    throw new Error(error);
  }
  return true;
});

function findPluginManifest(rootPath: string): string | null {
  const directManifest = path.join(rootPath, 'plugin.json');
  if (fs.existsSync(directManifest)) return directManifest;
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(rootPath, entry.name, 'plugin.json');
    if (fs.existsSync(manifestPath)) return manifestPath;
  }
  return null;
}

ipcMain.handle('app:importExtensionArchive', async (_, archivePath: string) => {
  const resolvedArchivePath = path.resolve(archivePath);
  if (!fs.existsSync(resolvedArchivePath)) {
    throw new Error(`Archive not found: ${resolvedArchivePath}`);
  }
  if (path.extname(resolvedArchivePath).toLowerCase() !== '.zip') {
    throw new Error('Only .zip extension packages are supported right now');
  }

  const extensionRoot = getUserExtensionsPath();
  fs.mkdirSync(extensionRoot, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(app.getPath('temp'), 'dnote-extension-'));
  await runShellCommand(
    `ditto -x -k ${quoteShellArg(resolvedArchivePath)} ${quoteShellArg(tempRoot)}`,
    tempRoot,
    getSecureEnv()
  );

  const manifestPath = findPluginManifest(tempRoot);
  if (!manifestPath) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error('Extension package must contain plugin.json at root or inside one top-level folder');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const extensionId = String(manifest.id || path.basename(path.dirname(manifestPath))).trim();
  if (!extensionId) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error('Extension plugin.json must declare an id');
  }

  const packageRoot = path.dirname(manifestPath);
  let targetPath = path.join(extensionRoot, extensionId);
  let index = 2;
  while (fs.existsSync(targetPath)) {
    targetPath = path.join(extensionRoot, `${extensionId}-${index}`);
    index += 1;
  }
  fs.renameSync(packageRoot, targetPath);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  return {
    extensionPath: targetPath,
    extensions: listUserExtensions(),
  };
});

ipcMain.handle('app:getEnvironmentStatus', async () => {
  const [uv, python, python3, agy, node] = await Promise.all([
    checkTool('uv'),
    checkTool('python'),
    checkTool('python3'),
    checkTool('agy'),
    checkTool('node'),
  ]);
  return {
    shell: {
      available: Boolean(process.env.SHELL),
      path: process.env.SHELL || '',
    },
    uv,
    python: python.available ? python : python3,
    python3,
    agy,
    node,
  };
});

ipcMain.handle('app:inspectProjectEnvironment', async (_, projectPath: string) => {
  return inspectProjectEnvironment(projectPath, getSecureEnv());
});

ipcMain.handle('app:repairProjectEnvironment', async (_, projectPath: string) => {
  assertWritableTarget(projectPath, 'repairProjectEnvironment');
  return repairProjectEnvironment(projectPath, getSecureEnv());
});

ipcMain.handle('app:ensureNotebookProjectDeclaration', async (_, projectPath: string) => {
  const resolvedProjectPath = path.resolve(projectPath);
  assertWritableTarget(resolvedProjectPath, 'ensureNotebookProjectDeclaration');
  fs.mkdirSync(resolvedProjectPath, { recursive: true });

  const pyprojectPath = path.join(resolvedProjectPath, 'pyproject.toml');
  const commandDir = path.join(resolvedProjectPath, 'command');
  const commandsPath = path.join(commandDir, 'commands.json');
  const scriptDir = path.join(resolvedProjectPath, 'script');
  const created: string[] = [];

  if (!fs.existsSync(pyprojectPath)) {
    const projectName = path.basename(resolvedProjectPath).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    fs.writeFileSync(pyprojectPath, `[project]
name = "${projectName || 'dnote-project'}"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = []
`, 'utf-8');
    created.push(pyprojectPath);
  }

  if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandDir, { recursive: true });
    fs.writeFileSync(commandsPath, JSON.stringify({ commands: [] }, null, 2), 'utf-8');
    created.push(commandsPath);
  }

  if (!fs.existsSync(scriptDir)) {
    fs.mkdirSync(scriptDir, { recursive: true });
    created.push(scriptDir);
  }

  return { projectPath: resolvedProjectPath, created };
});

ipcMain.handle('app:inspectPluginEnvironment', async (_, extensionId: string) => {
  const extension = listUserExtensions().find((item) => item.id === extensionId);
  if (!extension) throw new Error(`Extension not found: ${extensionId}`);
  return inspectPluginEnvironment(extension.id, extension.path, extension.manifestPath, getSecureEnv());
});

ipcMain.handle('app:repairPluginEnvironment', async (_, extensionId: string) => {
  const extension = listUserExtensions().find((item) => item.id === extensionId);
  if (!extension) throw new Error(`Extension not found: ${extensionId}`);
  assertWritableTarget(extension.path, 'repairPluginEnvironment');
  return repairPluginEnvironment(extension.id, extension.path, extension.manifestPath, getSecureEnv());
});

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

ipcMain.handle('app:getDevDefault', () => ensureDefaultNotebookProject());

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
      autoStartAgy: false
    },
    appearance: {
      sidebarIconSize: 14,
      fileTreeTitleSize: 11,
      fileTreeTagSize: 8.5
    },
    interpreters: {
      python: "",
      node: "",
      typescript: "",
      bash: ""
    },
    extensions: {
      devPaths: []
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

function shouldSkipTemplateItem(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  const segments = normalized.split('/');
  return (
    normalized === '.dnote_runtime.json' ||
    normalized.endsWith('/.dnote_runtime.json') ||
    segments.includes('.venv') ||
    segments.includes('.dnote_cache') ||
    normalized.endsWith('/.DS_Store') ||
    normalized === '.DS_Store'
  );
}

function removePathIfExists(targetPath: string) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function shouldRemoveStarterVenv(projectPath: string): boolean {
  const venvPath = path.join(projectPath, '.venv');
  const pyvenvPath = path.join(venvPath, 'pyvenv.cfg');
  if (!fs.existsSync(venvPath)) return false;
  if (!fs.existsSync(pyvenvPath)) return true;

  try {
    const pyvenv = fs.readFileSync(pyvenvPath, 'utf-8');
    const homeMatch = pyvenv.match(/^home\s*=\s*(.+)$/m);
    if (homeMatch && !fs.existsSync(homeMatch[1].trim())) return true;

    const versionMatch = pyvenv.match(/^version_info\s*=\s*(\d+\.\d+)/m);
    if (versionMatch) {
      const linkedDylib = path.join(venvPath, 'lib', `libpython${versionMatch[1]}.dylib`);
      const pythonBin = path.join(venvPath, 'bin', 'python3');
      if (fs.existsSync(pythonBin) && !fs.existsSync(linkedDylib)) return true;
    }

    return false;
  } catch (_) {
    return true;
  }
}

function repairStarterProjectRuntimeState(projectPath: string) {
  if (shouldRemoveStarterVenv(projectPath)) {
    removePathIfExists(path.join(projectPath, '.venv'));
  }
  removePathIfExists(path.join(projectPath, '.dnote_cache'));
  removePathIfExists(path.join(projectPath, '.dnote_runtime.json'));
}

function copyMissingTemplateFilesSync(src: string, dest: string, relativePath = '') {
  if (!fs.existsSync(src) || shouldSkipTemplateItem(relativePath)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyMissingTemplateFilesSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
        path.join(relativePath, childItemName)
      );
    });
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function getTemplateProjectSourcePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'template-project')
    : path.join(app.getAppPath(), 'template-project');
}

function getDefaultNotebookProjectPath(): string {
  return path.join(app.getPath('documents'), 'DNOTE Projects', 'Getting Started');
}

function ensureDefaultNotebookProject(): string {
  const src = getTemplateProjectSourcePath();
  const dest = getDefaultNotebookProjectPath();

  if (fs.existsSync(src)) {
    try {
      repairStarterProjectRuntimeState(dest);
      copyMissingTemplateFilesSync(src, dest);
      return dest;
    } catch (err) {
      console.error('[initUserData] Failed to seed default notebook project:', err);
    }
  }

  return fs.existsSync(dest) ? dest : src;
}

function seedSideLoadedExtensions() {
  const bundledExtensionsPath = getBundledExtensionsPath();
  const userExtensionsPath = getUserExtensionsPath();
  if (!fs.existsSync(bundledExtensionsPath)) return;

  fs.mkdirSync(userExtensionsPath, { recursive: true });
  fs.readdirSync(bundledExtensionsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      const src = path.join(bundledExtensionsPath, entry.name);
      const dest = path.join(userExtensionsPath, entry.name);
      if (fs.existsSync(dest)) return;
      try {
        copyFolderRecursiveSync(src, dest);
        console.log(`[initUserData] Seeded side-loaded extension: ${entry.name}`);
      } catch (err) {
        console.error(`[initUserData] Failed to seed extension ${entry.name}:`, err);
      }
    });
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
        autoStartAgy: false
      },
      interpreters: {
        python: "",
        node: "",
        typescript: "",
        bash: ""
      },
      extensions: {
        devPaths: []
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

  // 3. Seed or repair the user-facing starter project in Documents.
  ensureDefaultNotebookProject();

  // 4. Seed side-loaded extension examples into writable userData.
  seedSideLoadedExtensions();
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
