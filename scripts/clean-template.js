const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const templateRoot = path.join(root, 'template-project');

const removeNames = new Set([
  '.DS_Store',
  '.dnote_runtime.json',
  '.dnote_cache',
  '.venv',
  '__pycache__',
]);

const removeGeneratedJson = new Set([
  'on_project_run.json',
  'output.json',
  'run_once_demo.json',
  'sys_monitor.json',
]);

function removePath(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    console.log(`[clean:template] removed ${path.relative(root, targetPath)}`);
  }
}

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (removeNames.has(entry.name) || removeGeneratedJson.has(entry.name)) {
      removePath(entryPath);
      continue;
    }
    if (entry.isDirectory()) walk(entryPath);
  }
}

walk(templateRoot);
