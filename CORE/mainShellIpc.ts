import { ipcMain } from 'electron';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function registerShellIpcHandlers(deps: any) {
  const {
    assertWritableTarget, getClassicCodeSourcePath, getClassicCodeWorkspacePath,
    getDefaultNotebookProjectPath, getGaloisConfigPath, getRuntimeInfo, getSecureEnv,
    isInsidePath, listUserExtensions, quoteAppleScriptString, quoteCmdArg, quoteShellArg,
    resolveExtensionRoot, runShellCommand,
  } = deps;
  let lastAgentTerminalLaunchAt = 0;
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
    const now = Date.now();
    if (now - lastAgentTerminalLaunchAt < 800) return true;
    lastAgentTerminalLaunchAt = now;
    const runtimeInfo = getRuntimeInfo();
    const extraDirs = runtimeInfo.agentWorkspace.readableDirs
      .filter((workspaceDir: string) => workspaceDir && workspaceDir !== dirPath);
    const workspaceDirs = [dirPath, ...extraDirs];

    if (process.platform === 'darwin') {
      const agyArgs = workspaceDirs.map((workspaceDir: string) => `--add-dir ${quoteShellArg(workspaceDir)}`).join(' ');
      const agentCommand = `agy ${agyArgs}`.trim();
      const shellCommand = `cd ${quoteShellArg(dirPath)} && clear && ${agentCommand}`;
      const applescript = `tell application "Terminal"
        if (count of windows) = 0 then
          do script ${quoteAppleScriptString(shellCommand)}
        else
          do script ${quoteAppleScriptString(shellCommand)} in front window
        end if
        activate
      end tell`;
      exec(`osascript -e ${quoteShellArg(applescript)}`);
    } else if (process.platform === 'win32') {
      const agyArgs = workspaceDirs.map((workspaceDir: string) => `--add-dir ${quoteCmdArg(workspaceDir)}`).join(' ');
      const agentCommand = `agy ${agyArgs}`.trim();
      exec(`start cmd /k "cd /d ${quoteCmdArg(dirPath)} && ${agentCommand}"`);
    } else {
      const agyArgs = workspaceDirs.map((workspaceDir: string) => `--add-dir ${quoteShellArg(workspaceDir)}`).join(' ');
      const agentCommand = `agy ${agyArgs}`.trim();
      exec(`x-terminal-emulator -e bash -lc ${quoteShellArg(`cd ${quoteShellArg(dirPath)} && ${agentCommand}; exec bash`)}`);
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
  const configPath = getGaloisConfigPath();
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

function getPluginInterpreter(ext: string, pluginFolder: string): string {
  return getPluginInterpreterResolution(ext, pluginFolder).interpreter;
}

function getPluginInterpreterResolution(ext: string, pluginFolder: string) {
  const workbenchAppPath = path.join(getClassicCodeWorkspacePath(), 'APP');
  const classicAppPath = path.join(getClassicCodeSourcePath(), 'APP');
  
  const searchPaths = [
    path.join(workbenchAppPath, pluginFolder, 'plugin.json'),
    path.join(classicAppPath, pluginFolder, 'plugin.json'),
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
        interpreter = getPluginInterpreter(ext, pluginFolder);
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
    const quoteFn = process.platform === 'win32' ? quoteCmdArg : quoteShellArg;
    command = request.useUv === false
      ? quoteFn(scriptPath)
      : `uv run ${quoteFn(scriptPath)}`;
  }
  if (!command) {
    throw new Error('Missing project script command');
  }

  return runShellCommand(command, cwd, env, request.stdin);
});

// Resolve the absolute path of a service script inside an APP plugin folder
// e.g. getServiceScriptPath('graph-view', 'lattice.py') => APP/graph-view/services/lattice.py
ipcMain.handle('shell:getServiceScriptPath', async (_, pluginFolder: string, scriptName: string) => {
  const workbenchScriptPath = path.join(getClassicCodeWorkspacePath(), 'APP', pluginFolder, 'services', scriptName);
  if (fs.existsSync(workbenchScriptPath)) {
    return workbenchScriptPath;
  }
  return path.join(getClassicCodeSourcePath(), 'APP', pluginFolder, 'services', scriptName);
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
  const extension = listUserExtensions().find((candidate: any) => candidate.id === extensionId);
  if (!extension) {
    throw new Error(`Extension not found: ${extensionId}`);
  }

  const scriptPath = path.resolve(extension.path, 'services', serviceName);
  if (!isInsidePath(path.join(extension.path, 'services'), scriptPath)) {
    throw new Error('Extension service script must stay inside its services directory');
  }

  const ext = path.extname(scriptPath).toLowerCase();
  const pluginFolder = getPluginFolderFromPath(scriptPath) || extension.id;
  const resolution = getPluginInterpreterResolution(ext, pluginFolder);

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
}
