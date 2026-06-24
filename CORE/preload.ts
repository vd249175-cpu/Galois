import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Filesystem ────────────────────────────────────────────────────────────
  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('fs:deleteFile', filePath),
  listDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:listDir', dirPath),
  openDirectory: () =>
    ipcRenderer.invoke('dialog:openDirectory'),
  archiveMedia: (srcPath: string, projectPath: string) =>
    ipcRenderer.invoke('fs:archiveMedia', { srcPath, projectPath }),
  getPathForFile: (file: File) =>
    webUtils.getPathForFile(file),

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
  runScript: (scriptPath: string, stdin: string, cwd: string) =>
    ipcRenderer.invoke('shell:runScript', scriptPath, stdin, cwd),

  /**
   * 获取 APP 插件 services/ 目录下脚本的绝对路径
   * e.g. getServiceScriptPath('graph-view', 'lattice.py')
   */
  getServiceScriptPath: (pluginFolder: string, scriptName: string) =>
    ipcRenderer.invoke('shell:getServiceScriptPath', pluginFolder, scriptName),

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
  spawnTerminal: (id: string, cwd: string) =>
    ipcRenderer.invoke('terminal:spawn', id, cwd),
  writeTerminal: (id: string, data: string) =>
    ipcRenderer.invoke('terminal:write', id, data),
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
});
