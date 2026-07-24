import { app } from 'electron';
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function createRuntimeServices(deps: any) {
  const {
    ensureParentDir, getClassicCodeWorkspacePath, getGaloisConfigPath,
    getGaloisHomePath, getGaloisLogPath,
  } = deps;
function getSecureEnv() {
  const userEnv = { ...process.env };
  const homeDir = os.homedir();
  const utf8Locale = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8';
  const delimiter = path.delimiter;
  const commonPaths = process.platform === 'win32' ? [
    path.join(homeDir, '.cargo', 'bin'),
    path.join(homeDir, '.local', 'bin'),
    'C:\\Windows\\system32',
    'C:\\Windows',
    'C:\\Windows\\System32\\Wbem',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\'
  ] : [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(homeDir, '.cargo/bin'),
    path.join(homeDir, '.local/bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];
  
  let pathKey = 'PATH';
  for (const k of Object.keys(userEnv)) {
    if (k.toUpperCase() === 'PATH') {
      pathKey = k;
      break;
    }
  }
  
  const existingPath = userEnv[pathKey] || '';
  const allPaths = Array.from(new Set([
    ...existingPath.split(delimiter),
    ...commonPaths
  ])).filter(Boolean);
  
  userEnv[pathKey] = allPaths.join(delimiter);
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
  const isWin = process.platform === 'win32';
  const scriptName = isWin ? 'run-galois-workbench.bat' : 'run-galois-workbench.sh';
  const runScriptPath = path.join(path.dirname(getClassicCodeWorkspacePath()), scriptName);
  if (!fs.existsSync(runScriptPath)) {
    throw new Error(`External workbench launcher not found: ${runScriptPath}`);
  }

  const logPath = getGaloisLogPath('external-workbench.log');
  ensureParentDir(logPath);
  const logFd = fs.openSync(logPath, 'a');
  
  const spawnCmd = isWin ? 'cmd.exe' : runScriptPath;
  const spawnArgs = isWin ? ['/c', runScriptPath] : [];

  const child = spawn(spawnCmd, spawnArgs, {
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
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? `where.exe ${command}` : `command -v ${quoteShellArg(command)}`;
    const which = await runShellCommand(checkCmd, os.homedir(), getSecureEnv());
    let version = '';
    try {
      const execName = isWin ? command : quoteShellArg(command);
      const result = await runShellCommand(`${execName} ${versionArgs}`, os.homedir(), getSecureEnv());
      version = (result.stdout || result.stderr).trim().split('\n')[0] || '';
    } catch (err: any) {
      version = err.message || '';
    }
    const toolPath = which.stdout.trim().split('\r\n')[0].split('\n')[0];
    return { available: true, path: toolPath, version };
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


  return {
    assertWritableTarget, canWriteDirectory, checkTool, getExtensionDevPaths,
    getRuntimeInfo, getSourcePluginPath, getUserExtensionsPath, getSecureEnv,
    isInsidePath, launchExternalWorkbench, listExtensionsFromDevPath,
    listUserExtensions, quoteAppleScriptString, quoteCmdArg, quoteShellArg,
    readUserConfig, repairProjectEnvironment: undefined, resolveExtensionRoot,
    runShellCommand, setExtensionDevPaths, shouldLaunchExternalWorkbench,
  };
}

