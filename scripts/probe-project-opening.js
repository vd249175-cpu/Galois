const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'CORE', 'main.ts'), 'utf8');
const fileIpcSource = fs.readFileSync(path.join(root, 'CORE', 'mainFileIpc.ts'), 'utf8');

assert.match(
  mainSource,
  /registerFileIpcHandlers\(\{[\s\S]*?getMainWindow:\s*\(\)\s*=>\s*mainWindow[\s\S]*?\}\);/,
  'file IPC registration must pass a live main-window getter',
);
assert.doesNotMatch(
  mainSource,
  /registerFileIpcHandlers\(\{[\s\S]*?\n\s*mainWindow,\s*\n[\s\S]*?\}\);/,
  'file IPC registration must not capture the startup null mainWindow value',
);
assert.match(
  fileIpcSource,
  /ipcMain\.handle\('dialog:openDirectory',[\s\S]*?const mainWindow = getMainWindow\(\);[\s\S]*?dialog\.showOpenDialog\(mainWindow,/,
  'the directory picker must resolve its owner window when invoked',
);

console.log('project opening validated: directory picker uses the live main window');
