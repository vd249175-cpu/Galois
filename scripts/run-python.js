const { spawn, execSync } = require('child_process');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-python.js <script.py> [args...]');
  process.exit(1);
}

function run(cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => {
      resolve(code);
    });
  });
}

(async () => {
  let cmd = 'python';
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    cmd = 'python3';
  } catch (_) {
    try {
      execSync('python --version', { stdio: 'ignore' });
      cmd = 'python';
    } catch (_) {
      console.warn('[run-python] Neither python3 nor python found in PATH. Defaulting to python.');
    }
  }
  const code = await run(cmd);
  process.exit(code ?? 0);
})();
