import { useState, useEffect } from 'react';
import { LayoutEngine } from './LayoutEngine';
import { AreaLayout } from './AreaLayout';
import { AreaShell } from './AreaShell';
import { ComponentRegistry } from './ComponentRegistry';
import { ActionRegistry } from './ActionRegistry';
import { RightSidebar } from './RightSidebar';
import { SettingsModal } from './SettingsModal';
import { FirstRunSetup, shouldShowFirstRunSetup } from './FirstRunSetup';
import { BloodDebugPanel } from './BloodDebugPanel';
import { Blood } from './Blood';
import { BC } from './BloodChannels';
import { LeftActivityBar } from './LeftActivityBar';
import { TitleBar } from './TitleBar';
import { defaultLayout } from './defaultLayout';
import { applyTheme } from './themes';
import './index.css';

import { ServiceCollection, InstantiationService, InstantiationProvider } from './instantiation';
import { 
  StateService, IStateService, 
  LayoutService, ILayoutService, 
  WorkspaceService, IWorkspaceService,
  FileService, IFileService,
  ScriptExecutionService, IScriptExecutionService,
  CommandService, ICommandService
} from './services';
import { PlatformService, IPlatformService } from './platform';



// LeftActivityBar extracted to ./LeftActivityBar.tsx
// TitleBar extracted to ./TitleBar.tsx

const services = new ServiceCollection();
const stateService = new StateService();
services.set(IStateService, stateService);
services.set(ILayoutService, new LayoutService(stateService));
services.set(IWorkspaceService, new WorkspaceService(stateService));
services.set(IFileService, new FileService(stateService));
services.set(IScriptExecutionService, new ScriptExecutionService(stateService));
services.set(ICommandService, new CommandService());
services.set(IPlatformService, new PlatformService());

const globalInstantiationService = new InstantiationService(services);


export function App() {
  const getQueryParam = (key: string): string => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has(key)) return searchParams.get(key) || '';
    const hash = window.location.hash;
    const hashSearchIndex = hash.indexOf('?');
    if (hashSearchIndex !== -1) {
      const hashParams = new URLSearchParams(hash.substring(hashSearchIndex));
      return hashParams.get(key) || '';
    }
    return '';
  };

  const isPopped = getQueryParam('popped') === 'true';
  const poppedAreaId = getQueryParam('areaId');
  const poppedType = getQueryParam('type');

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

  interface ScriptErrorToast {
    id: string;
    title: string;
    message: string;
    details?: string;
  }
  const [toasts, setToasts] = useState<ScriptErrorToast[]>([]);

  // Listen for dynamic script execution errors via Blood state sync
  useEffect(() => {
    if (isPopped) return;
    const unsubscribe = Blood.subscribe((changedKeys) => {
      changedKeys.forEach((key) => {
        if (key.startsWith('events.scriptError.')) {
          const errorObj = Blood.getValue<any>(key, null);
          if (errorObj && errorObj.message) {
            const rawMsg = String(errorObj.message);
            const id = `${key}-${errorObj.ts || Date.now()}`;
            
            // Check if it is a uv or python dependency error
            let title = '脚本执行错误';
            let message = rawMsg;
            let details = '';
            
            const lowerMsg = rawMsg.toLowerCase();
            if (lowerMsg.includes('command not found: uv') || lowerMsg.includes('uv: not found') || lowerMsg.includes('uv: command not found') || (lowerMsg.includes('enoent') && lowerMsg.includes('uv'))) {
              title = '⚠️ 依赖缺失: Astral uv';
              message = '系统检测到您未安装 Python 环境管理工具 uv，导致笔记本中的自动标签或拓扑图计算脚本无法运行。';
              details = '请打开终端运行：\ncurl -LsSf https://astral.sh/uv/install.sh | sh\n或使用 Homebrew 安装：\nbrew install uv';
            } else if (lowerMsg.includes('python3: not found') || lowerMsg.includes('python: command not found') || (lowerMsg.includes('enoent') && lowerMsg.includes('python'))) {
              title = '⚠️ 依赖缺失: Python';
              message = '系统检测到您未安装 Python，请在系统中安装 Python 3.10 或更高版本以执行笔记本脚本。';
              details = '推荐使用 Homebrew 安装：\nbrew install python';
            }

            setToasts((prev) => {
              if (prev.some((t) => t.id === id)) return prev;
              return [...prev, { id, title, message, details }];
            });
          }
        }
      });
    });
    return unsubscribe;
  }, [isPopped]);

  useEffect(() => {
    if (isPopped) return;

    // Focus the default area on startup
    Blood.updateKey(BC.system.focusedAreaId, 'editor-root');

    const initApp = async () => {
      let runtimeInfoSnapshot: Awaited<ReturnType<typeof window.electronAPI.getRuntimeInfo>> | null = null;

      // 0. Bootstrap runtime facts used by terminal, settings, and extension tooling.
      try {
        const [runtimeInfo, environmentStatus] = await Promise.all([
          window.electronAPI.getRuntimeInfo(),
          window.electronAPI.getEnvironmentStatus(),
        ]);
        runtimeInfoSnapshot = runtimeInfo;
        Blood.updateKey(BC.system.runtimeMode, runtimeInfo.mode);
        Blood.updateKey(BC.system.extensionPath, runtimeInfo.extensionPath);
        Blood.updateKey(BC.system.sourcePluginPath, runtimeInfo.sourcePluginPath);
        Blood.updateKey(BC.system.canWriteSourcePlugins, runtimeInfo.canWriteSourcePlugins);
        Blood.updateKey(BC.system.agentWorkspace, runtimeInfo.agentWorkspace);
        Blood.updateKey(BC.system.environmentStatus, environmentStatus);
      } catch (err: any) {
        Blood.updateKey(BC.system.environmentStatus, {
          error: err?.message || 'Failed to inspect runtime environment',
        });
      }

      // 1. Load global config and put it in Blood
      try {
        const config = await window.electronAPI.getConfig();
        if (config) {
          Blood.updateKey(BC.system.config, config);
        }
      } catch (_) {}

      // 2. Restore a valid user project, falling back to the Documents starter project.
      const saved = localStorage.getItem('dnote_last_project');
      const pointsAtPackagedTemplate = Boolean(
        saved &&
        runtimeInfoSnapshot?.isPackaged &&
        saved.includes('/Contents/Resources/template-project')
      );
      const savedExists = saved && !pointsAtPackagedTemplate
        ? await window.electronAPI.pathExists(saved)
        : false;

      if (saved && savedExists) {
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

      // 2. Load custom shortcuts from the user-visible Galois home.
      try {
        const shortcuts = await window.electronAPI.getShortcuts();
        if (shortcuts) {
          ActionRegistry.loadShortcuts(shortcuts);
          console.log('[App] Custom shortcuts loaded from Galois home.');
        }
      } catch (_) {}

      // 3. Load layout state from the user-visible Galois home.
      try {
        const savedLayout = await window.electronAPI.getLayout();
        const normalizeLayout = (node: AreaLayout): AreaLayout => {
          if (node.type === 'area') {
            const componentType = node.componentType === 'linkGraph'
              ? 'graphView'
              : ComponentRegistry.getComponent(node.componentType)
                ? node.componentType
                : 'editor';
            return { ...node, componentType };
          }
          return {
            ...node,
            first: normalizeLayout(node.first),
            second: normalizeLayout(node.second),
          };
        };
        // Guard: only restore a layout that actually contains at least one area node.
        // An empty/null layout (from a prior session where all panels were closed)
        // would leave the user with a blank screen, so fall back to defaultLayout.
        const hasAnyArea = (node: any): boolean => {
          if (!node) return false;
          if (node.type === 'area') return true;
          return hasAnyArea(node.first) || hasAnyArea(node.second);
        };
        if (savedLayout && hasAnyArea(savedLayout)) {
          setLayout(normalizeLayout(savedLayout));
          console.log('[App] Layout loaded from Galois home.');
        } else if (savedLayout) {
          console.warn('[App] Saved layout has no area nodes — falling back to defaultLayout.');
        }
      } catch (_) {}
    };

    initApp();

    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const restoreProjectState = async (projectPath: string) => {
      if (!projectPath) return;
      try {
        const projectState = await window.electronAPI.getProjectState(projectPath);
        if (!projectState) return;

        const openFiles = projectState.openFiles || {};
        Object.entries(openFiles).forEach(([editorId, filePath]) => {
          if (typeof filePath === 'string' && filePath) {
            Blood.updateKey(BC.events.openFile(editorId), filePath);
          }
        });

        if (Object.keys(openFiles).length === 0 && projectState.activeFile) {
          Blood.updateKey(BC.events.openFile(projectState.activeEditorId || 'editor-root'), projectState.activeFile);
        }

        const cursors = projectState.cursors || {};
        Object.entries(cursors).forEach(([editorId, cursor]) => {
          if (cursor && typeof cursor === 'object') {
            Blood.updateKey(BC.system.editorCursor(editorId), cursor);
          }
        });

        if (projectState.activeEditorId) {
          Blood.updateKey(BC.system.lastFocusedEditorId, projectState.activeEditorId);
          Blood.updateKey(BC.system.focusedAreaId, projectState.activeEditorId);
        }
      } catch (err) {
        console.warn('[App] Failed to restore project state:', err);
      }
    };

    const unsubscribeProjectRestore = Blood.subscribe((changedKeys) => {
      if (!changedKeys.has(BC.system.projectPath)) return;
      const nextProjectPath = Blood.getValue<string>(BC.system.projectPath, '');
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => restoreProjectState(nextProjectPath), 150);
    });

    // Validate plugin dependency graph on startup (dev only)
    if (process.env.NODE_ENV === 'development') {
      const issues = ComponentRegistry.validateDependencies();
      if (issues.length > 0) {
        console.warn('[App] Plugin dependency issues:', issues);
      } else {
        console.log('[App] All plugin dependencies satisfied.');
      }
    }

    return () => {
      if (restoreTimer) clearTimeout(restoreTimer);
      unsubscribeProjectRestore();
    };
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

  // NOTE: .dnote_runtime.json write logic was moved to APP/editor/hooks/useRuntimeSync.ts
  // to eliminate CORE's dependency on editor-specific Blood channels (system.editorCursor.*).

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
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'shortcuts'>('general');
  const [showFirstRunSetup, setShowFirstRunSetup] = useState(() => !isPopped && shouldShowFirstRunSetup());

  // Initial layout tree
  const [layout, setLayout] = useState<AreaLayout>(defaultLayout);
  const [isAllClosed, setIsAllClosed] = useState(false);

  const handleLayoutChange = (newLayout: AreaLayout) => {
    setLayout(newLayout);
    window.electronAPI.setLayout(newLayout).catch((err) => {
      console.error('[App] Failed to save layout:', err);
    });
  };

  // Listen for the "all panels closed" signal from LayoutEngine
  useEffect(() => {
    if (isPopped) return;
    return Blood.subscribe((changedKeys) => {
      if (changedKeys.has(BC.layout.allClosed)) {
        setIsAllClosed(true);
      }
    });
  }, [isPopped]);

  // Restore default layout and clear the closed state
  const handleRestoreLayout = () => {
    setIsAllClosed(false);
    setLayout(defaultLayout);
    // Clear all removeArea flags so the new areas aren't immediately hidden
    Blood.updateKey(BC.layout.allClosed, 0);
    window.electronAPI.setLayout(defaultLayout).catch(() => {});
  };

  if (isPopped) {
    const poppedTitleMap: Record<string, string> = {
      editor: '编辑器',
      fileTree: '文件浏览器',
      graphView: '标签拓扑图',
      terminal: '终端控制台',
      videoTimeline: '视频时间轴'
    };
    const title = poppedTitleMap[poppedType] || '工作区窗格';

    return (
      <InstantiationProvider value={globalInstantiationService}>
        <div className="popped-window-root" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
          <TitleBar title={title} />
          <div style={{ flexGrow: 1, overflow: 'hidden' }}>
            <AreaShell areaId={poppedAreaId} componentType={poppedType} isPopped={true} />
          </div>
        </div>
      </InstantiationProvider>
    );
  }

  const handleToggleSettings = () => {
    setSettingsInitialTab('general');
    setIsSettingsOpen(true);
  };

  const handleOpenEnvironmentSettings = () => {
    setShowFirstRunSetup(false);
    setSettingsInitialTab('general');
    setIsSettingsOpen(true);
  };

  return (
    <InstantiationProvider value={globalInstantiationService}>
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

        <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
          <TitleBar />
          <div className="app-workspace-root" style={{ display: 'flex', flexDirection: 'row', width: '100vw', flexGrow: 1, overflow: 'hidden' }}>
            <LeftActivityBar />
            <div className="layout-container" style={{ flexGrow: 1, height: '100%' }}>
              {isAllClosed ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  gap: '24px',
                  backgroundColor: 'var(--bg-main)',
                }}>
                  <div style={{ fontSize: '52px', opacity: 0.18, lineHeight: 1 }}>⬜</div>
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', opacity: 0.7 }}>
                      工作区已清空
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      所有面板已关闭，点击下方按钮恢复默认布局
                    </div>
                  </div>
                  <button
                    onClick={handleRestoreLayout}
                    style={{
                      padding: '10px 28px',
                      borderRadius: '8px',
                      border: '1px solid var(--accent-color)',
                      background: 'var(--highlight-color)',
                      color: 'var(--accent-color)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      letterSpacing: '0.02em',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-color)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--bg-main)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'var(--highlight-color)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-color)';
                    }}
                  >
                    恢复默认布局
                  </button>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.5 }}>
                    或在左侧活动栏点击图标打开新面板
                  </div>
                </div>
              ) : (
                <LayoutEngine layout={layout} onLayoutChange={handleLayoutChange} />
              )}
            </div>
            <RightSidebar onToggleSettings={handleToggleSettings} />
          </div>
        </div>

        {showFirstRunSetup && (
          <FirstRunSetup
            onDone={() => setShowFirstRunSetup(false)}
            onOpenEnvironmentSettings={handleOpenEnvironmentSettings}
          />
        )}
        {isSettingsOpen && (
          <SettingsModal
            initialTab={settingsInitialTab}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
        {process.env.NODE_ENV === 'development' && <BloodDebugPanel />}

        {/* Toast Notifications Container */}
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '360px',
          pointerEvents: 'none'
        }}>
          {toasts.map((toast) => (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                backgroundColor: 'var(--bg-main)',
                border: '1.2px solid var(--border-color)',
                borderLeft: '4px solid var(--accent-color)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                animation: 'toast-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>{toast.title}</span>
                <button
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: 1,
                    padding: 0
                  }}
                >
                  ✕
                </button>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-main)', margin: 0, lineHeight: 1.4 }}>
                {toast.message}
              </p>
              {toast.details && (
                <pre style={{
                  fontSize: '10px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1.2px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  margin: '4px 0 0 0',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-mono)',
                  userSelect: 'text',
                  lineHeight: 1.3
                }}>
                  {toast.details}
                </pre>
              )}
            </div>
          ))}
        </div>
        <style>{`
          @keyframes toast-slide-in {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </>
    </InstantiationProvider>
  );
}
