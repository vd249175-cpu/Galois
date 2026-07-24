import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function registerAppIpcHandlers(deps: any) {
  const {
    assertWritableTarget, checkTool, ensureDefaultNotebookProject, ensureParentDir,
    getClassicCodeSourcePath, getClassicCodeWorkspacePath, getExtensionDevPaths,
    getGaloisLogPath, getRuntimeInfo, getSecureEnv, getUserExtensionsPath,
    inspectPluginEnvironment, inspectProjectEnvironment, listUserExtensions,
    quoteShellArg, repairPluginEnvironment, repairProjectEnvironment, runShellCommand,
    setExtensionDevPaths, syncClassicCodeWorkspace,
  } = deps;
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
  const devPaths = getExtensionDevPaths().filter((item: string) => item !== resolvedPath);
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
  const extension = listUserExtensions().find((item: any) => item.id === extensionId);
  if (!extension) throw new Error(`Extension not found: ${extensionId}`);
  return inspectPluginEnvironment(extension.id, extension.path, extension.manifestPath, getSecureEnv());
});

ipcMain.handle('app:repairPluginEnvironment', async (_, extensionId: string) => {
  const extension = listUserExtensions().find((item: any) => item.id === extensionId);
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

}
