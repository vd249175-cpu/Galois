import React from 'react';
import { parseMarkdownIntoBlocks, type ParsedBlock } from './markdownBlockParser';
import { SlashMenu } from './SlashMenu';
import { createInlineRenderer } from './markdownInlineRenderer';
import { MarkdownTableBlock } from './MarkdownTableBlock';
import { MarkdownCodeMathBlock } from './MarkdownCodeMathBlock';
import { MarkdownTextBlock } from './MarkdownTextBlock';
import { useReadingInteractions } from './useReadingInteractions';
import { readingPreviewStyles } from './readingPreviewStyles';

export function MarkdownPreviewSurface(props: any) {
  const {
    activeCell, areaId, beginEditingLine, content, countTrailingEmptyLines,
    currentFile, editingLineIdx, embedded, executePreviewSlashCommand, focusTableCell,
    getAbsoluteIndex, getShortcutDisplay, handleAddTableColumn, handleAddTableRow,
    handleDeleteTableColumn, handleDeleteTableRow, handleDropAtIndex, handleLineDrop, handleLinkClick,
    handlePasteAtIndex, handleTableCellEdit, handleTableCellKeyDown, hoveredLineIndex, isDraggingOverBottom,
    isPreviewMode, openTrailingEditableLine, persistReadingScroll, previewContainerRef, previewSlashMenu,
    projectPath, renderBlockEditor, setActiveCell, setDraggedBlockKey, setHoveredLineIndex,
    setIsDraggingOverBottom, setPreviewSlashMenu, slashCommands, state,
    suppressClickAfterDragRef, toggleTaskCheckbox, updateBloodKey, updateMarkdownLines,
    draggedBlockKey, filteredPreviewCommands, onContentChange, setEditingLineIdx,
    selectedBlockRange, setSelectedBlockRange, selectedMedia, setSelectedMedia,
  } = props;

const blocks = parseMarkdownIntoBlocks(content);
const readingInteractions = useReadingInteractions({
  beginEditingLine,
  blocks,
  content,
  onContentChange,
  selectedBlockRange,
  selectedMedia,
  setSelectedBlockRange,
  setSelectedMedia,
});

const handleDeleteBlock = (block: ParsedBlock) => {
  const allLines = content.split('\n');
  allLines.splice(block.startLine, block.endLine - block.startLine + 1);
  onContentChange(allLines.join('\n'));
};

const shouldTreatBlockAsMedia = (rawText: string) => {
  const trimText = rawText.trim();
  return (
    (trimText.startsWith('![') && trimText.endsWith(')')) ||
    (trimText.startsWith('@video[') && trimText.endsWith(')'))
  );
};

const finishBlockDrag = () => {
  setDraggedBlockKey(null);
  setHoveredLineIndex(null);
  setIsDraggingOverBottom(false);
  suppressClickAfterDragRef.current = true;
  window.setTimeout(() => {
    suppressClickAfterDragRef.current = false;
  }, 180);
};

const beginEditingLineFromClick = (e: React.MouseEvent, lineIdx: number, rawText = content.split('\n')[lineIdx] || '') => {
  const target = e.target as HTMLElement | null;
  if (
    suppressClickAfterDragRef.current ||
    target?.closest('button, input, textarea, select, a, video, audio, img, .inline-clip-player, [contenteditable="true"]')
  ) {
    e.stopPropagation();
    return;
  }
  readingInteractions.beginEditingLineFromClick(e, lineIdx, rawText);
};

const handleMediaSelect = (lineIdx: number, tokenIndex: number, markdown: string) => {
  setSelectedBlockRange(null);
  setSelectedMedia({ lineIdx, tokenIndex, markdown });
  previewContainerRef.current?.focus({ preventScroll: true });
};

const handleMediaDragStart = (
  e: React.DragEvent,
  lineIdx: number,
  tokenIndex: number,
  markdown: string
) => {
  e.stopPropagation();
  setDraggedBlockKey(`media:${lineIdx}:${tokenIndex}`);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/x-dnote-media-token', markdown);
  e.dataTransfer.setData('text/x-dnote-media-source-line', String(lineIdx));
  e.dataTransfer.setData('text/x-dnote-media-source-index', String(tokenIndex));
  e.dataTransfer.setData('text/plain', markdown);
};

const wrapBlock = (element: React.ReactNode, block: ParsedBlock) => {
  if (!isPreviewMode) return <React.Fragment key={block.key}>{element}</React.Fragment>;

  const isCurrentlyDragged = draggedBlockKey === block.key;

  const isMedia = shouldTreatBlockAsMedia(block.rawText);
  const isDeletable = isMedia || block.type === 'code';
  const startBlockDrag = (e: React.DragEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select, a, video, audio, .inline-clip-player, [contenteditable="true"]')) {
      e.preventDefault();
      return;
    }
    if (window.getSelection()?.toString()) {
      e.preventDefault();
      return;
    }
    setDraggedBlockKey(block.key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-dnote-block-line', String(block.startLine));
    e.dataTransfer.setData('text/plain', block.rawText);
  };

  return (
    <div
      key={block.key}
      className="preview-block-wrapper"
      data-dnote-block-start={block.startLine}
      data-dnote-block-end={block.endLine}
      data-dnote-block-selected={readingInteractions.isBlockSelected(block) ? 'true' : undefined}
      data-dnote-block-editing={editingLineIdx === block.startLine ? 'true' : undefined}
      draggable={isMedia}
      onDragStart={startBlockDrag}
      onDragEnd={finishBlockDrag}
      {...getLineDragProps(block)}
      style={getLineStyle(block, {
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        position: 'relative',
        opacity: isCurrentlyDragged ? 0.35 : 1,
      })}
      onClick={(e) => {
        // Prevent click from bubbling to the container click handler
        e.stopPropagation();
      }}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          startBlockDrag(e);
        }}
        onDragEnd={finishBlockDrag}
        className="drag-handle"
        style={{
          position: 'absolute',
          left: '-20px',
          top: '50%',
          transform: 'translateY(-50%)',
          cursor: 'grab',
          opacity: 0,
          transition: 'opacity 0.2s',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-muted, #888)',
          fontSize: '14px',
          zIndex: 10,
          width: '16px',
          justifyContent: 'center',
        }}
        title="拖拽以移动此区块"
      >
        ⣿
      </div>
      <div data-dnote-block-content style={{ flex: 1, minWidth: 0 }}>
        {element}
      </div>
      {isMedia && (
        <button
          type="button"
          draggable={false}
          className="media-copy-btn"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => {
            e.stopPropagation();
            void window.electronAPI?.writeClipboardText?.(block.rawText);
          }}
          title="复制此媒体的 Markdown"
        >
          ⧉
        </button>
      )}
      {isDeletable && (
        <button type="button" draggable={false}
          className="media-delete-btn"
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteBlock(block);
          }}
          title={block.type === 'table' ? "删除此表格" : block.type === 'code' ? "删除此代码块" : "清除此媒体文件"}
        >
          ✕
        </button>
      )}
    </div>
  );
};

const getLineDragProps = (block: ParsedBlock) => {
  if (!isPreviewMode) return {};
  return {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (
        draggedBlockKey ||
        e.dataTransfer.types.includes('Files') ||
        e.dataTransfer.types.includes('text/x-dnote-clip')
      ) {
        setHoveredLineIndex(block.startLine);
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
        setHoveredLineIndex((prev: number | null) => (prev === block.startLine ? null : prev));
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedBlockKey || e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/x-dnote-clip')) {
        setHoveredLineIndex(block.startLine);
      }
    },
    onDrop: (e: React.DragEvent) => {
      handleLineDrop(e, block.startLine);
      setDraggedBlockKey(null);
      setHoveredLineIndex(null);
    }
  };
};

const getLineStyle = (block: ParsedBlock, baseStyle: React.CSSProperties = {}): React.CSSProperties => {
  if (isPreviewMode && hoveredLineIndex === block.startLine) {
    return {
      ...baseStyle,
      borderBottom: '3px solid var(--accent-color, #7000ff)',
      backgroundColor: 'rgba(112, 0, 255, 0.05)',
      transition: 'all 0.1s ease',
    };
  }
  return baseStyle;
};

const renderParsedBlock = (block: ParsedBlock, idx: number) => {
  const contentVal = block.rawText;
  const isEditing = editingLineIdx === block.startLine;

  if (block.type === 'code' || block.type === 'math') {
    return (
      <MarkdownCodeMathBlock
        beginEditingLineFromClick={beginEditingLineFromClick}
        block={block}
        content={content}
        getAbsoluteIndex={getAbsoluteIndex}
        handlePasteAtIndex={handlePasteAtIndex}
        idx={idx}
        isEditing={isEditing}
        setEditingLineIdx={setEditingLineIdx}
        updateMarkdownLines={updateMarkdownLines}
        wrapBlock={wrapBlock}
      />
    );
  }

  if (block.type === 'table') {
    return (
      <MarkdownTableBlock
        activeCell={activeCell}
        block={block}
        focusTableCell={focusTableCell}
        handleAddTableColumn={handleAddTableColumn}
        handleAddTableRow={handleAddTableRow}
        handleDeleteBlock={handleDeleteBlock}
        handleDeleteTableColumn={handleDeleteTableColumn}
        handleDeleteTableRow={handleDeleteTableRow}
        handleTableCellEdit={handleTableCellEdit}
        handleTableCellKeyDown={handleTableCellKeyDown}
        idx={idx}
        renderInline={renderInline}
        setActiveCell={setActiveCell}
        wrapBlock={wrapBlock}
      />
    );
  }
  return (
    <MarkdownTextBlock
      beginEditingLineFromClick={beginEditingLineFromClick}
      block={block}
      contentVal={contentVal}
      idx={idx}
      isEditing={isEditing}
      renderBlockEditor={renderBlockEditor}
      renderInline={renderInline}
      shouldTreatBlockAsMedia={shouldTreatBlockAsMedia}
      toggleTaskCheckbox={toggleTaskCheckbox}
      wrapBlock={wrapBlock}
    />
  );
};

const renderInline = createInlineRenderer({
  areaId,
  beginEditingLine,
  currentFile,
  getShortcutDisplay,
  handleLinkClick,
  projectPath,
  isMediaSelected: (lineIdx: number, tokenIndex: number, markdown: string) => (
    selectedMedia?.lineIdx === lineIdx && selectedMedia.tokenIndex === tokenIndex && selectedMedia.markdown === markdown
  ),
  onMediaDragStart: handleMediaDragStart,
  onMediaSelect: handleMediaSelect,
  slashCommands,
  state,
  updateBloodKey,
});
return (
  <div
    ref={previewContainerRef}
    className="markdown-preview-container"
    tabIndex={0}
    onCopy={readingInteractions.onCopy}
    onKeyDown={readingInteractions.onKeyDown}
    onPointerDownCapture={readingInteractions.onPointerDownCapture}
    onPointerMoveCapture={readingInteractions.onPointerMoveCapture}
    onPointerUpCapture={readingInteractions.onPointerUpCapture}
    onScroll={persistReadingScroll}
    onDragOver={(e) => {
      e.preventDefault();
      const hasClip = e.dataTransfer.types.includes('text/x-dnote-clip');
      const hasFile = e.dataTransfer.types.includes('Files');
      if (hasClip || hasFile) {
        setIsDraggingOverBottom(true);
      }
    }}
    onDragLeave={() => {
      setIsDraggingOverBottom(false);
    }}
    onDrop={async (e) => {
      e.preventDefault();
      setIsDraggingOverBottom(false);

      const clipText = e.dataTransfer.getData('text/x-dnote-clip');
      if (clipText) {
        const nextContent = content + '\n' + clipText + '\n';
        onContentChange(nextContent);
        return;
      }

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const allLines = content.split('\n');
        handleLineDrop(e, allLines.length - 1);
      }
    }}
    onDoubleClick={(e) => {
      if (e.target === e.currentTarget) {
        const allLines = content.split('\n');
        const lastLineIdx = allLines.length - 1;
        if (allLines[lastLineIdx].trim() !== '') {
          updateMarkdownLines(lastLineIdx, lastLineIdx, [allLines[lastLineIdx], '']);
          beginEditingLine(lastLineIdx + 1);
        } else {
          beginEditingLine(lastLineIdx);
        }
      }
    }}
    style={{
      flexGrow: embedded ? 0 : 1,
      overflowY: embedded ? 'visible' : 'auto',
      padding: embedded ? '8px 4px 4px' : '20px 40px',
      backgroundColor: 'transparent',
      color: 'var(--text-main)',
      fontSize: 'var(--editor-font-size, 14px)',
      lineHeight: 'var(--editor-line-height, 1.6)',
      fontFamily: 'var(--editor-font-family, var(--font-sans))',
      userSelect: 'text',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      height: embedded ? 'auto' : 0,
      minHeight: embedded ? 'min-content' : 0,
      width: '100%',
      boxSizing: 'border-box',
    }}
  >
    <style dangerouslySetInnerHTML={{ __html: readingPreviewStyles }} />
    {content ? (
      blocks.map((block, idx) => renderParsedBlock(block, idx))
    ) : (
      <div
        onDoubleClick={() => openTrailingEditableLine(0)}
        style={{ minHeight: '20px', cursor: 'text' }}
      />
    )}
    {Array.from({ length: Math.max(0, 4 - countTrailingEmptyLines()) }).map((_, row) => {
      const lines = content ? content.split('\n') : [''];
      const insertAfterLine = Math.max(lines.length - 1 + row, -1);
      const insertIndex = content.length;
      const isOver = hoveredLineIndex === insertAfterLine || (row === 0 && isDraggingOverBottom);
      return (
        <div
          key={`reading_buffer_row_${row}`}
          className={`reading-buffer-row${isOver ? ' is-over' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            openTrailingEditableLine(row);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            openTrailingEditableLine(row);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setHoveredLineIndex(insertAfterLine);
            setIsDraggingOverBottom(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
              setHoveredLineIndex((prev: number | null) => (prev === insertAfterLine ? null : prev));
            setIsDraggingOverBottom(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOverBottom(false);
            setHoveredLineIndex(null);
            const hasLinePayload =
              e.dataTransfer.files.length > 0 ||
              e.dataTransfer.types.includes('text/x-dnote-clip') ||
              e.dataTransfer.getData('text/x-dnote-block-line') !== '';
            if (hasLinePayload) {
              handleLineDrop(e, insertAfterLine);
            } else {
              handleDropAtIndex(e, insertIndex);
            }
          }}
          title="点击编辑，或拖入媒体/区块插入到这里"
        />
      );
    })}
    <SlashMenu
      show={previewSlashMenu.show}
      filteredCommands={filteredPreviewCommands}
      slashMenuIndex={previewSlashMenu.index}
        setSlashMenuIndex={(index) => setPreviewSlashMenu((prev: any) => ({ ...prev, index }))}
      slashMenuCoords={previewSlashMenu.coords}
      handleExecuteCommand={executePreviewSlashCommand}
      getShortcutDisplay={getShortcutDisplay}
    />
  </div>
);
}
