import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn } from 'child_process';
import { inspectProjectEnvironment, repairProjectEnvironment } from './projectEnvironment';
import { inspectPluginEnvironment, repairPluginEnvironment } from './pluginEnvironment';
import { registerFileIpcHandlers } from './mainFileIpc';
import { createClassicWorkspaceServices } from './classicWorkspace';
import { registerShellIpcHandlers } from './mainShellIpc';
import { createAppConfigIpc } from './mainAppConfigIpc';

// Register dnote-file as a privileged scheme to load local media and bypass Content Security Policy
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'dnote-file',
    privileges: {
      standard: true,
      bypassCSP: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
const secondaryWindows = new Map<string, BrowserWindow>();
const userConfigWatchers: fs.FSWatcher[] = [];
const userConfigChangeTimers = new Map<string, ReturnType<typeof setTimeout>>();
interface FileWatchEntry {
  subscribers: Map<number, { webContents: Electron.WebContents; count: number }>;
}
const fileWatchEntries = new Map<string, FileWatchEntry>();
const fileWatchSenderCleanup = new Set<number>();
const mpvProcesses = new Set<ReturnType<typeof spawn>>();

function stopWatchingFileIfUnused(filePath: string) {
  const entry = fileWatchEntries.get(filePath);
  if (entry && entry.subscribers.size === 0) {
    fs.unwatchFile(filePath);
    fileWatchEntries.delete(filePath);
  }
}

function releaseFileWatchesForSender(senderId: number) {
  for (const [filePath, entry] of fileWatchEntries) {
    entry.subscribers.delete(senderId);
    stopWatchingFileIfUnused(filePath);
  }
  fileWatchSenderCleanup.delete(senderId);
}

function createLauncherStatusWindow(): BrowserWindow | null {
  try {
    const win = new BrowserWindow({
      width: 440,
      height: 260,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Galois 正在启动',
      backgroundColor: '#f7f3ea',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at 20% 15%, #fff7d8 0, transparent 34%),
                  linear-gradient(135deg, #f7f3ea 0%, #edf3ee 100%);
      color: #26312f;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
    }
    .wrap {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      text-align: center;
      box-sizing: border-box;
      padding: 28px;
    }
    .mark {
      width: 46px;
      height: 46px;
      border-radius: 16px;
      background: #26312f;
      color: #f7f3ea;
      display: grid;
      place-items: center;
      font-weight: 800;
      letter-spacing: -0.04em;
      box-shadow: 0 18px 38px rgba(38, 49, 47, 0.18);
    }
    h1 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0.02em;
    }
    p {
      margin: 0;
      max-width: 330px;
      color: rgba(38, 49, 47, 0.68);
      font-size: 12px;
      line-height: 1.7;
    }
    .bar {
      width: 220px;
      height: 4px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(38, 49, 47, 0.12);
    }
    .bar::after {
      content: "";
      display: block;
      width: 72px;
      height: 100%;
      border-radius: inherit;
      background: #e4523f;
      animation: slide 1.15s ease-in-out infinite;
    }
    @keyframes slide {
      0% { transform: translateX(-80px); }
      100% { transform: translateX(230px); }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="mark">G</div>
    <h1>Galois 正在启动</h1>
    <p>正在准备可写工作台并启动编辑环境。首次启动或依赖修复时会稍久，但 App 已经收到点击。</p>
    <div class="bar"></div>
    <p>如果长时间没有出现主窗口，可查看 ~/Documents/Galois/logs/external-workbench.log。</p>
  </div>
</body>
</html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return win;
  } catch (err) {
    console.warn('[launcher] Failed to create status window:', err);
    return null;
  }
}

function getGaloisHomePath(): string {
  return path.join(app.getPath('documents'), 'Galois');
}

function getGaloisConfigPath(): string {
  return path.join(getGaloisHomePath(), 'config', 'galois.config.json');
}

function getGaloisThemesPath(): string {
  return path.join(getGaloisHomePath(), 'config', 'themes');
}

function getGaloisShortcutsPath(): string {
  return path.join(getGaloisHomePath(), 'config', 'shortcuts.json');
}

function getGaloisLayoutPath(): string {
  return path.join(getGaloisHomePath(), 'config', 'layout.json');
}

function getGaloisProjectStatePath(): string {
  return path.join(getGaloisHomePath(), 'config', 'project-state.json');
}

function getGaloisWindowStatePath(): string {
  return path.join(getGaloisHomePath(), 'config', 'window-state.json');
}

function getGaloisLogPath(fileName: string): string {
  return path.join(getGaloisHomePath(), 'logs', fileName);
}

function getClassicCodeWorkspacePath(): string {
  return path.join(getGaloisHomePath(), 'workbench', 'Galois-vscode-core');
}

function getClassicCodeSourcePath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'classic-code') : app.getAppPath();
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const BUILTIN_THEME_FILES: Record<string, { file: string; name: string }> = {
  'default-light': { file: 'default-light.css', name: '温暖米色 (Light)' },
  'default-dark': { file: 'default-dark.css', name: '深空极夜 (Dark)' },
  lavender: { file: 'lavender.css', name: '雪青紫罗 (Lavender)' },
  yuebai: { file: 'yuebai.css', name: '月白缥青 (Azure)' },
  'black-gold': { file: 'blackgold.css', name: '玄金耀屑 (Black Gold)' },
};

function ensureUserThemeFiles() {
  const themesPath = getGaloisThemesPath();
  fs.mkdirSync(themesPath, { recursive: true });
  const sourceThemePath = path.join(getClassicCodeSourcePath(), 'CORE', 'themes');
  for (const [themeId, meta] of Object.entries(BUILTIN_THEME_FILES)) {
    const targetPath = path.join(themesPath, `${themeId}.css`);
    if (fs.existsSync(targetPath)) continue;
    const sourcePath = path.join(sourceThemePath, meta.file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function readUserThemes() {
  ensureUserThemeFiles();
  const themesPath = getGaloisThemesPath();
  return fs.readdirSync(themesPath)
    .filter((fileName) => fileName.endsWith('.css'))
    .map((fileName) => {
      const id = path.basename(fileName, '.css');
      const builtin = BUILTIN_THEME_FILES[id];
      return {
        id,
        name: builtin?.name || id.replace(/[-_]/g, ' '),
        path: path.join(themesPath, fileName),
        source: builtin ? 'seeded' : 'custom',
      };
    })
    .sort((a, b) => {
      const aBuiltin = BUILTIN_THEME_FILES[a.id] ? 0 : 1;
      const bBuiltin = BUILTIN_THEME_FILES[b.id] ? 0 : 1;
      if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
      return a.id.localeCompare(b.id);
    });
}

function broadcastUserConfigChange(kind: 'config' | 'shortcuts' | 'themes', filePath?: string) {
  const payload = { kind, path: filePath || '', timestamp: Date.now() };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('app:configFileChanged', payload);
    }
  }
}

function scheduleUserConfigChange(kind: 'config' | 'shortcuts' | 'themes', filePath?: string) {
  const key = `${kind}:${filePath || ''}`;
  const existing = userConfigChangeTimers.get(key);
  if (existing) clearTimeout(existing);
  userConfigChangeTimers.set(key, setTimeout(() => {
    userConfigChangeTimers.delete(key);
    broadcastUserConfigChange(kind, filePath);
  }, 120));
}

function setupUserConfigWatchers() {
  userConfigWatchers.splice(0).forEach((watcher) => watcher.close());
  const configDir = path.dirname(getGaloisConfigPath());
  const themesDir = getGaloisThemesPath();
  fs.mkdirSync(configDir, { recursive: true });
  ensureUserThemeFiles();

  try {
    userConfigWatchers.push(fs.watch(configDir, (_eventType, fileName) => {
      const name = String(fileName || '');
      if (name === 'galois.config.json') {
        scheduleUserConfigChange('config', getGaloisConfigPath());
      } else if (name === 'shortcuts.json') {
        scheduleUserConfigChange('shortcuts', getGaloisShortcutsPath());
      }
    }));
  } catch (err: any) {
    console.warn('[config-watch] Failed to watch config dir:', err?.message || err);
  }

  try {
    userConfigWatchers.push(fs.watch(themesDir, (_eventType, fileName) => {
      const name = String(fileName || '');
      if (!name || name.endsWith('.css')) {
        scheduleUserConfigChange('themes', path.join(themesDir, name));
      }
    }));
  } catch (err: any) {
    console.warn('[config-watch] Failed to watch themes dir:', err?.message || err);
  }
}

function createMainWindow() {
  const statePath = getGaloisWindowStatePath();
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
    title: 'Galois Workspace',
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
      ensureParentDir(statePath);
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
  const launcherStatusWindow = shouldLaunchExternalWorkbench()
    ? createLauncherStatusWindow()
    : null;
  await initUserData();
  if (shouldLaunchExternalWorkbench()) {
    launchExternalWorkbench();
    setTimeout(() => {
      launcherStatusWindow?.close();
      app.quit();
    }, 30_000);
    return;
  }

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
      else if (ext === '.mov') contentType = 'video/quicktime';
      else if (ext === '.m4v') contentType = 'video/x-m4v';
      else if (ext === '.ogg') contentType = 'video/ogg';
      else if (ext === '.mp3') contentType = 'audio/mpeg';
      else if (ext === '.wav') contentType = 'audio/wav';
      else if (ext === '.m4a') contentType = 'audio/mp4';
      else if (ext === '.aac') contentType = 'audio/aac';
      else if (ext === '.ogg') contentType = 'audio/ogg';
      else if (ext === '.flac') contentType = 'audio/flac';
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
            'Content-Length': String(chunkSize),
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin'
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
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin'
          }
        });
      }
    } catch (err: any) {
      console.error('[dnote-file handler error]', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  });

  createMainWindow();
  setupUserConfigWatchers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  userConfigWatchers.splice(0).forEach((watcher) => watcher.close());
  for (const filePath of fileWatchEntries.keys()) fs.unwatchFile(filePath);
  fileWatchEntries.clear();
  for (const child of mpvProcesses) child.kill();
  mpvProcesses.clear();
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC Filesystem APIs
registerFileIpcHandlers({
  assertWritableTarget,
  fileWatchEntries,
  fileWatchSenderCleanup,
  isInsidePath,
  mainWindow,
  releaseFileWatchesForSender,
  stopWatchingFileIfUnused,
});

ipcMain.handle('media:playWithMpv', async (_, request: {
  filePath: string;
  title?: string;
  start?: number;
  end?: number;
}) => {
  const filePath = path.resolve(String(request?.filePath || ''));
  if (!path.isAbsolute(filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`视频文件不存在：${filePath}`);
  }

  const mpv = await checkTool('mpv');
  if (!mpv.available || !mpv.path) {
    throw new Error('未找到 mpv。请先运行：brew install mpv');
  }

  const args = [
    '--no-config',
    '--force-window=yes',
    '--keep-open=yes',
    '--hwdec=auto-safe',
    `--title=${String(request.title || path.basename(filePath))}`,
  ];
  if (Number.isFinite(request.start) && Number(request.start) >= 0) {
    args.push(`--start=${Number(request.start)}`);
  }
  if (Number.isFinite(request.end) && Number(request.end) > Number(request.start ?? 0)) {
    args.push(`--end=${Number(request.end)}`);
  }
  args.push('--', filePath);

  const child = spawn(mpv.path, args, {
    cwd: path.dirname(filePath),
    env: getSecureEnv(),
    stdio: 'ignore',
  });
  mpvProcesses.add(child);
  child.once('exit', () => mpvProcesses.delete(child));
  child.once('error', () => mpvProcesses.delete(child));

  await new Promise<void>((resolve, reject) => {
    const onSpawn = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => {
      child.off('spawn', onSpawn);
      child.off('error', onError);
    };
    child.once('spawn', onSpawn);
    child.once('error', onError);
  });

  return {
    started: true as const,
    pid: child.pid ?? null,
    executable: mpv.path,
    version: mpv.version || '',
  };
});

// IPC Exec/Shell API
// IPC Exec/Shell API helper to run with extended PATH
function getSecureEnv() {
  const userEnv = { ...process.env };
  const homeDir = os.homedir();
  const utf8Locale = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8';
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
  userEnv.LANG = userEnv.LANG && /utf-?8/i.test(userEnv.LANG) ? userEnv.LANG : utf8Locale;
  userEnv.LC_ALL = userEnv.LC_ALL && /utf-?8/i.test(userEnv.LC_ALL) ? userEnv.LC_ALL : utf8Locale;
  userEnv.LC_CTYPE = userEnv.LC_CTYPE && /utf-?8/i.test(userEnv.LC_CTYPE) ? userEnv.LC_CTYPE : utf8Locale;
  userEnv.PYTHONIOENCODING = userEnv.PYTHONIOENCODING || 'utf-8';
  userEnv.TERM = userEnv.TERM || 'xterm-256color';
  userEnv.TERM_PROGRAM = userEnv.TERM_PROGRAM || 'Galois';
  return userEnv;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteCmdArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteAppleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function shouldLaunchExternalWorkbench(): boolean {
  return app.isPackaged && process.env.GALOIS_USE_INTERNAL_APP !== '1';
}

function launchExternalWorkbench() {
  const runScriptPath = path.join(path.dirname(getClassicCodeWorkspacePath()), 'run-galois-workbench.sh');
  if (!fs.existsSync(runScriptPath)) {
    throw new Error(`External workbench launcher not found: ${runScriptPath}`);
  }

  const logPath = getGaloisLogPath('external-workbench.log');
  ensureParentDir(logPath);
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(runScriptPath, [], {
    cwd: path.dirname(getClassicCodeWorkspacePath()),
    detached: true,
    env: getSecureEnv(),
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
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
  return path.join(getClassicCodeWorkspacePath(), 'APP');
}

function getUserExtensionsPath(): string {
  return path.join(getGaloisHomePath(), 'extensions');
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
  const configPath = getGaloisConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (_) {}
  }
  return {};
}

function writeUserConfig(config: any) {
  const configPath = getGaloisConfigPath();
  ensureParentDir(configPath);
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
  const classicCodePath = getClassicCodeWorkspacePath();
  const extensionDevPaths = getExtensionDevPaths();
  const canWriteSourcePlugins = !app.isPackaged && canWriteDirectory(sourcePluginPath);
  const agentCodeDirs = Array.from(new Set([classicCodePath]));

  return {
    mode: app.isPackaged ? 'installed-app' : 'source-dev',
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    galoisHomePath: getGaloisHomePath(),
    classicCodePath,
    extensionPath,
    extensionDevPaths,
    sourcePluginPath,
    canWriteSourcePlugins,
    agentWorkspace: {
      writableDirs: agentCodeDirs,
      readableDirs: agentCodeDirs,
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

registerShellIpcHandlers({
  assertWritableTarget,
  getClassicCodeSourcePath,
  getClassicCodeWorkspacePath,
  getDefaultNotebookProjectPath: () => getDefaultNotebookProjectPath(),
  getGaloisConfigPath,
  getRuntimeInfo,
  getSecureEnv,
  isInsidePath,
  listUserExtensions,
  quoteAppleScriptString,
  quoteCmdArg,
  quoteShellArg,
  resolveExtensionRoot,
  runShellCommand,
});
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

ipcMain.handle('app:listAppPluginEntries', () => {
  try {
    const appDir = path.join(app.getAppPath(), 'APP');
    if (!fs.existsSync(appDir)) return [];
    return fs.readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const indexPath = path.join(appDir, entry.name, 'index.ts');
        if (!fs.existsSync(indexPath)) return null;
        const stat = fs.statSync(indexPath);
        return {
          folder: entry.name,
          indexPath,
          modulePath: `/APP/${entry.name}/index.ts`,
          mtimeMs: stat.mtimeMs,
        };
      })
      .filter(Boolean);
  } catch (err: any) {
    console.warn('[app:listAppPluginEntries] Failed:', err?.message || err);
    return [];
  }
});

ipcMain.handle('app:ensureExtensionsDir', () => {
  const extensionPath = getUserExtensionsPath();
  fs.mkdirSync(extensionPath, { recursive: true });
  return extensionPath;
});

ipcMain.handle('app:listExtensions', () => listUserExtensions());

ipcMain.handle('app:seedExtensions', () => {
  return [];
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
  const [uv, python, python3, agy, node, git, mpv] = await Promise.all([
    checkTool('uv'),
    checkTool('python'),
    checkTool('python3'),
    checkTool('agy'),
    checkTool('node'),
    checkTool('git'),
    checkTool('mpv'),
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
    git,
    mpv,
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
    const logPath = getGaloisLogPath('renderer_error.log');
    ensureParentDir(logPath);
    fs.appendFileSync(logPath, JSON.stringify(errorMsg) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to log renderer error:', err);
    return false;
  }
});

ipcMain.handle('app:getDevDefault', () => ensureDefaultNotebookProject());

ipcMain.handle('app:getClassicCodeWorkspace', () => ({
  sourcePath: getClassicCodeSourcePath(),
  workspacePath: getClassicCodeWorkspacePath(),
}));

ipcMain.handle('app:restoreClassicCodeWorkspace', () => syncClassicCodeWorkspace(true));

const { getDefaultAppConfig } = createAppConfigIpc({
  BUILTIN_THEME_FILES,
  ensureParentDir,
  ensureUserThemeFiles,
  getGaloisConfigPath,
  getGaloisLayoutPath,
  getGaloisProjectStatePath,
  getGaloisShortcutsPath,
  getGaloisThemesPath,
  readUserThemes,
});
const { ensureDefaultNotebookProject, getDefaultNotebookProjectPath, initUserData, syncClassicCodeWorkspace } = createClassicWorkspaceServices({
  getClassicCodeSourcePath,
  getClassicCodeWorkspacePath,
  getDefaultAppConfig,
  getGaloisHomePath,
  getGaloisConfigPath,
  getGaloisShortcutsPath,
  getSecureEnv,
  quoteShellArg,
});
// ── PTY Terminal Manager (node-pty) ──────────────────────────────────────────
// Uses a real PTY — same as VS Code, Hyper, Warp. Supports TUI apps (agy, vim, etc.)
type PtyProcess = import('node-pty').IPty;
type PtyListener = import('node-pty').IDisposable;

const ptyProcesses = new Map<string, PtyProcess>();
const ptyListeners = new Map<string, PtyListener>();

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
    const pty = require('node-pty') as typeof import('node-pty');
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
