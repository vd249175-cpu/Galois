const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const launcherDir = path.dirname(root);
const restartScript = path.join(launcherDir, 'restart-galois-workbench.sh');

if (!fs.existsSync(restartScript)) {
  console.log('[restart:workbench] External workbench restart script was not found.');
  console.log('[restart:workbench] In source development, restart Electron manually with npm run dev.');
  console.log(`[restart:workbench] Expected packaged-workbench script: ${restartScript}`);
  process.exit(0);
}

const result = spawnSync('bash', [restartScript], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 0);
