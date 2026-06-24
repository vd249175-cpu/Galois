import { useState, useEffect } from 'react';
import { ActionRegistry } from './ActionRegistry';
import { Blood, useBloodChannel } from './Blood';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [, setUpdateTrigger] = useState<number>(0);
  const focusedAreaId = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null)
  );
  const focusedComponentType = useBloodChannel(
    focusedAreaId ? [`system.areaComponentTypes.${focusedAreaId}`] : [],
    () => focusedAreaId ? Blood.getValue<string | null>(`system.areaComponentTypes.${focusedAreaId}`, null) : null
  );

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
        // Cancel recording
        setEditingActionId(null);
        return;
      }

      if (!isModifier) {
        // Complete shortcut
        let key = keyName;
        // Normalize space key name
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
    // 1. Update in memory ActionRegistry
    ActionRegistry.registerShortcut(combo, actionId);

    // 2. Persist shortcuts change to dnote_shortcuts.json on disk
    try {
      const serialized = ActionRegistry.serializeShortcuts();
      await (window as any).electronAPI.writeFile('dnote_shortcuts.json', serialized);
      console.log(`[Settings] Keyboard shortcut saved: ${actionId} -> ${combo}`);
    } catch (err) {
      console.error('[Settings] Failed to save shortcuts file:', err);
    }

    setEditingActionId(null);
    setUpdateTrigger((prev) => prev + 1);
  };

  const handleReset = async (actionId: string, defaultShortcut?: string) => {
    if (defaultShortcut) {
      ActionRegistry.registerShortcut(defaultShortcut, actionId);
    } else {
      ActionRegistry.removeShortcutForAction(actionId);
    }

    try {
      const serialized = ActionRegistry.serializeShortcuts();
      await (window as any).electronAPI.writeFile('dnote_shortcuts.json', serialized);
    } catch (err) {
      console.error('[Settings] Failed to reset shortcut:', err);
    }

    setUpdateTrigger((prev) => prev + 1);
  };

  const formatCombo = (combo: string | undefined): string => {
    if (!combo) return '无';
    return combo
      .split('+')
      .map((part) => {
        if (part === 'meta') return '⌘ Cmd';
        if (part === 'control') return '⌃ Ctrl';
        if (part === 'shift') return '⇧ Shift';
        if (part === 'alt') return '⌥ Option';
        return part.toUpperCase();
      })
      .join(' + ');
  };

  const actions = ActionRegistry.getActionsForScope(focusedComponentType);

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h3>⚙️ 工作区偏好设置</h3>
          <button className="settings-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="settings-modal-body">
          <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            为全局操作和当前聚焦的页面配置快捷键。
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
      </div>
    </div>
  );
}
