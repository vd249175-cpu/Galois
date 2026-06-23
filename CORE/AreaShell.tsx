import React, { useRef, useEffect } from 'react';
import { Blood, useBloodChannel } from './Blood';
import { ComponentRegistry } from './ComponentRegistry';
import { ActionRegistry } from './ActionRegistry';

// Component wrapper middleware to subscribe to Blood keys and inject dependencies
function ComponentWrapper({
  areaId,
  currentComponent,
}: {
  areaId: string;
  currentComponent: any;
}) {
  // 1. Resolve state keys to listen to
  const channels = typeof currentComponent.bloodChannels === 'function'
    ? currentComponent.bloodChannels(areaId)
    : (currentComponent.bloodChannels || []);

  const actionChannels = (currentComponent.actions || []).map((act: any) => `actions.${act.id}.${areaId}`);
  const allChannels = [...channels, ...actionChannels];

  // 2. Subscribe using useBloodChannel
  const stateValues = useBloodChannel(allChannels, () => {
    const val: Record<string, any> = {};
    const allState = Blood.getRawState() || {};
    
    allChannels.forEach(ch => {
      if (ch.endsWith('.') || ch.endsWith(':')) {
        const subMap: Record<string, any> = {};
        Object.keys(allState).forEach(key => {
          if (key.startsWith(ch)) {
            subMap[key] = allState[key];
            val[key] = allState[key]; // Flatten key to top-level state for direct lookup
          }
        });
        val[ch] = subMap;
      } else {
        val[ch] = Blood.getValue(ch, undefined);
      }
    });
    return val;
  });

  // 3. Track lastAction triggered
  const [lastAction, setLastAction] = React.useState<any>(null);
  
  useEffect(() => {
    actionChannels.forEach((ch: string) => {
      if (Blood.getValue(ch, false)) {
        // Reset the value in Blood so it doesn't fire repeatedly
        Blood.updateKey(ch, false);
        const actionId = ch.split('.')[1];
        setLastAction({ id: actionId, timestamp: Date.now() });
      }
    });
  }, [stateValues, actionChannels]);

  // 4. Expose update actions
  const updateBloodState = (values: Record<string, any>) => {
    Blood.update(values);
  };
  const updateBloodKey = (key: string, value: any) => {
    Blood.updateKey(key, value);
  };

  // 5. Expose shortcut management API
  const shortcutAPI = {
    getAllActions: () => ActionRegistry.getAllActions(),
    getShortcutForAction: (actionId: string) => ActionRegistry.getShortcutForAction(actionId),
    registerShortcut: (actionId: string, combo: string) => ActionRegistry.registerShortcut(combo, actionId),
    removeShortcutForAction: (actionId: string) => ActionRegistry.removeShortcutForAction(actionId),
    serializeShortcuts: () => ActionRegistry.serializeShortcuts(),
  };

  return (
    <currentComponent.component
      areaId={areaId}
      state={stateValues}
      updateBloodState={updateBloodState}
      updateBloodKey={updateBloodKey}
      lastAction={lastAction}
      shortcutAPI={shortcutAPI}
    />
  );
}

interface AreaShellProps {
  areaId: string;
  componentType: string;
  isPopped?: boolean;
}

export function AreaShell({ areaId, componentType, isPopped = false }: AreaShellProps) {
  const ref = useRef<HTMLDivElement>(null);


  // Read if this area is focused
  const isFocused = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null) === areaId
  );

  // Listen to drag coordinates for visual split overlays
  const dragState = useBloodChannel(['system.dragState'], () =>
    Blood.getValue<any>('system.dragState', null)
  );

  // Monitor frame coordinates for split calculations
  useEffect(() => {
    if (isPopped) return;
    const el = ref.current;
    if (!el) return;

    const updateFrame = () => {
      const rect = el.getBoundingClientRect();
      Blood.updateKey(`system.areaFrames.${areaId}`, {
        minX: rect.left,
        maxX: rect.right,
        minY: rect.top,
        maxY: rect.bottom,
      });
    };

    const observer = new ResizeObserver(() => {
      updateFrame();
    });
    observer.observe(el);
    updateFrame();

    return () => {
      observer.disconnect();
      Blood.updateKey(`system.areaFrames.${areaId}`, undefined);
    };
  }, [areaId, isPopped]);

  // Register componentType in Blood state dynamically
  useEffect(() => {
    Blood.updateKey(`system.areaComponentTypes.${areaId}`, componentType);
    return () => {
      Blood.updateKey(`system.areaComponentTypes.${areaId}`, undefined);
    };
  }, [areaId, componentType]);

  // Determine split edge based on mouse position relative to bounds
  const calculateSplitRegion = (x: number, y: number, w: number, h: number) => {
    const dLeft = x;
    const dRight = w - x;
    const dTop = y;
    const dBottom = h - y;
    const minD = Math.min(dLeft, dRight, dTop, dBottom);

    if (minD === dLeft) return { direction: 'horizontal' as const, insertFirst: true };
    if (minD === dRight) return { direction: 'horizontal' as const, insertFirst: false };
    if (minD === dTop) return { direction: 'vertical' as const, insertFirst: true };
    return { direction: 'vertical' as const, insertFirst: false };
  };

  // Custom Mouse Drag merge/popout handler
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isPopped) return;
    if (e.button !== 0) return; // Only left click

    // Don't drag if clicking interactive elements inside the header
    const target = e.target as HTMLElement;
    if (target.tagName === 'SELECT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('select')) {
      return;
    }

    e.preventDefault();
    Blood.updateKey('system.activeDraggedId', areaId);

    const onMouseMove = (moveEvt: MouseEvent) => {
      const x = moveEvt.clientX;
      const y = moveEvt.clientY;

      // 1. Check if cursor left window boundaries to trigger popout
      const pad = 12;
      if (x < pad || x > window.innerWidth - pad || y < pad || y > window.innerHeight - pad) {
        cleanup();
        Blood.updateKey('system.dragState', null);
        Blood.updateKey('system.activeDraggedId', '');
        popOut();
        return;
      }

      // 2. Update drag coordinates in state for overlay rendering
      Blood.updateKey('system.dragState', {
        draggedId: areaId,
        location: { x, y }
      });
    };

    const onMouseUp = (upEvt: MouseEvent) => {
      cleanup();

      const x = upEvt.clientX;
      const y = upEvt.clientY;

      // Check if dropped over another panel using registered boundaries
      const frames = Blood.getValue<Record<string, any>>('system.areaFrames', {});

      for (const [id, frame] of Object.entries(frames)) {
        if (id === areaId || !frame) continue;
        const { minX, maxX, minY, maxY } = frame;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
          const w = maxX - minX;
          const h = maxY - minY;
          const rx = x - minX;
          const ry = y - minY;
          const splitRegion = calculateSplitRegion(rx, ry, w, h);

          Blood.updateKey('layout.dragMerge', {
            targetId: id,
            draggedId: areaId,
            direction: splitRegion.direction,
            insertFirst: splitRegion.insertFirst,
          });
          break;
        }
      }

      Blood.updateKey('system.dragState', null);
      Blood.updateKey('system.activeDraggedId', '');
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Actions
  const changeType = (newType: string) => {
    Blood.updateKey(`layout.changeAreaType.${areaId}`, newType);
  };

  const splitHorizontally = () => {
    Blood.updateKey(`layout.splitArea.${areaId}`, 'horizontal');
  };

  const splitVertically = () => {
    Blood.updateKey(`layout.splitArea.${areaId}`, 'vertical');
  };

  const popOut = () => {
    Blood.updateKey(`layout.poppedAreas.${areaId}`, componentType);
    Blood.updateKey(`layout.removeArea.${areaId}`, true);

    const title = ComponentRegistry.getComponent(componentType)?.displayName || 'Workspace Pane';
    (window as any).electronAPI.openSecondaryWindow(areaId, componentType, title);
  };

  const mergeBack = () => {
    Blood.updateKey(`layout.mergeBackArea.${areaId}`, true);
    (window as any).electronAPI.closeSecondaryWindow(areaId);
  };

  const closePanel = () => {
    Blood.updateKey(`layout.removeArea.${areaId}`, true);
  };

  const focusMe = () => {
    Blood.updateKey('system.focusedAreaId', areaId);
    Blood.updateKey(`system.lastFocused.${componentType}Id`, areaId);
  };

  // Dynamically calculate drag overlay region from Blood state
  const getActiveDragOverlay = () => {
    if (!dragState || dragState.draggedId === areaId) return null;
    const { x, y } = dragState.location || {};
    if (x === undefined || y === undefined) return null;

    const myFrame = Blood.getValue<any>(`system.areaFrames.${areaId}`, null);
    if (!myFrame) return null;

    const { minX, maxX, minY, maxY } = myFrame;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      const w = maxX - minX;
      const h = maxY - minY;
      const rx = x - minX;
      const ry = y - minY;
      return calculateSplitRegion(rx, ry, w, h);
    }
    return null;
  };

  const currentComponent = ComponentRegistry.getComponent(componentType);
  const availableTypes = ComponentRegistry.getAvailableTypes();
  const activeOverlay = getActiveDragOverlay();

  return (
    <div
      ref={ref}
      className={`area-shell ${isFocused ? 'focused' : ''}`}
      onClick={focusMe}
    >
      {/* Header controls bar */}
      <div
        className="area-header"
        onMouseDown={handleHeaderMouseDown}
      >
        <span className="area-header-icon" style={{ display: 'flex', alignItems: 'center' }}>
          {currentComponent?.typeId === 'editor' ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
            </svg>
          ) : currentComponent?.typeId === 'terminal' ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
              <path d="M4 6.5l2 1.5-2 1.5" />
              <line x1="7.5" y1="9.5" x2="10.5" y2="9.5" />
            </svg>
          ) : currentComponent?.typeId === 'settings' ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
            </svg>
          )}
        </span>

        <select
          className="area-select"
          value={componentType}
          onChange={(e) => changeType(e.target.value)}
        >
          {availableTypes.map((type) => (
            <option key={type} value={type}>
              {ComponentRegistry.getComponent(type)?.displayName || type}
            </option>
          ))}
        </select>

        <div style={{ flexGrow: 1 }} />


        {!isPopped && (
          <>
            <button className="area-btn" title="Split Horizontally" onClick={splitHorizontally}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1" />
                <line x1="8" y1="2" x2="8" y2="14" />
              </svg>
            </button>
            <button className="area-btn" title="Split Vertically" onClick={splitVertically}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1" />
                <line x1="2" y1="8" x2="14" y2="8" />
              </svg>
            </button>
            <button className="area-btn" title="Pop out Window" onClick={popOut}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="5" width="9" height="9" rx="1" />
                <path d="M6.5 2.5H13.5V9.5" />
                <line x1="13.5" y1="2.5" x2="7.5" y2="8.5" />
              </svg>
            </button>
            <button className="area-btn danger" title="Close Panel" onClick={closePanel}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
              </svg>
            </button>
          </>
        )}

        {isPopped && (
          <button className="area-btn" title="Merge Back" onClick={mergeBack}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="2" width="9" height="9" rx="1" />
              <path d="M11 13.5H2.5V5" />
              <line x1="2.5" y1="13.5" x2="8.5" y2="7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Render Component Content */}
      <div className="area-content">
        {currentComponent ? (
          <ComponentWrapper areaId={areaId} currentComponent={currentComponent} />
        ) : (
          <div style={{ padding: '20px', color: 'var(--text-muted)' }}>
            Select Component in Header Dropdown
          </div>
        )}
      </div>

      {/* Split drop zone highlights */}
      {activeOverlay && (
        <div
          className="drag-overlay-region"
          style={{
            top: activeOverlay.direction === 'vertical' && !activeOverlay.insertFirst ? '50%' : '0',
            left: activeOverlay.direction === 'horizontal' && !activeOverlay.insertFirst ? '50%' : '0',
            width: activeOverlay.direction === 'horizontal' ? '50%' : '100%',
            height: activeOverlay.direction === 'vertical' ? '50%' : '100%',
          }}
        />
      )}
    </div>
  );
}
