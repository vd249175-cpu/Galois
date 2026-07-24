const { spawn } = require('child_process');
const electron = require('electron');

const mode = process.argv[2] || 'development';
process.env.NODE_ENV = mode;

// Run Electron with the current directory
const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
