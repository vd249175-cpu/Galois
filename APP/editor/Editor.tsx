import { useEffect, useState, useRef } from 'react';
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

  // ── 7. lastAction handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lastAction) return;
    if (lastAction.id === 'editor.save') saveNodeFile();
    else if (lastAction.id === 'editor.toggleMode') togglePreviewMode();
    else if (lastAction.id === 'editor.delete') handleDeleteCurrentFile();
  }, [lastAction]);

  const handleFocus = () => {
    updateBloodKey(BC.system.focusedAreaId, areaId);
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
        <button
          className="area-btn"
          title="Toggle mode (meta+e)"
          onClick={togglePreviewMode}
          style={{ width: 'auto', height: '18px', padding: '0 8px', fontSize: '10px' }}
        >
          {isPreviewMode ? 'Edit Note' : 'Preview'}
        </button>
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
          }}
          onFocus={handleFocus}
          placeholder="Start writing note..."
          spellCheck={false}
          style={{ border: 'none', resize: 'none', overflowY: 'auto' }}
        />
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
    </div>
  );
}
