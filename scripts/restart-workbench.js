const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const launcherDir = path.dirname(root);
const isWin = process.platform === 'win32';
const scriptName = isWin ? 'restart-galois-workbench.bat' : 'restart-galois-workbench.sh';
const restartScript = path.join(launcherDir, scriptName);

if (!fs.existsSync(restartScript)) {
  console.log('[restart:workbench] External workbench restart script was not found.');
  console.log('[restart:workbench] In source development, restart Electron manually with npm run dev.');
  console.log(`[restart:workbench] Expected packaged-workbench script: ${restartScript}`);
  process.exit(0);
}

const spawnCmd = isWin ? 'cmd.exe' : 'bash';
const spawnArgs = isWin ? ['/c', restartScript] : [restartScript];

const result = spawnSync(spawnCmd, spawnArgs, {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 0);
