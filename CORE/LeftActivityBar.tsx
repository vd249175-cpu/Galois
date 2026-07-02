/**
 * CORE/LeftActivityBar.tsx
 *
 * 左侧活动栏组件。展示所有已注册插件的图标/短名称，
 * 点击后将聚焦区域的 componentType 切换为目标类型。
 *
 * 从 CORE/App.tsx 拆分至此（减小 App.tsx 体积，提升可读性）。
 */

import { useState } from 'react';
import { Blood, useBloodChannel } from './Blood';
import { ComponentRegistry } from './ComponentRegistry';
import { BC } from './BloodChannels';

export function LeftActivityBar() {
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
  useBloodChannel([BC.events.registryChanged], () =>
    Blood.getValue<number>(BC.events.registryChanged, 0)
  );

  const handleToggleMode = () => {
    const nextVal = !isTextMode;
    setIsTextMode(nextVal);
    localStorage.setItem('dnote_left_bar_text_mode', String(nextVal));
  };

  const availableTypes = ComponentRegistry.getAvailableTypes().filter(t => t !== 'settings');

  const barWidth = isTextMode ? '96px' : '44px';

  return (
    <div className="left-activity-bar" style={{
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
          // Each plugin declares its own shortName in its manifest.
          // CORE no longer hardcodes plugin-specific display names.
          const shortName = comp.shortName || comp.displayName;

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
                  fontSize: 'var(--sidebar-label-size, 11px)',
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
