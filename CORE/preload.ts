import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Filesystem ────────────────────────────────────────────────────────────
  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('fs:deleteFile', filePath),
  renameFile: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke('fs:renameFile', oldPath, newPath),
  listDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:listDir', dirPath),
  pathExists: (targetPath: string) =>
    ipcRenderer.invoke('fs:pathExists', targetPath),
  watchFile: (filePath: string) =>
    ipcRenderer.invoke('fs:watchFile', filePath),
  unwatchFile: (filePath: string) =>
    ipcRenderer.invoke('fs:unwatchFile', filePath),
  onFileChanged: (callback: (payload: { path: string; exists: boolean; mtimeMs: number; size: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { path: string; exists: boolean; mtimeMs: number; size: number }) => callback(payload);
    ipcRenderer.on('fs:fileChanged', listener);
    return () => ipcRenderer.removeListener('fs:fileChanged', listener);
  },
  openDirectory: () =>
    ipcRenderer.invoke('dialog:openDirectory'),
  archiveMedia: (srcPath: string, projectPath: string) =>
    ipcRenderer.invoke('fs:archiveMedia', { srcPath, projectPath }),
  archiveMediaData: (fileName: string, mimeType: string, data: ArrayBuffer, projectPath: string) =>
    ipcRenderer.invoke('fs:archiveMediaData', { fileName, mimeType, data, projectPath }),
  archiveVideo: (srcPath: string, projectPath: string) =>
    ipcRenderer.invoke('fs:archiveVideo', { srcPath, projectPath }),
  getPathForFile: (file: File) =>
    webUtils.getPathForFile(file),
  writeClipboardText: (text: string) =>
    ipcRenderer.invoke('clipboard:writeText', text),
  playMediaWithMpv: (request: { filePath: string; title?: string; start?: number; end?: number }) =>
    ipcRenderer.invoke('media:playWithMpv', request),

  // ── Shell / Script execution ──────────────────────────────────────────────
  /** 执行任意 shell 命令（用于生命周期脚本等） */
  execCommand: (command: string, cwd: string) =>
    ipcRenderer.invoke('shell:exec', command, cwd),
  openTerminal: (dirPath: string) =>
    ipcRenderer.invoke('shell:openTerminal', dirPath),
  openAgentTerminal: (dirPath: string) =>
    ipcRenderer.invoke('shell:openAgentTerminal', dirPath),

  /**
   * 通用脚本运行器 — 用 uv 运行 Python 脚本
   * 替代旧的 calculateLattice；插件自行传入脚本路径
   *
   * @param scriptPath  脚本绝对路径（由 getServiceScriptPath 获取）
   * @param stdin       写入 stdin 的字符串 payload（JSON 等）
   * @param cwd         工作目录（通常是 projectPath）
   * @returns { stdout: string, stderr: string }
   */
  runScript: (scriptPath: string, stdin: string, cwd: string, envExtra?: Record<string, string>) =>
    ipcRenderer.invoke('shell:runScript', scriptPath, stdin, cwd, envExtra),
  runProjectScript: (projectPath: string, request: {
    command?: string;
    scriptName?: string;
    cwd?: string;
    stdin?: string;
    envExtra?: Record<string, string>;
    useUv?: boolean;
  }) =>
    ipcRenderer.invoke('shell:runProjectScript', projectPath, request),

  /**
   * 获取 APP 插件 services/ 目录下脚本的绝对路径
   * e.g. getServiceScriptPath('graph-view', 'lattice.py')
   */
  getServiceScriptPath: (pluginFolder: string, scriptName: string) =>
    ipcRenderer.invoke('shell:getServiceScriptPath', pluginFolder, scriptName),
  getExtensionServiceScriptPath: (extensionId: string, scriptName: string) =>
    ipcRenderer.invoke('shell:getExtensionServiceScriptPath', extensionId, scriptName),
  diagnoseExtensionService: (extensionId: string, serviceName: string) =>
    ipcRenderer.invoke('shell:diagnoseExtensionService', extensionId, serviceName),

  /** 获取 Electron app 根目录（Galois 程序目录） */
  getAppPath: () =>
    ipcRenderer.invoke('app:getAppPath'),
  getRuntimeInfo: () =>
    ipcRenderer.invoke('app:getRuntimeInfo'),
  listAppPluginEntries: () =>
    ipcRenderer.invoke('app:listAppPluginEntries'),
  getClassicCodeWorkspace: () =>
    ipcRenderer.invoke('app:getClassicCodeWorkspace'),
  restoreClassicCodeWorkspace: () =>
    ipcRenderer.invoke('app:restoreClassicCodeWorkspace'),
  ensureExtensionsDir: () =>
    ipcRenderer.invoke('app:ensureExtensionsDir'),
  listExtensions: () =>
    ipcRenderer.invoke('app:listExtensions'),
  seedExtensions: () =>
    ipcRenderer.invoke('app:seedExtensions'),
  addExtensionDevPath: (devPath: string) =>
    ipcRenderer.invoke('app:addExtensionDevPath', devPath),
  removeExtensionDevPath: (devPath: string) =>
    ipcRenderer.invoke('app:removeExtensionDevPath', devPath),
  openPath: (targetPath: string) =>
    ipcRenderer.invoke('app:openPath', targetPath),
  importExtensionArchive: (archivePath: string) =>
    ipcRenderer.invoke('app:importExtensionArchive', archivePath),
  getEnvironmentStatus: () =>
    ipcRenderer.invoke('app:getEnvironmentStatus'),
  inspectProjectEnvironment: (projectPath: string) =>
    ipcRenderer.invoke('app:inspectProjectEnvironment', projectPath),
  repairProjectEnvironment: (projectPath: string) =>
    ipcRenderer.invoke('app:repairProjectEnvironment', projectPath),
  ensureNotebookProjectDeclaration: (projectPath: string) =>
    ipcRenderer.invoke('app:ensureNotebookProjectDeclaration', projectPath),
  inspectPluginEnvironment: (extensionId: string) =>
    ipcRenderer.invoke('app:inspectPluginEnvironment', extensionId),
  repairPluginEnvironment: (extensionId: string) =>
    ipcRenderer.invoke('app:repairPluginEnvironment', extensionId),

  logRendererError: (errorMsg: any) =>
    ipcRenderer.invoke('app:logRendererError', errorMsg),

  // ── Window management ─────────────────────────────────────────────────────
  openSecondaryWindow: (id: string, componentType: string, title: string) =>
    ipcRenderer.invoke('window:openSecondary', { id, componentType, title }),
  closeSecondaryWindow: (id: string) =>
    ipcRenderer.invoke('window:closeSecondary', id),

  onSecondaryClosed: (callback: (id: string) => void) => {
    const listener = (_event: any, id: string) => callback(id);
    ipcRenderer.on('window:secondaryClosed', listener);
    return () => { ipcRenderer.removeListener('window:secondaryClosed', listener); };
  },

  // ── Blood state sync (cross-window) ───────────────────────────────────────
  getBloodState: () =>
    ipcRenderer.invoke('blood:getInitialState'),
  updateBloodState: (values: Record<string, any>) =>
    ipcRenderer.invoke('blood:updateState', values),
  onBloodStateChanged: (callback: (values: Record<string, any>) => void) => {
    const listener = (_event: any, values: Record<string, any>) => callback(values);
    ipcRenderer.on('blood:stateChanged', listener);
    return () => { ipcRenderer.removeListener('blood:stateChanged', listener); };
  },

  // ── Persistent Terminal Process Management ──────────────────────────────────
  spawnTerminal: (id: string, cwd: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:spawn', id, cwd, cols, rows),
  writeTerminal: (id: string, data: string) =>
    ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),
  killTerminal: (id: string) =>
    ipcRenderer.invoke('terminal:kill', id),
  onTerminalOutput: (id: string, callback: (data: string) => void) => {
    const listener = (_event: any, data: string) => callback(data);
    ipcRenderer.on(`terminal:output:${id}`, listener);
    return () => { ipcRenderer.removeListener(`terminal:output:${id}`, listener); };
  },
  onTerminalExit: (id: string, callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(`terminal:exit:${id}`, listener);
    return () => { ipcRenderer.removeListener(`terminal:exit:${id}`, listener); };
  },

  // ── Config, Shortcuts, Layout and Dev Defaults ─────────────────────────────
  getDevDefaultProject: () =>
    ipcRenderer.invoke('app:getDevDefault'),
  getConfig: () =>
    ipcRenderer.invoke('app:getConfig'),
  setConfig: (config: any) =>
    ipcRenderer.invoke('app:setConfig', config),
  listThemes: () =>
    ipcRenderer.invoke('app:listThemes'),
  getThemeCss: (themeId: string) =>
    ipcRenderer.invoke('app:getThemeCss', themeId),
  getShortcuts: () =>
    ipcRenderer.invoke('app:getShortcuts'),
  setShortcuts: (shortcuts: any) =>
    ipcRenderer.invoke('app:setShortcuts', shortcuts),
  getLayout: () =>
    ipcRenderer.invoke('app:getLayout'),
  setLayout: (layout: any) =>
    ipcRenderer.invoke('app:setLayout', layout),
  getProjectState: (projectPath: string) =>
    ipcRenderer.invoke('app:getProjectState', projectPath),
  setProjectState: (projectPath: string, state: any) =>
    ipcRenderer.invoke('app:setProjectState', projectPath, state),
  getLastProjectPath: () =>
    ipcRenderer.invoke('app:getLastProjectPath'),
  setLastProjectPath: (projectPath: string) =>
    ipcRenderer.invoke('app:setLastProjectPath', projectPath),
  onConfigFileChanged: (callback: (payload: { kind: 'config' | 'shortcuts' | 'themes'; path: string; timestamp: number }) => void) => {
    const listener = (_event: any, payload: { kind: 'config' | 'shortcuts' | 'themes'; path: string; timestamp: number }) => callback(payload);
    ipcRenderer.on('app:configFileChanged', listener);
    return () => { ipcRenderer.removeListener('app:configFileChanged', listener); };
  },
});
