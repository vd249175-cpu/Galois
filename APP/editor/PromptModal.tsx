import { useEffect, useRef } from 'react';

interface PromptModalProps {
  show: boolean;
  title: string;
  defaultValue: string;
  onConfirm: (val: string) => void;
  onCancel: () => void;
}

export function PromptModal({
  show,
  title,
  defaultValue,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [show]);

  if (!show) return null;

  const handleConfirm = () => {
    if (inputRef.current) {
      onConfirm(inputRef.current.value.trim());
    }
  };

  return (
    <div className="pane-modal-overlay">
      <div className="pane-modal-content" style={{ width: '85%' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginBottom: 12 }}>
          {title === 'Enter Hyperlink URL:' ? '输入超链接 URL:' : title}
        </span>
        <input
          ref={inputRef}
          type="text"
          id="prompt-modal-input-editor"
          defaultValue={defaultValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleConfirm();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
          style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 8px', borderRadius: '6px', fontSize: '11px', outline: 'none', marginBottom: 12 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            className="area-btn text-btn"
            onClick={onCancel}
            style={{ height: '24px', fontSize: '10px', padding: '0 10px' }}
          >
            取消
          </button>
          <button
            className="area-btn text-btn"
            onClick={handleConfirm}
            style={{ height: '24px', fontSize: '10px', padding: '0 10px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none' }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
