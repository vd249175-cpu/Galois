import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function registerWindowStateIpc(deps: any) {
  const { getMainWindow, secondaryWindows } = deps;
ipcMain.handle('window:openSecondary', async (_, { id, componentType, title }: { id: string; componentType: string; title: string }) => {
  if (secondaryWindows.has(id)) {
    secondaryWindows.get(id)?.focus();
    return;
  }

  // On Windows, read saved config to pick the right overlay color for the current theme
  let overlayBg = '#f9f8f5';    // default-light bg
  let overlaySymbol = '#2b2b2f'; // default-light text color
  if (process.platform === 'win32') {
    const configPath = path.join(app.getPath('documents'), 'Galois', 'config', 'galois.config.json');
    try {
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const themeId = cfg?.theme || 'default-light';
        const themeOverlayColors: Record<string, [string, string]> = {
          'default-light': ['#f9f8f5', '#2b2b2f'],
          'default-dark':  ['#121212', '#cccccc'],
          'lavender':      ['#f0edf8', '#2b2b2f'],
          'yuebai':        ['#eef4f7', '#2b2b2f'],
          'black-gold':    ['#0a0a0a', '#d4af37'],
        };
        [overlayBg, overlaySymbol] = themeOverlayColors[themeId] || themeOverlayColors['default-light'];
      }
    } catch (_) { /* use defaults */ }
  }

  const win = new BrowserWindow({
    width: 600,
    height: 400,
    title: title || 'Workspace Pane',
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: overlayBg,
            symbolColor: overlaySymbol,
            height: 30,
          },
        }
      : {}),
    backgroundColor: overlayBg,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('maximize', () => {
    win.webContents.send('window:maximizedChange', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window:maximizedChange', false);
  });

  const queryParams = `?popped=true&areaId=${id}&type=${componentType}`;
  if (process.env.NODE_ENV === 'development') {
    win.loadURL(`http://localhost:5173/${queryParams}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: queryParams });
  }

  win.on('closed', () => {
    secondaryWindows.delete(id);
    const mainWindow = getMainWindow();
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

// Shared Blood state store across windows
let sharedState: Record<string, any> = {};

// NOTE: fs.watch project path watcher was intentionally removed.
// Per AGENTS.md §3: business-level file watching must be implemented inside
// APP organ components (e.g. file-tree plugin), not in CORE main process.
// The file-tree plugin broadcasts events.fileSaved.* when it saves files.


ipcMain.handle('blood:getInitialState', () => {
  return sharedState;
});

ipcMain.handle('blood:updateState', (event, values: Record<string, any>) => {
  sharedState = { ...sharedState, ...values };
  console.log('[Blood Main Sync] State updated:', JSON.stringify(values));
  
  // Broadcast updates to all other open windows
  const senderWebContents = event.sender;
  
  const broadcast = (win: BrowserWindow) => {
    if (!win.isDestroyed() && win.webContents !== senderWebContents) {
      win.webContents.send('blood:stateChanged', values);
    }
  };
  
  const mainWindow = getMainWindow();
  if (mainWindow) {
    broadcast(mainWindow);
  }
  for (const [_, win] of secondaryWindows) {
    broadcast(win);
  }
});

ipcMain.handle('window:setTitleBarOverlay', async (_, { color, symbolColor }: { color: string; symbolColor: string }) => {
  if (process.platform !== 'win32') return;
  try {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      (main as any).setTitleBarOverlay({ color, symbolColor, height: 30 });
    }
    for (const [_, secondary] of secondaryWindows) {
      if (!secondary.isDestroyed()) {
        (secondary as any).setTitleBarOverlay({ color, symbolColor, height: 30 });
      }
    }
  } catch (e) {
    // silently ignore if setTitleBarOverlay not available
  }
});

ipcMain.handle('window:isMaximized', (event) => {
  const windowInstance = BrowserWindow.fromWebContents(event.sender);
  return windowInstance ? windowInstance.isMaximized() : false;
});

}
