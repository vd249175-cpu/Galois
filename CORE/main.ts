import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

let mainWindow: BrowserWindow | null = null;
const secondaryWindows = new Map<string, BrowserWindow>();

function createMainWindow() {
  mainWindow = new BrowserWindow({
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
  } else {
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

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Filesystem APIs
ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    throw new Error(`Failed to read file: ${err.message}`);
  }
});

ipcMain.handle('fs:writeFile', async (_, filePath: string, content: string) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err: any) {
    throw new Error(`Failed to write file: ${err.message}`);
  }
});

ipcMain.handle('fs:listDir', async (_, dirPath: string) => {
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
  } catch (err: any) {
    throw new Error(`Failed to list directory: ${err.message}`);
  }
});

// IPC Exec/Shell API
ipcMain.handle('shell:exec', async (_, command: string, cwd: string) => {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
});

// IPC Window Manager APIs for Popped-out panels
ipcMain.handle('window:openSecondary', async (_, { id, componentType, title }: { id: string; componentType: string; title: string }) => {
  if (secondaryWindows.has(id)) {
    secondaryWindows.get(id)?.focus();
    return;
  }

  const win = new BrowserWindow({
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
  } else {
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

ipcMain.handle('window:closeSecondary', async (_, id: string) => {
  const win = secondaryWindows.get(id);
  if (win) {
    win.close();
  }
});
