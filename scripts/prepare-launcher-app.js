const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const launcherDir = path.join(root, '.launcher-app');

function copyRequiredDir(name) {
  const src = path.join(root, name);
  const dest = path.join(launcherDir, name);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing build output: ${name}`);
  }
  fs.cpSync(src, dest, { recursive: true });
}

fs.rmSync(launcherDir, { recursive: true, force: true });
fs.mkdirSync(launcherDir, { recursive: true });

copyRequiredDir('dist');
copyRequiredDir('dist-electron');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const launcherPackage = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description || 'Galois launcher',
  main: packageJson.main,
  type: packageJson.type,
  license: packageJson.license,
  dependencies: {},
};

fs.writeFileSync(
  path.join(launcherDir, 'package.json'),
  JSON.stringify(launcherPackage, null, 2),
  'utf-8'
);

console.log(`[prepare:launcher] prepared ${launcherDir}`);
