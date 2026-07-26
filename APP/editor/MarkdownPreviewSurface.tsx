import React from 'react';
import { parseMarkdownIntoBlocks, type ParsedBlock } from './markdownBlockParser';
import { SlashMenu } from './SlashMenu';
import { createInlineRenderer } from './markdownInlineRenderer';
import { MarkdownTableBlock } from './MarkdownTableBlock';
import { MarkdownCodeMathBlock } from './MarkdownCodeMathBlock';
import { MarkdownTextBlock } from './MarkdownTextBlock';

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
  } = props;

const blocks = parseMarkdownIntoBlocks(content);

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

const beginEditingLineFromClick = (e: React.MouseEvent, lineIdx: number) => {
  const target = e.target as HTMLElement | null;
  if (
    suppressClickAfterDragRef.current ||
    target?.closest('button, input, textarea, select, a, video, audio, img, .inline-clip-player, [contenteditable="true"]')
  ) {
    e.stopPropagation();
    return;
  }
  beginEditingLine(lineIdx);
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
      <div style={{ flex: 1, minWidth: 0 }}>
        {element}
      </div>
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
  slashCommands,
  state,
  updateBloodKey,
});
return (
  <div
    ref={previewContainerRef}
    className="markdown-preview-container"
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
    <style dangerouslySetInnerHTML={{ __html: `
      .preview-block-wrapper {
        position: relative;
        width: 100%;
        padding-left: 20px;
        margin-left: -20px;
        cursor: grab;
      }
      .markdown-preview-container {
        font-size: var(--editor-font-size, 14px);
        line-height: var(--editor-line-height, 1.6);
        font-family: var(--editor-font-family, var(--font-sans));
      }
      .galois-math-inline {
        display: inline-block;
        max-width: 100%;
        vertical-align: middle;
      }
      .galois-math-display {
        display: block;
        width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        text-align: center;
      }
      .galois-math-display > .katex-display {
        margin: 0.45em 0;
      }
      .preview-block-wrapper:active {
        cursor: grabbing;
      }
      .preview-block-wrapper:hover .drag-handle {
        opacity: 0.5 !important;
      }
      .drag-handle:hover {
        opacity: 1 !important;
        color: var(--accent-color, #7000ff) !important;
      }
      .drag-handle {
        user-select: none;
        -webkit-user-drag: element;
      }
      .wiki-link:hover {
        opacity: 0.8;
      }
      .media-delete-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: rgba(255, 59, 48, 0.12);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 59, 48, 0.25);
        color: #ff3b30;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transform: scale(0.9);
        transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s, color 0.2s, box-shadow 0.2s;
        z-index: 100;
      }
      .preview-block-wrapper:hover .media-delete-btn {
        opacity: 1;
        transform: scale(1);
      }
      .media-delete-btn:hover {
        background: #ff3b30;
        color: #ffffff;
        border-color: transparent;
        box-shadow: 0 4px 12px rgba(255, 59, 48, 0.4);
      }
      .reading-table-shell:hover .reading-table-toolbar {
        opacity: 1 !important;
      }
      .reading-table-toolbar button:hover {
        color: var(--accent-color, #7000ff) !important;
        border-color: var(--accent-color, #7000ff) !important;
        background: var(--highlight-color, rgba(112, 0, 255, 0.08)) !important;
      }
      .reading-buffer-row {
        min-height: 34px;
        margin: 4px 0;
        border-radius: 8px;
        border: 1px dashed transparent;
        display: flex;
        align-items: center;
        padding: 0 12px;
        opacity: 0.38;
        cursor: text;
        transition: border-color 0.14s ease, background-color 0.14s ease, opacity 0.14s ease;
      }
      .reading-buffer-row:hover,
      .reading-buffer-row.is-over {
        opacity: 1;
        border-color: var(--accent-color, #7000ff);
        background: rgba(112, 0, 255, 0.06);
      }
    ` }} />
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
