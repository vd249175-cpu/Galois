import { Blood, useBloodChannel } from './Blood';
import { ActionRegistry } from './ActionRegistry';

interface RightSidebarProps {
  onToggleSettings: () => void;
}

export function RightSidebar({ onToggleSettings }: RightSidebarProps) {
  const focusedAreaId = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null)
  );

  const focusedComponentType = useBloodChannel(
    focusedAreaId ? [`system.areaComponentTypes.${focusedAreaId}`] : [],
    () => focusedAreaId ? Blood.getValue<string | null>(`system.areaComponentTypes.${focusedAreaId}`, null) : null
  );

  const injectedButtons = useBloodChannel(
    focusedComponentType ? [`injections.${focusedComponentType}.toolbar`] : [],
    () => focusedComponentType ? Blood.getValue<string[]>(`injections.${focusedComponentType}.toolbar`, []) : []
  );

  const runLayoutAction = (actionId: string) => {
    if (!focusedAreaId) {
      console.warn('[RightSidebar] No focused panel area to apply layout action.');
      return;
    }
    ActionRegistry.runAction(actionId, {
      areaId: focusedAreaId,
      focusedAreaId,
    });
  };

  return (
    <>
      {/* SVG Liquid Glass Refraction Filter Definition */}
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <defs>
          <filter id="liquid-glass-sidebar-refraction" x="0%" y="0%" width="100%" height="100%">
            {/* High-quality fractal noise map to generate organic thickness refraction */}
            <feTurbulence type="fractalNoise" baseFrequency="0.015 0.03" numOctaves="3" result="noise" seed="42" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="24" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div
        className="right-sidebar"
        style={{
          width: '40px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          borderLeft: '1px solid var(--border-color)',
          backgroundColor: 'transparent',
          zIndex: 10,
        }}
      >
        {/* Layer 1: Liquid Glass Refracted backdrop */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'var(--bg-panel)',
            backdropFilter: 'url(#liquid-glass-sidebar-refraction) blur(24px) saturate(135%) contrast(90%)',
            WebkitBackdropFilter: 'url(#liquid-glass-sidebar-refraction) blur(24px) saturate(135%) contrast(90%)',
            boxShadow: 'inset 1px 0 0 rgba(255, 255, 255, 0.55), inset -1px 0 0 rgba(0, 0, 0, 0.03)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />

        {/* Layer 2: Interactive components */}
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
          {/* Split Horizontally Button */}
          <button
            className="right-sidebar-btn"
            title="Split Horizontally (meta+d)"
            onClick={() => runLayoutAction('panel.splitHorizontal')}
            disabled={!focusedAreaId}
            style={{ opacity: focusedAreaId ? 1 : 0.4 }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <line x1="8" y1="2" x2="8" y2="14" />
            </svg>
          </button>

          {/* Split Vertically Button */}
          <button
            className="right-sidebar-btn"
            title="Split Vertically (meta+shift+d)"
            onClick={() => runLayoutAction('panel.splitVertical')}
            disabled={!focusedAreaId}
            style={{ opacity: focusedAreaId ? 1 : 0.4 }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="12" height="12" rx="1.5" />
              <line x1="2" y1="8" x2="14" y2="8" />
            </svg>
          </button>

          {/* Close Panel Button */}
          <button
            className="right-sidebar-btn"
            title="Close Focused Panel (meta+w)"
            onClick={() => runLayoutAction('panel.close')}
            disabled={!focusedAreaId}
            style={{ opacity: focusedAreaId ? 1 : 0.4 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
            </svg>
          </button>

          {/* Divider */}
          {injectedButtons.length > 0 && (
            <div style={{
              width: '20px',
              height: '1px',
              backgroundColor: 'var(--border-color)',
              margin: '6px 0',
              opacity: 0.6
            }} />
          )}

          {/* Render Dynamic Contextual Buttons */}
          {injectedButtons.map((actionId) => {
            const action = ActionRegistry.getAction(actionId);
            if (!action) return null;

            const handleBtnClick = () => {
              ActionRegistry.runAction(actionId, {
                areaId: focusedAreaId || '',
                focusedAreaId,
              });
            };

            return (
              <button
                key={actionId}
                className="right-sidebar-btn"
                title={action.label}
                onClick={handleBtnClick}
                style={{ position: 'relative' }}
              >
                {action.icon ? (
                  action.icon
                ) : actionId === 'editor.save' ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 2.5h7.5L13 5v8.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-11z" />
                    <rect x="5.5" y="9.5" width="5" height="5" />
                    <rect x="5.5" y="2.5" width="4" height="3" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="8" cy="8" r="6" />
                    <line x1="8" y1="5" x2="8" y2="11" />
                    <line x1="5" y1="8" x2="11" y2="8" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Spacer to push settings button to the bottom */}
          <div style={{ flexGrow: 1 }} />

          {/* Settings Panel Toggle Button */}
          <button
            className="right-sidebar-btn"
            title="Workspace Settings"
            onClick={onToggleSettings}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
