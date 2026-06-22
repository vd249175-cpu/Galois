"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
let mainWindow = null;
const secondaryWindows = new Map();
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        title: 'DNOTE Workspace',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    // Load Vite dev server in development, built index.html in production
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
        // Close all secondary windows when main window is closed
        for (const [_, win] of secondaryWindows) {
            win.close();
        }
        secondaryWindows.clear();
    });
}
electron_1.app.whenReady().then(() => {
    createMainWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
// IPC Filesystem APIs
electron_1.ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch (err) {
        throw new Error(`Failed to read file: ${err.message}`);
    }
});
electron_1.ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    }
    catch (err) {
        throw new Error(`Failed to write file: ${err.message}`);
    }
});
electron_1.ipcMain.handle('fs:listDir', async (_, dirPath) => {
    try {
        const items = fs.readdirSync(dirPath);
        return items.map((name) => {
            const fullPath = path.join(dirPath, name);
            const stat = fs.statSync(fullPath);
            return {
                name,
                path: fullPath,
                isDir: stat.isDirectory(),
                size: stat.size,
            };
        });
    }
    catch (err) {
        throw new Error(`Failed to list directory: ${err.message}`);
    }
});
// IPC Exec/Shell API
electron_1.ipcMain.handle('shell:exec', async (_, command, cwd) => {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
            }
            else {
                resolve({ stdout, stderr });
            }
        });
    });
});
// IPC Window Manager APIs for Popped-out panels
electron_1.ipcMain.handle('window:openSecondary', async (_, { id, componentType, title }) => {
    if (secondaryWindows.has(id)) {
        secondaryWindows.get(id)?.focus();
        return;
    }
    const win = new electron_1.BrowserWindow({
        width: 600,
        height: 400,
        title: title || 'Workspace Pane',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const queryParams = `?popped=true&areaId=${id}&type=${componentType}`;
    if (process.env.NODE_ENV === 'development') {
        win.loadURL(`http://localhost:5173/${queryParams}`);
    }
    else {
        win.loadFile(path.join(__dirname, '../index.html'), { hash: queryParams });
    }
    win.on('closed', () => {
        secondaryWindows.delete(id);
        if (mainWindow) {
            mainWindow.webContents.send('window:secondaryClosed', id);
        }
    });
    secondaryWindows.set(id, win);
});
electron_1.ipcMain.handle('window:closeSecondary', async (_, id) => {
    const win = secondaryWindows.get(id);
    if (win) {
        win.close();
    }
});
