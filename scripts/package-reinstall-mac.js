const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, '.build');
const galoisHome = path.join(os.homedir(), 'Documents', 'Galois');
const notesHome = path.join(os.homedir(), 'Documents', 'Galois Projects');
const installPath = '/Applications/Galois.app';
const logPath = path.join(buildDir, 'package-reinstall.log');

function assertSafeTargets() {
  const expectedHome = path.resolve(os.homedir(), 'Documents', 'Galois');
  if (path.resolve(galoisHome) !== expectedHome || path.basename(galoisHome) !== 'Galois') {
    throw new Error(`Refusing unsafe Documents cleanup target: ${galoisHome}`);
  }
  if (path.resolve(installPath) !== '/Applications/Galois.app') {
    throw new Error(`Refusing unsafe app install target: ${installPath}`);
  }
}

function tailLog(lineCount = 60) {
  if (!fs.existsSync(logPath)) return '';
  return fs.readFileSync(logPath, 'utf-8').trimEnd().split('\n').slice(-lineCount).join('\n');
}

function runQuiet(command, args, phase) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(buildDir, { recursive: true });
    const log = fs.createWriteStream(logPath, { flags: 'a' });
    const child = spawn(command, args, { cwd: root, env: process.env });
    let lastOutputAt = Date.now();
    const capture = (chunk) => {
      lastOutputAt = Date.now();
      log.write(chunk);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const heartbeat = setInterval(() => {
      const quietSeconds = Math.floor((Date.now() - lastOutputAt) / 1000);
      process.stdout.write(`[release] ${phase} 进行中${quietSeconds >= 20 ? `（${quietSeconds}s 无新输出）` : ''}\n`);
    }, 15000);
    child.on('error', (error) => {
      clearInterval(heartbeat);
      log.end();
      reject(error);
    });
    child.on('close', (code) => {
      clearInterval(heartbeat);
      log.end();
      if (code === 0) resolve();
      else reject(new Error(`${phase} failed with exit code ${code}\n${tailLog()}`));
    });
  });
}

function runChecked(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
}

function stopExistingGalois() {
  spawnSync('osascript', ['-e', 'tell application "Galois" to quit'], { stdio: 'ignore' });
  const pidPath = path.join(galoisHome, 'workbench', 'galois-workbench.pid');
  if (!fs.existsSync(pidPath)) return;
  const pid = Number(fs.readFileSync(pidPath, 'utf-8').trim());
  if (!Number.isInteger(pid) || pid <= 1) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (_) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_) {}
  }
  spawnSync('sleep', ['1'], { stdio: 'ignore' });
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('This workflow only supports macOS.');
  assertSafeTargets();
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(logPath, `[release] started ${new Date().toISOString()}\n`, 'utf-8');

  console.log(`[release] 1/4 打包 macOS DMG（详细日志: ${logPath}）`);
  await runQuiet('npm', ['run', 'package:mac'], '打包');

  const appBundle = process.arch === 'arm64'
    ? path.join(buildDir, 'mac-arm64', 'Galois.app')
    : path.join(buildDir, 'mac', 'Galois.app');
  if (!fs.existsSync(appBundle)) throw new Error(`Packaged app not found: ${appBundle}`);

  console.log('[release] 2/4 关闭旧 Galois');
  stopExistingGalois();

  console.log(`[release] 3/4 清理 ${galoisHome}（保留 ${notesHome}）`);
  fs.rmSync(galoisHome, { recursive: true, force: true });

  console.log(`[release] 4/4 安装 ${installPath}`);
  fs.rmSync(installPath, { recursive: true, force: true });
  runChecked('ditto', [appBundle, installPath], 'Install Galois.app');
  runChecked('open', [installPath], 'Launch Galois.app');

  const dmgs = fs.readdirSync(buildDir)
    .filter((name) => name.endsWith('.dmg'))
    .map((name) => path.join(buildDir, name));
  console.log(`[release] 完成。已安装并启动 ${installPath}`);
  for (const dmg of dmgs) console.log(`[release] DMG: ${dmg}`);
}

main().catch((error) => {
  console.error(`[release] 失败: ${error.message || String(error)}`);
  process.exit(1);
});
