import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export function createAppConfigIpc(deps: any) {
  const {
    BUILTIN_THEME_FILES, ensureParentDir, ensureUserThemeFiles, getGaloisConfigPath,
    getGaloisLayoutPath, getGaloisProjectStatePath, getGaloisShortcutsPath,
    getGaloisThemesPath, readUserThemes,
  } = deps;
function getDefaultAppConfig() {
  return {
    theme: "default-light",
    editor: {
      fontSize: 14,
      fontFamily: "Fira Code",
      lineHeight: 1.6,
      autosaveDelay: 500
    },
    graph: {
      showOrphans: true,
      maxNodes: 500,
      nodeFontSize: 9,
      controlFontSize: 11,
      drawerFontSize: 12
    },
    terminal: {
      shell: "",
      fontSize: 13,
      autoStartAgy: false,
      autoStartAgyConfigured: true
    },
    appearance: {
      uiFontSize: 12,
      panelTitleSize: 11,
      sidebarLabelSize: 11,
      sidebarIconSize: 14,
      fileTreeTitleSize: 11,
      fileTreeTagSize: 8.5,
      slashMenuTitleSize: 11,
      slashMenuDescriptionSize: 9,
      timelineFontSize: 11
    },
    interpreters: {
      python: "",
      node: "",
      typescript: "",
      bash: ""
    },
    extensions: {
      devPaths: []
    }
  };
}

function normalizeAppConfig(config: any) {
  const defaults = getDefaultAppConfig();
  const terminal = {
    ...defaults.terminal,
    ...(config?.terminal || {}),
  };

  // AGY now launches through an explicit native-terminal button. Keep this
  // persisted value false so older configs cannot re-enable PTY injection.
  terminal.autoStartAgy = false;
  terminal.autoStartAgyConfigured = true;

  return {
    ...defaults,
    ...(config || {}),
    editor: {
      ...defaults.editor,
      ...(config?.editor || {}),
    },
    graph: {
      ...defaults.graph,
      ...(config?.graph || {}),
    },
    terminal,
    appearance: {
      ...defaults.appearance,
      ...(config?.appearance || {}),
    },
    interpreters: {
      ...defaults.interpreters,
      ...(config?.interpreters || {}),
    },
    extensions: {
      ...defaults.extensions,
      ...(config?.extensions || {}),
    },
  };
}

ipcMain.handle('app:getConfig', () => {
  const configPath = getGaloisConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      return normalizeAppConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
    } catch (_) {}
  }
  return getDefaultAppConfig();
});

ipcMain.handle('app:setConfig', (_, config: any) => {
  try {
    const configPath = getGaloisConfigPath();
    ensureParentDir(configPath);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set config:', err);
    return false;
  }
});

ipcMain.handle('app:listThemes', () => {
  try {
    return readUserThemes();
  } catch (err: any) {
    console.error('Failed to list themes:', err);
    return Object.entries(BUILTIN_THEME_FILES).map(([id, meta]: [string, any]) => ({
      id,
      name: meta.name,
      path: '',
      source: 'builtin',
    }));
  }
});

ipcMain.handle('app:getThemeCss', (_, themeId: string) => {
  try {
    const safeId = String(themeId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) return '';
    const themePath = path.join(getGaloisThemesPath(), `${safeId}.css`);
    ensureUserThemeFiles();
    if (!fs.existsSync(themePath)) return '';
    return fs.readFileSync(themePath, 'utf-8');
  } catch (err: any) {
    console.error('Failed to read theme css:', err);
    return '';
  }
});

ipcMain.handle('app:getShortcuts', () => {
  const shortcutsPath = getGaloisShortcutsPath();
  if (fs.existsSync(shortcutsPath)) {
    try {
      return JSON.parse(fs.readFileSync(shortcutsPath, 'utf-8'));
    } catch (_) {}
  }
  return {
    "editor.save": "meta+s",
    "terminal.clear": "meta+k",
    "sidebar.toggle": "meta+b"
  };
});

ipcMain.handle('app:setShortcuts', (_, shortcuts: any) => {
  try {
    const shortcutsPath = getGaloisShortcutsPath();
    ensureParentDir(shortcutsPath);
    fs.writeFileSync(shortcutsPath, JSON.stringify(shortcuts, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set shortcuts:', err);
    return false;
  }
});

ipcMain.handle('app:getLayout', () => {
  const layoutPath = getGaloisLayoutPath();
  if (fs.existsSync(layoutPath)) {
    try {
      return JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
    } catch (_) {}
  }
  return null;
});

ipcMain.handle('app:setLayout', (_, layout: any) => {
  try {
    const layoutPath = getGaloisLayoutPath();
    ensureParentDir(layoutPath);
    fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set layout:', err);
    return false;
  }
});

ipcMain.handle('app:getProjectState', (_, projectPath: string) => {
  const statePath = getGaloisProjectStatePath();
  if (!projectPath || !fs.existsSync(statePath)) return null;
  try {
    const allStates = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    return allStates?.[projectPath] || null;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('app:setProjectState', (_, projectPath: string, state: any) => {
  if (!projectPath) return false;
  try {
    const statePath = getGaloisProjectStatePath();
    ensureParentDir(statePath);
    let allStates: Record<string, any> = {};
    if (fs.existsSync(statePath)) {
      try {
        allStates = JSON.parse(fs.readFileSync(statePath, 'utf-8')) || {};
      } catch (_) {
        allStates = {};
      }
    }
    allStates[projectPath] = {
      ...state,
      projectPath,
      timestamp: Date.now(),
    };
    fs.writeFileSync(statePath, JSON.stringify(allStates, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set project state:', err);
    return false;
  }
});

const PROJECT_STATE_APP_KEY = '__galoisApp';

ipcMain.handle('app:getLastProjectPath', () => {
  const statePath = getGaloisProjectStatePath();
  if (!fs.existsSync(statePath)) return null;
  try {
    const allStates = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const lastProjectPath = allStates?.[PROJECT_STATE_APP_KEY]?.lastProjectPath;
    return typeof lastProjectPath === 'string' && lastProjectPath ? lastProjectPath : null;
  } catch (_) {
    return null;
  }
});

ipcMain.handle('app:setLastProjectPath', (_, projectPath: string) => {
  if (!projectPath) return false;
  try {
    const statePath = getGaloisProjectStatePath();
    ensureParentDir(statePath);
    let allStates: Record<string, any> = {};
    if (fs.existsSync(statePath)) {
      try {
        allStates = JSON.parse(fs.readFileSync(statePath, 'utf-8')) || {};
      } catch (_) {
        allStates = {};
      }
    }
    allStates[PROJECT_STATE_APP_KEY] = {
      ...(allStates[PROJECT_STATE_APP_KEY] || {}),
      lastProjectPath: projectPath,
      timestamp: Date.now(),
    };
    fs.writeFileSync(statePath, JSON.stringify(allStates, null, 2), 'utf-8');
    return true;
  } catch (err: any) {
    console.error('Failed to set last project path:', err);
    return false;
  }
});

  return { getDefaultAppConfig };
}
