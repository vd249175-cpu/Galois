import { useState } from 'react';

interface PaletteManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  palettes: Record<string, string[]>;
  setPalettes: (palettes: Record<string, string[]>) => void;
  activePaletteName: string;
  setActivePaletteName: (name: string) => void;
}

export function PaletteManagerModal({
  isOpen,
  onClose,
  palettes,
  setPalettes,
  activePaletteName,
  setActivePaletteName,
}: PaletteManagerModalProps) {
  const [editingPaletteName, setEditingPaletteName] = useState<string | null>(null);
  const [newPaletteName, setNewPaletteName] = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    setEditingPaletteName(null);
    setNewPaletteName('');
    onClose();
  };

  return (
    <div className="pane-modal-overlay" onClick={handleClose}>
      <div className="pane-modal-content" onClick={(e) => e.stopPropagation()} style={{
        width: '320px',
        maxHeight: '400px',
        color: 'var(--text-main)',
        fontSize: '12px',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 0
      }}>
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'rgba(0,0,0,0.02)'
        }}>
          <span style={{ fontWeight: 600 }}>
            {editingPaletteName ? `编辑色板: ${editingPaletteName}` : '色板主题管理'}
          </span>
          <button
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '14px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {editingPaletteName ? (
            /* Editing a Specific Palette */
            (() => {
              const paletteColors = palettes[editingPaletteName] || [];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {paletteColors.map((color, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* Swatch wrapper */}
                          <div style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            border: '1.2px solid var(--border-color)',
                            backgroundColor: color,
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'pointer'
                          }}>
                            <input
                              type="color"
                              value={color}
                              onChange={(e) => {
                                const updated = [...paletteColors];
                                updated[idx] = e.target.value;
                                setPalettes({
                                  ...palettes,
                                  [editingPaletteName]: updated
                                });
                              }}
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                left: '-4px',
                                width: '28px',
                                height: '28px',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                opacity: 0
                              }}
                            />
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                            {color.toUpperCase()}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const updated = paletteColors.filter((_, cIdx) => cIdx !== idx);
                            setPalettes({
                              ...palettes,
                              [editingPaletteName]: updated
                            });
                          }}
                          disabled={paletteColors.length <= 1}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: paletteColors.length <= 1 ? 'var(--border-color)' : '#ef4444',
                            cursor: paletteColors.length <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                    <button
                      onClick={() => {
                        setPalettes({
                          ...palettes,
                          [editingPaletteName]: [...paletteColors, '#7C7C82']
                        });
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        backgroundColor: 'rgba(0,0,0,0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text-main)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                    >
                      + 添加颜色
                    </button>
                    <button
                      onClick={() => setEditingPaletteName(null)}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: 'var(--accent-color)',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#ffffff',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '11px'
                      }}
                    >
                      返回
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            /* Palette List View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {Object.keys(palettes).map((pName) => {
                  const isActive = activePaletteName === pName;
                  const colors = palettes[pName];
                  return (
                    <div
                      key={pName}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        backgroundColor: isActive ? 'rgba(255, 59, 48, 0.06)' : 'rgba(0,0,0,0.015)',
                        border: isActive ? '1.2px solid var(--accent-color)' : '1.2px solid var(--border-color)',
                        borderRadius: '5px',
                        transition: 'border-color 0.15s, background-color 0.15s'
                      }}
                    >
                      {/* Left: select palette click target */}
                      <div
                        onClick={() => setActivePaletteName(pName)}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer' }}
                      >
                        <span style={{ fontWeight: 600, fontSize: '11px', color: isActive ? 'var(--accent-color)' : 'var(--text-main)' }}>
                          {pName}
                        </span>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {colors.map((color, cIdx) => (
                            <div key={cIdx} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
                          ))}
                        </div>
                      </div>

                      {/* Right: action buttons */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setEditingPaletteName(pName)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => {
                            const remaining = { ...palettes };
                            delete remaining[pName];
                            setPalettes(remaining);
                            if (activePaletteName === pName) {
                              setActivePaletteName(Object.keys(remaining)[0]);
                            }
                          }}
                          disabled={Object.keys(palettes).length <= 1}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: Object.keys(palettes).length <= 1 ? 'var(--border-color)' : '#ef4444',
                            cursor: Object.keys(palettes).length <= 1 ? 'not-allowed' : 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add New Palette form */}
              <div style={{ display: 'flex', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                <input
                  type="text"
                  placeholder="新建色板名称..."
                  value={newPaletteName}
                  onChange={(e) => setNewPaletteName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: '11px',
                    border: '1.2px solid var(--border-color)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => {
                    const name = newPaletteName.trim();
                    if (name && !palettes[name]) {
                      setPalettes({
                        ...palettes,
                        [name]: ['#4F46E5', '#06B6D4', '#10B981']
                      });
                      setActivePaletteName(name);
                      setNewPaletteName('');
                    }
                  }}
                  disabled={!newPaletteName.trim()}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: newPaletteName.trim() ? 'var(--accent-color)' : 'rgba(0,0,0,0.05)',
                    border: 'none',
                    borderRadius: '4px',
                    color: newPaletteName.trim() ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 600,
                    cursor: newPaletteName.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '11px'
                  }}
                >
                  + 新增
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
