const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

exports.default = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  const packagePath = path.join(context.packager.projectDir, '.launcher-app', 'package.json');

  if (!fs.existsSync(asarPath) || !fs.existsSync(packagePath)) {
    return;
  }

  const tempDir = path.join(context.packager.projectDir, '.launcher-app-asar');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  asar.extractAll(asarPath, tempDir);
  fs.copyFileSync(packagePath, path.join(tempDir, 'package.json'));
  fs.rmSync(asarPath, { force: true });
  await asar.createPackage(tempDir, asarPath);
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('[afterPack] injected launcher package.json into app.asar');
};
