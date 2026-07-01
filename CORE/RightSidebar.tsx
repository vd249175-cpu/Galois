import { useState } from 'react';
import type React from 'react';
import { Blood, useBloodChannel } from './Blood';
import { ActionRegistry } from './ActionRegistry';
import { BC } from './BloodChannels';

interface RightSidebarProps {
  onToggleSettings: () => void;
}

export function RightSidebar({ onToggleSettings }: RightSidebarProps) {
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [displayMode, setDisplayMode] = useState<'icon' | 'text'>(() => {
    return (localStorage.getItem('dnote_sidebar_mode') as 'icon' | 'text') || 'icon';
  });

  const focusedAreaId = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null)
  );

  const focusedComponentType = useBloodChannel(
    focusedAreaId ? [`system.areaComponentTypes.${focusedAreaId}`] : [],
    () => focusedAreaId ? Blood.getValue<string | null>(`system.areaComponentTypes.${focusedAreaId}`, null) : null
  );

  const injectedButtons = useBloodChannel(
    focusedComponentType ? [BC.system.toolbarInjection(focusedComponentType)] : [],
    () => focusedComponentType ? Blood.getValue<string[]>(BC.system.toolbarInjection(focusedComponentType), []) : []
  );

  const globalActions = ActionRegistry.getAllActions().filter((action) => action.isGlobal);
  const contextActions = injectedButtons
    .map((actionId) => ActionRegistry.getAction(actionId))
    .filter(Boolean);

  const runSidebarAction = (actionId: string) => {
    if (!focusedAreaId) {
      console.warn('[RightSidebar] No focused panel area to apply layout action.');
      return;
    }
    ActionRegistry.runAction(actionId, {
      areaId: focusedAreaId,
      focusedAreaId,
    });
  };

  const renderActionIcon = (icon?: React.ReactNode) => {
    if (icon) return icon;

    // Generic fallback for actions without icons
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <line x1="8" y1="5" x2="8" y2="11" />
        <line x1="5" y1="8" x2="11" y2="8" />
      </svg>
    );
  };


  const renderActionButton = (actionId: string, label: string, icon?: React.ReactNode) => {
    const shortcut = ActionRegistry.getShortcutForAction(actionId);
    const title = shortcut ? `${label} (${shortcut})` : label;

    // In text mode, show a shortened version of the label
    let displayText = label;
    if (displayMode === 'text') {
      if (label.includes('(')) {
        displayText = label.split('(')[0].trim();
      }
      if (displayText.length > 5) {
        displayText = displayText.substring(0, 4) + '..';
      }
    }

    const buttonStyle: React.CSSProperties = displayMode === 'text' ? {
      width: '84px',
      height: '30px',
      borderRadius: '8px',
      padding: '0 8px',
      fontSize: 'var(--sidebar-label-size, 11px)',
      fontWeight: 600,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: '8px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    } : {
      width: '28px',
      height: '28px',
    };

    return (
      <button
        key={actionId}
        className="right-sidebar-btn"
        title={title}
        onClick={() => runSidebarAction(actionId)}
        disabled={!focusedAreaId}
        style={buttonStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {renderActionIcon(icon)}
        </div>
        {displayMode === 'text' && (
          <span style={{
            fontSize: 'var(--sidebar-label-size, 11px)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            userSelect: 'none'
          }}>
            {displayText}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="right-sidebar"
      style={{
        width: displayMode === 'text' ? '96px' : '40px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        borderLeft: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-header)',
        boxShadow: 'inset 1px 0px 0px rgba(255, 255, 255, 0.06)',
        zIndex: 10,
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Interactive components */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          height: '100%',
          padding: '12px 0px',
        }}
      >
          <div className="right-sidebar-section" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {globalActions.map((action) => renderActionButton(action.id, action.label, action.icon))}
          </div>

          <div className="right-sidebar-divider" style={displayMode === 'text' ? { width: '36px' } : {}} />

          <button
            className="right-sidebar-btn right-sidebar-fold"
            title={contextCollapsed ? '显示页面操作' : '折叠页面操作'}
            onClick={() => setContextCollapsed((prev) => !prev)}
            style={displayMode === 'text' ? {
              width: '84px',
              height: '30px',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--sidebar-label-size, 11px)',
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '8px',
            } : {}}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                {contextCollapsed ? (
                  <path d="M5.5 3.5L10.5 8L5.5 12.5" />
                ) : (
                  <path d="M10.5 3.5L5.5 8L10.5 12.5" />
                )}
              </svg>
            </div>
            {displayMode === 'text' && (
              <span style={{
                fontSize: 'var(--sidebar-label-size, 11px)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none'
              }}>
                {contextCollapsed ? '展开' : '收起'}
              </span>
            )}
          </button>

          {!contextCollapsed && contextActions.length > 0 && (
            <div className="right-sidebar-section right-sidebar-context-section" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              {contextActions.map((action) => renderActionButton(action!.id, action!.label, action!.icon))}
            </div>
          )}

          {/* Spacer to push settings button to the bottom */}
          <div style={{ flexGrow: 1 }} />

          {/* Sidebar Display Mode Toggle Button */}
          <button
            className="right-sidebar-btn"
            title={displayMode === 'icon' ? '切换为文字模式' : '切换为图标模式'}
            onClick={() => {
              const nextMode = displayMode === 'icon' ? 'text' : 'icon';
              setDisplayMode(nextMode);
              localStorage.setItem('dnote_sidebar_mode', nextMode);
            }}
            style={displayMode === 'text' ? {
              width: '84px',
              height: '30px',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--sidebar-label-size, 11px)',
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '8px',
            } : {}}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="4" x2="14" y2="4" />
                <line x1="2" y1="8" x2="10" y2="8" />
                <line x1="2" y1="12" x2="12" y2="12" />
              </svg>
            </div>
            {displayMode === 'text' && (
              <span style={{
                fontSize: 'var(--sidebar-label-size, 11px)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none'
              }}>
                图标
              </span>
            )}
          </button>

          {/* Settings Panel Toggle Button */}
          <button
            className="right-sidebar-btn"
            title="工作区偏好设置"
            onClick={onToggleSettings}
            style={displayMode === 'text' ? {
              width: '84px',
              height: '30px',
              borderRadius: '8px',
              padding: '0 8px',
              fontSize: 'var(--sidebar-label-size, 11px)',
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '8px',
            } : {}}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
              </svg>
            </div>
            {displayMode === 'text' && (
              <span style={{
                fontSize: 'var(--sidebar-label-size, 11px)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                userSelect: 'none'
              }}>
                设置
              </span>
            )}
          </button>
      </div>
    </div>
  );
}
