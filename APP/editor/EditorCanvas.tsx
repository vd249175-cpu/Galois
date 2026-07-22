import React, { useEffect, useState, useRef, useMemo } from 'react';
import { extractBodyHashtags, parseFrontmatterTags, parseMarkdownBody } from '../utils';
import { updateYamlFrontmatterTags, parseExpression } from './editorUtils';
import { MarkdownPreview } from './MarkdownPreview';
import { TagToolbar } from './TagToolbar';
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
import { useRuntimeSync } from './hooks/useRuntimeSync';
import { useExternalFileSync } from './hooks/useExternalFileSync';
import { useProjectCommands } from './hooks/useProjectCommands';
import type { EditorTextHandle } from './LiveMarkdownEditor';
import { applyMarkdownFormatting, handleSmartEnter, handleSmartTab } from './markdownEditing';
import { filterAndRankSlashCommands, rememberSlashCommand } from './slashCommandSearch';

const LiveMarkdownEditor = React.lazy(async () => {
  const mod = await import('./LiveMarkdownEditor');
  return { default: mod.LiveMarkdownEditor };
});

const RECENT_SLASH_COMMANDS_KEY = 'dnote_recent_slash_commands';

type EditorMode = 'source' | 'live' | 'reading';

function getInitialEditorMode(): EditorMode {
  const savedMode = localStorage.getItem('dnote_editor_mode') as EditorMode | null;
  if (savedMode === 'live' || savedMode === 'reading') return savedMode;
  if (savedMode === 'source') return 'live';
  const legacyPreview = localStorage.getItem('dnote_editor_preview_mode');
  if (legacyPreview !== null) return legacyPreview === 'true' ? 'reading' : 'live';
  return 'live';
}

function getNextEditorMode(mode: EditorMode): EditorMode {
  return mode === 'reading' ? 'live' : 'reading';
}

/**
 * EditorComponent — 插件注册对象（完整契约）
 * 在 APP/editor/index.ts 重新导出，此处声明 manifest
 */
export function EditorView({
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
  const [editorMode, setEditorMode] = useState<EditorMode>(() => getInitialEditorMode());
  const isReadingMode = editorMode === 'reading';
  const isLivePreviewMode = editorMode === 'live';
  const [newTagInput, setNewTagInput] = useState('');
  const [ruleMatches, setRuleMatches] = useState<Record<string, string[]>>({});
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const projectPath = state[BC.system.projectPath] || '';

  // Sync runtime coordinates to .dnote_runtime.json in the project root.
  // Migrated from CORE/App.tsx to keep editor-specific logic inside the editor plugin.
  useRuntimeSync(areaId);

  const textareaRef = useRef<EditorTextHandle>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const lastSavedContentRef = useRef<string>('');
  const pendingInternalContentRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef<boolean>(false);
  const triggeredImmediateRefs = useRef<Set<string>>(new Set());
  const restoredCursorForFileRef = useRef<string>('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    triggeredImmediateRefs.current.clear();
    restoredCursorForFileRef.current = '';
  }, [currentFile]);

  const mergeInlineTagsIntoFrontmatter = (draft: string) => {
    const frontmatterTags = parseFrontmatterTags(draft);
    const inlineTags = extractBodyHashtags(draft);
    if (inlineTags.length === 0) {
      return { text: draft, tags: frontmatterTags, changed: false, delta: 0 };
    }
    const mergedTags = Array.from(new Set([...frontmatterTags, ...inlineTags])).sort();
    const missingInlineTag = inlineTags.some((tag) => !frontmatterTags.includes(tag));
    if (!missingInlineTag) {
      return { text: draft, tags: mergedTags, changed: false, delta: 0 };
    }
    const nextText = updateYamlFrontmatterTags(draft, mergedTags);
    return { text: nextText, tags: mergedTags, changed: nextText !== draft, delta: nextText.length - draft.length };
  };

  // ── saveNodeFile ──────────────────────────────────────────────────────────
  const saveNodeFile = async (customContent?: string) => {
    if (!currentFile) { setStatusMessage('无打开的笔记可保存'); return; }
    const sourceContent = customContent !== undefined ? customContent : contentRef.current;
    const normalized = mergeInlineTagsIntoFrontmatter(sourceContent);
    const fullContent = normalized.text;
    if (fullContent === lastSavedContentRef.current) return;
    try {
      pendingInternalContentRef.current = fullContent;
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      lastSavedContentRef.current = fullContent;
      if (normalized.changed) {
        const editor = textareaRef.current;
        const selectionStart = editor?.selectionStart ?? 0;
        const selectionEnd = editor?.selectionEnd ?? selectionStart;
        const scroll = editor?.getScrollPosition?.();
        setTags(normalized.tags);
        setContent(fullContent);
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.setSelectionRange(selectionStart + normalized.delta, selectionEnd + normalized.delta);
          if (scroll) textareaRef.current.setScrollPosition?.(scroll.top, scroll.left);
        });
      }
      setStatusMessage(`保存于 ${new Date().toLocaleTimeString()}`);
      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
      
      // If we are not in reading mode, detect and run any immediate scripts matching {{...}}
      if (!isReadingMode) {
        triggerImmediateScripts(fullContent);
      }
    } catch (err: any) {
      console.error('[Editor] Save failed:', err);
      setStatusMessage(`保存失败: ${err.message}`);
      updateBloodKey(BC.events.scriptError('editor'), { message: err.message, ts: Date.now() });
    } finally {
      if (pendingInternalContentRef.current === fullContent) {
        pendingInternalContentRef.current = null;
      }
    }
  };

  // ── Undo/Redo History Hook ──────────────────────────────────────────────
  const {
    pushStateToUndoStack,
    handleUndo,
    handleRedo,
    historyTimerRef,
    lastHistoryContentRef,
    markHistoryContent,
  } = useEditorHistory({
    content,
    setContent,
    currentFile,
    projectPath,
    saveNodeFile,
    textareaRef,
    setStatusMessage,
  });

  const openedFile = state[BC.events.openFile(areaId)] || '';
  const isFocused = state[BC.system.focusedAreaId] === areaId;
  const configPath = projectPath ? `${projectPath}/command/commands.json` : '';
  const commandsSavedEvent = state[BC.events.fileSaved(configPath)] || 0;

  const projectCommands = useProjectCommands(projectPath, commandsSavedEvent);

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
      callout: '',
      table: '',
      hr: '',
      'wiki-link': '',
      strike: '',
      highlight: '',
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
    const saved = localStorage.getItem('dnote_custom_commands');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(c => c.id !== 'custom.rainbow');
          if (filtered.length !== parsed.length) {
            localStorage.setItem('dnote_custom_commands', JSON.stringify(filtered));
          }
          return filtered;
        }
      } catch (_) {}
    }
    return [];
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
        sourceOwner: 'dynamic',
        defaultShortcut: cmd.defaultShortcut,
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
        sourceOwner: 'dynamic',
        defaultShortcut: cmd.defaultShortcut || cmd.shortcut,
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

  const handleUpdateTagGroups = (nextGroups: Record<string, string[]>) => {
    setTagGroups(nextGroups);
    localStorage.setItem('dnote_tag_groups', JSON.stringify(nextGroups));
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
  const [recentSlashCommandIds, setRecentSlashCommandIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_SLASH_COMMANDS_KEY) || '[]');
    } catch (_) {
      return [];
    }
  });

  const SLASH_COMMANDS = [
    { id: 'bold', label: 'Bold', desc: '加粗所选文本', icon: 'B', category: '格式' },
    { id: 'italic', label: 'Italic', desc: '将所选文本设为斜体', icon: 'I', category: '格式' },
    { id: 'code-inline', label: 'Inline Code', desc: '插入行内等宽代码', icon: '`', category: '格式' },
    { id: 'strike', label: 'Strikethrough', desc: '给所选文本加删除线', icon: 'S', category: '格式' },
    { id: 'highlight', label: 'Highlight', desc: '高亮所选文本', icon: '==', category: '格式' },
    { id: 'link', label: 'Link', desc: '插入外部超链接', icon: '🔗', category: '链接' },
    { id: 'wiki-link', label: 'Wiki Link', desc: '链接到另一篇笔记', icon: '[[', category: '链接' },
    { id: 'h1', label: 'Heading 1', desc: '插入一级标题', icon: 'H1', category: '基础块' },
    { id: 'h2', label: 'Heading 2', desc: '插入二级标题', icon: 'H2', category: '基础块' },
    { id: 'h3', label: 'Heading 3', desc: '插入三级标题', icon: 'H3', category: '基础块' },
    { id: 'quote', label: 'Blockquote', desc: '插入引用块', icon: '“', category: '基础块' },
    { id: 'callout', label: 'Callout', desc: '插入提示块', icon: '!', category: '基础块' },
    { id: 'hr', label: 'Divider', desc: '插入分隔线', icon: '—', category: '基础块' },
    { id: 'todo', label: 'To-Do List', desc: '插入待办列表', icon: '☑', category: '列表' },
    { id: 'bullet', label: 'Bullet List', desc: '插入无序列表', icon: '•', category: '列表' },
    { id: 'number', label: 'Numbered List', desc: '插入有序列表', icon: '1.', category: '列表' },
    { id: 'table', label: 'Table', desc: '插入两列表格', icon: '▦', category: '表格' },
    { id: 'code-block', label: 'Code Block', desc: '插入代码块', icon: '💻', category: '代码' }
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
      content: cmd.content,
      category: '自定义',
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
        content: cmd.content,
        category: '项目',
      }));

    const helperCmds = [
      {
        id: 'custom.add_new',
        label: 'Create Custom Command (新增自定义命令)',
        desc: '创建可复用的自定义文本命令',
        icon: React.createElement(
          'svg',
          { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
          React.createElement('path', { d: 'M8 3v10M3 8h10' })
        ),
        content: '',
        category: '自定义',
      },
      {
        id: 'custom.manage',
        label: 'Manage Custom Commands (管理自定义命令)',
        desc: '查看、编辑或删除自定义命令',
        icon: React.createElement(
          'svg',
          { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
          React.createElement('circle', { cx: 8, cy: 8, r: 2.5 }),
          React.createElement('path', { d: 'M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4' })
        ),
        content: '',
        category: '自定义',
      }
    ];
    return [...SLASH_COMMANDS, ...customList, ...projectList, ...helperCmds];
  }, [customCommands, projectCommands]);

  const filteredCommands = useMemo(
    () => filterAndRankSlashCommands(allCommands, slashMenuQuery, recentSlashCommandIds),
    [allCommands, slashMenuQuery, recentSlashCommandIds]
  );

  const rememberSlashCommandUse = (commandId: string) => {
    const nextRecent = rememberSlashCommand(recentSlashCommandIds, commandId);
    setRecentSlashCommandIds(nextRecent);
    localStorage.setItem(RECENT_SLASH_COMMANDS_KEY, JSON.stringify(nextRecent));
  };

  const applyFormatting = applyMarkdownFormatting;

  const getEditorCaretCoordinates = (position: number) => {
    return textareaRef.current?.getCaretCoordinates(position) || { left: 12, top: 36 };
  };

  const handleExecuteCommand = (
    cmd: { id: string; label: string; desc?: string; icon?: any; content?: string },
    rangeStart?: number,
    rangeEnd?: number,
    sourceContent?: string
  ) => {
    rememberSlashCommandUse(cmd.id);
    const activeEditor = textareaRef.current;
    const workingContent = sourceContent ?? content;
    const hasExplicitRange = rangeStart !== undefined && rangeEnd !== undefined;
    if (!activeEditor && !hasExplicitRange && cmd.id !== 'custom.add_new' && cmd.id !== 'custom.manage') return;

    const selectionStart = activeEditor?.selectionStart ?? workingContent.length;
    const selectionEnd = activeEditor?.selectionEnd ?? selectionStart;
    const actualStart = Math.max(0, Math.min(
      workingContent.length,
      hasExplicitRange ? rangeStart! : (showSlashMenu ? slashIndex : selectionStart)
    ));
    const actualEnd = Math.max(actualStart, Math.min(
      workingContent.length,
      hasExplicitRange ? rangeEnd! : selectionEnd
    ));
    const restoreSelection = (start: number, end: number) => {
      if (!activeEditor) return;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start, end);
        }
      }, 0);
    };

    if (cmd.id === 'custom.add_new' || cmd.id === 'custom.manage') {
      setShowSlashMenu(false);
      setIsCustomCommandsOpen(true);
      return;
    }

    if (cmd.id.startsWith('custom.')) {
      pushStateToUndoStack(workingContent, actualStart, actualEnd);
      
      const before = workingContent.substring(0, actualStart);
      const after = workingContent.substring(actualEnd);
      
      const snippet = cmd.content || '';
      const textAfterInsert = before + snippet + after;
      setContent(textAfterInsert);
      markHistoryContent(textAfterInsert);
      saveNodeFile(textAfterInsert);
      setShowSlashMenu(false);
      restoreSelection(actualStart + snippet.length, actualStart + snippet.length);
      return;
    }

    if (cmd.id.startsWith('project.')) {
      const projCmd = projectCommands.find(p => p.id === cmd.id);
      if (projCmd && projCmd.content) {
        // Run it like a custom command (insert content snippet)
        pushStateToUndoStack(workingContent, actualStart, actualEnd);
        const before = workingContent.substring(0, actualStart);
        const after = workingContent.substring(actualEnd);
        const snippet = projCmd.content || '';
        const textAfterInsert = before + snippet + after;
        setContent(textAfterInsert);
        markHistoryContent(textAfterInsert);
        saveNodeFile(textAfterInsert);
        setShowSlashMenu(false);
        restoreSelection(actualStart + snippet.length, actualStart + snippet.length);
        return;
      }

      // Fallback: Run project script command
      pushStateToUndoStack(workingContent, actualStart, actualEnd);
      
      const before = workingContent.substring(0, actualStart);
      const after = workingContent.substring(actualEnd);
      const cleanContent = before + after;
      
      setContent(cleanContent);
      markHistoryContent(cleanContent);
      saveNodeFile(cleanContent);
      setShowSlashMenu(false);
      
      if (projCmd) {
        setTimeout(() => {
          if (activeEditor && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(actualStart, actualStart);
          }
          handleExecuteProjectCommand(projCmd);
        }, 0);
      }
      return;
    }

    const start = (hasExplicitRange || showSlashMenu) ? actualStart : selectionStart;
    const end = (hasExplicitRange || showSlashMenu) ? actualEnd : selectionEnd;
    const before = workingContent.substring(0, start);
    const after = workingContent.substring(end);
    const baseContent = before + after;

    if (cmd.id === 'link') {
      setShowSlashMenu(false);
      showPrompt('输入超链接 URL:', 'https://', (url) => {
        if (!url) return;
        pushStateToUndoStack(workingContent, start, start);
        const res = applyFormatting('link', baseContent, start, start, url);
        setContent(res.text);
        markHistoryContent(res.text);
        saveNodeFile(res.text);
        restoreSelection(res.newStart, res.newEnd);
      });
      return;
    }

    pushStateToUndoStack(workingContent, start, start);
    const res = applyFormatting(cmd.id, baseContent, start, start);
    setContent(res.text);
    markHistoryContent(res.text);
    saveNodeFile(res.text);

    setShowSlashMenu(false);
    restoreSelection(res.newStart, res.newEnd);
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

      console.log(`[Editor] Executing project command: ${cmd.script}`);
      await (window as any).electronAPI.runProjectScript(projectPath, {
        command: cmd.script,
        cwd: projectPath,
        envExtra: {
          DNOTE_ACTIVE_FILE: currentFile,
          DNOTE_OUTPUT_FILE: absoluteOutputPath,
          DNOTE_CURSOR_LINE: String(cursorLine),
          DNOTE_CURSOR_COL: String(cursorCol),
          DNOTE_SELECTED_TEXT: selectedText,
        },
      });

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
    { id: 'wiki-link', label: 'Wiki Link (双向链接)', defaultCombo: '' },
    { id: 'h1', label: 'Heading 1 (一级标题)', defaultCombo: 'meta+1' },
    { id: 'h2', label: 'Heading 2 (二级标题)', defaultCombo: 'meta+2' },
    { id: 'h3', label: 'Heading 3 (三级标题)', defaultCombo: 'meta+3' },
    { id: 'todo', label: 'To-Do List (待办列表)', defaultCombo: '' },
    { id: 'bullet', label: 'Bullet List (无序列表)', defaultCombo: '' },
    { id: 'number', label: 'Numbered List (有序列表)', defaultCombo: '' },
    { id: 'quote', label: 'Blockquote (引用块)', defaultCombo: '' },
    { id: 'callout', label: 'Callout (提示块)', defaultCombo: '' },
    { id: 'table', label: 'Table (表格)', defaultCombo: '' },
    { id: 'hr', label: 'Divider (分割线)', defaultCombo: '' },
    { id: 'strike', label: 'Strikethrough (删除线)', defaultCombo: '' },
    { id: 'highlight', label: 'Highlight (高亮)', defaultCombo: '' },
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

      await (window as any).electronAPI.runProjectScript(projectPath, {
        scriptName: run,
        cwd: `${projectPath}/script`,
        envExtra: {
          DNOTE_THREAD_ID: threadId,
          DNOTE_OUTPUT_FILE: absoluteOutputPath,
          DNOTE_NOTE_PATH: currentFile,
          DNOTE_NOTE_LINE: String(lineIndex),
        },
      });

      try {
        const updatedContent = await (window as any).electronAPI.readFile(absoluteOutputPath);
        if (updatedContent) {
          const parsedData = JSON.parse(updatedContent);
          updateBloodKey(`${BC_PREFIX.scriptJson}${resolvedRelativeJsonPath}`, parsedData);
        }
      } catch (e) {}

      setStatusMessage(`Script ${run} executed successfully.`);
      updateBloodKey(BC.events.commandExecuted(`reactive.${run}`), Date.now());

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
    markHistoryContent(resolvedVal);
  };

  const handlePreviewContentChange = (newContent: string) => {
    if (newContent === contentRef.current) return;
    pushStateToUndoStack(contentRef.current, 0, 0);
    setContent(newContent);
    markHistoryContent(newContent);
    saveNodeFile(newContent);
  };

  const insertTextAtCurrentCursor = (snippet: string) => {
    const editor = textareaRef.current;
    const start = editor?.selectionStart ?? contentRef.current.length;
    const end = editor?.selectionEnd ?? start;
    const source = contentRef.current;
    const before = source.slice(0, start);
    const after = source.slice(end);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '\n';
    const nextContent = `${before}${prefix}${snippet}${suffix}${after}`;
    const nextCursor = before.length + prefix.length + snippet.length;
    pushStateToUndoStack(source, start, end);
    setContent(nextContent);
    markHistoryContent(nextContent);
    saveNodeFile(nextContent);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const stopRecordingTracks = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const finishAudioRecording = async (mimeType: string) => {
    try {
      const blob = new Blob(recordingChunksRef.current, { type: mimeType || 'audio/webm' });
      recordingChunksRef.current = [];
      if (blob.size === 0) {
        setStatusMessage('录音为空，未插入。');
        return;
      }
      if (!projectPath || !currentFile) {
        setStatusMessage('请先打开笔记项目和笔记，再开始录音。');
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const data = await blob.arrayBuffer();
      const relativePath = await (window as any).electronAPI.archiveMediaData(
        `voice-${timestamp}.webm`,
        mimeType || 'audio/webm',
        data,
        projectPath
      );
      insertTextAtCurrentCursor(`![audio](${relativePath})`);
      setStatusMessage('录音已保存到当前笔记项目媒体目录。');
    } catch (err: any) {
      console.error('[Editor] Audio recording save failed:', err);
      setStatusMessage(`录音保存失败: ${err.message}`);
    } finally {
      stopRecordingTracks();
      setIsRecordingAudio(false);
    }
  };

  const handleToggleAudioRecording = async () => {
    if (isRecordingAudio) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (!projectPath || !currentFile) {
      setStatusMessage('请先打开笔记项目和笔记，再开始录音。');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStatusMessage('当前环境不支持浏览器录音。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = (event: any) => {
        console.error('[Editor] Audio recording failed:', event.error || event);
        setStatusMessage(`录音失败: ${event.error?.message || '未知错误'}`);
        stopRecordingTracks();
        setIsRecordingAudio(false);
      };
      recorder.onstop = () => {
        finishAudioRecording(mimeType);
      };
      recorder.start();
      setIsRecordingAudio(true);
      setStatusMessage('正在录音，再次点击可停止并插入音频。');
    } catch (err: any) {
      console.error('[Editor] Audio recording start failed:', err);
      stopRecordingTracks();
      setIsRecordingAudio(false);
      setStatusMessage(`无法开始录音: ${err.message}`);
    }
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      stopRecordingTracks();
    };
  }, []);

  const {
    isDraggingFile,
    hoveredLineIndex,
    setHoveredLineIndex,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleDropAtIndex,
    handlePasteAtIndex,
    handleLineDrop,
  } = useMediaDrop({
    projectPath,
    currentFile,
    isPreviewMode: isReadingMode,
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
        const normalized = mergeInlineTagsIntoFrontmatter(rawContent);
        const loadedContent = normalized.text;
        if (loadedContent === contentRef.current || loadedContent === lastSavedContentRef.current) return;
        const parsedTags = normalized.tags;
        if (normalized.changed) {
          await (window as any).electronAPI.writeFile(openedFile, loadedContent);
          updateBloodKey(BC.events.fileSaved(openedFile), Date.now());
        }
        lastSavedContentRef.current = loadedContent;
        setTags(parsedTags);
        setContent(loadedContent);
        setCurrentFile(openedFile);
        const noteName = openedFile.split('/').pop()?.replace('.md', '') || '';
        setStatusMessage(`Editing Note: ${noteName}`);
      } catch (err: any) {
        console.error('[Editor] Failed to load note:', openedFile, err);
        const errMsg = err.message || '';
        if (errMsg.includes('ENOENT') || errMsg.includes('no such file')) {
          const noteName = openedFile.split(/[/\\]/).pop()?.replace('.md', '') || '';
          let draftTags: string[] = [];
          let draftTitle = noteName;
          if (noteName.startsWith('#')) {
            const parsed = noteName.split('#').map((t: string) => t.trim()).filter(Boolean);
            if (parsed.length > 0) {
              draftTags = parsed;
              draftTitle = noteName;
            }
          }
          const serializedTags = draftTags.map(t => `  - ${t}\n`).join('');
          const template = `---\ntags:\n${serializedTags}---\n# ${draftTitle}\n\n`;
          if (template === contentRef.current) return;
          lastSavedContentRef.current = template;
          setTags(draftTags);
          setContent(template);
          setCurrentFile(openedFile);
          setStatusMessage(`Draft Note: ${draftTitle} (Unsaved)`);
          setEditorMode('live');
        } else {
          setStatusMessage(`Error loading note file.`);
        }
      }
    };
    loadMarkdownFile();
  }, [openedFile, fileSavedEvent]);

  useExternalFileSync({
    currentFile,
    contentRef,
    lastSavedContentRef,
    pendingInternalContentRef,
    autoSaveTimerRef,
    normalizeMarkdown: mergeInlineTagsIntoFrontmatter,
    applyExternalContent: (nextContent, nextTags) => {
      setTags(nextTags);
      setContent(nextContent);
      markHistoryContent(nextContent);
    },
    setStatusMessage,
    updateBloodKey,
  });

  useEffect(() => {
    const savedCursor = state[BC.system.editorCursor(areaId)];
    if (!currentFile || !content) return;
    if (restoredCursorForFileRef.current === currentFile) return;
    if (editorMode === 'reading') return;

    let selectionStart = 0;
    let selectionEnd = 0;
    let scrollTop = 0;
    let scrollLeft = 0;
    if (projectPath) {
      try {
        const perFile = JSON.parse(localStorage.getItem(`galois_live_view:${projectPath}:${currentFile}`) || 'null');
        if (perFile) {
          selectionStart = Math.max(0, Math.min(content.length, Number(perFile.selectionStart || 0)));
          selectionEnd = Math.max(0, Math.min(content.length, Number(perFile.selectionEnd || selectionStart)));
          scrollTop = Number(perFile.scrollTop || 0);
          scrollLeft = Number(perFile.scrollLeft || 0);
        }
      } catch (_) {}
    }
    if (selectionStart === 0 && selectionEnd === 0 && savedCursor?.filePath === currentFile) {
      const line = Math.max(1, Number(savedCursor.line || 1));
      const column = Math.max(1, Number(savedCursor.column || 1));
      const lines = content.split('\n');
      const before = lines.slice(0, line - 1).reduce((sum, item) => sum + item.length + 1, 0);
      selectionStart = Math.min(content.length, before + Math.min(column - 1, (lines[line - 1] || '').length));
      selectionEnd = selectionStart;
      scrollTop = Number(savedCursor.scrollTop || 0);
      scrollLeft = Number(savedCursor.scrollLeft || 0);
    }

    restoredCursorForFileRef.current = currentFile;
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(selectionStart, selectionEnd);
      requestAnimationFrame(() => {
        textareaRef.current?.setScrollPosition?.(scrollTop, scrollLeft);
      });
    }, 0);
  }, [areaId, content, currentFile, editorMode, projectPath, state[BC.system.editorCursor(areaId)]]);

  // ── Tag resolver ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentFile || !projectPath) return;
    const staticTags = Array.from(new Set([
      ...tags.filter((t) => !t.startsWith('re:') && !t.startsWith('run:')),
      ...extractBodyHashtags(content),
    ]));
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
    if (!currentFile || isReadingMode || content === '' || content === lastSavedContentRef.current || isComposingRef.current) return;
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      saveNodeFile(content);
    }, 600);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [content, currentFile, isReadingMode]);

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
    markHistoryContent(fullContent);
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

  const cycleEditorMode = () => {
    setEditorMode((prev) => {
      const next = getNextEditorMode(prev);
      localStorage.setItem('dnote_editor_mode', next);
      localStorage.setItem('dnote_editor_preview_mode', String(next === 'reading'));
      return next;
    });
  };

  const switchEditorMode = (mode: EditorMode) => {
    setEditorMode(mode);
    localStorage.setItem('dnote_editor_mode', mode);
    localStorage.setItem('dnote_editor_preview_mode', String(mode === 'reading'));
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
    else if (lastAction.id === 'editor.toggleMode') cycleEditorMode();
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
    const scroll = textareaRef.current.getScrollPosition?.();
    if (projectPath && currentFile) {
      localStorage.setItem(`galois_live_view:${projectPath}:${currentFile}`, JSON.stringify({
        selectionStart,
        selectionEnd,
        scrollTop: scroll?.top || 0,
        scrollLeft: scroll?.left || 0,
      }));
    }
    
    updateBloodKey(`system.editorCursor.${areaId}`, {
      line,
      column,
      selectedText,
      scrollTop: scroll?.top || 0,
      scrollLeft: scroll?.left || 0,
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

  const handleKeyDown = (e: KeyboardEvent, start: number, end: number) => {
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
          markHistoryContent(res.text);
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
        markHistoryContent(res.text);
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

    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const result = handleSmartEnter(content, start, end);
      if (result.handled) {
        e.preventDefault();
        pushStateToUndoStack(content, start, end);
        setContent(result.text);
        markHistoryContent(result.text);
        saveNodeFile(result.text);
        setTimeout(() => {
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(result.newStart, result.newEnd);
        }, 0);
        return;
      }
    }

    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const result = handleSmartTab(content, start, end, e.shiftKey);
      if (result.handled) {
        e.preventDefault();
        pushStateToUndoStack(content, start, end);
        setContent(result.text);
        markHistoryContent(result.text);
        if (result.text !== content) saveNodeFile(result.text);
        setTimeout(() => {
          textareaRef.current?.focus();
          textareaRef.current?.setSelectionRange(result.newStart, result.newEnd);
        }, 0);
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

        const coords = getEditorCaretCoordinates(start);
        setSlashMenuCoords(coords);
      }
    }
  };

  useEffect(() => {
    if (!isFocused || !isReadingMode) return;
    const handleReadingUndoRedo = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleReadingUndoRedo, true);
    return () => window.removeEventListener('keydown', handleReadingUndoRedo, true);
  }, [isFocused, isReadingMode, handleUndo, handleRedo]);

  const handleEditorDrop = (event: React.DragEvent) => {
    if (event.defaultPrevented) return;
    if (!isReadingMode) {
      const position = textareaRef.current?.getPositionAtCoordinates(event.clientX, event.clientY);
      if (position !== null && position !== undefined) {
        handleDropAtIndex(event, position);
        return;
      }
    }
    handleDrop(event);
  };

  const modeLabel = editorMode === 'reading'
    ? '📖 Reading'
    : editorMode === 'live'
      ? '✨ Live Preview'
      : '✍️ Source';
  const modeOptions: Array<{ mode: EditorMode; label: string; title: string }> = [
    { mode: 'live', label: 'Live', title: '编辑态实时预览' },
    { mode: 'reading', label: 'Reading', title: '纯阅读预览' },
  ];

  return (
    <div
      className="code-editor"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleEditorDrop}
      style={{ position: 'relative' }}
    >
      {/* Editor Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', height: '26px', overflow: 'hidden' }}>
        <span style={{ fontSize: 'var(--panel-title-size, 11px)', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>
          <span>{modeLabel}</span>
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
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: 'var(--panel-title-size, 11px)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
            </svg>
            标签组模板
          </button>
          <button
            className="area-btn"
            onClick={() => setIsCustomCommandsOpen(true)}
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: 'var(--panel-title-size, 11px)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
            </svg>
            自定义命令
          </button>
          <button
            className="area-btn"
            onClick={handleToggleAudioRecording}
            title={isRecordingAudio ? '停止录音并插入到当前笔记' : '录制一段声音并插入到当前笔记'}
            style={{
              width: 'auto',
              height: '18px',
              padding: '0 8px',
              fontSize: 'var(--panel-title-size, 11px)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: isRecordingAudio ? '#ff3b30' : 'var(--text-muted)',
              borderColor: isRecordingAudio ? 'rgba(255, 59, 48, 0.45)' : undefined,
              backgroundColor: isRecordingAudio ? 'rgba(255, 59, 48, 0.08)' : undefined,
            }}
          >
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isRecordingAudio ? '#ff3b30' : 'currentColor',
              boxShadow: isRecordingAudio ? '0 0 0 3px rgba(255, 59, 48, 0.14)' : 'none',
            }} />
            {isRecordingAudio ? '停止' : '录音'}
          </button>
          <div
            role="group"
            aria-label="Editor mode"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '7px', backgroundColor: 'var(--bg-input)' }}
          >
            {modeOptions.map((option) => {
              const active = editorMode === option.mode;
              return (
                <button
                  key={option.mode}
                  className="area-btn"
                  title={`${option.title} (meta+e 在 Live / Reading 间切换)`}
                  onClick={() => switchEditorMode(option.mode)}
                  style={{
                    width: 'auto',
                    height: '18px',
                    padding: '0 8px',
                    fontSize: 'var(--panel-title-size, 11px)',
                    borderColor: active ? 'var(--accent-color)' : 'transparent',
                    backgroundColor: active ? 'var(--highlight-color)' : 'transparent',
                    color: active ? 'var(--accent-color)' : 'var(--text-muted)',
                    fontWeight: active ? 700 : 600,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
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
      {isReadingMode ? (
        <MarkdownPreview
          content={content}
          onContentChange={handlePreviewContentChange}
          areaId={areaId}
          projectPath={projectPath}
          state={state}
          updateBloodKey={updateBloodKey}
          handleLinkClick={handleLinkClick}
          isPreviewMode={true}
          hoveredLineIndex={hoveredLineIndex}
          setHoveredLineIndex={setHoveredLineIndex}
          handleLineDrop={handleLineDrop}
          handleDropAtIndex={handleDropAtIndex}
          handlePasteAtIndex={handlePasteAtIndex}
          currentFile={currentFile}
          slashCommands={allCommands}
          getShortcutDisplay={getShortcutDisplay}
          onExecuteSlashCommand={(cmd, start, end, sourceContent) => {
            handleExecuteCommand(cmd as any, start, end, sourceContent);
          }}
        />
      ) : (
        <React.Suspense
          fallback={
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--ui-font-size, 12px)' }}>
              正在加载编辑器内核...
            </div>
          }
        >
          <LiveMarkdownEditor
            key={`${editorMode}:${projectPath}`}
            ref={textareaRef}
            value={content}
            livePreview={isLivePreviewMode}
            projectPath={projectPath}
            onWikiLink={handleLinkClick}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={(nextValue) => {
              isComposingRef.current = false;
              setContent(nextValue);
            }}
            onChange={(nextVal, selectionStart) => {
              // Clear any pending debounced history push
              if (historyTimerRef.current) {
                clearTimeout(historyTimerRef.current);
              }

              // Capture milestones (space, newline, or a jump of characters) for undo history
              const diffLen = Math.abs(nextVal.length - lastHistoryContentRef.current.length);
              const lastChar = nextVal.charAt(selectionStart - 1);
              if (diffLen > 6 || lastChar === ' ' || lastChar === '\n') {
                pushStateToUndoStack(lastHistoryContentRef.current, selectionStart, selectionStart);
                markHistoryContent(nextVal);
              } else {
                // Debounce pushing history state if user stops typing for 500ms
                const prevVal = lastHistoryContentRef.current;
                historyTimerRef.current = setTimeout(() => {
                  pushStateToUndoStack(prevVal, selectionStart, selectionStart);
                  markHistoryContent(nextVal);
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

              const cursor = selectionStart;
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
            onDropAtPosition={handleDropAtIndex}
            onPasteAtPosition={handlePasteAtIndex}
            onFocus={handleFocus}
            onSelectionChange={() => updateCursorState()}
            placeholder="Start writing note..."
          />
        </React.Suspense>
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
        <div style={{ position: 'absolute', top: '58px', right: '14px', zIndex: 40, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 11px', border: '1.5px dashed var(--accent-color)', borderRadius: '10px', backgroundColor: 'color-mix(in srgb, var(--bg-main) 88%, transparent)', boxShadow: '0 10px 30px rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--highlight-color)', color: 'var(--accent-color)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontSize: 'var(--ui-font-size, 12px)', fontWeight: 700, color: 'var(--text-main)' }}>松手插入到当前位置</span>
              <span style={{ fontSize: 'calc(var(--ui-font-size, 12px) - 2px)', color: 'var(--text-muted)' }}>支持媒体文件和 CLIP 片段</span>
            </div>
          </div>
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
        onUpdateTagGroups={handleUpdateTagGroups}
        onDeleteTagGroup={handleDeleteTagGroup}
        handleUpdateTags={handleUpdateTags}
      />
    </div>
  );
}
