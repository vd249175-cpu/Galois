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

        const visibleTop = container.scrollTop;
        const visibleBottom = visibleTop + containerHeight;
        const childBottom = childTop + childHeight;
        const padding = 6;

        if (childTop < visibleTop + padding) {
          container.scrollTop = Math.max(0, childTop - padding);
        } else if (childBottom > visibleBottom - padding) {
          container.scrollTop = childBottom - containerHeight + padding;
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
        maxHeight: '260px',
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
          <div key={cmd.id}>
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleExecuteCommand(cmd);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '7px',
                cursor: 'pointer',
                backgroundColor: isSelected ? 'var(--highlight-color)' : 'transparent',
                color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                transition: 'background-color 0.1s, color 0.1s',
              }}
              onMouseMove={() => setSlashMenuIndex(idx)}
            >
              <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '6px',
                backgroundColor: isSelected ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 'calc(var(--slash-menu-title-size, 11px) - 1px)',
                flexShrink: 0,
              }}>
                {cmd.icon}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexGrow: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: 'var(--slash-menu-title-size, 11px)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {cmd.label}
                </span>
                <span style={{ fontSize: 'var(--slash-menu-description-size, 9px)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cmd.desc}
                </span>
              </div>
              {getShortcutDisplay(cmd.id) && (
                <span style={{ fontSize: 'var(--slash-menu-description-size, 9px)', color: 'var(--accent-color)', opacity: 0.8, paddingLeft: '8px', flexShrink: 0, fontWeight: 700 }}>
                  {getShortcutDisplay(cmd.id)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
