import React, { useMemo, useRef, useEffect } from 'react';
import { Blood, useBloodChannel } from './Blood';
import { ComponentRegistry } from './ComponentRegistry';
import { ActionRegistry } from './ActionRegistry';
import { BC } from './BloodChannels';

// Component wrapper middleware to subscribe to Blood keys and inject dependencies
function ComponentWrapper({
  areaId,
  currentComponent,
}: {
  areaId: string;
  currentComponent: any;
}) {
  // 1. Resolve data-only state channels (exclude action channels from stateValues)
  const dataChannels: string[] = useMemo(() => {
    const channels = typeof currentComponent.bloodChannels === 'function'
      ? currentComponent.bloodChannels(areaId)
      : (currentComponent.bloodChannels || []);
    return channels;
  }, [currentComponent.bloodChannels, areaId]);

  // 2. Subscribe data channels via useBloodChannel (React-safe, no action channels here)
  const stateValues = useBloodChannel(dataChannels, () => {
    const val: Record<string, any> = {};
    const allState = Blood.getRawState() || {};

    dataChannels.forEach(ch => {
      if (ch.endsWith('.') || ch.endsWith(':')) {
        const subMap: Record<string, any> = {};
        Object.keys(allState).forEach(key => {
          if (key.startsWith(ch)) {
            subMap[key] = allState[key];
            val[key] = allState[key];
          }
        });
        val[ch] = subMap;
      } else {
        val[ch] = Blood.getValue(ch, undefined);
      }
    });
    return val;
  });

  // 3. Track lastAction via direct Blood.subscribe (avoids stateValues polling race condition)
  //    Action signal format: actions.[pluginName].[actionName].[areaId] = timestamp
  const [lastAction, setLastAction] = React.useState<{ id: string; timestamp: number } | null>(null);
  const actionChannelPrefix = `actions.`;
  const areaIdRef = useRef(areaId);
  areaIdRef.current = areaId;

  const componentActionsRef = useRef(currentComponent.actions);
  componentActionsRef.current = currentComponent.actions;

  useEffect(() => {
    const unsubscribe = Blood.subscribe((changedKeys) => {
      const myActions: string[] = (componentActionsRef.current || []).map(
        (act: any) => `actions.${act.id}.${areaIdRef.current}`
      );

      changedKeys.forEach(key => {
        if (!key.startsWith(actionChannelPrefix)) return;
        
        // Extract actionId: strip "actions." prefix and ".{areaId}" suffix
        const withoutPrefix = key.slice(actionChannelPrefix.length);
        if (!withoutPrefix.endsWith(`.${areaIdRef.current}`)) return;
        const actionId = withoutPrefix.slice(0, -(`.${areaIdRef.current}`.length));

        const isMyStaticAction = myActions.includes(key);
        const isDynamicEditorAction = currentComponent.typeId === 'editor' && 
          (actionId.startsWith('custom.') || actionId.startsWith('project.'));

        if (!isMyStaticAction && !isDynamicEditorAction) return;

        const ts = Blood.getValue<number | undefined>(key, undefined);
        if (ts === undefined || ts === null) return; // ignore the clear-signal

        // Consume the signal immediately
        Blood.updateKey(key, undefined);

        setLastAction({ id: actionId, timestamp: ts as number });
        
        // Auto-clear lastAction signal after propagation to prevent duplicate executions on subsequent state/prop updates
        setTimeout(() => {
          setLastAction(null);
        }, 50);
      });
    });
    return unsubscribe;
  }, []); // stable subscription, uses refs for dynamic values

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

  // Robust focus listener mapping (focusin bubbles up, mousedown captures clicks)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleFocusTrigger = () => {
      focusMe();
    };

    el.addEventListener('focusin', handleFocusTrigger);
    el.addEventListener('mousedown', handleFocusTrigger);
    return () => {
      el.removeEventListener('focusin', handleFocusTrigger);
      el.removeEventListener('mousedown', handleFocusTrigger);
    };
  }, [areaId, componentType]);

  // Listen for panel.popOut action via Blood (layout.popArea.{areaId} = timestamp)
  // popOutRef avoids forward-reference issue since popOut const is declared later
  const popOutRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (isPopped) return;
    const unsubscribe = Blood.subscribe((changedKeys) => {
      if (changedKeys.has(`layout.popArea.${areaId}`)) {
        const ts = Blood.getValue<number | undefined>(`layout.popArea.${areaId}`, undefined);
        if (ts !== undefined) {
          Blood.updateKey(`layout.popArea.${areaId}`, undefined);
          popOutRef.current();
        }
      }
    });
    return unsubscribe;
  }, [areaId, isPopped]);


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

  // Cross-window HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'SELECT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('select')) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData('application/dnote-area', JSON.stringify({
      draggedId: areaId,
      componentType,
      isPopped
    }));
    e.dataTransfer.effectAllowed = 'move';

    Blood.updateKey(BC.system.activeDraggedId, areaId);
    Blood.updateKey('system.dragState', {
      draggedId: areaId,
      location: { x: e.clientX, y: e.clientY }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const activeDraggedId = Blood.getValue<string>(BC.system.activeDraggedId, '');
    if (!activeDraggedId || activeDraggedId === areaId) return;

    Blood.updateKey('system.dragState', {
      draggedId: activeDraggedId,
      location: { x: e.clientX, y: e.clientY }
    });
  };

  const handleDragLeave = () => {
    const dragState = Blood.getValue<any>('system.dragState', null);
    if (dragState && dragState.draggedId !== areaId) {
      Blood.updateKey('system.dragState', {
        draggedId: dragState.draggedId,
        location: null
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('application/dnote-area');
    if (dataStr) {
      try {
        const { draggedId, componentType: draggedType, isPopped: draggedPopped } = JSON.parse(dataStr);
        if (draggedId === areaId) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const rx = e.clientX - rect.left;
        const ry = e.clientY - rect.top;
        const splitRegion = calculateSplitRegion(rx, ry, rect.width, rect.height);

        Blood.updateKey('layout.dragMerge', {
          targetId: areaId,
          draggedId,
          direction: splitRegion.direction,
          insertFirst: splitRegion.insertFirst,
          draggedType,
          draggedPopped
        });
      } catch (err) {
        console.error('Failed to parse drag merge payload:', err);
      }
    }

    Blood.updateKey('system.dragState', null);
    Blood.updateKey(BC.system.activeDraggedId, '');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    Blood.updateKey('system.dragState', null);
    Blood.updateKey(BC.system.activeDraggedId, '');

    // Check if dropped outside window boundaries to trigger popOut (only if not already popped)
    if (!isPopped) {
      const x = e.clientX;
      const y = e.clientY;
      const pad = 12;
      if (x < pad || x > window.innerWidth - pad || y < pad || y > window.innerHeight - pad) {
        popOut();
      }
    }
  };

  // Actions

  const popOut = () => {
    Blood.updateKey(`layout.poppedAreas.${areaId}`, componentType);
    // 必须使用 timestamp：同一按钮连续单击也要触发，boolean 无法区分
    Blood.updateKey(`layout.removeArea.${areaId}`, Date.now());

    const title = ComponentRegistry.getComponent(componentType)?.displayName || '工作区面板';
    (window as any).electronAPI.openSecondaryWindow(areaId, componentType, title);
  };
  // Keep ref in sync so the stable Blood subscriber above can call the latest popOut
  popOutRef.current = popOut;



  const closePanel = () => {
    // 必须使用 timestamp：同一按钮连续单击也要触发，boolean 无法区分
    Blood.updateKey(`layout.removeArea.${areaId}`, Date.now());
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
  const activeOverlay = getActiveDragOverlay();

  return (
    <div
      ref={ref}
      className={`area-shell ${isFocused ? 'focused' : ''}`}
      onClick={focusMe}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header controls bar */}
      <div
        className="area-header"
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{ overflow: 'hidden' }}
      >
        <span className="area-header-icon" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {currentComponent?.icon || (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
            </svg>
          )}
        </span>

        <span
          className="area-header-title"
          style={{
            fontWeight: 600,
            fontSize: '11px',
            color: 'var(--text-main)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 1
          }}
        >
          {currentComponent?.displayName}
        </span>

        <div style={{ flexGrow: 1 }} />

        {!isPopped && (
          <button className="area-btn danger" title="关闭面板" onClick={closePanel} style={{ flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" />
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
            请在顶部下拉菜单选择组件
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
