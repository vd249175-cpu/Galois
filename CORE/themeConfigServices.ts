import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function createThemeConfigServices(deps: any) {
  const {
    getClassicCodeSourcePath, getGaloisConfigPath, getGaloisShortcutsPath,
    getGaloisThemesPath,
  } = deps;
  const userConfigWatchers: fs.FSWatcher[] = [];
  const userConfigChangeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const BUILTIN_THEME_FILES: Record<string, { file: string; name: string }> = {
  'default-light': { file: 'default-light.css', name: '温暖米色 (Light)' },
  'default-dark': { file: 'default-dark.css', name: '深空极夜 (Dark)' },
  lavender: { file: 'lavender.css', name: '雪青紫罗 (Lavender)' },
  yuebai: { file: 'yuebai.css', name: '月白缥青 (Azure)' },
  'black-gold': { file: 'blackgold.css', name: '玄金耀屑 (Black Gold)' },
};

function ensureUserThemeFiles() {
  const themesPath = getGaloisThemesPath();
  fs.mkdirSync(themesPath, { recursive: true });
  const sourceThemePath = path.join(getClassicCodeSourcePath(), 'CORE', 'themes');
  for (const [themeId, meta] of Object.entries(BUILTIN_THEME_FILES)) {
    const targetPath = path.join(themesPath, `${themeId}.css`);
    if (fs.existsSync(targetPath)) continue;
    const sourcePath = path.join(sourceThemePath, meta.file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function readUserThemes() {
  ensureUserThemeFiles();
  const themesPath = getGaloisThemesPath();
  return fs.readdirSync(themesPath)
    .filter((fileName) => fileName.endsWith('.css'))
    .map((fileName) => {
      const id = path.basename(fileName, '.css');
      const builtin = BUILTIN_THEME_FILES[id];
      return {
        id,
        name: builtin?.name || id.replace(/[-_]/g, ' '),
        path: path.join(themesPath, fileName),
        source: builtin ? 'seeded' : 'custom',
      };
    })
    .sort((a, b) => {
      const aBuiltin = BUILTIN_THEME_FILES[a.id] ? 0 : 1;
      const bBuiltin = BUILTIN_THEME_FILES[b.id] ? 0 : 1;
      if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
      return a.id.localeCompare(b.id);
    });
}

function broadcastUserConfigChange(kind: 'config' | 'shortcuts' | 'themes', filePath?: string) {
  const payload = { kind, path: filePath || '', timestamp: Date.now() };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('app:configFileChanged', payload);
    }
  }
}

function scheduleUserConfigChange(kind: 'config' | 'shortcuts' | 'themes', filePath?: string) {
  const key = `${kind}:${filePath || ''}`;
  const existing = userConfigChangeTimers.get(key);
  if (existing) clearTimeout(existing);
  userConfigChangeTimers.set(key, setTimeout(() => {
    userConfigChangeTimers.delete(key);
    broadcastUserConfigChange(kind, filePath);
  }, 120));
}

function setupUserConfigWatchers() {
  userConfigWatchers.splice(0).forEach((watcher) => watcher.close());
  const configDir = path.dirname(getGaloisConfigPath());
  const themesDir = getGaloisThemesPath();
  fs.mkdirSync(configDir, { recursive: true });
  ensureUserThemeFiles();

  try {
    userConfigWatchers.push(fs.watch(configDir, (_eventType: string, fileName: string | null) => {
      const name = String(fileName || '');
      if (name === 'galois.config.json') {
        scheduleUserConfigChange('config', getGaloisConfigPath());
      } else if (name === 'shortcuts.json') {
        scheduleUserConfigChange('shortcuts', getGaloisShortcutsPath());
      }
    }));
  } catch (err: any) {
    console.warn('[config-watch] Failed to watch config dir:', err?.message || err);
  }

  try {
    userConfigWatchers.push(fs.watch(themesDir, (_eventType: string, fileName: string | null) => {
      const name = String(fileName || '');
      if (!name || name.endsWith('.css')) {
        scheduleUserConfigChange('themes', path.join(themesDir, name));
      }
    }));
  } catch (err: any) {
    console.warn('[config-watch] Failed to watch themes dir:', err?.message || err);
  }
}

  const disposeUserConfigWatchers = () => userConfigWatchers.splice(0).forEach((watcher) => watcher.close());
  return { BUILTIN_THEME_FILES, disposeUserConfigWatchers, ensureUserThemeFiles, readUserThemes, setupUserConfigWatchers };
}
