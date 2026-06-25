interface PromptModalProps {
  show: boolean;
  title: string;
  defaultValue: string;
  onConfirm: (val: string) => void;
  onClose: () => void;
}

export function PromptModal({
  show,
  title,
  defaultValue,
  onConfirm,
  onClose,
}: PromptModalProps) {
  if (!show) return null;

  return (
    <div className="pane-modal-overlay">
      <div className="pane-modal-content" style={{ width: '85%' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginBottom: 12 }}>
          {title === 'Enter file name:' ? '新建笔记名称:' : title}
        </span>
        <input
          type="text"
          id="prompt-modal-input-tree"
          defaultValue={defaultValue}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const val = e.currentTarget.value.trim();
              onConfirm(val);
              onClose();
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 8px', borderRadius: '6px', fontSize: '11px', outline: 'none', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            className="area-btn text-btn"
            onClick={onClose}
            style={{ height: '24px', fontSize: '10px', padding: '0 10px' }}
          >
            取消
          </button>
          <button
            className="area-btn text-btn"
            onClick={() => {
              const input = document.getElementById('prompt-modal-input-tree') as HTMLInputElement;
              if (input) {
                onConfirm(input.value.trim());
              }
              onClose();
            }}
            style={{ height: '24px', fontSize: '10px', padding: '0 10px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none' }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
