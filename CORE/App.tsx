import { useState, useEffect } from 'react';
import { LayoutEngine } from './LayoutEngine';
import { AreaLayout } from './AreaLayout';
import { AreaShell } from './AreaShell';
import { ComponentRegistry } from './ComponentRegistry';
import { ActionRegistry } from './ActionRegistry';
import { RightSidebar } from './RightSidebar';
import { SettingsModal } from './SettingsModal';
import { BloodDebugPanel } from './BloodDebugPanel';
import { Blood } from './Blood';
import { BC } from './BloodChannels';
import { defaultLayout } from './defaultLayout';
import { applyTheme } from './themes';
import './index.css';
// Auto-register plugins through the normalized APP/[plugin]/index.ts entrypoint.
const modules = import.meta.glob('../APP/*/index.ts', { eager: true });
for (const path in modules) {
  const mod = modules[path] as any;
  for (const key in mod) {
    const exportVal = mod[key];
    if (exportVal && typeof exportVal === 'object' && exportVal.typeId && exportVal.component) {
      ComponentRegistry.register(exportVal);
    }
  }
}

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isPopped = searchParams.get('popped') === 'true';
  const poppedAreaId = searchParams.get('areaId') || '';
  const poppedType = searchParams.get('type') || '';

  // Load theme on startup for all windows (including popped-out windows)
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        if (config && config.theme) {
          applyTheme(config.theme);
        } else {
          applyTheme('default-light');
        }
      } catch (_) {
        applyTheme('default-light');
      }
    };
    loadTheme();
  }, []);

  // Listen for dynamic theme changes via Blood state sync
  useEffect(() => {
    const unsubscribe = Blood.subscribe((changedKeys) => {
      if (changedKeys.has('events.themeChanged')) {
        const newTheme = Blood.getValue<string>('events.themeChanged', 'default-light');
        applyTheme(newTheme);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isPopped) return;

    // Focus the default area on startup
    Blood.updateKey(BC.system.focusedAreaId, 'editor-root');

    const initApp = async () => {
      // 0. Load global config and put it in Blood
      try {
        const config = await window.electronAPI.getConfig();
        if (config) {
          Blood.updateKey(BC.system.config, config);
        }
      } catch (_) {}

      // 1. Restore last opened project from localStorage, fallback to dev default path via IPC
      const saved = localStorage.getItem('dnote_last_project');
      if (saved) {
        Blood.updateKey(BC.system.projectPath, saved);
      } else {
        try {
          const devDefault = await window.electronAPI.getDevDefaultProject();
          if (devDefault) {
            Blood.updateKey(BC.system.projectPath, devDefault);
            localStorage.setItem('dnote_last_project', devDefault);
          }
        } catch (_) {}
      }

      // 2. Load custom shortcuts from userData
      try {
        const shortcuts = await window.electronAPI.getShortcuts();
        if (shortcuts) {
          ActionRegistry.loadShortcuts(shortcuts);
          console.log('[App] Custom shortcuts loaded from userData.');
        }
      } catch (_) {}

      // 3. Load layout state from layout.json in userData
      try {
        const savedLayout = await window.electronAPI.getLayout();
        if (savedLayout) {
          setLayout(savedLayout);
          console.log('[App] Layout loaded from layout.json in userData.');
        }
      } catch (_) {}
    };

    initApp();

    // Validate plugin dependency graph on startup (dev only)
    if (process.env.NODE_ENV === 'development') {
      const issues = ComponentRegistry.validateDependencies();
      if (issues.length > 0) {
        console.warn('[App] Plugin dependency issues:', issues);
      } else {
        console.log('[App] All plugin dependencies satisfied.');
      }
    }
  }, [isPopped]);

  // Listen for popped-out secondary windows closing to restore them in the main window layout grid
  useEffect(() => {
    if (isPopped) return;
    if (!(window as any).electronAPI?.onSecondaryClosed) return;
    
    const unsubscribe = (window as any).electronAPI.onSecondaryClosed((id: string) => {
      // Set removeArea to false to restore the panel in the workspace grid
      Blood.updateKey(`layout.removeArea.${id}`, false);
    });

    return unsubscribe;
  }, [isPopped]);

  // Write DNOTE runtime coordinates (.dnote_runtime.json) to the project root directory
  useEffect(() => {
    if (isPopped) return;

    let writeTimeout: NodeJS.Timeout | null = null;
    const unsubscribe = Blood.subscribe((changedKeys) => {
      const isRelevant = Array.from(changedKeys).some(key =>
        key === 'system.projectPath' ||
        key === 'system.lastFocusedEditorId' ||
        key.startsWith('system.editorCursor.') ||
        key.startsWith('events.openFile.')
      );

      if (isRelevant) {
        if (writeTimeout) clearTimeout(writeTimeout);
        writeTimeout = setTimeout(async () => {
          const projectPath = Blood.getValue<string>('system.projectPath', '');
          if (!projectPath) return;

          const lastFocusedEditorId = Blood.getValue<string | null>('system.lastFocusedEditorId', null);
          const cursor = lastFocusedEditorId ? Blood.getValue<any>('system.editorCursor.' + lastFocusedEditorId, null) : null;
          
          const runtimeState = {
            projectPath,
            activeEditorId: lastFocusedEditorId,
            activeFile: cursor?.filePath || null,
            cursor: cursor ? {
              line: cursor.line,
              column: cursor.column,
              selectedText: cursor.selectedText
            } : null,
            timestamp: Date.now()
          };

          const filePath = `${projectPath}/.dnote_runtime.json`;
          try {
            await (window as any).electronAPI.writeFile(filePath, JSON.stringify(runtimeState, null, 2));
            console.log('[App] Updated .dnote_runtime.json at', filePath);
          } catch (err) {
            console.error('[App] Failed to write .dnote_runtime.json:', err);
          }
        }, 150);
      }
    });

    return () => {
      if (writeTimeout) clearTimeout(writeTimeout);
      unsubscribe();
    };
  }, [isPopped]);

  // Global keyboard shortcuts observer (反射弧)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys: string[] = [];
      if (e.metaKey) keys.push('meta');
      if (e.ctrlKey) keys.push('control');
      if (e.altKey) keys.push('alt');
      if (e.shiftKey) keys.push('shift');

      const keyName = e.key.toLowerCase();
      if (!['meta', 'control', 'alt', 'shift'].includes(keyName)) {
        keys.push(keyName);
      }

      const combo = keys.join('+');
      const focusedAreaId = Blood.getValue<string | null>('system.focusedAreaId', null);
      const focusedAreaType = focusedAreaId ? Blood.getValue<string | null>(`system.areaComponentTypes.${focusedAreaId}`, null) : null;
      const actionId = ActionRegistry.getActionIdByShortcut(combo, focusedAreaType);

      if (actionId) {
        e.preventDefault();
        const action = ActionRegistry.getAction(actionId);
        const targetAreaId = action?.isGlobal ? (focusedAreaId || 'global') : (focusedAreaType === action?.sourceType ? focusedAreaId : null);

        if (targetAreaId) {
          ActionRegistry.runAction(actionId, {
            areaId: targetAreaId,
            focusedAreaId,
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);



  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initial layout tree
  const [layout, setLayout] = useState<AreaLayout>(defaultLayout);

  const handleLayoutChange = (newLayout: AreaLayout) => {
    setLayout(newLayout);
    window.electronAPI.setLayout(newLayout).catch((err) => {
      console.error('[App] Failed to save layout:', err);
    });
  };

  if (isPopped) {
    return (
      <div className="popped-window-root">
        <AreaShell areaId={poppedAreaId} componentType={poppedType} isPopped={true} />
      </div>
    );
  }

  const handleToggleSettings = () => {
    setIsSettingsOpen(true);
  };

  return (
    <>
      {/* Global SVG Liquid Glass Refraction Filter Definition */}
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <defs>
          <filter id="liquid-glass-refraction-global" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="2" result="noise" seed="3" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className="app-workspace-root" style={{ display: 'flex', flexDirection: 'row', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <div className="layout-container" style={{ flexGrow: 1, height: '100%' }}>
          <LayoutEngine layout={layout} onLayoutChange={handleLayoutChange} />
        </div>
        <RightSidebar onToggleSettings={handleToggleSettings} />
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      {process.env.NODE_ENV === 'development' && <BloodDebugPanel />}
    </>
  );
}
