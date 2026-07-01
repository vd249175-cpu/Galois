const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const helpers = [
  path.join(root, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper'),
  path.join(root, 'node_modules', 'node-pty', 'prebuilds', 'darwin-x64', 'spawn-helper'),
];

let fixed = 0;

for (const helper of helpers) {
  if (!fs.existsSync(helper)) continue;
  const stat = fs.statSync(helper);
  const nextMode = stat.mode | 0o755;
  if ((stat.mode & 0o111) === 0) {
    fs.chmodSync(helper, nextMode);
    fixed += 1;
    console.log(`[fix:native] chmod +x ${path.relative(root, helper)}`);
  }
}

if (fixed === 0) {
  console.log('[fix:native] native helper permissions already look OK');
}
