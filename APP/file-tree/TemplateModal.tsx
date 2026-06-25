interface TemplateModalProps {
  show: boolean;
  onClose: () => void;
  templateFiles: { name: string; path: string; content: string }[];
  onUseTemplate: (template: { name: string; path: string; content: string }) => void;
  onOpenTempleFolder: () => void;
}

export function TemplateModal({
  show,
  onClose,
  templateFiles,
  onUseTemplate,
  onOpenTempleFolder,
}: TemplateModalProps) {
  if (!show) return null;

  return (
    <div className="pane-modal-overlay">
      <div className="pane-modal-content" style={{ width: '85%', maxHeight: '80%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>模板选择</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, marginBottom: 12 }}>
          {templateFiles.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', lineHeight: 1.5 }}>
              在 temple/ 目录下没有找到模板。<br/>在编辑器中使用“设为模板”来创建模板。
            </div>
          ) : (
            templateFiles.map((t) => (
              <div
                key={t.path}
                onClick={() => onUseTemplate(t)}
                style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: 12, color: 'var(--text-main)', fontWeight: 600, transition: 'background-color 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
              >
                {t.name.replace('.md', '')}
              </div>
            ))
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onOpenTempleFolder}
            style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
          >
            打开 temple/ 文件夹
          </button>
        </div>
      </div>
    </div>
  );
}
