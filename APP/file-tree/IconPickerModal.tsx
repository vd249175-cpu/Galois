import { FileInfo } from './types';

interface IconPickerModalProps {
  file: FileInfo | null;
  onClose: () => void;
  onSaveIcon: (file: FileInfo, newIcon: string) => void;
}

export function IconPickerModal({
  file,
  onClose,
  onSaveIcon,
}: IconPickerModalProps) {
  if (!file) return null;

  return (
    <div className="pane-modal-overlay" onClick={onClose}>
      <div
        className="pane-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '280px', maxHeight: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontWeight: 700, fontSize: '11px' }}>选择笔记图标</span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
          >
            ✕
          </button>
        </div>
        
        {/* Quick Emojis Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '6px',
          padding: '4px 0',
          maxHeight: '120px',
          overflowY: 'auto'
        }}>
          {['📝', '🚀', '💡', '📅', '🌟', '🛠️', '📂', '🎨', '📓', '💻', '⚡', '🔍', '🎯', '🔥', '📌', '🎉', '💬', '❤️', '✅', '❌', '🔑', '🏷️', '📚', '🗺️'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSaveIcon(file, emoji)}
              style={{
                fontSize: '16px',
                padding: '6px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: 'rgba(0,0,0,0.03)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.15s, transform 0.1s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--highlight-color)';
                e.currentTarget.style.transform = 'scale(1.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        
        {/* Custom Emoji input & Clear button */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="输入任意 Emoji..."
            maxLength={2}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (val) {
                onSaveIcon(file, val);
              }
            }}
            style={{
              flexGrow: 1,
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              outline: 'none'
            }}
          />
          {file.icon && (
            <button
              className="area-btn text-btn"
              onClick={() => onSaveIcon(file, '')}
              style={{
                height: '24px',
                padding: '0 8px',
                fontSize: '10px',
                backgroundColor: 'rgba(255, 59, 48, 0.1)',
                color: 'var(--accent-color)',
                border: '1px solid var(--accent-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              移除图标
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
