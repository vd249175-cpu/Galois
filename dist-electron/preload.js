"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Filesystem access
    readFile: (filePath) => electron_1.ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content) => electron_1.ipcRenderer.invoke('fs:writeFile', filePath, content),
    listDir: (dirPath) => electron_1.ipcRenderer.invoke('fs:listDir', dirPath),
    // Terminal commands execution
    execCommand: (command, cwd) => electron_1.ipcRenderer.invoke('shell:exec', command, cwd),
    // Windows popping out
    openSecondaryWindow: (id, componentType, title) => electron_1.ipcRenderer.invoke('window:openSecondary', { id, componentType, title }),
    closeSecondaryWindow: (id) => electron_1.ipcRenderer.invoke('window:closeSecondary', id),
    // Listeners
    onSecondaryClosed: (callback) => {
        const listener = (_event, id) => callback(id);
        electron_1.ipcRenderer.on('window:secondaryClosed', listener);
        return () => {
            electron_1.ipcRenderer.removeListener('window:secondaryClosed', listener);
        };
    }
});
