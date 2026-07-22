const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const sourceRoot = path.resolve(__dirname, '..');
const targetRoot = path.join(os.homedir(), 'Documents', 'Galois', 'workbench', 'Galois-vscode-core');
const shouldReopen = process.argv.includes('--reopen');

function fail(message) {
  console.error(`[sync:workbench] ${message}`);
  process.exit(1);
}

function run(command, args, cwd = sourceRoot) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

const managedItems = [
  'APP',
  'CORE',
  '.agents',
  'assets',
  'docs',
  'scripts',
  'template-project',
  'AGENTS.md',
  'README.md',
  'index.html',
  'index.tsx',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'run.sh',
  'tsconfig.json',
  'vite.config.ts',
];

if (sourceRoot === path.resolve(targetRoot)) {
  fail('Source and target are the same directory; Build Mode must edit the workbench directly.');
}
for (const marker of ['APP', 'CORE', 'package.json', 'AGENTS.md']) {
  if (!fs.existsSync(path.join(sourceRoot, marker))) fail(`Source marker is missing: ${marker}`);
}
if (!targetRoot.endsWith(path.join('Documents', 'Galois', 'workbench', 'Galois-vscode-core'))) {
  fail(`Refusing unexpected target: ${targetRoot}`);
}

fs.mkdirSync(targetRoot, { recursive: true });
const sourcePluginRoot = path.join(sourceRoot, 'APP');
const targetPluginRoot = path.join(targetRoot, 'APP');
const sourcePluginNames = new Set(fs.readdirSync(sourcePluginRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name));
const protectedPluginNames = fs.existsSync(targetPluginRoot)
  ? fs.readdirSync(targetPluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !sourcePluginNames.has(entry.name))
    .map((entry) => entry.name)
  : [];
const protectedPluginPaths = protectedPluginNames.map((name) => `APP/${name}/`);

function isProtectedPluginPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  return protectedPluginPaths.some((pluginPath) => normalized.startsWith(pluginPath));
}

if (fs.existsSync(path.join(targetRoot, '.git'))) {
  const status = spawnSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: targetRoot, encoding: 'utf-8' },
  );
  if (status.status !== 0) fail('Could not inspect the external workbench Git state.');

  const fields = status.stdout.split('\0').filter(Boolean);
  const unprotectedChanges = [];
  for (let index = 0; index < fields.length;) {
    const record = fields[index++];
    const statusCode = record.slice(0, 2);
    const paths = [record.slice(3)];
    if ((statusCode.includes('R') || statusCode.includes('C')) && index < fields.length) {
      paths.push(fields[index++]);
    }
    if (!paths.every(isProtectedPluginPath)) unprotectedChanges.push(...paths);
  }
  if (unprotectedChanges.length > 0) {
    fail(`External workbench has uncommitted managed changes: ${unprotectedChanges.join(', ')}`);
  }
}

console.log(`[sync:workbench] Replacing managed source in ${targetRoot}`);
for (const item of managedItems) {
  const sourceItem = path.join(sourceRoot, item);
  if (!fs.existsSync(sourceItem)) continue;
  const targetItem = path.join(targetRoot, item);
  const stats = fs.statSync(sourceItem);
  if (!stats.isDirectory()) {
    fs.mkdirSync(path.dirname(targetItem), { recursive: true });
    fs.copyFileSync(sourceItem, targetItem);
    continue;
  }

  fs.mkdirSync(targetItem, { recursive: true });
  const args = ['-a', '--delete', '--exclude', '.DS_Store'];
  if (item === 'APP') {
    for (const pluginName of protectedPluginNames) {
      args.push('--exclude', `/${pluginName}/`);
    }
  }
  args.push(`${sourceItem}/`, `${targetItem}/`);
  run('rsync', args);
}

console.log('[sync:workbench] Source code replaced successfully.');
if (protectedPluginNames.length > 0) {
  console.log(`[sync:workbench] Preserved user plugins: ${protectedPluginNames.join(', ')}`);
}
if (fs.existsSync(path.join(targetRoot, '.git'))) {
  run('git', ['config', 'user.name', 'Galois Workbench'], targetRoot);
  run('git', ['config', 'user.email', 'galois-workbench@local'], targetRoot);
  const protectedPathspecs = protectedPluginNames.map((name) => `:(exclude)APP/${name}/**`);
  run('git', ['add', '-A', '--', ...managedItems, ...protectedPathspecs], targetRoot);
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: targetRoot });
  if (staged.status === 1) {
    run('git', ['commit', '-m', 'Sync managed Galois source'], targetRoot);
    console.log('[sync:workbench] Created a rollback checkpoint in the external workbench Git repository.');
  } else if (staged.status !== 0) {
    fail('Could not inspect staged external-workbench changes.');
  }
}
if (shouldReopen) {
  console.log('[sync:workbench] Rebuilding Electron and reopening the external workbench...');
  run('npm', ['run', 'rebuild:reopen'], targetRoot);
}
