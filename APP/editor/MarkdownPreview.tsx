import React, { useEffect, useRef, useState } from 'react';
import { parseMarkdownIntoBlocks, type ParsedBlock } from './markdownBlockParser';
import { SlashMenu } from './SlashMenu';
import { addTableColumn, deleteTableColumn, deleteTableRow, insertTableRow } from './tableEditing';
import { handleSmartEnter, handleSmartTab } from './markdownEditing';
import { filterAndRankSlashCommands } from './slashCommandSearch';
import { createInlineRenderer } from './markdownInlineRenderer';
import { MarkdownTableBlock } from './MarkdownTableBlock';
import { MarkdownCodeMathBlock } from './MarkdownCodeMathBlock';
import { MarkdownTextBlock } from './MarkdownTextBlock';

interface MarkdownPreviewProps {
  content: string;
  onContentChange: (newContent: string) => void;
  areaId: string;
  projectPath: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  handleLinkClick: (targetNodeText: string) => void;
  isPreviewMode: boolean;
  hoveredLineIndex: number | null;
  setHoveredLineIndex: React.Dispatch<React.SetStateAction<number | null>>;
  handleLineDrop: (e: React.DragEvent, lineIdx: number) => void;
  handleDropAtIndex: (e: React.DragEvent, insertIndex: number) => void;
  handlePasteAtIndex: (e: React.ClipboardEvent, insertIndex: number, sourceContent?: string) => void;
  currentFile: string;
  slashCommands?: any[];
  getShortcutDisplay?: (id: string) => string;
  onExecuteSlashCommand?: (cmd: any, start: number, end: number, sourceContent?: string) => void;
  embedded?: boolean;
}

export function MarkdownPreview({
  content,
  onContentChange,
  areaId,
  projectPath,
  state,
  updateBloodKey,
  handleLinkClick,
  isPreviewMode,
  hoveredLineIndex,
  setHoveredLineIndex,
  handleLineDrop,
  handleDropAtIndex,
  handlePasteAtIndex,
  currentFile,
  slashCommands = [],
  getShortcutDisplay = () => '',
  onExecuteSlashCommand,
  embedded = false,
}: MarkdownPreviewProps) {
  const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<{ lineIdx: number; colIdx: number } | null>(null);
  const [draggedBlockKey, setDraggedBlockKey] = useState<string | null>(null);
  const [isDraggingOverBottom, setIsDraggingOverBottom] = useState(false);
  const [previewSlashMenu, setPreviewSlashMenu] = useState<{
    show: boolean;
    query: string;
    index: number;
    coords: { left: number; top: number };
    start: number;
    end: number;
  }>({ show: false, query: '', index: 0, coords: { left: 0, top: 0 }, start: -1, end: -1 });
  const isJumpingToNextLineRef = useRef(false);
  const pendingCaretPosRef = useRef<number | null>(null);
  const previewSlashDraftRef = useRef<string | null>(null);
  const isExecutingPreviewSlashRef = useRef(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const editingDraftRef = useRef<{ lineIdx: number; value: string } | null>(null);
  const suppressClickAfterDragRef = useRef(false);
  const readingScrollKey = projectPath && currentFile
    ? `galois_reading_scroll:${projectPath}:${currentFile}`
    : '';

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container || !readingScrollKey) return;
    const saved = Number(localStorage.getItem(readingScrollKey) || 0);
    requestAnimationFrame(() => {
      container.scrollTop = Number.isFinite(saved) ? saved : 0;
    });
  }, [readingScrollKey]);

  const persistReadingScroll = () => {
    const container = previewContainerRef.current;
    if (!container || !readingScrollKey) return;
    localStorage.setItem(readingScrollKey, String(container.scrollTop));
  };

  const updateMarkdownLines = (startLineIdx: number, endLineIdx: number, newLines: string[]) => {
    const allLines = content.split('\n');
    allLines.splice(startLineIdx, endLineIdx - startLineIdx + 1, ...newLines);
    onContentChange(allLines.join('\n'));
  };

  const toggleTaskCheckbox = (lineIdx: number, currentlyChecked: boolean) => {
    const allLines = content.split('\n');
    const line = allLines[lineIdx];
    if (line === undefined) return;
    const nextLine = line.replace(
      /^(\s*(?:>\s*)*[-*+]\s+\[)( |x|X)(\])/,
      `$1${currentlyChecked ? ' ' : 'x'}$3`
    );
    if (nextLine === line) return;
    allLines[lineIdx] = nextLine;
    onContentChange(allLines.join('\n'));
  };

  const commitEditingDraft = (clearEditing = true) => {
    const draft = editingDraftRef.current;
    if (!draft) {
      if (clearEditing) setEditingLineIdx(null);
      return;
    }
    const allLines = content.split('\n');
    if (allLines[draft.lineIdx] !== undefined && allLines[draft.lineIdx] !== draft.value) {
      allLines.splice(draft.lineIdx, 1, ...draft.value.split('\n'));
      onContentChange(allLines.join('\n'));
    }
    editingDraftRef.current = null;
    if (clearEditing) setEditingLineIdx(null);
  };

  const beginEditingLine = (lineIdx: number) => {
    if (editingDraftRef.current?.lineIdx !== lineIdx) {
      commitEditingDraft(false);
    }
    setEditingLineIdx(lineIdx);
  };

  const getAbsoluteIndex = (lineIdx: number, offset: number) => {
    const lines = content.split('\n');
    let index = 0;
    for (let i = 0; i < lineIdx; i++) {
      index += (lines[i] || '').length + 1;
    }
    return index + offset;
  };

  const handleAddTableRow = (block: ParsedBlock) => {
    onContentChange(insertTableRow(content.split('\n'), block).join('\n'));
  };

  const handleAddTableColumn = (block: ParsedBlock) => {
    updateMarkdownLines(block.startLine, block.endLine, addTableColumn(block));
  };

  const handleDeleteTableRow = (block: ParsedBlock, rowLineIndex: number) => {
    onContentChange(deleteTableRow(content.split('\n'), block, rowLineIndex).join('\n'));
  };

  const handleDeleteTableColumn = (block: ParsedBlock, colIdx: number) => {
    updateMarkdownLines(block.startLine, block.endLine, deleteTableColumn(block, colIdx));
  };

  const filteredPreviewCommands = filterAndRankSlashCommands(
    slashCommands,
    previewSlashMenu.query
  );

  const closePreviewSlashMenu = () => {
    setPreviewSlashMenu((prev) => ({ ...prev, show: false, query: '', index: 0 }));
  };

  const updatePreviewSlashQuery = (textarea: HTMLTextAreaElement, lineIdx: number) => {
    const draftLines = content.split('\n');
    draftLines.splice(lineIdx, 1, ...textarea.value.split('\n'));
    previewSlashDraftRef.current = draftLines.join('\n');

    setPreviewSlashMenu((prev) => {
      if (!prev.show) return prev;
      const selectionStart = textarea.selectionStart ?? 0;
      const absoluteEnd = getAbsoluteIndex(lineIdx, selectionStart);
      if (absoluteEnd <= prev.start) return { ...prev, show: false };

      const localSlashOffset = prev.start - getAbsoluteIndex(lineIdx, 0);
      const currentText = textarea.value;
      if (localSlashOffset < 0 || localSlashOffset >= currentText.length) return { ...prev, show: false };
      if (currentText[localSlashOffset] !== '/') return { ...prev, show: false };

      const query = currentText.slice(localSlashOffset + 1, selectionStart);
      if (query.includes(' ') || query.includes('\n')) return { ...prev, show: false };
      return { ...prev, query, end: absoluteEnd, index: 0 };
    });
  };

  const executePreviewSlashCommand = (cmd: any) => {
    if (!onExecuteSlashCommand || previewSlashMenu.start < 0) return;
    isExecutingPreviewSlashRef.current = true;
    onExecuteSlashCommand(cmd, previewSlashMenu.start, previewSlashMenu.end, previewSlashDraftRef.current || content);
    closePreviewSlashMenu();
    previewSlashDraftRef.current = null;
  };

  const handleTableCellEdit = (lineIdx: number, colIdx: number, newCellVal: string) => {
    const allLines = content.split('\n');
    const originalLine = allLines[lineIdx];
    if (originalLine === undefined) return;

    const cells = originalLine.split('|');
    if (colIdx + 1 < cells.length) {
      cells[colIdx + 1] = ` ${newCellVal.trim()} `;
    }
    const newLineText = cells.join('|');
    updateMarkdownLines(lineIdx, lineIdx, [newLineText]);
  };

  const openTrailingEditableLine = (extraBlankRows = 0) => {
    const lines = content ? content.split('\n') : [''];
    const lastNonEmpty = (() => {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() !== '') return i;
      }
      return -1;
    })();
    const targetLineIdx = Math.max(lastNonEmpty + 1 + extraBlankRows, 0);
    while (lines.length <= targetLineIdx) lines.push('');
    onContentChange(lines.join('\n'));
    beginEditingLine(targetLineIdx);
  };

  const countTrailingEmptyLines = () => {
    if (!content) return 0;
    const lines = content.split('\n');
    let count = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== '') break;
      count++;
    }
    return count;
  };

  const focusTableCell = (tableKey: string, order: number) => {
    requestAnimationFrame(() => {
      const root = previewContainerRef.current;
      if (!root) return;
      const cells = Array.from(root.querySelectorAll<HTMLElement>('[data-dnote-table-key]'))
        .filter((cell) => cell.dataset.dnoteTableKey === tableKey)
        .sort((a, b) => Number(a.dataset.dnoteCellOrder || 0) - Number(b.dataset.dnoteCellOrder || 0));
      const nextCell = cells[Math.max(0, Math.min(order, cells.length - 1))];
      nextCell?.focus();
    });
  };

  const handleTableCellKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
    tableKey: string,
    order: number,
    maxOrder: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusTableCell(tableKey, Math.min(order + 1, maxOrder));
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      focusTableCell(tableKey, e.shiftKey ? Math.max(order - 1, 0) : Math.min(order + 1, maxOrder));
    }
  };

  const renderBlockEditor = (lineIdx: number, rawText: string) => {
    const replaceLineInDraft = (lineText: string) => {
      const lines = content.split('\n');
      lines.splice(lineIdx, 1, ...lineText.split('\n'));
      return lines.join('\n');
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (!files.some((file) => file.type.startsWith('image/'))) return;
      const textarea = e.currentTarget;
      const selectionStart = textarea.selectionStart ?? textarea.value.length;
      const draft = replaceLineInDraft(textarea.value);
      handlePasteAtIndex(e, getAbsoluteIndex(lineIdx, selectionStart), draft);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = e.nativeEvent as KeyboardEvent;
      if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
        // Enter confirms the active IME candidate. Let the input method handle
        // it without also creating a new Markdown block in Reading mode.
        return;
      }

      if (previewSlashMenu.show) {
        const cmds = filteredPreviewCommands;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setPreviewSlashMenu((prev) => ({ ...prev, index: cmds.length > 0 ? (prev.index + 1) % cmds.length : 0 }));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setPreviewSlashMenu((prev) => ({ ...prev, index: cmds.length > 0 ? (prev.index - 1 + cmds.length) % cmds.length : 0 }));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          if (cmds.length > 0) {
            e.preventDefault();
            executePreviewSlashCommand(cmds[previewSlashMenu.index] || cmds[0]);
            return;
          }
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closePreviewSlashMenu();
          return;
        }
      }

      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Allow Shift+Enter for single line breaks
        } else {
          e.preventDefault();
          const newText = e.currentTarget.value || '';
          const selectionStart = e.currentTarget.selectionStart ?? newText.length;
          const selectionEnd = e.currentTarget.selectionEnd ?? selectionStart;
          
          const currentLines = content.split('\n');
          currentLines[lineIdx] = newText;
          const draft = currentLines.join('\n');

          const absoluteStart = getAbsoluteIndex(lineIdx, selectionStart);
          const absoluteEnd = getAbsoluteIndex(lineIdx, selectionEnd);
          const smart = handleSmartEnter(draft, absoluteStart, absoluteEnd);

          if (smart.handled) {
            isJumpingToNextLineRef.current = true;
            onContentChange(smart.text);
            const nextLineIdx = smart.text.substring(0, smart.newStart).split('\n').length - 1;
            setEditingLineIdx(nextLineIdx);
            return;
          }

          isJumpingToNextLineRef.current = true;
          const caretPos = selectionStart;
          const caretEndPos = selectionEnd;
          const updatedText = newText.substring(0, caretPos) + '\n' + newText.substring(caretEndPos);
          const newLines = updatedText.split('\n');

          const allLines = content.split('\n');
          allLines.splice(lineIdx, 1, ...newLines);

          const linesBeforeCaret = updatedText.substring(0, caretPos + 1).split('\n');
          let nextLineIdx = lineIdx + linesBeforeCaret.length - 1;

          if (nextLineIdx >= allLines.length) {
            allLines.push('');
            nextLineIdx = allLines.length - 1;
          }

          onContentChange(allLines.join('\n'));
          setEditingLineIdx(nextLineIdx);
        }
      } else if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const newText = e.currentTarget.value || '';
        const selectionStart = e.currentTarget.selectionStart ?? newText.length;
        const selectionEnd = e.currentTarget.selectionEnd ?? selectionStart;
        const draft = replaceLineInDraft(newText);
        const absoluteStart = getAbsoluteIndex(lineIdx, selectionStart);
        const absoluteEnd = getAbsoluteIndex(lineIdx, selectionEnd);
        const smart = handleSmartTab(draft, absoluteStart, absoluteEnd, e.shiftKey);
        if (smart.handled) {
          onContentChange(smart.text);
          const nextLineIdx = smart.text.substring(0, smart.newStart).split('\n').length - 1;
          setEditingLineIdx(nextLineIdx);
        }
      } else if (e.key === 'Backspace') {
        const selectionStart = e.currentTarget.selectionStart ?? 0;
        const selectionEnd = e.currentTarget.selectionEnd ?? 0;
        if (selectionStart === 0 && selectionEnd === 0 && lineIdx > 0) {
          e.preventDefault();
          const currentLines = content.split('\n');
          const currentText = e.currentTarget.value || '';
          const prevText = currentLines[lineIdx - 1] || '';
          
          isJumpingToNextLineRef.current = true;
          pendingCaretPosRef.current = prevText.length;
          
          currentLines[lineIdx - 1] = prevText + currentText;
          currentLines.splice(lineIdx, 1);
          
          onContentChange(currentLines.join('\n'));
          setEditingLineIdx(lineIdx - 1);
        }
      } else if (e.key === '/') {
        const textarea = e.currentTarget;
        const selectionStart = textarea.selectionStart ?? 0;
        const isStartOrWhitespace = selectionStart === 0 || /\s/.test(textarea.value.charAt(selectionStart - 1));
        if (isStartOrWhitespace && onExecuteSlashCommand) {
          const rect = textarea.getBoundingClientRect();
          const container = previewContainerRef.current;
          const containerRect = container?.getBoundingClientRect();
          const absoluteStart = getAbsoluteIndex(lineIdx, selectionStart);
          setPreviewSlashMenu({
            show: true,
            query: '',
            index: 0,
            coords: {
              left: containerRect ? rect.left - containerRect.left + 12 : rect.left + 12,
              top: containerRect && container ? rect.top - containerRect.top + container.scrollTop + 30 : rect.top + 30,
            },
            start: absoluteStart,
            end: absoluteStart + 1,
          });
        }
      }
    };

    return (
      <textarea
        key={`editor_${lineIdx}_${rawText}`}
        defaultValue={rawText}
        placeholder="输入文字..."
        rows={1}
        onBlur={(e) => {
          if (isExecutingPreviewSlashRef.current) {
            isExecutingPreviewSlashRef.current = false;
            return;
          }
          if (isJumpingToNextLineRef.current) {
            isJumpingToNextLineRef.current = false;
            return;
          }
          editingDraftRef.current = { lineIdx, value: e.currentTarget.value || '' };
          commitEditingDraft(true);
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          color: 'var(--text-main)',
          background: 'rgba(255,255,255,0.04)',
          border: '1.2px dashed var(--accent-color, #7000ff)',
          outline: 'none',
          padding: '6px 10px',
          borderRadius: '4px',
          margin: '6px 0',
          width: '100%',
          boxSizing: 'border-box',
          resize: 'none',
          overflow: 'hidden',
          display: 'block',
        }}
        ref={(el) => {
          if (el) {
            el.focus();
            editingDraftRef.current = { lineIdx, value: el.value };
            const targetPos = pendingCaretPosRef.current !== null ? pendingCaretPosRef.current : el.value.length;
            el.selectionStart = el.selectionEnd = targetPos;
            pendingCaretPosRef.current = null;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight + 3}px`;
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          editingDraftRef.current = { lineIdx, value: el.value };
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight + 3}px`;
          updatePreviewSlashQuery(el, lineIdx);
        }}
      />
    );
  };

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
          <button
            className="media-delete-btn"
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
        setHoveredLineIndex((prev) => (prev === block.startLine ? null : prev));
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
              setHoveredLineIndex((prev) => (prev === insertAfterLine ? null : prev));
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
        setSlashMenuIndex={(index) => setPreviewSlashMenu((prev) => ({ ...prev, index }))}
        slashMenuCoords={previewSlashMenu.coords}
        handleExecuteCommand={executePreviewSlashCommand}
        getShortcutDisplay={getShortcutDisplay}
      />
    </div>
  );
}
