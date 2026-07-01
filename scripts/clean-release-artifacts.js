const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, '.build');

if (!fs.existsSync(buildDir)) {
  console.log('[clean:release] .build does not exist');
  process.exit(0);
}

for (const entry of fs.readdirSync(buildDir)) {
  const fullPath = path.join(buildDir, entry);
  const shouldRemove =
    entry === 'mac' ||
    entry === 'mac-arm64' ||
    entry.endsWith('.dmg') ||
    entry.endsWith('.dmg.blockmap');

  if (shouldRemove) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`[clean:release] removed .build/${entry}`);
  }
}
