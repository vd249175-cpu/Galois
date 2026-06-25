import { useEffect, useRef } from 'react';

interface SlashMenuProps {
  show: boolean;
  filteredCommands: any[];
  slashMenuIndex: number;
  setSlashMenuIndex: (idx: number) => void;
  slashMenuCoords: { left: number; top: number };
  handleExecuteCommand: (cmd: any) => void;
  getShortcutDisplay: (id: string) => string;
}

export function SlashMenu({
  show,
  filteredCommands,
  slashMenuIndex,
  setSlashMenuIndex,
  slashMenuCoords,
  handleExecuteCommand,
  getShortcutDisplay,
}: SlashMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && containerRef.current) {
      const container = containerRef.current;
      const activeChild = container.children[slashMenuIndex] as HTMLElement;
      if (activeChild) {
        const containerHeight = container.clientHeight;
        const childTop = activeChild.offsetTop;
        const childHeight = activeChild.clientHeight;

        if (childTop < container.scrollTop) {
          container.scrollTop = childTop;
        } else if (childTop + childHeight > container.scrollTop + containerHeight) {
          container.scrollTop = childTop + childHeight - containerHeight;
        }
      }
    }
  }, [slashMenuIndex, show]);

  if (!show || filteredCommands.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: slashMenuCoords.left,
        top: slashMenuCoords.top,
        width: '320px',
        maxHeight: '200px',
        backgroundColor: 'var(--bg-main)',
        border: '1.2px solid rgba(0, 0, 0, 0.12)',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
        overflowY: 'auto',
        zIndex: 1000,
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      {filteredCommands.map((cmd, idx) => {
        const isSelected = idx === slashMenuIndex;
        return (
          <div
            key={cmd.id}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleExecuteCommand(cmd);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              backgroundColor: isSelected ? 'var(--highlight-color)' : 'transparent',
              color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
              transition: 'background-color 0.1s, color 0.1s',
            }}
            onMouseEnter={() => setSlashMenuIndex(idx)}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              backgroundColor: isSelected ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '10px',
              flexShrink: 0,
            }}>
              {cmd.icon}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexGrow: 1 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>{cmd.label}</span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>{cmd.desc}</span>
            </div>
            {getShortcutDisplay(cmd.id) && (
              <span style={{ fontSize: '9px', color: 'var(--accent-color)', opacity: 0.8, paddingLeft: '8px', flexShrink: 0, fontWeight: 700 }}>
                {getShortcutDisplay(cmd.id)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
