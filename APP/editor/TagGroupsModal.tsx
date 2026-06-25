import { useState } from 'react';

interface TagGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tags: string[];
  tagGroups: Record<string, string[]>;
  onSaveTagGroup: (name: string) => void;
  onDeleteTagGroup: (name: string) => void;
  handleUpdateTags: (nextTags: string[]) => void;
}

export function TagGroupsModal({
  isOpen,
  onClose,
  tags,
  tagGroups,
  onSaveTagGroup,
  onDeleteTagGroup,
  handleUpdateTags,
}: TagGroupsModalProps) {
  const [newGroupName, setNewGroupName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) {
      alert('Please enter a name for the tag group.');
      return;
    }
    if (tags.length === 0) {
      alert('The current note has no tags to save.');
      return;
    }
    onSaveTagGroup(name);
    setNewGroupName('');
  };

  return (
    <div className="pane-modal-overlay" onClick={onClose}>
      <div className="pane-modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '460px', maxHeight: '400px', padding: 0 }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
          <span style={{ fontWeight: 700, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
            </svg>
            标签组模板
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Save Current Tags Form */}
          <form onSubmit={handleSubmit} style={{ padding: '10px', border: '1.2px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.015)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '11px' }}>保存当前笔记标签为组</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '4px 0' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>要保存的标签:</span>
              {tags.length === 0 ? (
                <span style={{ fontSize: '10px', fontStyle: 'italic', color: 'var(--text-muted)' }}>当前笔记没有标签。请先添加一些标签。</span>
              ) : (
                tags.map(t => (
                  <span key={`group_save_pill_${t}`} style={{ fontSize: '9px', fontWeight: 600, backgroundColor: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', padding: '1px 5px', borderRadius: '4px' }}>#{t}</span>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="标签组名称 (例如: 每日回顾)"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                disabled={tags.length === 0}
                style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
              />
              <button
                type="submit"
                className="area-btn text-btn"
                disabled={tags.length === 0}
                style={{ height: '24px', fontSize: '10.5px', padding: '0 12px', whiteSpace: 'nowrap' }}
              >
                保存标签组
              </button>
            </div>
          </form>

          {/* Groups List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
            <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)' }}>已保存的标签组</span>
            {Object.keys(tagGroups).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px', padding: '12px 0' }}>尚未保存任何标签组。请在上方创建！</div>
            ) : (
              Object.entries(tagGroups).map(([name, groupTags]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', border: '1.2px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-main)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '11px' }}>{name}</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                      {groupTags.map(t => (
                        <span key={`pill_${name}_${t}`} style={{ fontSize: '9px', fontWeight: 600, color: 'var(--accent-color)', backgroundColor: 'var(--highlight-color)', padding: '1px 4px', borderRadius: '4px' }}>#{t}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        // Incremental add tags
                        handleUpdateTags([...tags, ...groupTags]);
                      }}
                      className="area-btn text-btn"
                      style={{ height: '22px', fontSize: '10px', padding: '0 8px' }}
                    >
                      添加 (增量)
                    </button>
                    <button
                      onClick={() => onDeleteTagGroup(name)}
                      style={{ border: 'none', background: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
