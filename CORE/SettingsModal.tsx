import { useState, useEffect } from 'react';
import { ActionRegistry } from './ActionRegistry';
import { Blood, useBloodChannel } from './Blood';
import { BC } from './BloodChannels';
import { themes, applyTheme } from './themes';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts'>('general');
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [, setUpdateTrigger] = useState<number>(0);

  // Configuration states
  const [theme, setTheme] = useState<string>('default-light');
  const [editorFontSize, setEditorFontSize] = useState<number>(14);
  const [editorFontFamily, setEditorFontFamily] = useState<string>('Fira Code');
  const [editorLineHeight, setEditorLineHeight] = useState<number>(1.6);
  const [editorAutosaveDelay, setEditorAutosaveDelay] = useState<number>(500);
  const [terminalFontSize, setTerminalFontSize] = useState<number>(13);
  const [terminalAutoStartAgy, setTerminalAutoStartAgy] = useState<boolean>(true);
  const [sidebarIconSize, setSidebarIconSize] = useState<number>(14);
  const [fileTreeTitleSize, setFileTreeTitleSize] = useState<number>(11);
  const [fileTreeTagSize, setFileTreeTagSize] = useState<number>(8.5);

  const focusedAreaId = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null)
  );
  const focusedComponentType = useBloodChannel(
    focusedAreaId ? [`system.areaComponentTypes.${focusedAreaId}`] : [],
    () => focusedAreaId ? Blood.getValue<string | null>(`system.areaComponentTypes.${focusedAreaId}`, null) : null
  );

  // Load configuration from userData
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        if (config) {
          if (config.theme) setTheme(config.theme);
          if (config.editor) {
            if (config.editor.fontSize) setEditorFontSize(config.editor.fontSize);
            if (config.editor.fontFamily) setEditorFontFamily(config.editor.fontFamily);
            if (config.editor.lineHeight) setEditorLineHeight(config.editor.lineHeight);
            if (config.editor.autosaveDelay) setEditorAutosaveDelay(config.editor.autosaveDelay);
          }
          if (config.terminal) {
            if (config.terminal.fontSize) setTerminalFontSize(config.terminal.fontSize);
            if (config.terminal.autoStartAgy !== undefined) setTerminalAutoStartAgy(config.terminal.autoStartAgy);
          }
          if (config.appearance) {
            if (config.appearance.sidebarIconSize) setSidebarIconSize(config.appearance.sidebarIconSize);
            if (config.appearance.fileTreeTitleSize) setFileTreeTitleSize(config.appearance.fileTreeTitleSize);
            if (config.appearance.fileTreeTagSize) setFileTreeTagSize(config.appearance.fileTreeTagSize);
          }
        }
      } catch (err) {
        console.error('[Settings] Failed to load config:', err);
      }
    };
    loadConfig();
  }, []);

  // Save config helper
  const saveConfig = async (updatedFields: any) => {
    try {
      const config = await window.electronAPI.getConfig();
      const mergedConfig = {
        ...config,
        ...updatedFields,
        editor: {
          ...config.editor,
          ...updatedFields.editor,
        },
        terminal: {
          ...config.terminal,
          ...updatedFields.terminal,
        },
        appearance: {
          ...config.appearance,
          ...updatedFields.appearance,
        }
      };
      await window.electronAPI.setConfig(mergedConfig);
      // Update Blood state
      Blood.updateKey(BC.system.config, mergedConfig);
    } catch (err) {
      console.error('[Settings] Failed to save config:', err);
    }
  };

  // Theme change handler
  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    await saveConfig({ theme: newTheme });
    // Broadcast via Blood to all other windows
    Blood.updateKey(BC.events.themeChanged, newTheme);
  };

  // Keyboard shortcut listener
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
    ActionRegistry.registerShortcut(combo, actionId);
    try {
      const serialized = ActionRegistry.serializeShortcuts();
      await window.electronAPI.setShortcuts(JSON.parse(serialized));
      console.log(`[Settings] Keyboard shortcut saved: ${actionId} -> ${combo}`);
    } catch (err) {
      console.error('[Settings] Failed to save shortcuts:', err);
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
      await window.electronAPI.setShortcuts(JSON.parse(serialized));
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

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('general')}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'general' ? '2px solid var(--accent-color)' : 'none',
              color: activeTab === 'general' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: activeTab === 'general' ? 'bold' : 'normal',
              fontSize: '13px'
            }}
          >
            🎨 常规设置
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            style={{
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'shortcuts' ? '2px solid var(--accent-color)' : 'none',
              color: activeTab === 'shortcuts' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: activeTab === 'shortcuts' ? 'bold' : 'normal',
              fontSize: '13px'
            }}
          >
            ⌨️ 快捷键
          </button>
        </div>

        <div className="settings-modal-body">
          {activeTab === 'general' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Theme Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold' }}>界面主题</label>
                <select
                  value={theme}
                  onChange={(e) => handleThemeChange(e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  {Object.entries(themes).map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Appearance Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>界面外观设置</span>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>侧栏图标大小 (px)</label>
                  <input
                    type="number"
                    min="10"
                    max="28"
                    value={sidebarIconSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 14;
                      setSidebarIconSize(val);
                      saveConfig({ appearance: { sidebarIconSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>文件卡片标题大小 (px)</label>
                  <input
                    type="number"
                    min="9"
                    max="18"
                    value={fileTreeTitleSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 11;
                      setFileTreeTitleSize(val);
                      saveConfig({ appearance: { fileTreeTitleSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>文件卡片标签大小 (px)</label>
                  <input
                    type="number"
                    min="7"
                    max="14"
                    step="0.5"
                    value={fileTreeTagSize}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 8.5;
                      setFileTreeTagSize(val);
                      saveConfig({ appearance: { fileTreeTagSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>
              </div>

              {/* Editor Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>编辑器设置</span>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>字体大小 (px)</label>
                  <input
                    type="number"
                    value={editorFontSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 14;
                      setEditorFontSize(val);
                      saveConfig({ editor: { fontSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>字体族 (Family)</label>
                  <input
                    type="text"
                    value={editorFontFamily}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditorFontFamily(val);
                      saveConfig({ editor: { fontFamily: val } });
                    }}
                    style={{
                      width: '120px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'right'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>行高 (Line Height)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editorLineHeight}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1.6;
                      setEditorLineHeight(val);
                      saveConfig({ editor: { lineHeight: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>自动保存延迟 (ms)</label>
                  <input
                    type="number"
                    value={editorAutosaveDelay}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 500;
                      setEditorAutosaveDelay(val);
                      saveConfig({ editor: { autosaveDelay: val } });
                    }}
                    style={{
                      width: '70px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>
              </div>

              {/* Terminal Settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>终端设置</span>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>字体大小 (px)</label>
                  <input
                    type="number"
                    value={terminalFontSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 13;
                      setTerminalFontSize(val);
                      saveConfig({ terminal: { fontSize: val } });
                    }}
                    style={{
                      width: '60px',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      textAlign: 'center'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>启动时自动运行 agy</label>
                  <input
                    type="checkbox"
                    checked={terminalAutoStartAgy}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setTerminalAutoStartAgy(val);
                      saveConfig({ terminal: { autoStartAgy: val } });
                    }}
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
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
          )}
        </div>
      </div>
    </div>
  );
}
