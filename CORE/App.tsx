import { useState, useEffect } from 'react';
import { LayoutEngine } from './LayoutEngine';
import { AreaLayout } from './AreaLayout';
import { AreaShell } from './AreaShell';
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
import { useAppConfigSync } from './useAppConfigSync';
import { useAppBootstrap } from './useAppBootstrap';
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
  const [layout, setLayout] = useState<AreaLayout>(defaultLayout);

  useAppConfigSync();

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

  useAppBootstrap({ isPopped, setLayout });
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
      const isWin = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('win');
      
      if (isWin) {
        // On Windows, translate e.ctrlKey to 'meta' to match meta+s, meta+k, etc. default configs
        if (e.ctrlKey) keys.push('meta');
        if (e.metaKey) keys.push('control');
      } else {
        if (e.metaKey) keys.push('meta');
        if (e.ctrlKey) keys.push('control');
      }
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
