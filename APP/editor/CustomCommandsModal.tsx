import { useState } from 'react';

interface CustomCommandsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customCommands: Array<{ id: string; label: string; desc: string; content: string }>;
  handleDeleteCustomCommand: (id: string) => void;
  onAddCustomCommand: (trigger: string, label: string, desc: string, content: string) => void;
}

export function CustomCommandsModal({
  isOpen,
  onClose,
  customCommands,
  handleDeleteCustomCommand,
  onAddCustomCommand,
}: CustomCommandsModalProps) {
  const [newCmdLabel, setNewCmdLabel] = useState('');
  const [newCmdTrigger, setNewCmdTrigger] = useState('');
  const [newCmdDesc, setNewCmdDesc] = useState('');
  const [newCmdContent, setNewCmdContent] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trigger = newCmdTrigger.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = newCmdLabel.trim();
    const desc = newCmdDesc.trim();
    const content = newCmdContent;

    if (!trigger || !label || !content) {
      alert('Please fill in Label, Trigger word, and Content fields.');
      return;
    }

    onAddCustomCommand(trigger, label, desc, content);

    setNewCmdLabel('');
    setNewCmdTrigger('');
    setNewCmdDesc('');
    setNewCmdContent('');
  };

  return (
    <div className="pane-modal-overlay" onClick={onClose}>
      <div className="pane-modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '560px', maxHeight: '460px', padding: 0 }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
          <span style={{ fontWeight: 700, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
            </svg>
            自定义命令管理器
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', gap: '16px' }}>
          {/* Left Side: List */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', borderRight: '1px solid var(--border-color)', paddingRight: '16px' }}>
            <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)' }}>已有命令 ({customCommands.length})</span>
            {customCommands.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px', padding: '12px 0' }}>尚未创建任何自定义命令。请在右侧表单添加！</div>
            ) : (
              customCommands.map(cmd => (
                <div key={cmd.id} style={{ padding: '8px', border: '1.2px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>/{cmd.id.replace('custom.', '')}</span>
                    <button
                      onClick={() => handleDeleteCustomCommand(cmd.id)}
                      style={{ border: 'none', background: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                    >
                      删除
                    </button>
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '10.5px' }}>{cmd.label}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{cmd.desc}</span>
                  <pre style={{ margin: '4px 0 0 0', padding: '4px', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '50px' }}>{cmd.content}</pre>
                </div>
              ))
            )}
          </div>

          {/* Right Side: Add Form */}
          <form onSubmit={handleSubmit} style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)' }}>新建自定义命令</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600 }}>命令名称</label>
              <input
                type="text"
                placeholder="例如: 签名"
                value={newCmdLabel}
                onChange={e => setNewCmdLabel(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600 }}>触发词 (例如 sig, 无前导斜杠)</label>
              <input
                type="text"
                placeholder="例如: sig"
                value={newCmdTrigger}
                onChange={e => setNewCmdTrigger(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600 }}>描述</label>
              <input
                type="text"
                placeholder="简短描述该命令"
                value={newCmdDesc}
                onChange={e => setNewCmdDesc(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <label style={{ fontSize: '10px', fontWeight: 600 }}>要插入的内容</label>
              <textarea
                placeholder="在此输入要插入的文本片段内容..."
                value={newCmdContent}
                onChange={e => setNewCmdContent(e.target.value)}
                style={{ flex: 1, minHeight: '80px', padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none', resize: 'none' }}
              />
            </div>
            <button
              type="submit"
              className="area-btn text-btn"
              style={{ height: '28px', padding: '4px 12px', fontSize: '11px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none', fontWeight: 700, borderRadius: '4px', cursor: 'pointer' }}
            >
              创建命令
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
