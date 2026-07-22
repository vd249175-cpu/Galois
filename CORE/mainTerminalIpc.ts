import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';

export function registerTerminalIpcHandlers(getSecureEnv: () => NodeJS.ProcessEnv) {
// ── PTY Terminal Manager (node-pty) ──────────────────────────────────────────
// Uses a real PTY — same as VS Code, Hyper, Warp. Supports TUI apps (agy, vim, etc.)
type PtyProcess = import('node-pty').IPty;
type PtyListener = import('node-pty').IDisposable;

const ptyProcesses = new Map<string, PtyProcess>();
const ptyListeners = new Map<string, PtyListener>();

ipcMain.handle('terminal:spawn', (event, id: string, cwd: string, cols: number, rows: number) => {
  let ptyProcess = ptyProcesses.get(id);

  // Clean up any old listener bound to a previous (potentially destroyed) WebContents
  const oldListener = ptyListeners.get(id);
  if (oldListener) {
    oldListener.dispose();
    ptyListeners.delete(id);
  }

  if (ptyProcess) {
    // Re-bind listener to the new active window's WebContents
    const listener = ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:output:${id}`, data);
      }
    });
    ptyListeners.set(id, listener);
    return true;
  }

  let shell = 'zsh';
  if (process.platform === 'win32') {
    shell = 'cmd.exe';
  } else {
    const envShell = process.env.SHELL;
    if (envShell && fs.existsSync(envShell)) {
      shell = envShell;
    } else if (fs.existsSync('/bin/zsh')) {
      shell = '/bin/zsh';
    } else if (fs.existsSync('/bin/bash')) {
      shell = '/bin/bash';
    } else {
      shell = 'zsh';
    }
  }

  let spawnCwd = cwd;
  if (!spawnCwd || !fs.existsSync(spawnCwd)) {
    spawnCwd = os.homedir();
  }

  try {
    const pty = require('node-pty') as typeof import('node-pty');
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: spawnCwd,
      env: getSecureEnv() as Record<string, string>,
    });

    const listener = ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:output:${id}`, data);
      }
    });
    ptyListeners.set(id, listener);

    ptyProcess.onExit(() => {
      ptyProcesses.delete(id);
      const listenerToDispose = ptyListeners.get(id);
      if (listenerToDispose) {
        listenerToDispose.dispose();
        ptyListeners.delete(id);
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send(`terminal:exit:${id}`);
      }
    });

    ptyProcesses.set(id, ptyProcess);
    return true;
  } catch (err: any) {
    console.error('[terminal:spawn pty error]', err);
    throw err;
  }
});

ipcMain.handle('terminal:write', (_, id: string, data: string) => {
  const ptyProcess = ptyProcesses.get(id);
  if (ptyProcess) {
    ptyProcess.write(data);
    return true;
  }
  return false;
});

ipcMain.handle('terminal:resize', (_, id: string, cols: number, rows: number) => {
  const ptyProcess = ptyProcesses.get(id);
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
    return true;
  }
  return false;
});

ipcMain.handle('terminal:kill', (_, id: string) => {
  const ptyProcess = ptyProcesses.get(id);
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcesses.delete(id);
  }
  const listener = ptyListeners.get(id);
  if (listener) {
    listener.dispose();
    ptyListeners.delete(id);
  }
  return true;
});

app.on('will-quit', () => {
  for (const [_, ptyProcess] of ptyProcesses) {
    ptyProcess.kill();
  }
  ptyProcesses.clear();
});
}
