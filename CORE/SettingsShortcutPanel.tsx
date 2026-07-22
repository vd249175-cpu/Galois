import { ActionRegistry } from './ActionRegistry';

interface SettingsShortcutPanelProps {
  actions: ReturnType<typeof ActionRegistry.getActionsForScope>;
  editingActionId: string | null;
  setEditingActionId: (actionId: string) => void;
  handleReset: (actionId: string, defaultShortcut?: string) => void;
  formatCombo: (combo: string | undefined) => string;
}

export function SettingsShortcutPanel({
  actions,
  editingActionId,
  setEditingActionId,
  handleReset,
  formatCombo,
}: SettingsShortcutPanelProps) {
  return (
    <div>
      <div style={{ marginBottom: '8px', fontSize: 'var(--ui-font-size, 12px)', color: 'var(--text-muted)' }}>
        为全局操作和当前聚焦的页面配置快捷键。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
        {actions.map((act) => {
          const currentCombo = ActionRegistry.getShortcutForAction(act.id);
          const isListening = editingActionId === act.id;
          return (
            <div key={act.id} className="shortcut-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="shortcut-label">{act.label}</span>
                <span className="shortcut-id">{act.id}</span>
              </div>
              <div className="shortcut-input-group">
                <button
                  className={`shortcut-key-btn ${isListening ? 'listening' : ''}`}
                  onClick={() => setEditingActionId(act.id)}
                >
                  {isListening ? '请按下按键...' : formatCombo(currentCombo)}
                </button>
                {currentCombo !== act.defaultShortcut && (
                  <button
                    className="shortcut-reset-btn"
                    onClick={() => handleReset(act.id, act.defaultShortcut)}
                    title="重置为默认值"
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
  );
}
