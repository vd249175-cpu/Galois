import { useEffect, useState, useRef } from 'react';
import { extractBodyHashtags, parseFrontmatterTags } from '../utils';
import { updateYamlFrontmatterTags } from './editorUtils';
import { useMediaDrop } from './hooks/useMediaDrop';
import { useLinkNavigator } from './hooks/useLinkNavigator';
import { BC } from '../../CORE/BloodChannels';

import { useEditorHistory } from './hooks/useEditorHistory';
import { useRuntimeSync } from './hooks/useRuntimeSync';
import { useExternalFileSync } from './hooks/useExternalFileSync';
import { useProjectCommands } from './hooks/useProjectCommands';
import type { EditorTextHandle } from './LiveMarkdownEditor';
import { applyMarkdownFormatting } from './markdownEditing';
import { useEditorTagGroups } from './useEditorTagGroups';
import { useEditorCommandRegistration } from './useEditorCommandRegistration';
import { useSlashCommands } from './useSlashCommands';
import { useEditorTagResolution } from './useEditorTagResolution';
import { useEditorFileLoader } from './useEditorFileLoader';
import { useEditorCursorRestore } from './useEditorCursorRestore';
import { useAudioRecording } from './useAudioRecording';
import { useEditorTags } from './useEditorTags';
import { useEditorFileActions } from './useEditorFileActions';
import { useEditorKeyboard } from './useEditorKeyboard';
import { useImmediateScripts } from './useImmediateScripts';
import { useEditorCommands } from './useEditorCommands';
import { useEditorCursorState } from './useEditorCursorState';
import { useEditorUiState } from './useEditorUiState';
import { useEditorContentActions } from './useEditorContentActions';
import { EditorSurface } from './EditorSurface';
import { useEditorLifecycle } from './useEditorLifecycle';
import { useEditorShortcutActions } from './useEditorShortcutActions';
import { getInitialEditorMode, type EditorMode, useEditorSurfaceControls } from './useEditorSurfaceControls';

export type { EditorMode } from './useEditorSurfaceControls';

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

  const {
    customCommands, editorShortcuts, isShortcutsModalOpen, promptConfig, recordingActionId,
    setCustomCommands, setEditorShortcuts, setIsShortcutsModalOpen, setPromptConfig, setRecordingActionId, showPrompt,
  } = useEditorUiState();

  useEditorCommandRegistration({ customCommands, editorShortcuts, projectCommands, setStatusMessage });

  const {
    allProjectTags, getShortcutDisplay, handleAddCustomCommand, handleDeleteCustomCommand,
    handleDeleteTagGroup, handleSaveTagGroup, handleUpdateTagGroups, isCustomCommandsOpen,
    isTagGroupsOpen, setIsCustomCommandsOpen, setIsTagGroupsOpen, tagGroups,
  } = useEditorTagGroups({ customCommands, editorShortcuts, setCustomCommands, setStatusMessage, state, tags });

  const {
    allCommands, filteredCommands, rememberSlashCommandUse, setShowSlashMenu, setSlashIndex,
    setSlashMenuCoords, setSlashMenuIndex, setSlashMenuQuery, showSlashMenu, slashIndex, slashMenuCoords,
    slashMenuIndex,
  } = useSlashCommands({ customCommands, projectCommands });
  const applyFormatting = applyMarkdownFormatting;

  const { getEditorCaretCoordinates, handleExecuteCommand, handleExecuteProjectCommand } = useEditorCommands({
    applyFormatting, content, currentFile, markHistoryContent, projectCommands, projectPath,
    pushStateToUndoStack, rememberSlashCommandUse, saveNodeFile, setContent, setIsCustomCommandsOpen,
    setShowSlashMenu, setStatusMessage, showPrompt, showSlashMenu, slashIndex, textareaRef, updateBloodKey,
  });
  const { allManageableActions, handleResetShortcut } = useEditorShortcutActions({
    customCommands, projectCommands, setEditorShortcuts,
  });

  // ── Immediate Script execution in edit mode ──────────────────────────────
  const { triggerImmediateScripts } = useImmediateScripts({
    areaId, currentFile, projectPath, setStatusMessage, triggeredImmediateRefs, updateBloodKey,
  });
  // ── MediaDrop ─────────────────────────────────────────────────────────────
  const { handlePreviewContentChange, insertTextAtCurrentCursor, setContentFromDrop } = useEditorContentActions({
    contentRef, markHistoryContent, pushStateToUndoStack, saveNodeFile, setContent, textareaRef,
  });

  const { handleToggleAudioRecording } = useAudioRecording({
    currentFile, insertTextAtCurrentCursor, isRecordingAudio, mediaRecorderRef, projectPath,
    recordingChunksRef, recordingStreamRef, setIsRecordingAudio, setStatusMessage,
  });

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

  const fileSavedEvent = state[BC.events.fileSaved(openedFile)] || 0;
  useEditorFileLoader({
    areaId, contentRef, fileSavedEvent, lastSavedContentRef, mergeInlineTagsIntoFrontmatter,
    openedFile, setContent, setCurrentFile, setEditorMode, setStatusMessage, setTags, updateBloodKey,
  });

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

  useEditorCursorRestore({ areaId, content, currentFile, editorMode, projectPath, restoredCursorForFileRef, state, textareaRef });

  useEditorTagResolution({ content, currentFile, projectPath, setActiveTags, setRuleMatches, state, tags });
  // ── Tag update helper ──────────────────────────────────────────────────
  const { handleAddTag, handleRemoveTag, handleUpdateTags } = useEditorTags({
    contentRef, currentFile, lastSavedContentRef, markHistoryContent, newTagInput,
    pushStateToUndoStack, setContent, setNewTagInput, setStatusMessage, setTags, tags, textareaRef, updateBloodKey,
  });
  const { handleDeleteCurrentFile, handleRenameCurrentFile, handleSetAsTemplate } = useEditorFileActions({
    contentRef, currentFile, projectPath, setStatusMessage, showPrompt, state, updateBloodKey,
  });

  const { handleFocus, updateCursorState } = useEditorCursorState({
    areaId, contentRef, currentFile, projectPath, textareaRef, updateBloodKey,
  });
  const { handleKeyDown } = useEditorKeyboard({
    applyFormatting, areaId, content, editorShortcuts, filteredCommands, getEditorCaretCoordinates,
    handleExecuteCommand, handleRedo, handleUndo, isFocused, isReadingMode, markHistoryContent,
    pushStateToUndoStack, saveNodeFile, setContent, setShowSlashMenu, setSlashIndex, setSlashMenuCoords,
    setSlashMenuIndex, setSlashMenuQuery, showPrompt, showSlashMenu, slashMenuIndex, textareaRef,
  });
  const { cycleEditorMode, handleEditorDrop, modeLabel, modeOptions, switchEditorMode } = useEditorSurfaceControls({
    editorMode, handleDrop, handleDropAtIndex, isReadingMode, setEditorMode, textareaRef,
  });
  useEditorLifecycle({
    areaId, autoSaveTimerRef, content, currentFile, customCommands, cycleEditorMode,
    handleDeleteCurrentFile, handleExecuteCommand, handleExecuteProjectCommand,
    handleSetAsTemplate, isComposingRef, isFocused, isReadingMode, lastAction,
    lastSavedContentRef, projectCommands, recordingActionId, saveNodeFile,
    setEditorShortcuts, setIsShortcutsModalOpen, setRecordingActionId, updateBloodKey,
  });
  return (
    <EditorSurface
        activeTags={activeTags}
        allCommands={allCommands}
        allManageableActions={allManageableActions}
        allProjectTags={allProjectTags}
        areaId={areaId}
        content={content}
        currentFile={currentFile}
        customCommands={customCommands}
        editorMode={editorMode}
        editorShortcuts={editorShortcuts}
        expandedRule={expandedRule}
        filteredCommands={filteredCommands}
        getShortcutDisplay={getShortcutDisplay}
        handleAddCustomCommand={handleAddCustomCommand}
        handleAddTag={handleAddTag}
        handleDeleteCustomCommand={handleDeleteCustomCommand}
        handleDeleteTagGroup={handleDeleteTagGroup}
        handleDragEnter={handleDragEnter}
        handleDragLeave={handleDragLeave}
        handleDragOver={handleDragOver}
        handleDropAtIndex={handleDropAtIndex}
        handleEditorDrop={handleEditorDrop}
        handleExecuteCommand={handleExecuteCommand}
        handleFocus={handleFocus}
        handleKeyDown={handleKeyDown}
        handleLineDrop={handleLineDrop}
        handleLinkClick={handleLinkClick}
        handlePasteAtIndex={handlePasteAtIndex}
        handlePreviewContentChange={handlePreviewContentChange}
        handleRemoveTag={handleRemoveTag}
        handleRenameCurrentFile={handleRenameCurrentFile}
        handleResetShortcut={handleResetShortcut}
        handleToggleAudioRecording={handleToggleAudioRecording}
        handleSaveTagGroup={handleSaveTagGroup}
        switchEditorMode={switchEditorMode}
        setIsShortcutsModalOpen={setIsShortcutsModalOpen}
        handleUpdateTagGroups={handleUpdateTagGroups}
        handleUpdateTags={handleUpdateTags}
        hoveredLineIndex={hoveredLineIndex}
        isCustomCommandsOpen={isCustomCommandsOpen}
        isDraggingFile={isDraggingFile}
        isLivePreviewMode={isLivePreviewMode}
        isReadingMode={isReadingMode}
        isRecordingAudio={isRecordingAudio}
        isShortcutsModalOpen={isShortcutsModalOpen}
        isTagGroupsOpen={isTagGroupsOpen}
        lastHistoryContentRef={lastHistoryContentRef}
        markHistoryContent={markHistoryContent}
        modeLabel={modeLabel}
        modeOptions={modeOptions}
        newTagInput={newTagInput}
        projectPath={projectPath}
        promptConfig={promptConfig}
        pushStateToUndoStack={pushStateToUndoStack}
        recordingActionId={recordingActionId}
        ruleMatches={ruleMatches}
        setContent={setContent}
        setExpandedRule={setExpandedRule}
        setIsCustomCommandsOpen={setIsCustomCommandsOpen}
        setIsTagGroupsOpen={setIsTagGroupsOpen}
        setHoveredLineIndex={setHoveredLineIndex}
        setNewTagInput={setNewTagInput}
        setRecordingActionId={setRecordingActionId}
        setSlashIndex={setSlashIndex}
        setSlashMenuCoords={setSlashMenuCoords}
        setSlashMenuIndex={setSlashMenuIndex}
        setSlashMenuQuery={setSlashMenuQuery}
        setShowSlashMenu={setShowSlashMenu}
        setTags={setTags}
        setPromptConfig={setPromptConfig}
        slashIndex={slashIndex}
        slashMenuCoords={slashMenuCoords}
        slashMenuIndex={slashMenuIndex}
        showSlashMenu={showSlashMenu}
        state={state}
        statusMessage={statusMessage}
        tagGroups={tagGroups}
        tags={tags}
        textareaRef={textareaRef}
        updateBloodKey={updateBloodKey}
        updateCursorState={updateCursorState}
        historyTimerRef={historyTimerRef}
        isComposingRef={isComposingRef}
    />
  );
}
