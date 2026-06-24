import React, { useRef, useEffect } from 'react';
import { AreaLayout, SplitDirection } from './AreaLayout';
import { AreaShell } from './AreaShell';
import { Blood, useBloodChannel } from './Blood';

interface LayoutEngineProps {
  layout: AreaLayout;
  onLayoutChange: (newLayout: AreaLayout) => void;
}

export function isNodeCollapsed(node: AreaLayout): boolean {
  if (node.type === 'area') {
    return Blood.getValue(`layout.removeArea.${node.id}`, false);
  }
  return isNodeCollapsed(node.first) && isNodeCollapsed(node.second);
}

export function LayoutEngine({ layout, onLayoutChange }: LayoutEngineProps) {
  // Subscribe to all layout-related state triggers in Blood
  useEffect(() => {
    return Blood.subscribe((changedKeys) => {
      let treeModified = false;
      let nextLayout = { ...layout };

      for (const channel of changedKeys) {
        if (channel.startsWith('layout.changeAreaType.')) {
          const areaId = channel.replace('layout.changeAreaType.', '');
          const newType = Blood.getValue(channel, '');
          if (newType) {
            nextLayout = updateComponentType(nextLayout, areaId, newType);
            treeModified = true;
          }
        } else if (channel.startsWith('layout.removeArea.')) {
          const areaId = channel.replace('layout.removeArea.', '');
          if (Blood.getValue(channel, false)) {
            nextLayout = exciseNode(nextLayout, areaId) || nextLayout;
            treeModified = true;
          }
        } else if (channel.startsWith('layout.splitArea.')) {
          const areaId = channel.replace('layout.splitArea.', '');
          const dirStr = Blood.getValue(channel, '');
          if (dirStr) {
            const direction = dirStr as SplitDirection;
            nextLayout = splitNode(nextLayout, areaId, direction);
            Blood.updateKey(channel, ''); // Clear trigger
            treeModified = true;
          }
        } else if (channel.startsWith('layout.mergeBackArea.')) {
          const areaId = channel.replace('layout.mergeBackArea.', '');
          if (Blood.getValue(channel, false)) {
            // Restore hidden node inside the layout tree
            Blood.updateKey(`layout.removeArea.${areaId}`, false);
            Blood.updateKey(channel, false);
            treeModified = true;
          }
        } else if (channel === 'layout.dragMerge') {
          const config = Blood.getValue<any>(channel, null);
          if (config && config.targetId && config.draggedId) {
            const { targetId, draggedId, direction, insertFirst } = config;
            const wasPopped = config.draggedPopped || Blood.getValue(`layout.poppedAreas.${draggedId}`, null) !== null;
            const componentType = config.draggedType || 
              Blood.getValue(`system.areaComponentTypes.${draggedId}`, null) || 
              Blood.getValue(`layout.poppedAreas.${draggedId}`, 'editor');

            const draggedNode: AreaLayout = {
              type: 'area',
              id: draggedId,
              componentType,
            };

            // Excise from old position and merge into new position
            const excised = exciseNode(nextLayout, draggedId) || nextLayout;
            nextLayout = dragMergeNode(excised, targetId, draggedNode, direction, insertFirst);
            
            // Mark as restored in main window
            Blood.updateKey(`layout.removeArea.${draggedId}`, false);
            
            if (wasPopped) {
              Blood.updateKey(`layout.poppedAreas.${draggedId}`, undefined);
              (window as any).electronAPI.closeSecondaryWindow(draggedId);
            }

            Blood.updateKey(channel, null);
            treeModified = true;
          }
        }
      }

      if (treeModified) {
        onLayoutChange(nextLayout);
      }
    });
  }, [layout, onLayoutChange]);

  return <LayoutEngineView node={layout} onLayoutChange={onLayoutChange} />;
}

interface LayoutEngineViewProps {
  node: AreaLayout;
  onLayoutChange: (newLayout: AreaLayout) => void;
}

function LayoutEngineView({ node, onLayoutChange }: LayoutEngineViewProps) {
  // Use Blood channel updates to catch hidden/collapse triggers
  const collapsed = useBloodChannel(
    [`layout.removeArea.`],
    () => isNodeCollapsed(node)
  );

  if (collapsed) {
    return null;
  }

  if (node.type === 'area') {
    return <AreaShell areaId={node.id} componentType={node.componentType} />;
  }

  const firstCollapsed = isNodeCollapsed(node.first);
  const secondCollapsed = isNodeCollapsed(node.second);

  if (firstCollapsed && !secondCollapsed) {
    return <LayoutEngineView node={node.second} onLayoutChange={onLayoutChange} />;
  }
  
  if (secondCollapsed && !firstCollapsed) {
    return <LayoutEngineView node={node.first} onLayoutChange={onLayoutChange} />;
  }

  // Handle ratio changes for split divider dragging
  const updateRatio = (newRatio: number) => {
    const updated: AreaLayout = {
      ...node,
      ratio: newRatio,
    };
    // Replace current node inside the parent tree and update layout state
    onLayoutChange(updated);
  };

  const handleRatioChangeChild = (child: 'first' | 'second', childLayout: AreaLayout) => {
    const updated: AreaLayout = {
      ...node,
      [child]: childLayout,
    };
    onLayoutChange(updated);
  };

  return (
    <SplitView
      direction={node.direction}
      ratio={node.ratio}
      first={node.first}
      second={node.second}
      onRatioChange={updateRatio}
      onChildChange={(child, l) => handleRatioChangeChild(child, l)}
    />
  );
}

interface SplitViewProps {
  direction: SplitDirection;
  ratio: number;
  first: AreaLayout;
  second: AreaLayout;
  onRatioChange: (newRatio: number) => void;
  onChildChange: (child: 'first' | 'second', layout: AreaLayout) => void;
}

function SplitView({
  direction,
  ratio,
  first,
  second,
  onRatioChange,
  onChildChange,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Keep latest layout variables in a mutable ref to solve stale closure issue during drag events
  const latestProps = useRef({ direction, onRatioChange });
  useEffect(() => {
    latestProps.current = { direction, onRatioChange };
  }, [direction, onRatioChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { direction: dir, onRatioChange: onChange } = latestProps.current;

    let newRatio;
    if (dir === 'horizontal') {
      const offsetX = e.clientX - rect.left;
      newRatio = Math.max(0.05, Math.min(0.95, offsetX / rect.width));
    } else {
      const offsetY = e.clientY - rect.top;
      newRatio = Math.max(0.05, Math.min(0.95, offsetY / rect.height));
    }
    onChange(newRatio);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={containerRef}
      className={`layout-split ${direction}`}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        flexDirection: direction === 'horizontal' ? 'row' : 'column',
      }}
    >
      <div style={{ flex: ratio, position: 'relative', overflow: 'hidden' }}>
        <LayoutEngineView node={first} onLayoutChange={(l) => onChildChange('first', l)} />
      </div>
      <div className="layout-divider" onMouseDown={handleMouseDown} />
      <div style={{ flex: 1 - ratio, position: 'relative', overflow: 'hidden' }}>
        <LayoutEngineView node={second} onLayoutChange={(l) => onChildChange('second', l)} />
      </div>
    </div>
  );
}

// Layout helper operations (immutable mutations)
function updateComponentType(node: AreaLayout, targetId: string, toType: string): AreaLayout {
  if (node.type === 'area') {
    if (node.id === targetId) {
      return { ...node, componentType: toType };
    }
    return node;
  }
  return {
    ...node,
    first: updateComponentType(node.first, targetId, toType),
    second: updateComponentType(node.second, targetId, toType),
  };
}

function exciseNode(node: AreaLayout, targetId: string): AreaLayout | null {
  if (node.type === 'area') {
    return node.id === targetId ? null : node;
  }
  const f = exciseNode(node.first, targetId);
  const s = exciseNode(node.second, targetId);
  if (!f) return s;
  if (!s) return f;
  return { ...node, first: f, second: s };
}

function splitNode(node: AreaLayout, targetId: string, direction: SplitDirection): AreaLayout {
  if (node.type === 'area') {
    if (node.id === targetId) {
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        first: { ...node },
        second: {
          type: 'area',
          id: Math.random().toString(36).substring(2, 11).toUpperCase(),
          componentType: node.componentType,
        },
      };
    }
    return node;
  }
  return {
    ...node,
    first: splitNode(node.first, targetId, direction),
    second: splitNode(node.second, targetId, direction),
  };
}

function dragMergeNode(
  node: AreaLayout,
  targetId: string,
  draggedNode: AreaLayout,
  direction: SplitDirection,
  insertFirst: boolean
): AreaLayout {
  if (node.type === 'area') {
    if (node.id === targetId) {
      return {
        type: 'split',
        direction,
        ratio: 0.5,
        first: insertFirst ? draggedNode : node,
        second: insertFirst ? node : draggedNode,
      };
    }
    return node;
  }
  return {
    ...node,
    first: dragMergeNode(node.first, targetId, draggedNode, direction, insertFirst),
    second: dragMergeNode(node.second, targetId, draggedNode, direction, insertFirst),
  };
}
