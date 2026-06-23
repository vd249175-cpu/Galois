import { useEffect, useState, useRef, useMemo } from 'react';
import { parseFrontmatterTags, parseMarkdownBody } from '../utils';
import { updateYamlFrontmatterTags } from './editorUtils';
import { MarkdownPreview } from './MarkdownPreview';
import { TagToolbar } from './TagToolbar';
import { editorActions } from './actions';
import { useMediaDrop } from './hooks/useMediaDrop';
import { useLinkNavigator } from './hooks/useLinkNavigator';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';

/**
 * EditorComponent — 插件注册对象（完整契约）
 * 在 APP/editor/index.ts 重新导出，此处声明 manifest
 */
export const EditorComponent = {
  typeId: 'editor',
  displayName: 'Lattice Editor',
  iconName: 'document',
  component: EditorView,
  actions: editorActions,
  bloodChannels: (areaId: string) => [
    BC.system.projectPath,
    BC.system.resolvedTags,
    BC.events.openFile(areaId),
    BC.system.focusedAreaId,
    BC.system.activeEditors,
    BC.system.lastFocusedEditorId,
    BC_PREFIX.scriptJson,
  ],
  manifest: {
    description: 'Markdown 笔记编辑器，支持 YAML frontmatter 标签和 WikiLink 导航',
    reads: [
      BC.system.projectPath,        // 项目根目录（由 fileTree 写入）
      BC.system.resolvedTags,       // 解析后的全局标签 map（由 fileTree 写入）
      BC.events.openFile('*'),      // 打开文件请求（由 fileTree/graphView 写入）
      BC.system.focusedAreaId,
      BC.system.activeEditors,
      BC.system.lastFocusedEditorId,
    ],
    writes: [
      BC.events.fileSaved('*'),         // 文件保存事件 → fileTree, graphView
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
  const slashMenuRef = useRef<HTMLDivElement>(null);


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
  const [customCommands, setCustomCommands] = useState<Array<{ id: string; label: string; desc: string; content: string }>>(() => {
    const saved = localStorage.getItem('dnote_custom_commands');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_) {}
    }
    return [];
  });
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
    const set = new Set<string>();
    for (const fileTags of Object.values(resolved)) {
      if (Array.isArray(fileTags)) {
        fileTags.forEach(t => set.add(t));
      }
    }
    return Array.from(set).sort();
  }, [state[BC.system.resolvedTags]]);

  const [newCmdLabel, setNewCmdLabel] = useState('');
  const [newCmdTrigger, setNewCmdTrigger] = useState('');
  const [newCmdDesc, setNewCmdDesc] = useState('');
  const [newCmdContent, setNewCmdContent] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const handleAddCustomCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const trigger = newCmdTrigger.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = newCmdLabel.trim();
    const desc = newCmdDesc.trim();
    const bodyText = newCmdContent;

    if (!trigger || !label || !bodyText) {
      alert('Please fill in Label, Trigger word, and Content fields.');
      return;
    }

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

    setNewCmdLabel('');
    setNewCmdTrigger('');
    setNewCmdDesc('');
    setNewCmdContent('');
    setStatusMessage(`Custom command /${trigger} created.`);
  };

  const handleDeleteCustomCommand = (id: string) => {
    const nextCmds = customCommands.filter(c => c.id !== id);
    setCustomCommands(nextCmds);
    localStorage.setItem('dnote_custom_commands', JSON.stringify(nextCmds));
    setStatusMessage('Custom command deleted.');
  };

  const handleSaveTagGroup = (e: React.FormEvent) => {
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
    const nextGroups = {
      ...tagGroups,
      [name]: [...tags]
    };
    setTagGroups(nextGroups);
    localStorage.setItem('dnote_tag_groups', JSON.stringify(nextGroups));
    setNewGroupName('');
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

  useEffect(() => {
    if (showSlashMenu && slashMenuRef.current) {
      const container = slashMenuRef.current;
      const activeChild = container.children[slashMenuIndex] as HTMLElement;
      if (activeChild) {
        const containerHeight = container.clientHeight;
        const childTop = activeChild.offsetTop;
        const childHeight = activeChild.clientHeight;

        if (childTop < container.scrollTop) {
          container.scrollTop = childTop;
        } else if (childTop + childHeight > container.scrollTop + containerHeight) {
          container.scrollTop = childTop + childHeight - containerHeight;
        }
      }
    }
  }, [slashMenuIndex, showSlashMenu]);

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
      icon: '⚙️',
      content: cmd.content
    }));
    const helperCmds = [
      { id: 'custom.add_new', label: 'Create Custom Command (新增自定义命令)', desc: 'Define your own text snippet slash command', icon: '➕', content: '' },
      { id: 'custom.manage', label: 'Manage Custom Commands (管理自定义命令)', desc: 'View, edit or delete custom slash commands', icon: '⚙️', content: '' }
    ];
    return [...SLASH_COMMANDS, ...customList, ...helperCmds];
  }, [customCommands]);

  const filteredCommands = allCommands.filter((cmd: { id: string; label: string; desc: string; icon: string; content?: string }) => 
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

  const handleExecuteCommand = (cmd: { id: string; label: string; desc: string; icon: string }) => {
    if (!textareaRef.current) return;
    const start = slashIndex;
    const end = textareaRef.current.selectionEnd;

    const before = content.substring(0, start);
    const after = content.substring(end);
    const baseContent = before + after;

    if (cmd.id === 'custom.add_new') {
      setShowSlashMenu(false);
      setIsCustomCommandsOpen(true);
      return;
    }

    if (cmd.id === 'custom.manage') {
      setShowSlashMenu(false);
      setIsCustomCommandsOpen(true);
      return;
    }

    if (cmd.id.startsWith('custom.')) {
      const snippet = (cmd as any).content || '';
      const textAfterInsert = before + snippet + after;
      setContent(textAfterInsert);
      saveNodeFile(textAfterInsert);
      setShowSlashMenu(false);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(start + snippet.length, start + snippet.length);
        }
      }, 0);
      return;
    }

    if (cmd.id === 'link') {
      setShowSlashMenu(false);
      showPrompt('Enter Hyperlink URL:', 'https://', (url) => {
        if (!url) return;
        const res = applyFormatting('link', baseContent, start, start, url);
        setContent(res.text);
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

    const res = applyFormatting(cmd.id, baseContent, start, start);
    setContent(res.text);
    saveNodeFile(res.text);

    setShowSlashMenu(false);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
      }
    }, 0);
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

  const handleResetShortcut = (id: string, defaultCombo: string) => {
    setEditorShortcuts((prev) => {
      const next = { ...prev, [id]: defaultCombo };
      localStorage.setItem('dnote_markdown_shortcuts', JSON.stringify(next));
      return next;
    });
  };

  const renderVisualKeycap = (part: string) => {
    let label = part.toUpperCase();
    if (part === 'meta') label = '⌘ Cmd';
    if (part === 'control' || part === 'ctrl') label = '⌃ Ctrl';
    if (part === 'shift') label = '⇧ Shift';
    if (part === 'alt') label = '⌥ Opt';
    return (
      <kbd
        key={part}
        style={{
          display: 'inline-block',
          padding: '2px 5px',
          fontSize: '9px',
          fontFamily: 'monospace',
          lineHeight: '1',
          color: 'var(--text-main)',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1.2px solid var(--border-color)',
          borderRadius: '4px',
          boxShadow: '0 1px 0px var(--border-color), 0 1.5px 0px rgba(0,0,0,0.2)'
        }}
      >
        {label}
      </kbd>
    );
  };

  const formatComboVisual = (combo: string | undefined) => {
    if (!combo) return <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>None</span>;
    const parts = combo.split('+');
    return (
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        {parts.map((p) => renderVisualKeycap(p))}
      </div>
    );
  };

  const projectPath = state[BC.system.projectPath] || '';
  const openedFile = state[BC.events.openFile(areaId)] || '';
  const isFocused = state[BC.system.focusedAreaId] === areaId;

  // ── saveNodeFile ──────────────────────────────────────────────────────────
  const saveNodeFile = async (customContent?: string) => {
    if (!currentFile) { setStatusMessage('No file open to save'); return; }
    const fullContent = customContent !== undefined ? customContent : contentRef.current;
    if (fullContent === lastSavedContentRef.current) return;
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      lastSavedContentRef.current = fullContent;
      setStatusMessage(`Saved at ${new Date().toLocaleTimeString()}`);
      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
    } catch (err: any) {
      console.error('[Editor] Save failed:', err);
      setStatusMessage(`Error saving: ${err.message}`);
      updateBloodKey(BC.events.scriptError('editor'), { message: err.message, ts: Date.now() });
    }
  };

  // ── MediaDrop ─────────────────────────────────────────────────────────────
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
    setContent,
    saveNodeFile,
    setStatusMessage,
  });

  // ── LinkNavigator ─────────────────────────────────────────────────────────
  const { handleLinkClick } = useLinkNavigator({ projectPath, areaId, updateBloodKey });

  // ── 1. Register editor instance ───────────────────────────────────────────
  useEffect(() => {
    const editors = state[BC.system.activeEditors] || [];
    if (!editors.includes(areaId)) {
      updateBloodKey(BC.system.activeEditors, [...editors, areaId]);
    }
    if (!state[BC.system.lastFocusedEditorId]) {
      updateBloodKey(BC.system.lastFocusedEditorId, areaId);
    }
    return () => {
      const remaining = (state[BC.system.activeEditors] || []).filter((id: string) => id !== areaId);
      updateBloodKey(BC.system.activeEditors, remaining);
      if (state[BC.system.lastFocusedEditorId] === areaId) {
        updateBloodKey(BC.system.lastFocusedEditorId, remaining[0] || null);
      }
    };
  }, [areaId]);

  // ── 2. Focus tracking ─────────────────────────────────────────────────────
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

  // ── 3. File loading ───────────────────────────────────────────────────────
  useEffect(() => {
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
          const template = `---\ntags:\n  - ${noteName}\n---\n# ${noteName}\n\n`;
          lastSavedContentRef.current = template;
          setTags([noteName]);
          setContent(template);
          setCurrentFile(openedFile);
          setStatusMessage(`Draft Note: ${noteName} (Unsaved)`);
          setIsPreviewMode(false);
        } else {
          setStatusMessage(`Error loading note file.`);
        }
      }
    };
    loadMarkdownFile();
  }, [openedFile]);

  // ── 4. Tag resolver ───────────────────────────────────────────────────────
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

  // ── 5. Auto-save (debounced) ──────────────────────────────────────────────
  useEffect(() => {
    if (!currentFile || isPreviewMode || content === '' || content === lastSavedContentRef.current) return;
    const timer = setTimeout(() => { saveNodeFile(content); }, 1200);
    return () => clearTimeout(timer);
  }, [content, currentFile, isPreviewMode]);

  // ── 6. Tag update helper ──────────────────────────────────────────────────
  const handleUpdateTags = async (nextTags: string[]) => {
    if (!currentFile) return;
    const cleanTags = Array.from(new Set(nextTags.map((t) => t.trim()).filter(Boolean))).sort();
    setTags(cleanTags);
    const fullContent = updateYamlFrontmatterTags(contentRef.current, cleanTags);
    if (fullContent === lastSavedContentRef.current) return;
    setContent(fullContent);
    try {
      await (window as any).electronAPI.writeFile(currentFile, fullContent);
      lastSavedContentRef.current = fullContent;
      setStatusMessage('Tags updated inline.');
      updateBloodKey(BC.events.fileSaved(currentFile), Date.now());
    } catch (err: any) {
      console.error('[Editor] Tag update failed:', err);
      alert(`Failed to save tag updates: ${err.message}`);
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

  // ── 7. lastAction handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'editor.save') saveNodeFile();
    else if (lastAction.id === 'editor.toggleMode') togglePreviewMode();
    else if (lastAction.id === 'editor.delete') handleDeleteCurrentFile();
    else if (lastAction.id === 'editor.setAsTemplate') handleSetAsTemplate();
    else if (lastAction.id === 'editor.editShortcuts') setIsShortcutsModalOpen(true);
  }, [lastAction]);

  const handleFocus = () => {
    updateBloodKey(BC.system.focusedAreaId, areaId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

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

    if (matchedType) {
      e.preventDefault();
      if (matchedType === 'link') {
        showPrompt('Enter Hyperlink URL:', 'https://', (url) => {
          if (!url) return;
          const res = applyFormatting('link', content, start, end, url);
          setContent(res.text);
          saveNodeFile(res.text);
          
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.setSelectionRange(res.newStart, res.newEnd);
            }
          }, 0);
        });
      } else {
        const res = applyFormatting(matchedType, content, start, end);
        setContent(res.text);
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

  // ── Render ────────────────────────────────────────────────────────────────
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', height: '26px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
          {isPreviewMode ? '✨ NOTE PREVIEW' : '✍️ NOTE EDITOR'}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            className="area-btn"
            onClick={() => setIsTagGroupsOpen(true)}
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '10px' }}
          >
            📁 Tag Groups (标签组)
          </button>
          <button
            className="area-btn"
            onClick={() => setIsCustomCommandsOpen(true)}
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '10px' }}
          >
            ⚙️ Commands (自定义命令)
          </button>
          <button
            className="area-btn"
            title="Toggle mode (meta+e)"
            onClick={togglePreviewMode}
            style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '10px' }}
          >
            {isPreviewMode ? 'Edit Note' : 'Preview'}
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
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="Start writing note..."
          spellCheck={false}
          style={{ border: 'none', resize: 'none', overflowY: 'auto' }}
        />
      )}

      {showSlashMenu && filteredCommands.length > 0 && (
        <div
          ref={slashMenuRef}
          style={{
            position: 'absolute',
            left: slashMenuCoords.left,
            top: slashMenuCoords.top,
            width: '320px',
            maxHeight: '200px',
            backgroundColor: 'var(--bg-main)',
            border: '1.2px solid rgba(0, 0, 0, 0.12)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
            overflowY: 'auto',
            zIndex: 1000,
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {filteredCommands.map((cmd: any, idx: number) => {
            const isSelected = idx === slashMenuIndex;
            return (
              <div
                key={cmd.id}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleExecuteCommand(cmd);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--highlight-color)' : 'transparent',
                  color: isSelected ? 'var(--accent-color)' : 'var(--text-main)',
                  transition: 'background-color 0.1s, color 0.1s',
                }}
                onMouseEnter={() => setSlashMenuIndex(idx)}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  backgroundColor: isSelected ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '10px',
                  flexShrink: 0,
                }}>
                  {cmd.icon}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexGrow: 1 }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>{cmd.label}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>{cmd.desc}</span>
                </div>
                {getShortcutDisplay(cmd.id) && (
                  <span style={{ fontSize: '9px', color: 'var(--accent-color)', opacity: 0.8, paddingLeft: '8px', flexShrink: 0, fontWeight: 700 }}>
                    {getShortcutDisplay(cmd.id)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Status Bar */}
      <div className="editor-statusbar">
        <span style={{ flexGrow: 1 }}>{statusMessage}</span>
        <span>{activeTags.length} tags</span>
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
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Drop media to import</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Supports Image, Audio, and Video files</span>
        </div>
      )}

      {isShortcutsModalOpen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            width: '320px',
            maxHeight: '400px',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            color: 'var(--text-main)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
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
              <span style={{ fontWeight: 600 }}>Markdown Shortcuts (快捷键管理)</span>
              <button
                onClick={() => {
                  setIsShortcutsModalOpen(false);
                  setRecordingActionId(null);
                }}
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
            <div style={{ padding: '14px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {MARKDOWN_ACTIONS.map((act) => {
                const currentCombo = editorShortcuts[act.id];
                const isListening = recordingActionId === act.id;
                return (
                  <div
                    key={act.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      backgroundColor: isListening ? 'rgba(255, 59, 48, 0.06)' : 'rgba(0,0,0,0.015)',
                      border: isListening ? '1.2px solid var(--accent-color)' : '1.2px solid var(--border-color)',
                      borderRadius: '5px',
                      transition: 'border-color 0.15s, background-color 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: '11px' }}>{act.label}</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{act.id}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        onClick={() => setRecordingActionId(act.id)}
                        style={{
                          minWidth: '60px',
                          minHeight: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1.2px solid var(--border-color)',
                          backgroundColor: 'var(--bg-main)',
                          cursor: 'pointer',
                          fontSize: '10px',
                          color: isListening ? 'var(--accent-color)' : 'var(--text-main)',
                          transition: 'background-color 0.15s, color 0.15s',
                        }}
                      >
                        {isListening ? (
                          <span style={{ animation: 'pulse 1.2s infinite', fontSize: '9px' }}>Press key...</span>
                        ) : (
                          formatComboVisual(currentCombo)
                        )}
                      </div>
                      {currentCombo !== act.defaultCombo && (
                        <button
                          onClick={() => handleResetShortcut(act.id, act.defaultCombo)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {promptConfig.show && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '85%', borderRadius: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>{promptConfig.title}</span>
            <input
              type="text"
              id="prompt-modal-input-editor"
              defaultValue={promptConfig.defaultValue}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = e.currentTarget.value.trim();
                  promptConfig.onConfirm(val);
                  setPromptConfig(prev => ({ ...prev, show: false }));
                } else if (e.key === 'Escape') {
                  setPromptConfig(prev => ({ ...prev, show: false }));
                }
              }}
              style={{ width: '100%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 8px', borderRadius: '6px', fontSize: '11px', outline: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button
                className="area-btn"
                onClick={() => setPromptConfig(prev => ({ ...prev, show: false }))}
                style={{ height: '24px', fontSize: '10px', padding: '0 10px' }}
              >
                Cancel
              </button>
              <button
                className="area-btn"
                onClick={() => {
                  const input = document.getElementById('prompt-modal-input-editor') as HTMLInputElement;
                  if (input) {
                    promptConfig.onConfirm(input.value.trim());
                  }
                  setPromptConfig(prev => ({ ...prev, show: false }));
                }}
                style={{ height: '24px', fontSize: '10px', padding: '0 10px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {isCustomCommandsOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1100, backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '560px',
            maxHeight: '460px',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            color: 'var(--text-main)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>⚙️ Custom Commands Manager (自定义命令管理)</span>
              <button
                onClick={() => setIsCustomCommandsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', gap: '16px' }}>
              {/* Left Side: List */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', borderRight: '1px solid var(--border-color)', paddingRight: '16px' }}>
                <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)' }}>EXISTING COMMANDS ({customCommands.length})</span>
                {customCommands.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px', padding: '12px 0' }}>No custom commands created yet. Use the form to add one!</div>
                ) : (
                  customCommands.map(cmd => (
                    <div key={cmd.id} style={{ padding: '8px', border: '1.2px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>/{cmd.id.replace('custom.', '')}</span>
                        <button
                          onClick={() => handleDeleteCustomCommand(cmd.id)}
                          style={{ border: 'none', background: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '10px', fontWeight: 600 }}
                        >
                          Delete
                        </button>
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '10.5px' }}>{cmd.label}</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{cmd.desc}</span>
                      <pre style={{ margin: '4px 0 0 0', padding: '4px', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '50px' }}>{cmd.content}</pre>
                    </div>
                  ))
                )}
              </div>

              {/* Right Side: Add Form */}
              <form onSubmit={handleAddCustomCommand} style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)' }}>CREATE NEW COMMAND</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600 }}>Command Name (Label)</label>
                  <input
                    type="text"
                    placeholder="e.g. Signature"
                    value={newCmdLabel}
                    onChange={e => setNewCmdLabel(e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600 }}>Trigger Word (e.g. /sig)</label>
                  <input
                    type="text"
                    placeholder="e.g. sig (no slashes)"
                    value={newCmdTrigger}
                    onChange={e => setNewCmdTrigger(e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600 }}>Description</label>
                  <input
                    type="text"
                    placeholder="Brief description"
                    value={newCmdDesc}
                    onChange={e => setNewCmdDesc(e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                  <label style={{ fontSize: '10px', fontWeight: 600 }}>Content to Insert</label>
                  <textarea
                    placeholder="Text snippet content..."
                    value={newCmdContent}
                    onChange={e => setNewCmdContent(e.target.value)}
                    style={{ flex: 1, minHeight: '80px', padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none', resize: 'none' }}
                  />
                </div>
                <button
                  type="submit"
                  className="area-btn"
                  style={{ height: '26px', backgroundColor: 'var(--accent-color)', color: '#fff', border: 'none', fontWeight: 700 }}
                >
                  Create Command
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {isTagGroupsOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1100, backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: '460px',
            maxHeight: '400px',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            color: 'var(--text-main)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <span style={{ fontWeight: 700, fontSize: '13px' }}>📁 Tag Templates / Groups (标签组模板)</span>
              <button
                onClick={() => setIsTagGroupsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Save Current Tags Form */}
              <form onSubmit={handleSaveTagGroup} style={{ padding: '10px', border: '1.2px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.015)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '11px' }}>Save Current note tags as group</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '4px 0' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Tags to save:</span>
                  {tags.length === 0 ? (
                    <span style={{ fontSize: '10px', fontStyle: 'italic', color: 'var(--text-muted)' }}>No tags on current note. Add some tags first.</span>
                  ) : (
                    tags.map(t => (
                      <span key={`group_save_pill_${t}`} style={{ fontSize: '9px', fontWeight: 600, backgroundColor: 'rgba(0,0,0,0.05)', color: 'var(--text-main)', padding: '1px 5px', borderRadius: '4px' }}>#{t}</span>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Group name (e.g. Daily Review)"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    disabled={tags.length === 0}
                    style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', outline: 'none' }}
                  />
                  <button
                    type="submit"
                    className="area-btn"
                    disabled={tags.length === 0}
                    style={{ height: '24px', fontSize: '10.5px', padding: '0 12px', whiteSpace: 'nowrap' }}
                  >
                    Save Group
                  </button>
                </div>
              </form>

              {/* Groups List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
                <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)' }}>SAVED TAG GROUPS</span>
                {Object.keys(tagGroups).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11px', padding: '12px 0' }}>No tag groups saved. Create one above!</div>
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
                          className="area-btn"
                          style={{ height: '22px', fontSize: '10px', padding: '0 8px' }}
                        >
                          Add (增量)
                        </button>
                        <button
                          onClick={() => handleDeleteTagGroup(name)}
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
      )}
    </div>
  );
}
