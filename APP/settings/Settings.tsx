import { useState, useEffect } from 'react';

export const SettingsComponent = {
  typeId: 'settings',
  displayName: '偏好设置',
  iconName: 'settings',
  component: SettingsView,
  bloodChannels: [
    'system.focusedAreaId'
  ],
  manifest: {
    description: '快捷键与系统偏好设置（当前由 SettingsModal 承载，此插件为占位）',
    reads: ['system.focusedAreaId'],
    writes: ['system.maxIterations'],   // 将来修改迭代次数会写入此频道
    dependsOn: [],
  },
};

function SettingsView({
  shortcutAPI,
}: {
  shortcutAPI: {
    getAllActions: () => any[];
    getShortcutForAction: (actionId: string) => string | undefined;
    registerShortcut: (actionId: string, combo: string) => void;
    removeShortcutForAction: (actionId: string) => void;
    serializeShortcuts: () => string;
  };
}) {
  const [activeCategory, setActiveCategory] = useState<'shortcuts' | 'appearance' | 'system'>('shortcuts');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [, setUpdateTrigger] = useState(0);

  // Global keydown recording handler when editing an action's keybinding
  useEffect(() => {
    if (!editingActionId) return;

    const handleRecordKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keys: string[] = [];
      if (e.metaKey) keys.push('meta');
      if (e.ctrlKey) keys.push('control');
      if (e.altKey) keys.push('alt');
      if (e.shiftKey) keys.push('shift');

      const keyName = e.key.toLowerCase();
      const isModifier = ['control', 'meta', 'alt', 'shift'].includes(keyName);

      if (keyName === 'escape') {
        setEditingActionId(null);
        return;
      }

      if (!isModifier) {
        let key = keyName;
        if (key === ' ') key = 'space';
        keys.push(key);
        const combo = keys.join('+');
        saveNewShortcut(editingActionId, combo);
      }
    };

    window.addEventListener('keydown', handleRecordKey, true);
    return () => {
      window.removeEventListener('keydown', handleRecordKey, true);
    };
  }, [editingActionId]);

  const saveNewShortcut = async (actionId: string, combo: string) => {
    shortcutAPI.registerShortcut(actionId, combo);

    try {
      const serialized = shortcutAPI.serializeShortcuts();
      await window.electronAPI.setShortcuts(JSON.parse(serialized));
      console.log(`[Preferences] Shortcut updated: ${actionId} -> ${combo}`);
    } catch (err) {
      console.error('[Preferences] Failed to save shortcuts:', err);
    }

    setEditingActionId(null);
    setUpdateTrigger((prev) => prev + 1);
  };

  const handleReset = async (actionId: string, defaultShortcut?: string) => {
    if (defaultShortcut) {
      shortcutAPI.registerShortcut(actionId, defaultShortcut);
    } else {
      shortcutAPI.removeShortcutForAction(actionId);
    }

    try {
      const serialized = shortcutAPI.serializeShortcuts();
      await window.electronAPI.setShortcuts(JSON.parse(serialized));
    } catch (err) {
      console.error('[Preferences] Failed to reset shortcut:', err);
    }

    setUpdateTrigger((prev) => prev + 1);
  };

  const renderKeycap = (part: string) => {
    let icon = part.toUpperCase();
    if (part === 'meta') icon = '⌘ Cmd';
    if (part === 'control') icon = '⌃ Ctrl';
    if (part === 'shift') icon = '⇧ Shift';
    if (part === 'alt') icon = '⌥ Opt';
    return (
      <kbd key={part} className="keycap">
        {icon}
      </kbd>
    );
  };

  const formatComboElement = (combo: string | undefined) => {
    if (!combo) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>无</span>;
    const parts = combo.split('+');
    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {parts.map((p) => renderKeycap(p))}
      </div>
    );
  };

  const actions = shortcutAPI.getAllActions();
  const filteredActions = actions.filter(
    (act) =>
      act.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="settings-page" style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: 'transparent' }}>
        {/* Sidebar Navigation */}
        <div className="settings-sidebar">
          <div
            className={`settings-sidebar-item ${activeCategory === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveCategory('shortcuts')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1.5" y="4.5" width="13" height="7" rx="1" />
              <line x1="4" y1="7" x2="4" y2="7.01" />
              <line x1="6.5" y1="7" x2="6.5" y2="7.01" />
              <line x1="9" y1="7" x2="9" y2="7.01" />
              <line x1="12" y1="7" x2="12" y2="7.01" />
              <line x1="5.5" y1="9.5" x2="10.5" y2="9.5" />
            </svg>
            <span>快捷键</span>
          </div>
          <div
            className={`settings-sidebar-item ${activeCategory === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveCategory('appearance')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1.5a2.5 2.5 0 012.5 2.5c0 .7-.3 1.3-.7 1.7l-7.3 7.3a1 1 0 01-.7.3H3.5a1 1 0 01-1-1v-2.3a1 1 0 01.3-.7l7.3-7.3c.4-.4 1-.7 1.7-.7z" />
              <path d="M9.5 4.5l2 2" />
            </svg>
            <span>外观</span>
          </div>
          <div
            className={`settings-sidebar-item ${activeCategory === 'system' ? 'active' : ''}`}
            onClick={() => setActiveCategory('system')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
            </svg>
            <span>系统</span>
          </div>
        </div>

        {/* Main Settings Content */}
        <div className="settings-content" style={{ backgroundColor: 'transparent' }}>
          {activeCategory === 'shortcuts' && (
            <>
              <div className="settings-header">
                <h2>键盘快捷键</h2>
                <div className="settings-search-container">
                  <input
                    type="text"
                    placeholder="搜索操作..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="settings-search-input"
                  />
                </div>
              </div>

              <div className="settings-list">
                {filteredActions.map((act) => {
                  const currentCombo = shortcutAPI.getShortcutForAction(act.id);
                  const isListening = editingActionId === act.id;

                  return (
                    <div key={act.id} className="settings-row">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span className="settings-row-label">{act.label}</span>
                        <span className="settings-row-id">{act.id}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          className={`settings-recorder-box ${isListening ? 'listening' : ''}`}
                          onClick={() => setEditingActionId(act.id)}
                        >
                          {isListening ? (
                            <span className="recording-text">按下按键组合... (ESC 取消)</span>
                          ) : (
                            formatComboElement(currentCombo)
                          )}
                        </div>

                        {currentCombo !== act.defaultShortcut && (
                          <button
                            className="settings-reset-link"
                            onClick={() => handleReset(act.id, act.defaultShortcut)}
                          >
                            重置
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeCategory === 'appearance' && (
            <div style={{ padding: '16px' }}>
              <h2>外观设置</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>
                主题：温暖米色 (已启用)
              </p>
            </div>
          )}

          {activeCategory === 'system' && (
            <div style={{ padding: '16px' }}>
              <h2>系统偏好设置</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>
                工作区路径：/Users/apexwave/Desktop/DNOTE
              </p>
            </div>
          )}
        </div>
    </div>
  );
}
