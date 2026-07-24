import { useEffect } from 'react';
import { ActionRegistry } from './ActionRegistry';
import { Blood } from './Blood';
import { BC } from './BloodChannels';
import { applyTheme } from './themes';

export function useAppConfigSync() {
  // Load theme and appearance configuration on startup for all windows
  useEffect(() => {
    const applyConfigVars = (config: any) => {
      if (!config) return;
      const root = document.documentElement;
      
      const sidebarIconSize = config.appearance?.sidebarIconSize ?? 14;
      const uiFontSize = config.appearance?.uiFontSize ?? 12;
      const panelTitleSize = config.appearance?.panelTitleSize ?? 11;
      const sidebarLabelSize = config.appearance?.sidebarLabelSize ?? 11;
      const fileTreeTitleSize = config.appearance?.fileTreeTitleSize ?? 11;
      const fileTreeTagSize = config.appearance?.fileTreeTagSize ?? 8.5;
      const slashMenuTitleSize = config.appearance?.slashMenuTitleSize ?? 11;
      const slashMenuDescriptionSize = config.appearance?.slashMenuDescriptionSize ?? 9;
      const timelineFontSize = config.appearance?.timelineFontSize ?? 11;
      const editorFontSize = config.editor?.fontSize ?? 14;
      const editorFontFamily = config.editor?.fontFamily || 'Fira Code';
      const editorLineHeight = config.editor?.lineHeight ?? 1.6;
      const graphNodeFontSize = config.graph?.nodeFontSize ?? 9;
      const graphControlFontSize = config.graph?.controlFontSize ?? 11;
      const graphDrawerFontSize = config.graph?.drawerFontSize ?? 12;
      const terminalFontSize = config.terminal?.fontSize ?? 13;
      
      root.style.setProperty('--sidebar-icon-size', `${sidebarIconSize}px`);
      root.style.setProperty('--ui-font-size', `${uiFontSize}px`);
      root.style.setProperty('--panel-title-size', `${panelTitleSize}px`);
      root.style.setProperty('--sidebar-label-size', `${sidebarLabelSize}px`);
      root.style.setProperty('--file-tree-title-size', `${fileTreeTitleSize}px`);
      root.style.setProperty('--file-tree-tag-size', `${fileTreeTagSize}px`);
      root.style.setProperty('--slash-menu-title-size', `${slashMenuTitleSize}px`);
      root.style.setProperty('--slash-menu-description-size', `${slashMenuDescriptionSize}px`);
      root.style.setProperty('--video-timeline-font-size', `${timelineFontSize}px`);
      root.style.setProperty('--editor-font-size', `${editorFontSize}px`);
      root.style.setProperty('--editor-font-family', editorFontFamily);
      root.style.setProperty('--editor-line-height', String(editorLineHeight));
      root.style.setProperty('--graph-node-font-size', `${graphNodeFontSize}px`);
      root.style.setProperty('--graph-control-font-size', `${graphControlFontSize}px`);
      root.style.setProperty('--graph-drawer-font-size', `${graphDrawerFontSize}px`);
      root.style.setProperty('--terminal-font-size', `${terminalFontSize}px`);
    };

    const applyLiveConfig = async (kind: 'config' | 'shortcuts' | 'themes', label?: string) => {
      if (kind === 'shortcuts') {
        const shortcuts = await window.electronAPI.getShortcuts();
        ActionRegistry.loadShortcuts(shortcuts);
        Blood.updateKey(BC.events.shortcutsChanged, Date.now());
        Blood.updateKey(BC.system.devHotUpdateStatus, {
          kind: 'shortcuts',
          label: label || 'shortcuts.json',
          timestamp: Date.now(),
        });
        return;
      }

      const config = await window.electronAPI.getConfig();
      Blood.updateKey(BC.system.config, config);
      applyConfigVars(config);
      const themeId = config?.theme || 'default-light';
      await applyTheme(themeId);
      Blood.updateKey(BC.events.themeChanged, themeId);
      Blood.updateKey(BC.system.devHotUpdateStatus, {
        kind,
        label: label || (kind === 'themes' ? themeId : 'galois.config.json'),
        timestamp: Date.now(),
      });
    };

    const loadConfig = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        if (config) {
          if (config.theme) {
            applyTheme(config.theme);
          } else {
            applyTheme('default-light');
          }
          applyConfigVars(config);
        } else {
          applyTheme('default-light');
        }
      } catch (_) {
        applyTheme('default-light');
      }
    };
    loadConfig();

    const unsubscribeConfigFiles = window.electronAPI.onConfigFileChanged?.(async (payload) => {
      try {
        await applyLiveConfig(payload.kind, payload.kind === 'shortcuts' ? 'shortcuts.json' : undefined);
      } catch (err) {
        console.warn('[App] Failed to apply live config change:', err);
      }
    });

    let disposed = false;
    let pollInFlight = false;
    let configSignature = '';
    let shortcutsSignature = '';
    let themeCssSignature = '';

    const pollConfigFiles = async () => {
      if (disposed || pollInFlight) return;
      pollInFlight = true;
      try {
        const config = await window.electronAPI.getConfig();
        const nextConfigSignature = JSON.stringify(config || {});
        const themeId = config?.theme || 'default-light';
        const themeCss = await window.electronAPI.getThemeCss?.(themeId);
        const nextThemeCssSignature = `${themeId}:${themeCss || ''}`;
        const shortcuts = await window.electronAPI.getShortcuts();
        const nextShortcutsSignature = JSON.stringify(shortcuts || {});

        if (configSignature && nextConfigSignature !== configSignature) {
          await applyLiveConfig('config', 'galois.config.json');
        } else if (themeCssSignature && nextThemeCssSignature !== themeCssSignature) {
          await applyLiveConfig('themes', themeId);
        }

        if (shortcutsSignature && nextShortcutsSignature !== shortcutsSignature) {
          await applyLiveConfig('shortcuts', 'shortcuts.json');
        }

        configSignature = nextConfigSignature;
        themeCssSignature = nextThemeCssSignature;
        shortcutsSignature = nextShortcutsSignature;
      } catch (err) {
        console.warn('[App] Failed to poll live config change:', err);
      } finally {
        pollInFlight = false;
      }
    };

    pollConfigFiles();
    const pollTimer = window.setInterval(pollConfigFiles, 2500);

    // Listen for config and theme changes via Blood state sync
    const unsubscribe = Blood.subscribe((changedKeys) => {
      if (changedKeys.has('events.themeChanged')) {
        const newTheme = Blood.getValue<string>('events.themeChanged', 'default-light');
        applyTheme(newTheme);
      }
      if (changedKeys.has('system.config')) {
        const config = Blood.getValue<any>('system.config', null);
        applyConfigVars(config);
      }
    });
    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
      unsubscribe();
      unsubscribeConfigFiles?.();
    };
  }, []);
}
