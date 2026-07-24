import { app } from 'electron';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { initializeUserData } from './userDataInitializer';

export function createClassicWorkspaceServices(deps: any) {
  const {
    getClassicCodeSourcePath, getClassicCodeWorkspacePath, getDefaultAppConfig,
    getGaloisHomePath, getGaloisConfigPath, getGaloisShortcutsPath,
    getSecureEnv, quoteShellArg, quoteCmdArg,
  } = deps;

const CLASSIC_CODE_ITEMS = [
  'APP',
  'CORE',
  '.agents',
  'assets',
  'docs',
  'scripts',
  'template-project',
  'AGENTS.md',
  'README.md',
  'index.html',
  'index.tsx',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'run.sh',
  'tsconfig.json',
  'vite.config.ts',
];

function shouldSkipClassicCodeItem(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  const segments = normalized.split('/').filter(Boolean);
  return (
    normalized === '.DS_Store' ||
    normalized.endsWith('/.DS_Store') ||
    segments.includes('.git') ||
    segments.includes('node_modules') ||
    segments.includes('.build') ||
    segments.includes('dist') ||
    segments.includes('dist-electron') ||
    segments.includes('.venv') ||
    segments.includes('.dnote_cache') ||
    normalized.endsWith('/.dnote_runtime.json')
  );
}

function shouldAlwaysOverwrite(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  return (
    normalized.startsWith('CORE/') ||
    normalized.startsWith('APP/') ||
    normalized.startsWith('scripts/') ||
    normalized === 'package.json' ||
    normalized === 'tsconfig.json' ||
    normalized === 'vite.config.ts' ||
    normalized === 'index.html' ||
    normalized === 'index.tsx' ||
    normalized === 'run.sh'
  );
}

function copyClassicCodeItemSync(src: string, dest: string, relativePath: string, overwrite: boolean) {
  if (!fs.existsSync(src) || shouldSkipClassicCodeItem(relativePath)) return;

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyClassicCodeItemSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
        path.join(relativePath, childItemName),
        overwrite
      );
    });
    return;
  }

  if (overwrite || shouldAlwaysOverwrite(relativePath) || !fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function isGitAvailableSync(): boolean {
  try {
    execSync('git --version', { env: getSecureEnv(), stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function initializeClassicWorkspaceGit(workspaceRoot: string) {
  if (!fs.existsSync(workspaceRoot)) {
    return { available: false, initialized: false, reason: 'workspace missing' };
  }
  if (fs.existsSync(path.join(workspaceRoot, '.git'))) {
    return { available: true, initialized: false, reason: 'already initialized' };
  }
  if (!isGitAvailableSync()) {
    return { available: false, initialized: false, reason: 'git not found' };
  }

  const env = getSecureEnv();
  try {
    execSync('git init', { cwd: workspaceRoot, env, stdio: 'ignore' });
    execSync('git config user.name "Galois Workbench"', { cwd: workspaceRoot, env, stdio: 'ignore' });
    execSync('git config user.email "galois-workbench@local"', { cwd: workspaceRoot, env, stdio: 'ignore' });
    execSync('git add .', { cwd: workspaceRoot, env, stdio: 'ignore' });
    try {
      execSync('git commit -m "Initialize Galois external workbench"', { cwd: workspaceRoot, env, stdio: 'ignore' });
    } catch (_) {
      // Commit can be skipped if the copied seed has no tracked changes.
    }
    return { available: true, initialized: true, reason: 'initialized' };
  } catch (err: any) {
    console.warn('[classic-code] Failed to initialize git workbench:', err?.message || err);
    return { available: true, initialized: false, reason: err?.message || 'git init failed' };
  }
}

function assertClassicWorkspaceRunnable(workspaceRoot: string) {
  const requiredPaths = [
    'package.json',
    'index.tsx',
    path.join('CORE', 'main.ts'),
    path.join('CORE', 'preload.ts'),
    'APP',
  ];
  const missing = requiredPaths.filter((item) => !fs.existsSync(path.join(workspaceRoot, item)));
  if (missing.length > 0) {
    throw new Error(`External Galois workbench is incomplete. Missing: ${missing.join(', ')}`);
  }
}

function writeClassicWorkspaceScripts(sourceRoot: string, workspaceRoot: string) {
  const launcherDir = path.dirname(workspaceRoot);
  fs.mkdirSync(launcherDir, { recursive: true });

  // ── Unix Shell Scripts ──────────────────────────────────────────────────────
  const runScript = `#!/bin/bash
set -e
cd ${quoteShellArg(workspaceRoot)}
PID_FILE=${quoteShellArg(path.join(launcherDir, 'galois-workbench.pid'))}
echo $$ > "$PID_FILE"
cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT
echo "Starting external Galois workbench:"
echo "  ${workspaceRoot}"
echo "This process uses the external CORE/, APP/, docs/, and .agents/ tree."
if [ ! -f package.json ] || [ ! -f CORE/main.ts ] || [ ! -f CORE/preload.ts ] || [ ! -d APP ]; then
  echo "External Galois workbench is incomplete. Restore it with:"
  echo "  ${path.join(launcherDir, 'restore-galois-workbench.sh')}"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run the editable Galois workbench."
  echo "Install it with: brew install node"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install Galois workbench dependencies."
  exit 1
fi
if command -v git >/dev/null 2>&1; then
  if [ ! -d .git ]; then
    git init >/dev/null
    git config user.name "Galois Workbench"
    git config user.email "galois-workbench@local"
    git add .
    git commit -m "Initialize Galois external workbench" >/dev/null 2>&1 || true
  fi
else
  echo "Warning: git was not found. Agent rollback will fall back to the classic restore script."
fi
if [ ! -d node_modules ]; then
  npm install
fi
if npm run | grep -q "fix:native"; then
  npm run fix:native
fi
npm run dev
`;
  const runScriptPath = path.join(launcherDir, 'run-galois-workbench.sh');
  fs.writeFileSync(runScriptPath, runScript, 'utf-8');
  fs.chmodSync(runScriptPath, 0o755);

  const restartScript = `#!/bin/bash
set -e
LAUNCHER_DIR=${quoteShellArg(launcherDir)}
WORKSPACE_ROOT=${quoteShellArg(workspaceRoot)}
PID_FILE="$LAUNCHER_DIR/galois-workbench.pid"
LOG_DIR=${quoteShellArg(path.join(getGaloisHomePath(), 'logs'))}
mkdir -p "$LOG_DIR"
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" >/dev/null 2>&1; then
    echo "Stopping existing Galois workbench process group: $OLD_PID"
    kill -TERM "-$OLD_PID" >/dev/null 2>&1 || kill -TERM "$OLD_PID" >/dev/null 2>&1 || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi
cd "$WORKSPACE_ROOT"
echo "Starting Galois workbench with HMR..."
nohup "$LAUNCHER_DIR/run-galois-workbench.sh" >> "$LOG_DIR/external-workbench.log" 2>&1 &
echo "Galois workbench restart requested."
`;
  const restartScriptPath = path.join(launcherDir, 'restart-galois-workbench.sh');
  fs.writeFileSync(restartScriptPath, restartScript, 'utf-8');
  fs.chmodSync(restartScriptPath, 0o755);

  const rebuildScript = `#!/bin/bash
set -e
LAUNCHER_DIR=${quoteShellArg(launcherDir)}
WORKSPACE_ROOT=${quoteShellArg(workspaceRoot)}
cd "$WORKSPACE_ROOT"
echo "Rebuilding Electron CORE/preload, then reopening Galois..."
npm run build:electron
"$LAUNCHER_DIR/restart-galois-workbench.sh"
`;
  const rebuildScriptPath = path.join(launcherDir, 'rebuild-and-reopen-galois-workbench.sh');
  fs.writeFileSync(rebuildScriptPath, rebuildScript, 'utf-8');
  fs.chmodSync(rebuildScriptPath, 0o755);

  const sameSourceAndTarget = path.resolve(sourceRoot) === path.resolve(workspaceRoot);
  const restoreScript = sameSourceAndTarget
    ? `#!/bin/bash
set -e
echo "Restore refused: classic source and external workbench resolve to the same directory."
echo "Use Git in ${workspaceRoot} or sync from a separate source checkout with npm run sync:workbench."
exit 1
`
    : `#!/bin/bash
set -e
SOURCE=${quoteShellArg(sourceRoot)}
TARGET=${quoteShellArg(workspaceRoot)}
if [ ! -d "$SOURCE" ]; then
  echo "Classic source not found: $SOURCE"
  exit 1
fi
rm -rf "$TARGET"
mkdir -p "$TARGET"
rsync -a --exclude '.git' --exclude 'node_modules' --exclude '.build' --exclude 'dist' --exclude 'dist-electron' --exclude '.DS_Store' "$SOURCE"/ "$TARGET"/
cd "$TARGET"
if command -v git >/dev/null 2>&1; then
  git init >/dev/null
  git config user.name "Galois Workbench"
  git config user.email "galois-workbench@local"
  git add .
  git commit -m "Restore classic Galois workbench" >/dev/null 2>&1 || true
else
  echo "Warning: git was not found. Classic code restored without a git checkpoint."
fi
echo "Restored classic Galois code to $TARGET"
`;
  const restoreScriptPath = path.join(launcherDir, 'restore-galois-workbench.sh');
  fs.writeFileSync(restoreScriptPath, restoreScript, 'utf-8');
  fs.chmodSync(restoreScriptPath, 0o755);

  // ── Windows Batch Scripts ──────────────────────────────────────────────────
  const winRunScript = `@echo off
cd /d "${workspaceRoot}"
set "PID_FILE=${path.join(launcherDir, 'galois-workbench.pid')}"
for /f "usebackq tokens=*" %%i in (\`node -e "console.log(process.ppid)"\`) do set MY_PID=%%i
echo %MY_PID% > "%PID_FILE%"

echo Starting external Galois workbench:
echo   ${workspaceRoot}
echo This process uses the external CORE/, APP/, docs/, and .agents/ tree.

if not exist package.json goto INCOMPLETE
if not exist CORE\\main.ts goto INCOMPLETE
if not exist CORE\\preload.ts goto INCOMPLETE
if not exist APP goto INCOMPLETE
goto ENVIRONMENT

:INCOMPLETE
echo External Galois workbench is incomplete. Restore it with:
echo   ${path.join(launcherDir, 'restore-galois-workbench.bat')}
del "%PID_FILE%"
exit /b 1

:ENVIRONMENT
where.exe node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Node.js is required to run the editable Galois workbench.
  echo Install it from https://nodejs.org/
  del "%PID_FILE%"
  exit /b 1
)

where.exe npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo npm is required to install Galois workbench dependencies.
  del "%PID_FILE%"
  exit /b 1
)

where.exe git >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  if not exist .git (
    git init >nul
    git config user.name "Galois Workbench"
    git config user.email "galois-workbench@local"
    git add .
    git commit -m "Initialize Galois external workbench" >nul 2>nul
  )
) else (
  echo Warning: git was not found. Agent rollback will fall back to the classic restore script.
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)

findstr /C:"fix:native" package.json >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  call npm run fix:native
)

call npm run dev
del "%PID_FILE%"
`;
  fs.writeFileSync(path.join(launcherDir, 'run-galois-workbench.bat'), winRunScript, 'utf-8');

  const winRestartScript = `@echo off
set "LAUNCHER_DIR=${launcherDir}"
set "WORKSPACE_ROOT=${workspaceRoot}"
set "PID_FILE=%LAUNCHER_DIR%\\galois-workbench.pid"
set "LOG_DIR=${path.join(getGaloisHomePath(), 'logs')}"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if exist "%PID_FILE%" (
  set /p OLD_PID=<"%PID_FILE%"
  if not "%OLD_PID%"=="" (
    echo Stopping existing Galois workbench process: %OLD_PID%
    taskkill /f /t /pid %OLD_PID% >nul 2>nul
  )
  del "%PID_FILE%"
)

cd /d "%WORKSPACE_ROOT%"
echo Starting Galois workbench with HMR...
start "" /b cmd /c "%LAUNCHER_DIR%\\run-galois-workbench.bat" >> "%LOG_DIR%\\external-workbench.log" 2>&1
echo Galois workbench restart requested.
`;
  fs.writeFileSync(path.join(launcherDir, 'restart-galois-workbench.bat'), winRestartScript, 'utf-8');

  const winRebuildScript = `@echo off
set "LAUNCHER_DIR=${launcherDir}"
set "WORKSPACE_ROOT=${workspaceRoot}"
cd /d "%WORKSPACE_ROOT%"
echo Rebuilding Electron CORE/preload, then reopening Galois...
call npm run build:electron
call "%LAUNCHER_DIR%\\restart-galois-workbench.bat"
`;
  fs.writeFileSync(path.join(launcherDir, 'rebuild-and-reopen-galois-workbench.bat'), winRebuildScript, 'utf-8');

  const winRestoreScript = sameSourceAndTarget
    ? `@echo off
echo Restore refused: classic source and external workbench resolve to the same directory.
echo Use Git in ${workspaceRoot} or sync from a separate source checkout with npm run sync:workbench.
exit /b 1
`
    : `@echo off
set "SOURCE=${sourceRoot}"
set "TARGET=${workspaceRoot}"

if not exist "%SOURCE%" (
  echo Classic source not found: %SOURCE%
  exit /b 1
)

echo Restoring classic Galois workbench...
if exist "%TARGET%" rmdir /s /q "%TARGET%"
mkdir "%TARGET%"
robocopy "%SOURCE%" "%TARGET%" /E /XD .git node_modules .build dist dist-electron .venv .dnote_cache /XF .DS_Store >nul
set ERRORLEVEL=0

cd /d "%TARGET%"
where.exe git >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  git init >nul
  git config user.name "Galois Workbench"
  git config user.email "galois-workbench@local"
  git add .
  git commit -m "Restore classic Galois workbench" >nul 2>nul
) else (
  echo Warning: git was not found. Classic code restored without a git checkpoint.
)
echo Restored classic Galois code to %TARGET%
`;
  fs.writeFileSync(path.join(launcherDir, 'restore-galois-workbench.bat'), winRestoreScript, 'utf-8');
}

function syncClassicCodeWorkspace(overwrite = false) {
  const sourceRoot = getClassicCodeSourcePath();
  const workspaceRoot = getClassicCodeWorkspacePath();
  if (!fs.existsSync(sourceRoot)) {
    console.warn('[classic-code] Source not found:', sourceRoot);
    return { sourcePath: sourceRoot, workspacePath: workspaceRoot, copied: false };
  }

  const versionMarkerPath = path.join(workspaceRoot, '.workspace_version');
  const currentVersion = app.getVersion();

  // If in production packaged app and workspace matches current version, skip copying
  if (app.isPackaged && !overwrite && fs.existsSync(versionMarkerPath)) {
    try {
      const savedVersion = fs.readFileSync(versionMarkerPath, 'utf-8').trim();
      if (savedVersion === currentVersion) {
        console.log('[classic-code] Workspace is up-to-date, skipping sync');
        return { sourcePath: sourceRoot, workspacePath: workspaceRoot, copied: false };
      }
    } catch (_) {}
  }

  if (overwrite) {
    removePathIfExists(workspaceRoot);
  }
  fs.mkdirSync(workspaceRoot, { recursive: true });

  CLASSIC_CODE_ITEMS.forEach((item) => {
    copyClassicCodeItemSync(
      path.join(sourceRoot, item),
      path.join(workspaceRoot, item),
      item,
      overwrite
    );
  });
  assertClassicWorkspaceRunnable(workspaceRoot);
  writeClassicWorkspaceScripts(sourceRoot, workspaceRoot);
  const git = initializeClassicWorkspaceGit(workspaceRoot);

  try {
    fs.writeFileSync(versionMarkerPath, currentVersion, 'utf-8');
  } catch (_) {}

  return { sourcePath: sourceRoot, workspacePath: workspaceRoot, copied: true, git };
}

function shouldSkipTemplateItem(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  const segments = normalized.split('/');
  return (
    normalized === '.dnote_runtime.json' ||
    normalized.endsWith('/.dnote_runtime.json') ||
    normalized === 'AGENTS.md' ||
    normalized.endsWith('/AGENTS.md') ||
    segments.includes('.venv') ||
    segments.includes('.agents') ||
    segments.includes('.agent') ||
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
    if (process.platform === 'darwin' && versionMatch) {
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
  return path.join(getClassicCodeSourcePath(), 'template-project');
}

function getDefaultNotebookProjectPath(): string {
  return path.join(app.getPath('documents'), 'Galois Projects', 'Getting Started');
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

const initUserData = () => initializeUserData({
  ensureDefaultNotebookProject,
  getDefaultAppConfig,
  getGaloisConfigPath,
  getGaloisHomePath,
  getGaloisShortcutsPath,
  syncClassicCodeWorkspace,
});


  return { ensureDefaultNotebookProject, getDefaultNotebookProjectPath, initUserData, syncClassicCodeWorkspace };
}
