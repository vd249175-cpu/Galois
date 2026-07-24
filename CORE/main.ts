import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { inspectProjectEnvironment, repairProjectEnvironment } from './projectEnvironment';
import { inspectPluginEnvironment, repairPluginEnvironment } from './pluginEnvironment';
import { registerFileIpcHandlers } from './mainFileIpc';
import { createClassicWorkspaceServices } from './classicWorkspace';
import { registerShellIpcHandlers } from './mainShellIpc';
import { createAppConfigIpc } from './mainAppConfigIpc';
import { registerTerminalIpcHandlers } from './mainTerminalIpc';
import { registerAppIpcHandlers } from './mainAppIpc';
import { registerWindowStateIpc } from './mainWindowStateIpc';
import { createThemeConfigServices } from './themeConfigServices';
import { registerApplicationLifecycle } from './applicationLifecycle';
import { createRuntimeServices } from './runtimeServices';

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
      width: 550,
      height: 380,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Galois 正在启动',
      backgroundColor: '#f7f3ea',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
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
      max-width: 380px;
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
    <div id="log-container" style="width: 100%; height: 120px; background: rgba(38, 49, 47, 0.05); border: 1px solid rgba(38, 49, 47, 0.1); border-radius: 6px; padding: 8px; box-sizing: border-box; overflow-y: auto; text-align: left; font-family: Consolas, monospace; font-size: 10px; color: rgba(38, 49, 47, 0.85); white-space: pre-wrap; margin-top: 8px; user-select: text;">[等待日志输出...]</div>
  </div>
  <script>
    if (window.electronAPI && typeof window.electronAPI.onLauncherLog === 'function') {
      const container = document.getElementById('log-container');
      window.electronAPI.onLauncherLog((log) => {
        container.textContent = log;
        container.scrollTop = container.scrollHeight;
      });
    }
  </script>
</body>
</html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Tail log file to launcher status window
    const logPath = path.join(getGaloisHomePath(), 'logs', 'external-workbench.log');
    const tailInterval = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(tailInterval);
        return;
      }
      try {
        if (fs.existsSync(logPath)) {
          const content = fs.readFileSync(logPath, 'utf-8');
          const lines = content.trim().split('\n').slice(-15).join('\n');
          win.webContents.send('launcher:log', lines);
        }
      } catch (_) {}
    }, 500);

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

const {
  BUILTIN_THEME_FILES,
  disposeUserConfigWatchers,
  ensureUserThemeFiles,
  readUserThemes,
  setupUserConfigWatchers,
} = createThemeConfigServices({
  getClassicCodeSourcePath,
  getGaloisConfigPath,
  getGaloisShortcutsPath,
  getGaloisThemesPath,
});

const {
  assertWritableTarget,
  checkTool,
  getExtensionDevPaths,
  getRuntimeInfo,
  getUserExtensionsPath,
  getSecureEnv,
  isInsidePath,
  killWorkbenchProcess,
  launchExternalWorkbench,
  listUserExtensions,
  quoteAppleScriptString,
  quoteCmdArg,
  quoteShellArg,
  resolveExtensionRoot,
  runShellCommand,
  setExtensionDevPaths,
  shouldLaunchExternalWorkbench,
} = createRuntimeServices({
  ensureParentDir,
  getClassicCodeWorkspacePath,
  getGaloisConfigPath,
  getGaloisHomePath,
  getGaloisLogPath,
});

registerApplicationLifecycle({
  createLauncherStatusWindow,
  disposeUserConfigWatchers,
  ensureParentDir,
  fileWatchEntries,
  getGaloisWindowStatePath,
  initUserData: () => initUserData(),
  killWorkbenchProcess,
  launchExternalWorkbench,
  mpvProcesses,
  secondaryWindows,
  setMainWindow: (window: BrowserWindow | null) => { mainWindow = window; },
  setupUserConfigWatchers,
  shouldLaunchExternalWorkbench,
});
registerFileIpcHandlers({
  assertWritableTarget,
  fileWatchEntries,
  fileWatchSenderCleanup,
  isInsidePath,
  getMainWindow: () => mainWindow,
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
registerWindowStateIpc({ getMainWindow: () => mainWindow, secondaryWindows });
registerAppIpcHandlers({
  assertWritableTarget,
  checkTool,
  ensureDefaultNotebookProject: () => ensureDefaultNotebookProject(),
  ensureParentDir,
  getClassicCodeSourcePath,
  getClassicCodeWorkspacePath,
  getExtensionDevPaths,
  getGaloisLogPath,
  getRuntimeInfo,
  getSecureEnv,
  getUserExtensionsPath,
  inspectPluginEnvironment,
  inspectProjectEnvironment,
  listUserExtensions,
  quoteShellArg,
  repairPluginEnvironment,
  repairProjectEnvironment,
  runShellCommand,
  setExtensionDevPaths,
  syncClassicCodeWorkspace: (overwrite: boolean) => syncClassicCodeWorkspace(overwrite),
});
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
  quoteCmdArg,
});
registerTerminalIpcHandlers(getSecureEnv);
