import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

export function registerWindowStateIpc(deps: any) {
  const { getMainWindow, secondaryWindows } = deps;
ipcMain.handle('window:openSecondary', async (_, { id, componentType, title }: { id: string; componentType: string; title: string }) => {
  if (secondaryWindows.has(id)) {
    secondaryWindows.get(id)?.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 600,
    height: 400,
    title: title || 'Workspace Pane',
    titleBarStyle: 'hidden',
    backgroundColor: '#121212',
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

}
