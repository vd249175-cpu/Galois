import * as fs from 'fs';
import * as path from 'path';

export async function initializeUserData(deps: any) {
  const {
    ensureDefaultNotebookProject, getDefaultAppConfig, getGaloisConfigPath,
    getGaloisHomePath, getGaloisShortcutsPath, syncClassicCodeWorkspace,
  } = deps;
  const galoisHome = getGaloisHomePath();
  const configDir = path.join(galoisHome, 'config');
  const configPath = getGaloisConfigPath();
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(getDefaultAppConfig(), null, 2), 'utf-8');
  }
  const shortcutsPath = getGaloisShortcutsPath();
  if (!fs.existsSync(shortcutsPath)) {
    fs.writeFileSync(shortcutsPath, JSON.stringify({
      'editor.save': 'meta+s', 'terminal.clear': 'meta+k', 'sidebar.toggle': 'meta+b',
    }, null, 2), 'utf-8');
  }
  ensureDefaultNotebookProject();
  syncClassicCodeWorkspace(false);
}
