import { useState, useEffect } from 'react';
import { LayoutEngine } from './LayoutEngine';
import { AreaLayout } from './AreaLayout';
import { AreaShell } from './AreaShell';
import { ComponentRegistry } from './ComponentRegistry';
import { ActionRegistry } from './ActionRegistry';
import { EditorComponent } from '../APP/Editor';
import { TerminalComponent } from '../APP/Terminal';
import { FileTreeComponent } from '../APP/FileTree';
import { SettingsComponent } from '../APP/Settings';
import { RightSidebar } from './RightSidebar';
import { Blood } from './Blood';
import './index.css';

// Register Plugins into the Registry
ComponentRegistry.register(FileTreeComponent);
ComponentRegistry.register(EditorComponent);
ComponentRegistry.register(TerminalComponent);
ComponentRegistry.register(SettingsComponent);

export function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isPopped = searchParams.get('popped') === 'true';
  const poppedAreaId = searchParams.get('areaId') || '';
  const poppedType = searchParams.get('type') || '';

  // Load customized keyboard shortcuts from disk on launch (反射通路)
  useEffect(() => {
    if (isPopped) return;
    
    const loadCustomShortcuts = async () => {
      try {
        const content = await (window as any).electronAPI.readFile('dnote_shortcuts.json');
        if (content) {
          ActionRegistry.loadShortcuts(content);
          console.log('[App] Custom shortcuts loaded from disk.');
        }
      } catch (err) {
        console.log('[App] Custom shortcuts configuration file not found, using default keybindings.');
      }
    };
    loadCustomShortcuts();
  }, [isPopped]);

  // Listen for popped-out secondary windows closing to restore them in the main window layout grid
  useEffect(() => {
    if (isPopped) return;
    
    const unsubscribe = (window as any).electronAPI.onSecondaryClosed((id: string) => {
      // Set removeArea to false to restore the panel in the workspace grid
      Blood.updateKey(`layout.removeArea.${id}`, false);
    });

    return unsubscribe;
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
      const actionId = ActionRegistry.getActionIdByShortcut(combo);

      if (actionId) {
        e.preventDefault();
        const focusedAreaId = Blood.getValue<string | null>('system.focusedAreaId', null);
        if (focusedAreaId) {
          ActionRegistry.runAction(actionId, {
            areaId: focusedAreaId,
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



  // Initial layout tree
  const [layout, setLayout] = useState<AreaLayout>({
    type: 'split',
    direction: 'horizontal',
    ratio: 0.25,
    first: {
      type: 'area',
      id: 'file-tree-root',
      componentType: 'fileTree',
    },
    second: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.6,
      first: {
        type: 'area',
        id: 'editor-root',
        componentType: 'editor',
      },
      second: {
        type: 'area',
        id: 'terminal-root',
        componentType: 'terminal',
      },
    },
  });

  if (isPopped) {
    return (
      <div className="popped-window-root">
        <AreaShell areaId={poppedAreaId} componentType={poppedType} isPopped={true} />
      </div>
    );
  }

  const handleToggleSettings = () => {
    const focusedAreaId = Blood.getValue<string | null>('system.focusedAreaId', null);
    if (focusedAreaId) {
      Blood.updateKey(`layout.changeAreaType.${focusedAreaId}`, 'settings');
    } else {
      Blood.updateKey('layout.changeAreaType.editor-root', 'settings');
      Blood.updateKey('system.focusedAreaId', 'editor-root');
    }
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
          <LayoutEngine layout={layout} onLayoutChange={setLayout} />
        </div>
        <RightSidebar onToggleSettings={handleToggleSettings} />
      </div>
    </>
  );
}
