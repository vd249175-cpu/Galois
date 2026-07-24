import { app, BrowserWindow, protocol, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function registerApplicationLifecycle(deps: any) {
  const {
    createLauncherStatusWindow, disposeUserConfigWatchers, ensureParentDir,
    fileWatchEntries, getGaloisWindowStatePath, initUserData,
    launchExternalWorkbench, mpvProcesses, secondaryWindows, setMainWindow,
    setupUserConfigWatchers, shouldLaunchExternalWorkbench,
  } = deps;
function createMainWindow() {
  const statePath = getGaloisWindowStatePath();
  let bounds: any = { width: 1200, height: 800 };
  if (fs.existsSync(statePath)) {
    try {
      bounds = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } catch (_) {}
  }

  // On Windows, read saved config to pick the right overlay color for the current theme
  let overlayBg = '#f9f8f5';    // default-light bg
  let overlaySymbol = '#2b2b2f'; // default-light text color
  if (process.platform === 'win32') {
    const configPath = path.join(app.getPath('documents'), 'Galois', 'config', 'galois.config.json');
    try {
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const themeId = cfg?.theme || 'default-light';
        const themeOverlayColors: Record<string, [string, string]> = {
          'default-light': ['#f9f8f5', '#2b2b2f'],
          'default-dark':  ['#121212', '#cccccc'],
          'lavender':      ['#f0edf8', '#2b2b2f'],
          'yuebai':        ['#eef4f7', '#2b2b2f'],
          'black-gold':    ['#0a0a0a', '#d4af37'],
        };
        [overlayBg, overlaySymbol] = themeOverlayColors[themeId] || themeOverlayColors['default-light'];
      }
    } catch (_) { /* use defaults */ }
  }

  const mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width || 1200,
    height: bounds.height || 800,
    title: 'Galois Workspace',
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: overlayBg,
            symbolColor: overlaySymbol,
            height: 30,
          },
        }
      : {}),
    backgroundColor: overlayBg,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setMainWindow(mainWindow);

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximizedChange', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximizedChange', false);
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
    setMainWindow(null);
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
    try {
      await launchExternalWorkbench();
      // Poll port 5173 every 500ms — close launcher as soon as Vite is up
      const net = require('net');
      const MAX_WAIT_MS = 90_000;
      const started = Date.now();
      const pollTimer = setInterval(() => {
        if (launcherStatusWindow?.isDestroyed()) { clearInterval(pollTimer); return; }
        const sock = new net.Socket();
        sock.setTimeout(300);
        sock.on('connect', () => {
          sock.destroy();
          clearInterval(pollTimer);
          launcherStatusWindow?.close();
        });
        sock.on('error', () => sock.destroy());
        sock.on('timeout', () => sock.destroy());
        sock.connect(5173, '127.0.0.1');
        if (Date.now() - started > MAX_WAIT_MS) {
          clearInterval(pollTimer);
          launcherStatusWindow?.close();
        }
      }, 500);
    } catch (err: any) {
      launcherStatusWindow?.close();
      dialog.showErrorBox('启动失败 / Launch Failed', err.message || String(err));
      app.quit();
    }
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
  disposeUserConfigWatchers();
  for (const filePath of fileWatchEntries.keys()) fs.unwatchFile(filePath);
  fileWatchEntries.clear();
  for (const child of mpvProcesses) child.kill();
  mpvProcesses.clear();

  // Kill all workbench processes on Windows upon quit
  // Strategy: kill by PID file first, then kill by port 5173 as fallback
  if (process.platform === 'win32') {
    const execSync = require('child_process').execSync;
    // 1. Kill by PID file
    const pidPath = path.join(app.getPath('documents'), 'Galois', 'workbench', 'galois-workbench.pid');
    if (fs.existsSync(pidPath)) {
      try {
        const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
        if (pidStr) {
          const pid = parseInt(pidStr, 10);
          if (Number.isInteger(pid) && pid > 0) {
            execSync(`taskkill /f /t /pid ${pid}`, { stdio: 'ignore' });
          }
        }
      } catch (_) {}
      try { fs.unlinkSync(pidPath); } catch (_) {}
    }
    // 2. Always kill by port 5173 (catches Vite even if PID file was missing)
    try {
      const out = execSync('netstat -ano | findstr ":5173 "', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' }) as string;
      const pids = new Set<string>();
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try { execSync(`taskkill /f /t /pid ${pid}`, { stdio: 'ignore' }); } catch (_) {}
      }
    } catch (_) {}
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

}
