interface HistoryProjectsMenuProps {
  show: boolean;
  displayedHistory: string[];
  projectPath: string;
  demoPath: string;
  onSelectHistoryProject: (path: string) => void;
}

export function HistoryProjectsMenu({
  show,
  displayedHistory,
  projectPath,
  demoPath,
  onSelectHistoryProject,
}: HistoryProjectsMenuProps) {
  if (!show) return null;

  return (
    <div
      id="history-projects-menu"
      style={{
        position: 'absolute',
        top: '44px',
        right: '10px',
        zIndex: 1100,
        width: '240px',
        maxHeight: '260px',
        overflowY: 'auto',
        backgroundColor: 'var(--bg-main)',
        border: '1.2px solid var(--border-color)',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '6px',
        gap: '2px',
      }}
    >
      <div style={{ padding: '6px 8px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', marginBottom: '4px', letterSpacing: '0.5px' }}>
        历史笔记本
      </div>
      {displayedHistory.map((item) => {
        const name = item.split('/').pop() || item;
        const isCurrent = item === projectPath;
        const isDemo = item === demoPath;
        return (
          <div
            key={item}
            onClick={() => onSelectHistoryProject(item)}
            style={{
              padding: '6px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: isCurrent ? 'var(--highlight-color)' : 'transparent',
              color: isCurrent ? 'var(--accent-color)' : 'var(--text-main)',
              transition: 'background-color 0.12s',
              fontWeight: isCurrent ? 700 : 500,
            }}
            onMouseEnter={(e) => {
              if (!isCurrent) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)';
            }}
            onMouseLeave={(e) => {
              if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title={item}
          >
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', marginRight: '6px' }}>
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {name}
              </span>
              <span style={{ fontSize: '8.5px', opacity: 0.5, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {item}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
              {isCurrent && (
                <span style={{ fontSize: '8px', padding: '1px 3px', borderRadius: '2px', backgroundColor: 'var(--accent-color)', color: '#fff' }}>
                  当前
                </span>
              )}
              {isDemo && (
                <span style={{ fontSize: '8px', padding: '1px 3px', borderRadius: '2px', backgroundColor: 'rgba(255, 59, 48, 0.1)', color: 'var(--accent-color)' }}>
                  演示
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
