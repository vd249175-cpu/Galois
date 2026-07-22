import React from 'react';
import { EditorHeader } from './EditorHeader';
import { TagToolbar } from './TagToolbar';
import { MarkdownPreview } from './MarkdownPreview';
import { SlashMenu } from './SlashMenu';
import { ShortcutsModal } from './ShortcutsModal';
import { PromptModal } from './PromptModal';
import { CustomCommandsModal } from './CustomCommandsModal';
import { TagGroupsModal } from './TagGroupsModal';
import { BC } from '../../CORE/BloodChannels';
import { parseFrontmatterTags } from '../utils';

const LiveMarkdownEditor = React.lazy(async () => {
  const mod = await import('./LiveMarkdownEditor');
  return { default: mod.LiveMarkdownEditor };
});

export function EditorSurface(props: any) {
  const { activeTags, allCommands, allManageableActions, allProjectTags, areaId, content, currentFile,
    customCommands, editorMode, editorShortcuts, expandedRule, filteredCommands, getShortcutDisplay,
    handleAddCustomCommand, handleAddTag, handleDeleteCustomCommand, handleDeleteTagGroup, handleDragEnter,
    handleDragLeave, handleDragOver, handleDropAtIndex, handleEditorDrop, handleExecuteCommand, handleFocus,
    handleKeyDown, handleLineDrop, handleLinkClick, handlePasteAtIndex, handlePreviewContentChange,
    handleRemoveTag, handleRenameCurrentFile, handleResetShortcut, handleToggleAudioRecording, handleUpdateTagGroups,
    handleUpdateTags, handleSaveTagGroup, hoveredLineIndex, isCustomCommandsOpen, isDraggingFile,
    isLivePreviewMode, isReadingMode, isRecordingAudio, isShortcutsModalOpen, isTagGroupsOpen,
    lastHistoryContentRef, markHistoryContent, modeLabel, modeOptions, newTagInput, projectPath, promptConfig,
    pushStateToUndoStack, recordingActionId, ruleMatches, setContent,
    setExpandedRule, setIsCustomCommandsOpen, setIsTagGroupsOpen, setHoveredLineIndex, setNewTagInput,
    setRecordingActionId, setSlashMenuIndex, setSlashMenuQuery,
    setShowSlashMenu, setTags, setPromptConfig, slashIndex, slashMenuCoords, slashMenuIndex, showSlashMenu,
    state, statusMessage, tagGroups, tags, textareaRef, updateBloodKey, updateCursorState,
    historyTimerRef, isComposingRef, setIsShortcutsModalOpen, switchEditorMode } = props;

return (
  <div
    className="code-editor"
    onDragEnter={handleDragEnter}
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleEditorDrop}
    style={{ position: 'relative' }}
  >
    <EditorHeader
      currentFile={currentFile}
      editorMode={editorMode}
      isRecordingAudio={isRecordingAudio}
      modeLabel={modeLabel}
      modeOptions={modeOptions}
      onRename={handleRenameCurrentFile}
      onSetCustomCommandsOpen={setIsCustomCommandsOpen}
      onSetTagGroupsOpen={setIsTagGroupsOpen}
      onToggleAudioRecording={handleToggleAudioRecording}
      onSwitchMode={switchEditorMode}
    />

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
                setTags((prev: string[]) => {
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
          setPromptConfig((prev: any) => ({ ...prev, show: false }));
      }}
        onCancel={() => setPromptConfig((prev: any) => ({ ...prev, show: false }))}
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
