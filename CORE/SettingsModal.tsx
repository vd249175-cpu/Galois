import { useState, useEffect } from 'react';
import { ActionRegistry } from './ActionRegistry';
import { Blood, useBloodChannel } from './Blood';
import { BC } from './BloodChannels';
import { themes, applyTheme, listAvailableThemes, type AvailableTheme } from './themes';
import { SettingsShortcutPanel } from './SettingsShortcutPanel';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';

interface SettingsModalProps {
  onClose: () => void;
  initialTab?: 'general' | 'shortcuts';
}

const EDITOR_FONT_FAMILY_OPTIONS = [
  { label: 'Fira Code', value: 'Fira Code' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'SF Mono', value: 'SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, monospace' },
  { label: 'Menlo', value: 'Menlo, Monaco, Consolas, monospace' },
  { label: '苹方 / Sans', value: 'PingFang SC, Hiragino Sans GB, var(--font-sans)' },
  { label: '宋体 / Serif', value: 'Songti SC, Noto Serif CJK SC, serif' },
  { label: '系统无衬线', value: 'var(--font-sans)' },
];

export function SettingsModal({ onClose, initialTab = 'general' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts'>(initialTab);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [, setUpdateTrigger] = useState<number>(0);

  // Configuration states
  const [theme, setTheme] = useState<string>('default-light');
  const [availableThemes, setAvailableThemes] = useState<AvailableTheme[]>(
    Object.entries(themes).map(([id, t]) => ({ id, name: t.name, source: 'builtin' }))
  );
  const [editorFontSize, setEditorFontSize] = useState<number>(14);
  const [editorFontFamily, setEditorFontFamily] = useState<string>('Fira Code');
  const [editorLineHeight, setEditorLineHeight] = useState<number>(1.6);
  const [editorAutosaveDelay, setEditorAutosaveDelay] = useState<number>(500);
  const [terminalFontSize, setTerminalFontSize] = useState<number>(13);
  const [uiFontSize, setUiFontSize] = useState<number>(12);
  const [panelTitleSize, setPanelTitleSize] = useState<number>(11);
  const [sidebarLabelSize, setSidebarLabelSize] = useState<number>(11);
  const [sidebarIconSize, setSidebarIconSize] = useState<number>(14);
  const [fileTreeTitleSize, setFileTreeTitleSize] = useState<number>(11);
  const [fileTreeTagSize, setFileTreeTagSize] = useState<number>(8.5);
  const [slashMenuTitleSize, setSlashMenuTitleSize] = useState<number>(11);
  const [slashMenuDescriptionSize, setSlashMenuDescriptionSize] = useState<number>(9);
  const [timelineFontSize, setTimelineFontSize] = useState<number>(11);
  const [graphNodeFontSize, setGraphNodeFontSize] = useState<number>(9);
  const [graphControlFontSize, setGraphControlFontSize] = useState<number>(11);
  const [graphDrawerFontSize, setGraphDrawerFontSize] = useState<number>(12);

  const focusedAreaId = useBloodChannel(['system.focusedAreaId'], () =>
    Blood.getValue<string | null>('system.focusedAreaId', null)
  );
  const focusedComponentType = useBloodChannel(
    focusedAreaId ? [`system.areaComponentTypes.${focusedAreaId}`] : [],
    () => focusedAreaId ? Blood.getValue<string | null>(`system.areaComponentTypes.${focusedAreaId}`, null) : null
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Load configuration from the user-visible Galois home in Documents.
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setAvailableThemes(await listAvailableThemes());
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
          }
          if (config.appearance) {
            if (config.appearance.uiFontSize) setUiFontSize(config.appearance.uiFontSize);
            if (config.appearance.panelTitleSize) setPanelTitleSize(config.appearance.panelTitleSize);
            if (config.appearance.sidebarLabelSize) setSidebarLabelSize(config.appearance.sidebarLabelSize);
            if (config.appearance.sidebarIconSize) setSidebarIconSize(config.appearance.sidebarIconSize);
            if (config.appearance.fileTreeTitleSize) setFileTreeTitleSize(config.appearance.fileTreeTitleSize);
            if (config.appearance.fileTreeTagSize) setFileTreeTagSize(config.appearance.fileTreeTagSize);
            if (config.appearance.slashMenuTitleSize) setSlashMenuTitleSize(config.appearance.slashMenuTitleSize);
            if (config.appearance.slashMenuDescriptionSize) setSlashMenuDescriptionSize(config.appearance.slashMenuDescriptionSize);
            if (config.appearance.timelineFontSize) setTimelineFontSize(config.appearance.timelineFontSize);
          }
          if (config.graph) {
            if (config.graph.nodeFontSize) setGraphNodeFontSize(config.graph.nodeFontSize);
            if (config.graph.controlFontSize) setGraphControlFontSize(config.graph.controlFontSize);
            if (config.graph.drawerFontSize) setGraphDrawerFontSize(config.graph.drawerFontSize);
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
        graph: {
          ...config.graph,
          ...updatedFields.graph,
        },
        appearance: {
          ...config.appearance,
          ...updatedFields.appearance,
        },
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

  const hasKnownEditorFontFamily = EDITOR_FONT_FAMILY_OPTIONS.some((option) => option.value === editorFontFamily);

  const renderNumberSetting = (
    label: string,
    value: number,
    setValue: (value: number) => void,
    section: 'appearance' | 'editor' | 'terminal' | 'graph',
    field: string,
    fallback: number,
    min: number,
    max: number,
    step: number = 1
  ) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <label style={{ fontSize: 'var(--ui-font-size, 12px)', color: 'var(--text-muted)' }}>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const val = Number(e.target.value) || fallback;
          setValue(val);
          saveConfig({ [section]: { [field]: val } });
        }}
        style={{
          width: '60px',
          padding: '4px 6px',
          borderRadius: '4px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-input)',
          color: 'var(--text-main)',
          fontSize: 'var(--ui-font-size, 12px)',
          textAlign: 'center'
        }}
      />
    </div>
  );

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
              fontSize: 'var(--panel-title-size, 11px)'
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
              fontSize: 'var(--panel-title-size, 11px)'
            }}
          >
            ⌨️ 快捷键
          </button>
        </div>

        <div className="settings-modal-body">
          {activeTab === 'general' ? (
            <GeneralSettingsPanel {...{
              availableThemes, editorAutosaveDelay, editorFontFamily,
              editorFontFamilyOptions: EDITOR_FONT_FAMILY_OPTIONS, editorFontSize, editorLineHeight,
              fileTreeTagSize, fileTreeTitleSize, graphControlFontSize, graphDrawerFontSize,
              graphNodeFontSize, handleThemeChange, hasKnownEditorFontFamily, panelTitleSize,
              renderNumberSetting, saveConfig, setEditorAutosaveDelay, setEditorFontFamily,
              setEditorFontSize, setEditorLineHeight, setFileTreeTagSize, setFileTreeTitleSize,
              setGraphControlFontSize, setGraphDrawerFontSize, setGraphNodeFontSize,
              setPanelTitleSize, setSidebarIconSize, setSidebarLabelSize,
              setSlashMenuDescriptionSize, setSlashMenuTitleSize, setTerminalFontSize,
              setTimelineFontSize, setUiFontSize, sidebarIconSize, sidebarLabelSize,
              slashMenuDescriptionSize, slashMenuTitleSize, terminalFontSize, theme, timelineFontSize,
              uiFontSize,
            }} />
          ) : (
            <SettingsShortcutPanel
              actions={actions}
              editingActionId={editingActionId}
              setEditingActionId={setEditingActionId}
              handleReset={handleReset}
              formatCombo={formatCombo}
            />
          )}
        </div>
      </div>
    </div>
  );
}
