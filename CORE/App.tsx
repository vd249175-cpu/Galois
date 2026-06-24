import { useState, useEffect } from 'react';
import { LayoutEngine } from './LayoutEngine';
import { AreaLayout } from './AreaLayout';
import { AreaShell } from './AreaShell';
import { ComponentRegistry } from './ComponentRegistry';
import { ActionRegistry } from './ActionRegistry';
import { RightSidebar } from './RightSidebar';
import { SettingsModal } from './SettingsModal';
import { BloodDebugPanel } from './BloodDebugPanel';
import { Blood, useBloodChannel } from './Blood';
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

function LeftActivityBar() {
  const focusedAreaId = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null)
  );

  const focusedType = useBloodChannel(
    focusedAreaId ? [`system.areaComponentTypes.${focusedAreaId}`] : [],
    () => focusedAreaId ? Blood.getValue<string | null>(`system.areaComponentTypes.${focusedAreaId}`, null) : null
  );

  const [isTextMode, setIsTextMode] = useState(() => {
    return localStorage.getItem('dnote_left_bar_text_mode') === 'true';
  });

  const handleToggleMode = () => {
    const nextVal = !isTextMode;
    setIsTextMode(nextVal);
    localStorage.setItem('dnote_left_bar_text_mode', String(nextVal));
  };

  const availableTypes = ComponentRegistry.getAvailableTypes().filter(t => t !== 'settings');

  const getShortName = (typeId: string, displayName: string) => {
    const map: Record<string, string> = {
      editor: '编辑器',
      fileTree: '浏览器',
      graphView: '拓扑图',
      linkGraph: '关系图',
      terminal: '控制台',
      agent: '副驾驶'
    };
    return map[typeId] || displayName;
  };

  const barWidth = isTextMode ? '96px' : '44px';

  return (
    <div style={{
      width: barWidth,
      height: '100%',
      backgroundColor: 'var(--bg-header)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 0',
      gap: '12px',
      boxShadow: 'inset -1px 0px 0px rgba(255,255,255,0.06)',
      zIndex: 5,
      transition: 'width 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      {/* Top Icons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center' }}>
        {availableTypes.map((typeId) => {
          const comp = ComponentRegistry.getComponent(typeId);
          if (!comp) return null;
          
          const isActive = focusedType === typeId;
          const shortName = getShortName(typeId, comp.displayName);
          
          return (
            <button
              key={typeId}
              title={`${comp.displayName}${isActive ? ' (当前聚焦)' : ''}`}
              onClick={() => {
                if (focusedAreaId) {
                  Blood.updateKey(`layout.changeAreaType.${focusedAreaId}`, typeId);
                }
              }}
              disabled={!focusedAreaId}
              style={{
                width: isTextMode ? '84px' : '30px',
                height: '30px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? 'var(--accent-color)' : 'transparent',
                color: isActive ? '#ffffff' : (focusedAreaId ? 'var(--text-main)' : 'var(--text-muted)'),
                opacity: focusedAreaId ? 1.0 : 0.4,
                cursor: focusedAreaId ? 'pointer' : 'not-allowed',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: isTextMode ? 'flex-start' : 'center',
                padding: isTextMode ? '0 8px' : '0',
                gap: '8px',
                transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (focusedAreaId && !isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.color = 'var(--accent-color)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = focusedAreaId ? 'var(--text-main)' : 'var(--text-muted)';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {comp.icon || (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
                  </svg>
                )}
              </div>
              {isTextMode && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  userSelect: 'none'
                }}>
                  {shortName}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flexGrow: 1 }} />

      {/* Mode Toggle Button at Bottom */}
      <button
        title={isTextMode ? "切换为图标模式" : "切换为文字列表模式"}
        onClick={handleToggleMode}
        style={{
          width: '30px',
          height: '30px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
          e.currentTarget.style.color = 'var(--text-main)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
      >
        {isTextMode ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 3.5H3M13 8H3M13 12.5H3" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
            <path d="M6 3v10M10 3v10" />
          </svg>
        )}
      </button>
    </div>
  );
}

function TitleBar({ title = 'DNOTE Workspace' }: { title?: string }) {
  const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac');
  return (
    <div className="window-titlebar" style={{ paddingLeft: isMac ? '80px' : '12px' }}>
      <span className="window-titlebar-title">{title}</span>
    </div>
  );
}

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
    const poppedTitleMap: Record<string, string> = {
      editor: '编辑器',
      fileTree: '文件浏览器',
      graphView: '标签拓扑图',
      linkGraph: '关系图',
      terminal: '终端控制台',
      agent: '智能副驾驶'
    };
    const title = poppedTitleMap[poppedType] || '工作区窗格';

    return (
      <div className="popped-window-root" style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
        <TitleBar title={title} />
        <div style={{ flexGrow: 1, overflow: 'hidden' }}>
          <AreaShell areaId={poppedAreaId} componentType={poppedType} isPopped={true} />
        </div>
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

      <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
        <TitleBar />
        <div className="app-workspace-root" style={{ display: 'flex', flexDirection: 'row', width: '100vw', flexGrow: 1, overflow: 'hidden' }}>
          <LeftActivityBar />
          <div className="layout-container" style={{ flexGrow: 1, height: '100%' }}>
            <LayoutEngine layout={layout} onLayoutChange={handleLayoutChange} />
          </div>
          <RightSidebar onToggleSettings={handleToggleSettings} />
        </div>
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
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
  );
}
