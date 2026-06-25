
interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordingActionId: string | null;
  setRecordingActionId: (id: string | null) => void;
  editorShortcuts: Record<string, string>;
  allManageableActions: Array<{ id: string; label: string; defaultCombo: string }>;
  handleResetShortcut: (id: string, defaultCombo: string) => void;
}

export function ShortcutsModal({
  isOpen,
  onClose,
  recordingActionId,
  setRecordingActionId,
  editorShortcuts,
  allManageableActions,
  handleResetShortcut,
}: ShortcutsModalProps) {
  if (!isOpen) return null;

  const renderVisualKeycap = (part: string) => {
    let label = part.toUpperCase();
    if (part === 'meta') label = '⌘ Cmd';
    if (part === 'control' || part === 'ctrl') label = '⌃ Ctrl';
    if (part === 'shift') label = '⇧ Shift';
    if (part === 'alt') label = '⌥ Opt';
    return (
      <kbd
        key={part}
        style={{
          display: 'inline-block',
          padding: '2px 5px',
          fontSize: '9px',
          fontFamily: 'monospace',
          lineHeight: '1',
          color: 'var(--text-main)',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1.2px solid var(--border-color)',
          borderRadius: '4px',
          boxShadow: '0 1px 0px var(--border-color), 0 1.5px 0px rgba(0,0,0,0.2)'
        }}
      >
        {label}
      </kbd>
    );
  };

  const formatComboVisual = (combo: string | undefined) => {
    if (!combo) return <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>None</span>;
    const parts = combo.split('+');
    return (
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        {parts.map((p) => renderVisualKeycap(p))}
      </div>
    );
  };

  return (
    <div className="pane-modal-overlay" onClick={onClose}>
      <div className="pane-modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '340px', maxHeight: '420px' }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontWeight: 700, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
            </svg>
            Markdown 快捷键管理
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ paddingTop: '10px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {allManageableActions.map((act) => {
            const currentCombo = editorShortcuts[act.id] !== undefined ? editorShortcuts[act.id] : act.defaultCombo;
            const isListening = recordingActionId === act.id;
            return (
              <div
                key={act.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  backgroundColor: isListening ? 'rgba(255, 59, 48, 0.06)' : 'rgba(0,0,0,0.015)',
                  border: isListening ? '1.2px solid var(--accent-color)' : '1.2px solid var(--border-color)',
                  borderRadius: '5px',
                  transition: 'border-color 0.15s, background-color 0.15s'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '11px' }}>{act.label}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{act.id}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    onClick={() => setRecordingActionId(act.id)}
                    style={{
                      minWidth: '60px',
                      minHeight: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1.2px solid var(--border-color)',
                      backgroundColor: 'var(--bg-main)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      color: isListening ? 'var(--accent-color)' : 'var(--text-main)',
                      transition: 'background-color 0.15s, color 0.15s',
                    }}
                  >
                    {isListening ? (
                      <span style={{ animation: 'pulse 1.2s infinite', fontSize: '9px' }}>录入中...</span>
                    ) : (
                      formatComboVisual(currentCombo)
                    )}
                  </div>
                  {currentCombo !== act.defaultCombo && (
                    <button
                      onClick={() => handleResetShortcut(act.id, act.defaultCombo)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                    >
                      重置
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
