import { useState } from 'react';
import type React from 'react';
import { Blood, useBloodChannel } from './Blood';
import { ActionRegistry } from './ActionRegistry';

interface RightSidebarProps {
  onToggleSettings: () => void;
}

export function RightSidebar({ onToggleSettings }: RightSidebarProps) {
  const [contextCollapsed, setContextCollapsed] = useState(false);

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

  const renderActionIcon = (actionId: string, icon?: React.ReactNode) => {
    if (icon) return icon;

    if (actionId === 'panel.splitHorizontal') {
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
          <line x1="8" y1="2" x2="8" y2="14" />
        </svg>
      );
    }

    if (actionId === 'panel.splitVertical') {
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
          <line x1="2" y1="8" x2="14" y2="8" />
        </svg>
      );
    }

    if (actionId === 'panel.popOut') {
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" />
          <path d="M10 2h4v4" />
          <line x1="14" y1="2" x2="7.5" y2="8.5" />
        </svg>
      );
    }

    if (actionId === 'panel.close') {
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
        </svg>
      );
    }

    // Generic fallback
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

    return (
      <button
        key={actionId}
        className="right-sidebar-btn"
        title={title}
        onClick={() => runSidebarAction(actionId)}
        disabled={!focusedAreaId}
      >
        {renderActionIcon(actionId, icon)}
      </button>
    );
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
          <div className="right-sidebar-section">
            {globalActions.map((action) => renderActionButton(action.id, action.label, action.icon))}
          </div>

          <div className="right-sidebar-divider" />

          <button
            className="right-sidebar-btn right-sidebar-fold"
            title={contextCollapsed ? 'Show Page Buttons' : 'Collapse Page Buttons'}
            onClick={() => setContextCollapsed((prev) => !prev)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              {contextCollapsed ? (
                <path d="M5.5 3.5L10.5 8L5.5 12.5" />
              ) : (
                <path d="M10.5 3.5L5.5 8L10.5 12.5" />
              )}
            </svg>
          </button>

          {!contextCollapsed && contextActions.length > 0 && (
            <div className="right-sidebar-section right-sidebar-context-section">
              {contextActions.map((action) => renderActionButton(action!.id, action!.label, action!.icon))}
            </div>
          )}

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
