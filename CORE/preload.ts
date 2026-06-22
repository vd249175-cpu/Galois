import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Filesystem access
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  archiveMedia: (srcPath: string, projectPath: string) => ipcRenderer.invoke('fs:archiveMedia', { srcPath, projectPath }),
  
  // Terminal commands execution
  execCommand: (command: string, cwd: string) => ipcRenderer.invoke('shell:exec', command, cwd),
  
  // Windows popping out
  openSecondaryWindow: (id: string, componentType: string, title: string) => 
    ipcRenderer.invoke('window:openSecondary', { id, componentType, title }),
  closeSecondaryWindow: (id: string) => ipcRenderer.invoke('window:closeSecondary', id),
  
  // Listeners
  onSecondaryClosed: (callback: (id: string) => void) => {
    const listener = (_event: any, id: string) => callback(id);
    ipcRenderer.on('window:secondaryClosed', listener);
    return () => {
      ipcRenderer.removeListener('window:secondaryClosed', listener);
    };
  }
});
