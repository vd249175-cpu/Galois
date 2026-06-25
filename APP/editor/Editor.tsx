import React, { useEffect, useState, useRef, useMemo } from 'react';
import { parseFrontmatterTags, parseMarkdownBody } from '../utils';
import { updateYamlFrontmatterTags, parseExpression } from './editorUtils';
import { MarkdownPreview } from './MarkdownPreview';
import { TagToolbar } from './TagToolbar';
import { editorActions } from './actions';
import { useMediaDrop } from './hooks/useMediaDrop';
import { useLinkNavigator } from './hooks/useLinkNavigator';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { ActionRegistry } from '../../CORE/ActionRegistry';
import { Blood } from '../../CORE/Blood';

import { ShortcutsModal } from './ShortcutsModal';
import { CustomCommandsModal } from './CustomCommandsModal';
import { TagGroupsModal } from './TagGroupsModal';
import { PromptModal } from './PromptModal';
import { SlashMenu } from './SlashMenu';
import { useEditorHistory } from './hooks/useEditorHistory';

/**
 * EditorComponent — 插件注册对象（完整契约）
 * 在 APP/editor/index.ts 重新导出，此处声明 manifest
 */
export const EditorComponent = {
  typeId: 'editor',
  displayName: '文本编辑器',
  iconName: 'document',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
    </svg>
  ),
  component: EditorView,
  actions: editorActions,
  bloodChannels: (areaId: string) => [
    BC.system.projectPath,
    BC.system.resolvedTags,
    BC.system.staticTags,
    BC.events.openFile(areaId),
    BC.system.focusedAreaId,
    BC.system.activeEditors,
    BC.system.lastFocusedEditorId,
    BC_PREFIX.fileSavedAll,
    BC_PREFIX.scriptJson,
  ],
  manifest: {
    description: 'Markdown 笔记编辑器，支持 YAML frontmatter 标签 and WikiLink 导航',
    reads: [
      BC.system.projectPath,        // 项目根目录（由 fileTree 写入）
      BC.system.resolvedTags,       // 解析后的全局标签 map（由 fileTree 写入）
      BC.system.staticTags,         // 所有文件的原始/静态标签 map（由 fileTree 写入）
      BC.events.openFile('*'),      // 打开文件请求（由 fileTree/graphView 写入）
      BC_PREFIX.fileSavedAll,       // 读取外部脚本修改文件的保存事件
      BC.system.focusedAreaId,
      BC.system.activeEditors,
      BC.system.lastFocusedEditorId,
    ],
    writes: [
      BC_PREFIX.fileSavedAll,           // 文件保存事件 → fileTree, graphView
      BC.system.activeEditors,          // 注册/注销自身
      BC.system.lastFocusedEditorId,    // 聚焦时更新
      BC.system.focusedAreaId,          // 聚焦时更新
      BC.events.openFile('*'),          // WikiLink 跳转时写入目标 areaId
    ],
    dependsOn: ['fileTree'],           // 需要 fileTree 提供 system.resolvedTags
  },
};

function EditorView({
  areaId,
  state,
  updateBloodKey,
  lastAction,
}: {
  areaId: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: { id: string; timestamp: number } | null;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [content, setContent] = useState<string>('');
  const [currentFile, setCurrentFile] = useState('');
  const [statusMessage, setStatusMessage] = useState('No file open');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dnote_editor_preview_mode');
    return saved !== null ? saved === 'true' : true;
  });
  const [newTagInput, setNewTagInput] = useState('');
  const [ruleMatches, setRuleMatches] = useState<Record<string, string[]>>({});
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const lastSavedContentRef = useRef<string>('');
  const triggeredImmediateRefs = useRef<Set<string>>(new Set());

  useEffect(() => {
    triggeredImmediateRefs.current.clear();
  }, [currentFile]);

  // ── saveNodeFile ──────────────────────────────────────────────────────────
  const saveNodeFile = async (customContent?: string) => {
    if (!currentFile) { setStatusMessage('无打开的笔记可保存'); return; }
    const fullContent = customContent !== undefined ? customContent : contentRef.current;
    if (fullContent === lastSavedContentRef.current) return;
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      lastSavedContentRef.current = fullContent;
      setStatusMessage(`保存于 ${new Date().toLocaleTimeString()}`);
      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
      
      // If we are not in preview mode, detect and run any immediate scripts matching {{...}}
      if (!isPreviewMode) {
        triggerImmediateScripts(fullContent);
      }
    } catch (err: any) {
      console.error('[Editor] Save failed:', err);
      setStatusMessage(`保存失败: ${err.message}`);
      updateBloodKey(BC.events.scriptError('editor'), { message: err.message, ts: Date.now() });
    }
  };

  // ── Undo/Redo History Hook ──────────────────────────────────────────────
  const {
    pushStateToUndoStack,
    handleUndo,
    handleRedo,
    historyTimerRef,
    lastHistoryContentRef,
  } = useEditorHistory({
    content,
    setContent,
    currentFile,
    saveNodeFile,
    textareaRef,
    setStatusMessage,
  });

  const projectPath = state[BC.system.projectPath] || '';
  const openedFile = state[BC.events.openFile(areaId)] || '';
  const isFocused = state[BC.system.focusedAreaId] === areaId;
  const configPath = projectPath ? `${projectPath}/command/commands.json` : '';
  const commandsSavedEvent = state[BC.events.fileSaved(configPath)] || 0;

  const [projectCommands, setProjectCommands] = useState<Array<{ id: string; label: string; desc?: string; content?: string; defaultShortcut?: string; shortcut?: string; script?: string; scope?: string | boolean }>>([]);

  useEffect(() => {
    if (!projectPath) {
      setProjectCommands([]);
      return;
    }
    const loadProjectCommands = async () => {
      const configPath = `${projectPath}/command/commands.json`;
      try {
        const content = await (window as any).electronAPI.readFile(configPath);
        if (content) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            setProjectCommands(parsed);
          } else if (parsed && Array.isArray(parsed.commands)) {
            setProjectCommands(parsed.commands);
          }
        }
      } catch (e) {
        setProjectCommands([]);
      }
    };
    loadProjectCommands();
  }, [projectPath, commandsSavedEvent]);

  // ── Keyboard Shortcuts & Prompt Modal States ─────────────────────────────
  const [editorShortcuts, setEditorShortcuts] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('dnote_markdown_shortcuts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_) {}
    }
    return {
      bold: 'meta+b',
      italic: 'meta+i',
      'code-inline': 'meta+d',
      link: 'meta+k',
      h1: 'meta+1',
      h2: 'meta+2',
      h3: 'meta+3',
      todo: '',
      bullet: '',
      number: '',
      quote: '',
      'code-block': '',
    };
  });

  const [promptConfig, setPromptConfig] = useState<{
    show: boolean;
    title: string;
    defaultValue: string;
    onConfirm: (val: string) => void;
  }>({ show: false, title: '', defaultValue: '', onConfirm: () => {} });

  const showPrompt = (title: string, defaultValue: string, onConfirm: (val: string) => void) => {
    setPromptConfig({ show: true, title, defaultValue, onConfirm });
  };

  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [recordingActionId, setRecordingActionId] = useState<string | null>(null);

  // Custom Commands & Tag Groups States
  const [customCommands, setCustomCommands] = useState<Array<{ id: string; label: string; desc: string; content: string; defaultShortcut?: string }>>(() => {
    const defaultRainbow = {
      id: 'custom.rainbow',
      label: 'Rainbow Text (彩虹渐变文字)',
      desc: 'Colors the paragraph below using rainbow colors',
      content: '{{rainbow.json:status?run=rainbow.py&isolate=execution}}',
      defaultShortcut: 'meta+l'
    };

    const saved = localStorage.getItem('dnote_custom_commands');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const hasRainbow = parsed.some(c => c.id === 'custom.rainbow');
          if (!hasRainbow) {
            const updated = [...parsed, defaultRainbow];
            localStorage.setItem('dnote_custom_commands', JSON.stringify(updated));
            return updated;
          }
          return parsed;
        }
      } catch (_) {}
    }
    localStorage.setItem('dnote_custom_commands', JSON.stringify([defaultRainbow]));
    return [defaultRainbow];
  });

  useEffect(() => {
    // 1. Gather all currently occupied shortcuts (Core & Global Builtins)
    const occupied = new Map<string, string>();
    for (const [id, combo] of Object.entries(editorShortcuts)) {
      if (combo) {
        occupied.set(combo.toLowerCase().trim(), `editor.${id}`);
      }
    }
    ActionRegistry.getAllActions().forEach(act => {
      if (act.id.startsWith('custom.') || act.id.startsWith('project.')) return;
      const combo = ActionRegistry.getShortcutForAction(act.id);
      if (combo) {
        occupied.set(combo.toLowerCase().trim(), act.id);
      }
    });

    const conflictsToWarn: string[] = [];

    // 2. Register Global User Custom commands (Priority: User Global > Project)
    customCommands.forEach((cmd) => {
      ActionRegistry.register({
        id: cmd.id,
        label: cmd.label,
        sourceType: 'editor',
        run: (context) => {
          Blood.updateKey(`actions.${cmd.id}.${context.areaId}`, Date.now());
        }
      });

      const userCombo = editorShortcuts[cmd.id];
      const defaultShortcut = (cmd as any).defaultShortcut?.toLowerCase().trim();
      const activeCombo = userCombo !== undefined ? userCombo : defaultShortcut;

      if (activeCombo) {
        const occupant = occupied.get(activeCombo);
        if (occupant && occupant !== `editor.${cmd.id}`) {
          conflictsToWarn.push(`Global custom command "${cmd.label}" shortcut "${activeCombo}" conflicts with "${occupant}".`);
        } else {
          ActionRegistry.registerShortcut(activeCombo, cmd.id);
          occupied.set(activeCombo, cmd.id);
        }
      }
    });

    // 3. Register Project-level commands (Priority: User Global > Project)
    projectCommands.forEach((cmd) => {
      // ID collision: skip project command if a global custom command has the same ID
      const hasGlobalOverride = customCommands.some(c => c.id === cmd.id);
      if (hasGlobalOverride) {
        console.warn(`[Editor] Project command "${cmd.id}" overridden by global custom command.`);
        
        // Inherit default shortcut if the global command doesn't have one
        const globalCmd = customCommands.find(c => c.id === cmd.id);
        const cmdShortcut = cmd.defaultShortcut || cmd.shortcut;
        if (globalCmd && !(globalCmd as any).defaultShortcut && cmdShortcut) {
          (globalCmd as any).defaultShortcut = cmdShortcut;
          
          const userCombo = editorShortcuts[cmd.id];
          const activeCombo = userCombo !== undefined ? userCombo : cmdShortcut.toLowerCase().trim();
          if (activeCombo) {
            const occupant = occupied.get(activeCombo);
            if (!occupant || occupant === `editor.${cmd.id}`) {
              ActionRegistry.registerShortcut(activeCombo, cmd.id);
              occupied.set(activeCombo, cmd.id);
            }
          }
        }
        return;
      }

      let targetIsGlobal = false;
      let targetSourceType: string | undefined = undefined;

      if (cmd.scope !== undefined) {
        if (cmd.scope === 'global' || cmd.scope === 'all' || cmd.scope === true) {
          targetIsGlobal = true;
        } else {
          targetIsGlobal = false;
          targetSourceType = String(cmd.scope);
        }
      } else if ((cmd as any).isGlobal !== undefined) {
        targetIsGlobal = !!(cmd as any).isGlobal;
        if (!targetIsGlobal) {
          targetSourceType = 'editor';
        }
      } else {
        // Default behavior: script-based commands are global, insert text commands are editor-only
        targetIsGlobal = !!cmd.script;
        if (!targetIsGlobal) {
          targetSourceType = 'editor';
        }
      }

      ActionRegistry.register({
        id: cmd.id,
        label: cmd.label,
        isGlobal: targetIsGlobal,
        sourceType: targetSourceType,
        run: (_context) => {
          // Always route project command execution signals to the active Editor areaId
          const activeEditorId = Blood.getValue<string | null>('system.lastFocusedEditorId', null) || 'editor-root';
          Blood.updateKey(`actions.${cmd.id}.${activeEditorId}`, Date.now());
        }
      });

      const userCombo = editorShortcuts[cmd.id];
      const cmdShortcut = cmd.defaultShortcut || cmd.shortcut;
      const defaultShortcut = cmdShortcut?.toLowerCase().trim();
      const activeCombo = userCombo !== undefined ? userCombo : defaultShortcut;

      if (activeCombo) {
        const occupant = occupied.get(activeCombo);
        if (occupant && occupant !== `editor.${cmd.id}`) {
          conflictsToWarn.push(`Project command "${cmd.label}" shortcut "${activeCombo}" conflicts with "${occupant}". Please reconfigure.`);
        } else {
          ActionRegistry.registerShortcut(activeCombo, cmd.id);
          occupied.set(activeCombo, cmd.id);
        }
      }
    });

    if (conflictsToWarn.length > 0) {
      const msg = `Shortcut Conflict: ${conflictsToWarn.join(' | ')}`;
      console.warn(msg);
      setStatusMessage(`Shortcut Conflict! Check settings or logs for details.`);
      // Also show an alert to user to let them know explicitly
      alert(`Shortcut Conflict Detected:\n${conflictsToWarn.join('\n')}\n\nPlease reconfigure your shortcuts in Settings.`);
    }

    return () => {
      // Cleanup registered shortcuts for custom and project actions on re-runs or unmount
      customCommands.forEach((cmd) => {
        ActionRegistry.unregister(cmd.id);
      });
      projectCommands.forEach((cmd) => {
        ActionRegistry.unregister(cmd.id);
      });
    };
  }, [customCommands, projectCommands, editorShortcuts]);

  const [isCustomCommandsOpen, setIsCustomCommandsOpen] = useState(false);
  const [isTagGroupsOpen, setIsTagGroupsOpen] = useState(false);

  const [tagGroups, setTagGroups] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('dnote_tag_groups');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_) {}
    }
    return {
      "Daily Work (日常工作)": ["daily", "work", "todo"],
      "Study Notes (学习笔记)": ["study", "notes", "learning"],
      "Bug Report (缺陷报告)": ["bug", "issue", "reproduce"]
    };
  });

  const allProjectTags = useMemo(() => {
    const resolved = state[BC.system.resolvedTags] || {};
    const staticTags = state[BC.system.staticTags] || {};
    const set = new Set<string>();

    // 1. Gather tags from resolvedTags (individual matched values)
    for (const fileTags of Object.values(resolved)) {
      if (Array.isArray(fileTags)) {
        fileTags.forEach(t => {
          if (t && !t.startsWith('re:') && !t.startsWith('run:') && t.includes('#')) {
            t.split('#').filter(Boolean).forEach((part: string) => set.add(part));
          } else {
            set.add(t);
          }
        });
      }
    }

    // 2. Gather tags from staticTags (raw tag strings including re: and run:)
    for (const fileTags of Object.values(staticTags)) {
      if (Array.isArray(fileTags)) {
        fileTags.forEach(t => {
          if (t && !t.startsWith('re:') && !t.startsWith('run:') && t.includes('#')) {
            t.split('#').filter(Boolean).forEach((part: string) => set.add(part));
          } else {
            set.add(t);
          }
        });
      }
    }

    return Array.from(set).sort();
  }, [state[BC.system.resolvedTags], state[BC.system.staticTags]]);

  const handleAddCustomCommand = (trigger: string, label: string, desc: string, bodyText: string) => {
    const nextCmds = [
      ...customCommands.filter(c => c.id !== `custom.${trigger}`),
      {
        id: `custom.${trigger}`,
        label,
        desc: desc || `Custom text insertion for /${trigger}`,
        content: bodyText
      }
    ];
    setCustomCommands(nextCmds);
    localStorage.setItem('dnote_custom_commands', JSON.stringify(nextCmds));
    setStatusMessage(`Custom command /${trigger} created.`);
  };

  const handleDeleteCustomCommand = (id: string) => {
    const nextCmds = customCommands.filter(c => c.id !== id);
    setCustomCommands(nextCmds);
    localStorage.setItem('dnote_custom_commands', JSON.stringify(nextCmds));
    setStatusMessage('Custom command deleted.');
  };

  const handleSaveTagGroup = (name: string) => {
    const nextGroups = {
      ...tagGroups,
      [name]: [...tags]
    };
    setTagGroups(nextGroups);
    localStorage.setItem('dnote_tag_groups', JSON.stringify(nextGroups));
    setStatusMessage(`Saved tag group: ${name}`);
  };

  const handleDeleteTagGroup = (name: string) => {
    const nextGroups = { ...tagGroups };
    delete nextGroups[name];
    setTagGroups(nextGroups);
    localStorage.setItem('dnote_tag_groups', JSON.stringify(nextGroups));
    setStatusMessage(`Deleted tag group: ${name}`);
  };

  const getShortcutDisplay = (id: string): string => {
    const combo = editorShortcuts[id];
    if (!combo) return '';
    return combo
      .split('+')
      .map(part => {
        if (part === 'meta') return '⌘';
        if (part === 'control' || part === 'ctrl') return '⌃';
        if (part === 'shift') return '⇧';
        if (part === 'alt') return '⌥';
        return part.toUpperCase();
      })
      .join('');
  };

  // ── Notion-style Command & Formatting Menu States ─────────────────────────
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashIndex, setSlashIndex] = useState(-1);
  const [slashMenuQuery, setSlashMenuQuery] = useState('');
  const [slashMenuCoords, setSlashMenuCoords] = useState({ left: 0, top: 0 });
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);

  const SLASH_COMMANDS = [
    { id: 'bold', label: 'Bold', desc: 'Make text bold', icon: 'B' },
    { id: 'italic', label: 'Italic', desc: 'Make text italic', icon: 'I' },
    { id: 'code-inline', label: 'Inline Code', desc: 'Insert monospace code', icon: '`' },
    { id: 'link', label: 'Link', desc: 'Create a hyperlink', icon: '🔗' },
    { id: 'h1', label: 'Heading 1', desc: 'Big section heading', icon: 'H1' },
    { id: 'h2', label: 'Heading 2', desc: 'Medium section heading', icon: 'H2' },
    { id: 'h3', label: 'Heading 3', desc: 'Small section heading', icon: 'H3' },
    { id: 'todo', label: 'To-Do List', desc: 'Checkbox for tasks', icon: '☑' },
    { id: 'bullet', label: 'Bullet List', desc: 'Simple bullet point', icon: '•' },
    { id: 'number', label: 'Numbered List', desc: 'Numbered sequence', icon: '1.' },
    { id: 'quote', label: 'Blockquote', desc: 'Blockquote section', icon: '“' },
    { id: 'code-block', label: 'Code Block', desc: 'Code code wrapper', icon: '💻' }
  ];

  const allCommands = useMemo(() => {
    const customList = customCommands.map((cmd: { id: string; label: string; desc: string; content: string }) => ({
      id: cmd.id,
      label: cmd.label,
      desc: cmd.desc,
      icon: React.createElement(
        'svg',
        { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
        React.createElement('circle', { cx: 8, cy: 8, r: 2.5 }),
        React.createElement('path', { d: 'M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4' })
      ),
      content: cmd.content
    }));

    const projectList = projectCommands
      .filter(cmd => !customCommands.some(c => c.id === cmd.id))
      .filter(cmd => !cmd.script)
      .map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        desc: `${cmd.desc || ''} (Project)`,
        icon: React.createElement(
          'svg',
          { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
          React.createElement('path', { d: 'M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z' })
        ),
        content: cmd.content
      }));

    const helperCmds = [
      {
        id: 'custom.add_new',
        label: 'Create Custom Command (新增自定义命令)',
        desc: 'Define your own text snippet slash command',
        icon: React.createElement(
          'svg',
          { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
          React.createElement('path', { d: 'M8 3v10M3 8h10' })
        ),
        content: ''
      },
      {
        id: 'custom.manage',
        label: 'Manage Custom Commands (管理自定义命令)',
        desc: 'View, edit or delete custom slash commands',
        icon: React.createElement(
          'svg',
          { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
          React.createElement('circle', { cx: 8, cy: 8, r: 2.5 }),
          React.createElement('path', { d: 'M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4' })
        ),
        content: ''
      }
    ];
    return [...SLASH_COMMANDS, ...customList, ...projectList, ...helperCmds];
  }, [customCommands, projectCommands]);

  const filteredCommands = allCommands.filter((cmd: any) => 
    cmd.label.toLowerCase().includes(slashMenuQuery.toLowerCase()) ||
    cmd.id.includes(slashMenuQuery.toLowerCase())
  );

  const applyFormatting = (
    type: string,
    currentVal: string,
    start: number,
    end: number,
    urlArg?: string
  ): { text: string; newStart: number; newEnd: number } => {
    const selectedText = currentVal.substring(start, end);
    const before = currentVal.substring(0, start);
    const after = currentVal.substring(end);

    switch (type) {
      case 'bold':
        return {
          text: before + `**${selectedText}**` + after,
          newStart: start + 2,
          newEnd: end + 2,
        };
      case 'italic':
        return {
          text: before + `*${selectedText}*` + after,
          newStart: start + 1,
          newEnd: end + 1,
        };
      case 'code-inline':
        return {
          text: before + `\`${selectedText}\`` + after,
          newStart: start + 1,
          newEnd: end + 1,
        };
      case 'link': {
        const url = urlArg !== undefined ? urlArg : 'https://';
        return {
          text: before + `[${selectedText || 'link'}](${url})` + after,
          newStart: start + 1,
          newEnd: start + 1 + (selectedText || 'link').length,
        };
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'todo':
      case 'bullet':
      case 'number':
      case 'quote': {
        const lineStart = currentVal.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = currentVal.indexOf('\n', start);
        const actualLineEnd = lineEnd === -1 ? currentVal.length : lineEnd;
        const lineText = currentVal.substring(lineStart, actualLineEnd);

        let prefix = '';
        if (type === 'h1') prefix = '# ';
        else if (type === 'h2') prefix = '## ';
        else if (type === 'h3') prefix = '### ';
        else if (type === 'todo') prefix = '- [ ] ';
        else if (type === 'bullet') prefix = '- ';
        else if (type === 'number') prefix = '1. ';
        else if (type === 'quote') prefix = '> ';

        const newLineText = prefix + lineText;
        const beforeLine = currentVal.substring(0, lineStart);
        const afterLine = currentVal.substring(actualLineEnd);

        return {
          text: beforeLine + newLineText + afterLine,
          newStart: start + prefix.length,
          newEnd: end + prefix.length,
        };
      }
      case 'code-block':
        return {
          text: before + `\`\`\`\n${selectedText}\n\`\`\`` + after,
          newStart: start + 4,
          newEnd: start + 4 + selectedText.length,
        };
      default:
        return { text: currentVal, newStart: start, newEnd: end };
    }
  };

  const getCaretCoordinates = (element: HTMLTextAreaElement, position: number) => {
    const style = window.getComputedStyle(element);
    
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.width = element.offsetWidth + 'px';
    div.style.font = style.font;
    div.style.padding = style.padding;
    div.style.border = style.border;
    div.style.lineHeight = style.lineHeight;

    const text = element.value.substring(0, position);
    div.textContent = text;
    
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);
    
    document.body.appendChild(div);
    const { offsetLeft: spanLeft, offsetTop: spanTop } = span;
    document.body.removeChild(div);

    return {
      left: Math.min(spanLeft - element.scrollLeft + 12, element.clientWidth - 250),
      top: Math.min(spanTop - element.scrollTop + 22, element.clientHeight - 230)
    };
  };

  const handleExecuteCommand = (cmd: { id: string; label: string; desc?: string; icon?: any; content?: string }) => {
    if (!textareaRef.current) return;

    if (cmd.id === 'custom.add_new' || cmd.id === 'custom.manage') {
      setShowSlashMenu(false);
      setIsCustomCommandsOpen(true);
      return;
    }

    if (cmd.id.startsWith('custom.')) {
      const actualStart = showSlashMenu ? slashIndex : textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      
      pushStateToUndoStack(content, actualStart, end);
      
      const before = content.substring(0, actualStart);
      const after = content.substring(end);
      
      const snippet = cmd.content || '';
      const textAfterInsert = before + snippet + after;
      setContent(textAfterInsert);
      lastHistoryContentRef.current = textAfterInsert;
      saveNodeFile(textAfterInsert);
      setShowSlashMenu(false);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(actualStart + snippet.length, actualStart + snippet.length);
        }
      }, 0);
      return;
    }

    if (cmd.id.startsWith('project.')) {
      const projCmd = projectCommands.find(p => p.id === cmd.id);
      if (projCmd && projCmd.content) {
        // Run it like a custom command (insert content snippet)
        const actualStart = showSlashMenu ? slashIndex : textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        pushStateToUndoStack(content, actualStart, end);
        const before = content.substring(0, actualStart);
        const after = content.substring(end);
        const snippet = projCmd.content || '';
        const textAfterInsert = before + snippet + after;
        setContent(textAfterInsert);
        lastHistoryContentRef.current = textAfterInsert;
        saveNodeFile(textAfterInsert);
        setShowSlashMenu(false);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(actualStart + snippet.length, actualStart + snippet.length);
          }
        }, 0);
        return;
      }

      // Fallback: Run project script command
      const actualStart = showSlashMenu ? slashIndex : textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      
      pushStateToUndoStack(content, actualStart, end);
      
      const before = content.substring(0, actualStart);
      const after = content.substring(end);
      const cleanContent = before + after;
      
      setContent(cleanContent);
      lastHistoryContentRef.current = cleanContent;
      saveNodeFile(cleanContent);
      setShowSlashMenu(false);
      
      if (projCmd) {
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(actualStart, actualStart);
          }
          handleExecuteProjectCommand(projCmd);
        }, 0);
      }
      return;
    }

    const start = slashIndex;
    const end = textareaRef.current.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end);
    const baseContent = before + after;

    if (cmd.id === 'link') {
      setShowSlashMenu(false);
      showPrompt('输入超链接 URL:', 'https://', (url) => {
        if (!url) return;
        pushStateToUndoStack(content, start, start);
        const res = applyFormatting('link', baseContent, start, start, url);
        setContent(res.text);
        lastHistoryContentRef.current = res.text;
        saveNodeFile(res.text);
        
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
          }
        }, 0);
      });
      return;
    }

    pushStateToUndoStack(content, start, start);
    const res = applyFormatting(cmd.id, baseContent, start, start);
    setContent(res.text);
    lastHistoryContentRef.current = res.text;
    saveNodeFile(res.text);

    setShowSlashMenu(false);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
      }
    }, 0);
  };

  const handleExecuteProjectCommand = async (cmd: { id: string; label: string; script?: string }) => {
    if (!projectPath || !cmd.script) return;
    setStatusMessage(`正在运行项目指令: ${cmd.label}...`);

    let cursorLine = 0;
    let cursorCol = 0;
    let selectedText = '';
    if (textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      const subStr = content.substring(0, selectionStart);
      const lines = subStr.split('\n');
      cursorLine = lines.length - 1;
      cursorCol = lines[lines.length - 1].length;
      selectedText = content.substring(selectionStart, selectionEnd);
    }

    const cacheDir = `${projectPath}/.dnote_cache`;
    const absoluteOutputPath = `${cacheDir}/${cmd.id}.json`;

    try {
      try {
        await (window as any).electronAPI.readFile(absoluteOutputPath);
      } catch (e) {
        await (window as any).electronAPI.writeFile(absoluteOutputPath, '{}');
      }

      const workingDir = projectPath;
      const shellCmd = `DNOTE_PROJECT_PATH="${projectPath}" DNOTE_ACTIVE_FILE="${currentFile}" DNOTE_OUTPUT_FILE="${absoluteOutputPath}" DNOTE_CURSOR_LINE="${cursorLine}" DNOTE_CURSOR_COL="${cursorCol}" DNOTE_SELECTED_TEXT="${selectedText.replace(/"/g, '\\"')}" ${cmd.script}`;

      console.log(`[Editor] Executing project command: ${shellCmd}`);
      await (window as any).electronAPI.execCommand(shellCmd, workingDir);

      let parsedData: any = null;
      try {
        const updatedContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
        if (updatedContent) {
          parsedData = JSON.parse(updatedContent);
          updateBloodKey(`events.commandExecuted.${cmd.id}`, { timestamp: Date.now(), data: parsedData });
        }
      } catch (e) {
        console.error('[Editor] Failed to read output file:', e);
      }

      if (parsedData && parsedData.status === 'success') {
        setStatusMessage(`${cmd.label} 执行成功: ${parsedData.message || ''}`);
        if (parsedData.message) {
          alert(`${cmd.label} 执行成功！\n\n${parsedData.message}\n${parsedData.data ? JSON.stringify(parsedData.data, null, 2) : ''}`);
        }
      } else if (parsedData && parsedData.status === 'error') {
        setStatusMessage(`${cmd.label} 执行失败: ${parsedData.message || ''}`);
        alert(`${cmd.label} 执行失败！\n\n${parsedData.message || ''}`);
      } else {
        setStatusMessage(`${cmd.label} 执行完成。`);
      }

      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
    } catch (err: any) {
      console.error('[Editor] Project command execution failed:', err);
      setStatusMessage(`${cmd.label} 执行失败: ${err.message}`);
      alert(`${cmd.label} 执行失败: ${err.message}`);
    }
  };

  const MARKDOWN_ACTIONS = [
    { id: 'bold', label: 'Bold (粗体)', defaultCombo: 'meta+b' },
    { id: 'italic', label: 'Italic (斜体)', defaultCombo: 'meta+i' },
    { id: 'code-inline', label: 'Inline Code (行内代码)', defaultCombo: 'meta+d' },
    { id: 'link', label: 'Link (超链接)', defaultCombo: 'meta+k' },
    { id: 'h1', label: 'Heading 1 (一级标题)', defaultCombo: 'meta+1' },
    { id: 'h2', label: 'Heading 2 (二级标题)', defaultCombo: 'meta+2' },
    { id: 'h3', label: 'Heading 3 (三级标题)', defaultCombo: 'meta+3' },
    { id: 'todo', label: 'To-Do List (待办列表)', defaultCombo: '' },
    { id: 'bullet', label: 'Bullet List (无序列表)', defaultCombo: '' },
    { id: 'number', label: 'Numbered List (有序列表)', defaultCombo: '' },
    { id: 'quote', label: 'Blockquote (引用块)', defaultCombo: '' },
    { id: 'code-block', label: 'Code Block (代码块)', defaultCombo: '' }
  ];

  const allManageableActions = useMemo(() => {
    const list = [...MARKDOWN_ACTIONS];

    customCommands.forEach((cmd) => {
      const projCmd = projectCommands.find(p => p.id === cmd.id);
      const defShortcut = cmd.defaultShortcut || projCmd?.defaultShortcut || '';
      list.push({
        id: cmd.id,
        label: `${cmd.label} (自定义)`,
        defaultCombo: defShortcut
      });
    });

    projectCommands.forEach((cmd) => {
      if (customCommands.some(c => c.id === cmd.id)) return;
      list.push({
        id: cmd.id,
        label: `${cmd.label} (项目)`,
        defaultCombo: cmd.defaultShortcut || ''
      });
    });

    return list;
  }, [customCommands, projectCommands]);

  const handleResetShortcut = (id: string, defaultCombo: string) => {
    setEditorShortcuts((prev) => {
      const next = { ...prev, [id]: defaultCombo };
      localStorage.setItem('dnote_markdown_shortcuts', JSON.stringify(next));
      return next;
    });
  };

  // ── Immediate Script execution in edit mode ──────────────────────────────
  const triggerImmediateScripts = async (fileContent: string) => {
    if (!projectPath || !currentFile) return;

    const exprRegex = /\{\{([\s\S]*?)\}\}/g;
    const lines = fileContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      exprRegex.lastIndex = 0;

      while ((match = exprRegex.exec(line)) !== null) {
        const rawExpr = match[0];
        const exprInner = match[1];

        if (triggeredImmediateRefs.current.has(rawExpr)) {
          continue;
        }

        const parsed = parseExpression(exprInner);
        if (!parsed || !parsed.run) continue;

        // Skip periodic scheduled scripts
        if (parsed.interval && parsed.interval > 0) continue;

        triggeredImmediateRefs.current.add(rawExpr);
        executeImmediateScript(parsed as any, i, rawExpr);
      }
    }
  };

  const executeImmediateScript = async (
    parsed: { jsonPath: string; keyPath: string; run: string; isolate: string | null },
    lineIndex: number,
    _rawExpr: string
  ) => {
    const { jsonPath, run, isolate } = parsed;
    const uniqueId = 'exec_' + Math.random().toString(36).substring(2, 9);

    let resolvedRelativeJsonPath = jsonPath;
    let threadId = 'project';

    const isIsolatedWindow = isolate === 'window' || isolate === 'true';
    const isIsolatedExecution = isolate === 'execution' || isolate === 'single';

    if (isIsolatedWindow) {
      threadId = areaId;
      const extIndex = jsonPath.lastIndexOf('.json');
      if (extIndex !== -1) {
        resolvedRelativeJsonPath = jsonPath.substring(0, extIndex) + `_${areaId}.json`;
      } else {
        resolvedRelativeJsonPath = jsonPath + `_${areaId}`;
      }
    } else if (isIsolatedExecution) {
      threadId = uniqueId;
      const extIndex = jsonPath.lastIndexOf('.json');
      if (extIndex !== -1) {
        resolvedRelativeJsonPath = jsonPath.substring(0, extIndex) + `_${uniqueId}.json`;
      } else {
        resolvedRelativeJsonPath = jsonPath + `_${uniqueId}`;
      }
    }

    const absoluteOutputPath = `${projectPath}/script/${resolvedRelativeJsonPath}`;
    setStatusMessage(`Running immediate script: ${run}...`);

    try {
      try {
        await (window as any).electronAPI.readFile(absoluteOutputPath);
      } catch (e) {
        await (window as any).electronAPI.writeFile(absoluteOutputPath, '{}');
      }

      const workingDir = `${projectPath}/script`;
      const cmd = `DNOTE_THREAD_ID="${threadId}" DNOTE_OUTPUT_FILE="${absoluteOutputPath}" DNOTE_NOTE_PATH="${currentFile}" DNOTE_NOTE_LINE="${lineIndex}" uv run "${run}"`;

      await (window as any).electronAPI.execCommand(cmd, workingDir);

      try {
        const updatedContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
        if (updatedContent) {
          const parsedData = JSON.parse(updatedContent);
          updateBloodKey(`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`, parsedData);
        }
      } catch (e) {}

      setStatusMessage(`Script ${run} executed successfully.`);
      // Force reload editor state
      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());

      if (isIsolatedExecution) {
        setTimeout(() => {
          (window as any).electronAPI.deleteFile(absoluteOutputPath).catch(() => {});
        }, 1000);
      }
    } catch (err: any) {
      console.error('[Editor] Immediate script run failed:', err);
      setStatusMessage(`Immediate script failed: ${err.message}`);
    }
  };

  // ── MediaDrop ─────────────────────────────────────────────────────────────
  const setContentFromDrop = (val: string | ((prev: string) => string)) => {
    const resolvedVal = typeof val === 'function' ? val(contentRef.current) : val;
    if (textareaRef.current) {
      pushStateToUndoStack(contentRef.current, textareaRef.current.selectionStart, textareaRef.current.selectionEnd);
    } else {
      pushStateToUndoStack(contentRef.current, 0, 0);
    }
    setContent(resolvedVal);
    lastHistoryContentRef.current = resolvedVal;
  };

  const {
    isDraggingFile,
    hoveredLineIndex,
    setHoveredLineIndex,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleLineDrop,
  } = useMediaDrop({
    projectPath,
    currentFile,
    isPreviewMode,
    contentRef,
    setContent: setContentFromDrop,
    saveNodeFile,
    setStatusMessage,
  });

  // ── LinkNavigator ─────────────────────────────────────────────────────────
  const { handleLinkClick } = useLinkNavigator({ projectPath, areaId, updateBloodKey });

  useEffect(() => {
    const editors = Blood.getValue<string[]>(BC.system.activeEditors, []);
    if (!editors.includes(areaId)) {
      updateBloodKey(BC.system.activeEditors, [...editors, areaId]);
    }
    const lastFocused = Blood.getValue<string | null>(BC.system.lastFocusedEditorId, null);
    if (!lastFocused) {
      updateBloodKey(BC.system.lastFocusedEditorId, areaId);
    }
    return () => {
      const currentEditors = Blood.getValue<string[]>(BC.system.activeEditors, []);
      const remaining = currentEditors.filter((id) => id !== areaId);
      updateBloodKey(BC.system.activeEditors, remaining);
      
      const currentLastFocused = Blood.getValue<string | null>(BC.system.lastFocusedEditorId, null);
      if (currentLastFocused === areaId) {
        updateBloodKey(BC.system.lastFocusedEditorId, remaining[0] || null);
      }
    };
  }, [areaId]);

  // ── Focus tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isFocused) updateBloodKey(BC.system.lastFocusedEditorId, areaId);
  }, [isFocused, areaId]);

  // Global keydown recording handler when editing a markdown keyboard shortcut
  useEffect(() => {
    if (!recordingActionId) return;

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
        setRecordingActionId(null);
        return;
      }

      if (!isModifier) {
        let key = keyName;
        if (key === ' ') key = 'space';
        keys.push(key);
        const combo = keys.join('+');
        
        setEditorShortcuts((prev) => {
          const next = { ...prev, [recordingActionId]: combo };
          localStorage.setItem('dnote_markdown_shortcuts', JSON.stringify(next));
          return next;
        });
        setRecordingActionId(null);
      }
    };

    window.addEventListener('keydown', handleRecordKey, true);
    return () => {
      window.removeEventListener('keydown', handleRecordKey, true);
    };
  }, [recordingActionId]);

  // ── File loading ───────────────────────────────────────────────────────
  const fileSavedEvent = state[BC.events.fileSaved(openedFile)] || 0;

  useEffect(() => {
    console.log('[Editor] File loading useEffect triggered. openedFile =', openedFile, 'areaId =', areaId);
    if (!openedFile) {
      setContent('');
      setCurrentFile('');
      setTags([]);
      lastSavedContentRef.current = '';
      setStatusMessage('No file open');
      return;
    }
    const loadMarkdownFile = async () => {
      try {
        const rawContent = await (window as any).electronAPI.readFile(openedFile);
        if (rawContent === contentRef.current) return;
        const parsedTags = parseFrontmatterTags(rawContent);
        lastSavedContentRef.current = rawContent;
        setTags(parsedTags);
        setContent(rawContent);
        setCurrentFile(openedFile);
        const noteName = openedFile.split('/').pop()?.replace('.md', '') || '';
        setStatusMessage(`Editing Note: ${noteName}`);
      } catch (err: any) {
        console.error('[Editor] Failed to load note:', openedFile, err);
        const errMsg = err.message || '';
        if (errMsg.includes('ENOENT') || errMsg.includes('no such file')) {
          const noteName = openedFile.split(/[/\\]/).pop()?.replace('.md', '') || '';
          let draftTags = [noteName];
          let draftTitle = noteName;
          if (noteName.startsWith('#')) {
            const parsed = noteName.split('#').map((t: string) => t.trim()).filter(Boolean);
            if (parsed.length > 0) {
              draftTags = parsed;
              draftTitle = noteName;
            }
          }
          const template = `---\ntags:\n${draftTags.map(t => `  - ${t}`).join('\n')}\n---\n# ${draftTitle}\n\n`;
          if (template === contentRef.current) return;
          lastSavedContentRef.current = template;
          setTags(draftTags);
          setContent(template);
          setCurrentFile(openedFile);
          setStatusMessage(`Draft Note: ${draftTitle} (Unsaved)`);
          setIsPreviewMode(false);
        } else {
          setStatusMessage(`Error loading note file.`);
        }
      }
    };
    loadMarkdownFile();
  }, [openedFile, fileSavedEvent]);

  // ── Tag resolver ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentFile || !projectPath) return;
    const staticTags = tags.filter((t) => !t.startsWith('re:') && !t.startsWith('run:'));
    const bodyText = parseMarkdownBody(content);
    const matchesMap: Record<string, string[]> = {};
    const allRegexMatches: string[] = [];

    for (const tag of tags) {
      if (tag.startsWith('re:')) {
        const patternStr = tag.substring(3).trim();
        const ruleMatchesList: string[] = [];
        try {
          let regex: RegExp;
          const slashMatch = patternStr.match(/^\/(.+)\/([a-z]*)$/);
          if (slashMatch) {
            regex = new RegExp(slashMatch[1], slashMatch[2].includes('g') ? slashMatch[2] : slashMatch[2] + 'g');
          } else {
            regex = new RegExp(patternStr, 'g');
          }
          const matches = bodyText.matchAll(regex);
          for (const m of matches) {
            const val = m[1] !== undefined ? m[1].trim() : m[0].trim();
            if (val && isNaN(Number(val)) && !ruleMatchesList.includes(val)) {
              ruleMatchesList.push(val);
              allRegexMatches.push(val);
            }
          }
        } catch (e) {
          console.error('[Editor] Invalid regex:', patternStr, e);
        }
        matchesMap[tag] = ruleMatchesList.sort();
      }
    }

    const globalResolved = state[BC.system.resolvedTags]?.[currentFile] || [];
    const scriptDerived = globalResolved.filter((t: string) => !staticTags.includes(t));
    const runScripts = tags.filter((t: string) => t.startsWith('run:'));
    if (runScripts.length > 0) {
      const pureScriptTags = scriptDerived.filter((t: string) => !allRegexMatches.includes(t));
      runScripts.forEach((scriptTag) => { matchesMap[scriptTag] = pureScriptTags.sort(); });
    }

    const combinedDerived = Array.from(new Set([...allRegexMatches, ...scriptDerived])).sort();
    const combinedActive = Array.from(new Set([...staticTags, ...combinedDerived])).sort();
    setRuleMatches(matchesMap);
    setActiveTags(combinedActive);
  }, [tags, content, currentFile, projectPath, state[BC.system.resolvedTags]]);

  // ── Auto-save (debounced) ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentFile || isPreviewMode || content === '' || content === lastSavedContentRef.current) return;
    const timer = setTimeout(() => { saveNodeFile(content); }, 600);
    return () => clearTimeout(timer);
  }, [content, currentFile, isPreviewMode]);

  // ── Tag update helper ──────────────────────────────────────────────────
  const handleUpdateTags = async (nextTags: string[]) => {
    if (!currentFile) return;
    const cleanTags = Array.from(new Set(nextTags.map((t) => t.trim()).filter(Boolean))).sort();
    setTags(cleanTags);
    const fullContent = updateYamlFrontmatterTags(contentRef.current, cleanTags);
    if (fullContent === lastSavedContentRef.current) return;
    
    if (textareaRef.current) {
      pushStateToUndoStack(contentRef.current, textareaRef.current.selectionStart, textareaRef.current.selectionEnd);
    } else {
      pushStateToUndoStack(contentRef.current, 0, 0);
    }
    
    setContent(fullContent);
    lastHistoryContentRef.current = fullContent;
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      lastSavedContentRef.current = fullContent;
      setStatusMessage('标签已更新。');
      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
    } catch (err: any) {
      console.error('[Editor] Tag update failed:', err);
      alert(`更新标签失败: ${err.message}`);
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = newTagInput.trim();
    if (!cleanInput) return;
    handleUpdateTags([...tags, cleanInput]);
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    handleUpdateTags(tags.filter((t) => t !== tagToRemove));
  };

  const togglePreviewMode = () => {
    setIsPreviewMode((prev) => {
      const next = !prev;
      localStorage.setItem('dnote_editor_preview_mode', String(next));
      return next;
    });
  };

  const handleDeleteCurrentFile = async () => {
    if (!currentFile) return;
    const noteName = currentFile.split(/[/\\]/).pop()?.replace('.md', '') || '';

    let isUnsaved = false;
    try {
      const exists = await (window as any).electronAPI.readFile(currentFile).then(() => true).catch(() => false);
      isUnsaved = !exists;
    } catch (_) {}

    const message = isUnsaved
      ? `Are you sure you want to discard this draft note "${noteName}"?`
      : `Are you sure you want to delete note "${noteName}"?\nThis cannot be undone.`;

    const ok = confirm(message);
    if (!ok) return;

    try {
      if (!isUnsaved) {
        await (window as any).electronAPI.deleteFile(currentFile);
      }

      const activeEditors = state[BC.system.activeEditors] || [];
      activeEditors.forEach((editorId: string) => {
        const opened = state[BC.events.openFile(editorId)] || '';
        if (opened === currentFile) {
          updateBloodKey(BC.events.openFile(editorId), '');
        }
      });
      if (state[BC.events.openFile('global')] === currentFile) {
        updateBloodKey(BC.events.openFile('global'), '');
      }

      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
    } catch (err: any) {
      alert(`Failed to delete note: ${err.message}`);
    }
  };

  const handleSetAsTemplate = async () => {
    if (!currentFile || !projectPath) {
      alert('Please open a project and a note file first.');
      return;
    }
    const noteName = currentFile.split(/[/\\]/).pop()?.replace('.md', '') || 'template';
    showPrompt('Save as template with name:', noteName, async (templeName) => {
      if (!templeName) return;
      const cleanName = templeName.trim().endsWith('.md') ? templeName.trim() : `${templeName.trim()}.md`;
      const templePath = `${projectPath}/temple`;
      const destPath = `${templePath}/${cleanName}`;
      try {
        await (window as any).electronAPI.writeFile(destPath, contentRef.current);
        setStatusMessage(`Saved as template: ${cleanName}`);
      } catch (err: any) {
        alert(`Failed to save template: ${err.message}`);
      }
    });
  };

  const handleRenameCurrentFile = async () => {
    if (!currentFile || !projectPath) return;
    const oldPath = currentFile;
    const currentName = oldPath.split(/[/\\]/).pop()?.replace('.md', '') || '';

    showPrompt('重命名笔记:', currentName, async (newName) => {
      if (!newName || newName.trim() === currentName) return;

      const cleanName = newName.trim().endsWith('.md') ? newName.trim() : `${newName.trim()}.md`;
      const dirPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
      const newPath = `${dirPath}/${cleanName}`;

      try {
        const list = await (window as any).electronAPI.listDir(dirPath);
        const exists = list.some((f: any) => f.name.toLowerCase() === cleanName.toLowerCase() && f.path !== oldPath);
        if (exists) {
          alert('同名笔记已存在！');
          return;
        }

        await (window as any).electronAPI.renameFile(oldPath, newPath);

        const activeEditors = state[BC.system.activeEditors] || [];
        activeEditors.forEach((editorId: string) => {
          const opened = state[BC.events.openFile(editorId)] || '';
          if (opened === oldPath) {
            updateBloodKey(BC.events.openFile(editorId), newPath);
          }
        });
        if (state[BC.events.openFile('global')] === oldPath) {
          updateBloodKey(BC.events.openFile('global'), newPath);
        }

        updateBloodKey(BC.events.fileSaved(oldPath), Date.now());
        updateBloodKey(BC.events.fileSaved(newPath), Date.now());
        
        setStatusMessage(`Editing Note: ${newName.trim()}`);
      } catch (err: any) {
        alert(`重命名笔记失败: ${err.message}`);
      }
    });
  };

  // ── lastAction handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'editor.save') saveNodeFile();
    else if (lastAction.id === 'editor.toggleMode') togglePreviewMode();
    else if (lastAction.id === 'editor.delete') handleDeleteCurrentFile();
    else if (lastAction.id === 'editor.setAsTemplate') handleSetAsTemplate();
    else if (lastAction.id === 'editor.editShortcuts') setIsShortcutsModalOpen(true);
    else if (lastAction.id.startsWith('custom.') || lastAction.id.startsWith('project.')) {
      const cmd = (customCommands.find(c => c.id === lastAction.id) || projectCommands.find(c => c.id === lastAction.id)) as any;
      if (cmd) {
        if (cmd.script) {
          handleExecuteProjectCommand(cmd as any);
        } else {
          handleExecuteCommand(cmd as any);
        }
      }
    }
  }, [lastAction, customCommands, projectCommands]);

  const updateCursorState = (overrideContent?: string) => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd } = textareaRef.current;
    const currentVal = overrideContent !== undefined ? overrideContent : (contentRef.current || '');
    const subStr = currentVal.substring(0, selectionStart);
    const lines = subStr.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    const selectedText = currentVal.substring(selectionStart, selectionEnd);
    
    updateBloodKey(`system.editorCursor.${areaId}`, {
      line,
      column,
      selectedText,
      filePath: currentFile
    });
  };

  useEffect(() => {
    if (textareaRef.current) {
      updateCursorState();
    }
  }, [currentFile]);

  const handleFocus = () => {
    updateBloodKey(BC.system.focusedAreaId, areaId);
    updateCursorState();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Undo / Redo keybind interception
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Formatting keyboard shortcuts matching user configuration
    const pressedComboParts: string[] = [];
    if (e.metaKey) pressedComboParts.push('meta');
    if (e.ctrlKey) pressedComboParts.push('control');
    if (e.altKey) pressedComboParts.push('alt');
    if (e.shiftKey) pressedComboParts.push('shift');
    
    const keyName = e.key.toLowerCase();
    const isModifier = ['control', 'meta', 'alt', 'shift'].includes(keyName);
    if (!isModifier) {
      pressedComboParts.push(keyName === ' ' ? 'space' : keyName);
    }
    const pressedCombo = pressedComboParts.join('+');

    let matchedType = '';
    for (const [type, combo] of Object.entries(editorShortcuts)) {
      if (combo === pressedCombo) {
        matchedType = type;
        break;
      }
    }

    // Also check ActionRegistry for custom/project commands shortcuts
    if (!matchedType) {
      const actionId = ActionRegistry.getActionIdByShortcut(pressedCombo, 'editor');
      if (actionId && (actionId.startsWith('custom.') || actionId.startsWith('project.'))) {
        matchedType = actionId;
      }
    }

    if (matchedType) {
      e.preventDefault();
      e.stopPropagation();
      if (matchedType.startsWith('custom.') || matchedType.startsWith('project.')) {
        // Trigger custom/project command immediately via Blood signal
        Blood.updateKey(`actions.${matchedType}.${areaId}`, Date.now());
      } else if (matchedType === 'link') {
        showPrompt('输入链接 URL:', 'https://', (url) => {
          if (!url) return;
          pushStateToUndoStack(content, start, end);
          const res = applyFormatting('link', content, start, end, url);
          setContent(res.text);
          lastHistoryContentRef.current = res.text;
          saveNodeFile(res.text);
          
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
            }
          }, 0);
        });
      } else {
        pushStateToUndoStack(content, start, end);
        const res = applyFormatting(matchedType, content, start, end);
        setContent(res.text);
        lastHistoryContentRef.current = res.text;
        saveNodeFile(res.text);
        
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
          }
        }, 0);
      }
      return;
    }

    // Slash menu keyboard navigation
    if (showSlashMenu) {
      const cmds = filteredCommands;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex((prev) => (cmds.length > 0 ? (prev + 1) % cmds.length : 0));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex((prev) => (cmds.length > 0 ? (prev - 1 + cmds.length) % cmds.length : 0));
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (cmds.length > 0) {
          e.preventDefault();
          handleExecuteCommand(cmds[slashMenuIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    // Triggering Slash Menu
    if (e.key === '/') {
      const isStartOrWhitespace = start === 0 || /\s/.test(content.charAt(start - 1));
      if (isStartOrWhitespace) {
        setSlashIndex(start);
        setSlashMenuQuery('');
        setSlashMenuIndex(0);
        setShowSlashMenu(true);

        const coords = getCaretCoordinates(textarea, start);
        setSlashMenuCoords(coords);
      }
    }
  };

  return (
    <div
      className="code-editor"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {/* Editor Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', height: '26px', overflow: 'hidden' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
          <span>{isPreviewMode ? '✨ 笔记预览' : '✍️ 笔记编辑器'}</span>
          {currentFile && (
            <>
              <span style={{ color: 'var(--border-color)', margin: '0 2px' }}>|</span>
              <span
                onClick={handleRenameCurrentFile}
                title="点击重命名此笔记"
                style={{
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(0,0,0,0.03)',
                  transition: 'background-color 0.12s',
                  maxWidth: '150px',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--highlight-color)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>
                  {currentFile.split(/[/\\]/).pop()?.replace('.md', '')}
                </span>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ opacity: 0.8, flexShrink: 0 }}>
                  <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" fill="currentColor"/>
                </svg>
              </span>
            </>
          )}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <button
            className="area-btn"
            onClick={() => setIsTagGroupsOpen(true)}
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
            </svg>
            标签组模板
          </button>
          <button
            className="area-btn"
            onClick={() => setIsCustomCommandsOpen(true)}
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
            </svg>
            自定义命令
          </button>
          <button
            className="area-btn"
            title="切换编辑/预览 (meta+e)"
            onClick={togglePreviewMode}
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '11px' }}
          >
            {isPreviewMode ? '编辑笔记' : '预览'}
          </button>
        </div>
      </div>

      <TagToolbar
        currentFile={currentFile}
        tags={tags}
        handleRemoveTag={handleRemoveTag}
        ruleMatches={ruleMatches}
        expandedRule={expandedRule}
        setExpandedRule={setExpandedRule}
        handleAddTag={handleAddTag}
        newTagInput={newTagInput}
        setNewTagInput={setNewTagInput}
        maxIterations={state[BC.system.maxIterations] || 3}
        updateBloodKey={updateBloodKey}
        allProjectTags={allProjectTags}
        handleUpdateTags={handleUpdateTags}
      />

      {/* Editor Body */}
      {isPreviewMode ? (
        <MarkdownPreview
          content={content}
          areaId={areaId}
          projectPath={projectPath}
          state={state}
          updateBloodKey={updateBloodKey}
          handleLinkClick={handleLinkClick}
          isPreviewMode={isPreviewMode}
          hoveredLineIndex={hoveredLineIndex}
          setHoveredLineIndex={setHoveredLineIndex}
          handleLineDrop={handleLineDrop}
          currentFile={currentFile}
        />
      ) : (
        <textarea
          ref={textareaRef}
          className="code-textarea"
          value={content}
          onChange={(e) => {
            const nextVal = e.target.value;
            const start = e.target.selectionStart;

            // Clear any pending debounced history push
            if (historyTimerRef.current) {
              clearTimeout(historyTimerRef.current);
            }

            // Capture milestones (space, newline, or a jump of characters) for undo history
            const diffLen = Math.abs(nextVal.length - lastHistoryContentRef.current.length);
            const lastChar = nextVal.charAt(start - 1);
            if (diffLen > 6 || lastChar === ' ' || lastChar === '\n') {
              pushStateToUndoStack(lastHistoryContentRef.current, start, start);
              lastHistoryContentRef.current = nextVal;
            } else {
              // Debounce pushing history state if user stops typing for 500ms
              const prevVal = lastHistoryContentRef.current;
              historyTimerRef.current = setTimeout(() => {
                pushStateToUndoStack(prevVal, start, start);
                lastHistoryContentRef.current = nextVal;
              }, 500);
            }

            setContent(nextVal);
            try {
              const parsed = parseFrontmatterTags(nextVal);
              setTags((prev) => {
                const prevClean = prev.slice().sort().join(',');
                const nextClean = parsed.slice().sort().join(',');
                return prevClean === nextClean ? prev : parsed;
              });
            } catch (_) {}

            const cursor = e.target.selectionStart;
            if (showSlashMenu) {
              if (cursor <= slashIndex || nextVal[slashIndex] !== '/') {
                setShowSlashMenu(false);
              } else {
                const query = nextVal.substring(slashIndex + 1, cursor);
                if (query.includes(' ') || query.includes('\n')) {
                  setShowSlashMenu(false);
                } else {
                  setSlashMenuQuery(query);
                  setSlashMenuIndex(0);
                }
              }
            }
            updateCursorState(nextVal);
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onKeyUp={() => updateCursorState()}
          onMouseUp={() => updateCursorState()}
          onClick={() => updateCursorState()}
          placeholder="Start writing note..."
          spellCheck={false}
          style={{ border: 'none', resize: 'none', overflowY: 'auto' }}
        />
      )}

      {/* Slash Menu */}
      <SlashMenu
        show={showSlashMenu}
        filteredCommands={filteredCommands}
        slashMenuIndex={slashMenuIndex}
        setSlashMenuIndex={setSlashMenuIndex}
        slashMenuCoords={slashMenuCoords}
        handleExecuteCommand={handleExecuteCommand}
        getShortcutDisplay={getShortcutDisplay}
      />

      {/* Status Bar */}
      <div className="editor-statusbar">
        <span style={{ flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusMessage}</span>
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap', marginLeft: '8px' }}>{activeTags.length} 个标签</span>
      </div>

      {isDraggingFile && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, border: '2.5px dashed var(--accent-color)', margin: '8px', borderRadius: '10px', pointerEvents: 'none' }}>
          <div style={{ padding: '20px', borderRadius: '50%', backgroundColor: 'var(--highlight-color)', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>拖放媒体文件以导入</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>支持图片、音频和视频文件</span>
        </div>
      )}

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => {
          setIsShortcutsModalOpen(false);
          setRecordingActionId(null);
        }}
        recordingActionId={recordingActionId}
        setRecordingActionId={setRecordingActionId}
        editorShortcuts={editorShortcuts}
        allManageableActions={allManageableActions}
        handleResetShortcut={handleResetShortcut}
      />

      {/* Prompt Modal */}
      <PromptModal
        show={promptConfig.show}
        title={promptConfig.title}
        defaultValue={promptConfig.defaultValue}
        onConfirm={(val) => {
          promptConfig.onConfirm(val);
          setPromptConfig(prev => ({ ...prev, show: false }));
        }}
        onCancel={() => setPromptConfig(prev => ({ ...prev, show: false }))}
      />

      {/* Custom Commands Modal */}
      <CustomCommandsModal
        isOpen={isCustomCommandsOpen}
        onClose={() => setIsCustomCommandsOpen(false)}
        customCommands={customCommands}
        handleDeleteCustomCommand={handleDeleteCustomCommand}
        onAddCustomCommand={handleAddCustomCommand}
      />

      {/* Tag Groups Modal */}
      <TagGroupsModal
        isOpen={isTagGroupsOpen}
        onClose={() => setIsTagGroupsOpen(false)}
        tags={tags}
        tagGroups={tagGroups}
        onSaveTagGroup={handleSaveTagGroup}
        onDeleteTagGroup={handleDeleteTagGroup}
        handleUpdateTags={handleUpdateTags}
      />
    </div>
  );
}
