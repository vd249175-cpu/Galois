import React, { useEffect, useRef, useState } from 'react';
import { parseMarkdownIntoBlocks, type ParsedBlock } from './markdownBlockParser';
import { SlashMenu } from './SlashMenu';
import { addTableColumn, deleteTableColumn, deleteTableRow, insertTableRow } from './tableEditing';
import { handleSmartEnter, handleSmartTab } from './markdownEditing';
import { filterAndRankSlashCommands } from './slashCommandSearch';
import { MathRenderer } from './MathRenderer';
import { MermaidRenderer } from './MermaidRenderer';
import { createInlineRenderer } from './markdownInlineRenderer';

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

    if (block.type === 'code') {
      const lang = block.codeLang || '';
      const codeText = block.codeText || '';
      
      const blockEl = isEditing ? (
        <textarea
          defaultValue={codeText}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files || []);
            if (!files.some((file) => file.type.startsWith('image/'))) return;
            const textarea = e.currentTarget;
            const selectionStart = textarea.selectionStart ?? textarea.value.length;
            const draftLines = content.split('\n');
            const newCodeLines = textarea.value.split('\n');
            draftLines.splice(block.startLine, block.endLine - block.startLine + 1, ['```' + lang, ...newCodeLines, '```'].join('\n'));
            handlePasteAtIndex(e, getAbsoluteIndex(block.startLine + 1, selectionStart), draftLines.join('\n'));
          }}
          onBlur={(e) => {
            const newCode = e.currentTarget.value;
            const newLines = ['```' + lang, ...newCode.split('\n'), '```'];
            updateMarkdownLines(block.startLine, block.endLine, newLines);
            setEditingLineIdx(null);
          }}
          style={{
            width: '100%',
            minHeight: '120px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '12px',
            backgroundColor: 'var(--bg-secondary, rgba(0, 0, 0, 0.05))',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--accent-color, #7000ff)',
            color: 'var(--text-main)',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
            margin: '12px 0',
          }}
          ref={(el) => {
            if (el) el.focus();
          }}
        />
      ) : (
        <div onClick={(e) => beginEditingLineFromClick(e, block.startLine)} style={{ cursor: 'text', width: '100%' }}>
          {lang.toLowerCase() === 'mermaid' ? (
            <MermaidRenderer key={`mermaid_${idx}`} code={codeText} />
          ) : (
            <div key={`codeblock_${idx}`} style={{ margin: '14px 0', overflowX: 'auto' }}>
              <pre
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-secondary, rgba(0, 0, 0, 0.03))',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  margin: 0,
                  whiteSpace: 'pre'
                }}
              >
                <code>{codeText}</code>
              </pre>
            </div>
          )}
        </div>
      );
      
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'math') {
      const blockEl = isEditing ? (
        <textarea
          defaultValue={block.rawText}
          onBlur={(event) => {
            updateMarkdownLines(block.startLine, block.endLine, event.currentTarget.value.split('\n'));
            setEditingLineIdx(null);
          }}
          style={{
            width: '100%',
            minHeight: '96px',
            boxSizing: 'border-box',
            resize: 'vertical',
            border: '1.2px dashed var(--accent-color, #7000ff)',
            borderRadius: 6,
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-main)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            outline: 'none',
          }}
          ref={(element) => element?.focus()}
        />
      ) : (
        <div
          onClick={(event) => beginEditingLineFromClick(event, block.startLine)}
          style={{ cursor: 'text', overflowX: 'auto', padding: '8px 4px' }}
        >
          <MathRenderer expression={block.mathText || ''} displayMode />
        </div>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'table') {
      const headerCells = block.tableHeaders || [];
      const alignments = block.tableAlignments || [];
      const dataRows = block.tableRows || [];
      const maxCellOrder = Math.max((dataRows.length + 1) * Math.max(headerCells.length, 1) - 1, 0);
      
      const tableEl = (
        <div
          key={`table_${idx}`}
          className="reading-table-shell"
          onClick={(e) => e.stopPropagation()}
          style={{ overflowX: 'auto', margin: '14px 0', width: '100%', position: 'relative' }}
        >
          <div
            className="reading-table-toolbar"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '6px',
              marginBottom: '6px',
              opacity: 0,
              transition: 'opacity 0.14s ease',
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteBlock(block);
              }}
              style={{
                border: '1px solid rgba(255, 59, 48, 0.25)',
                background: 'rgba(255, 59, 48, 0.08)',
                color: '#ff3b30',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              删除表格
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddTableRow(block);
              }}
              style={{
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input, rgba(255,255,255,0.08))',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + 行
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddTableColumn(block);
              }}
              style={{
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input, rgba(255,255,255,0.08))',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + 列
            </button>
          </div>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              border: '1.2px solid var(--border-color)',
              borderRadius: '6px'
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.015)' }}>
                {headerCells.map((cell, colIdx) => {
                  const isCellActive = activeCell?.lineIdx === block.startLine && activeCell?.colIdx === colIdx;
                  const cellOrder = colIdx;
                  return (
                    <th
                      key={`th_${colIdx}`}
                      data-dnote-table-key={block.key}
                      data-dnote-cell-order={cellOrder}
                      contentEditable={isCellActive}
                      suppressContentEditableWarning
                      onClick={(e) => {
                        e.stopPropagation();
                        const target = e.target as HTMLElement;
                        if (target.closest('a, audio, video, button, input, select')) return;
                        if (!isCellActive) {
                          setActiveCell({ lineIdx: block.startLine, colIdx });
                          focusTableCell(block.key, cellOrder);
                        }
                      }}
                      onBlur={(e) => {
                        if (!isCellActive) return;
                        const newCellVal = e.currentTarget.textContent || '';
                        handleTableCellEdit(block.startLine, colIdx, newCellVal);
                        setActiveCell(null);
                      }}
                      onKeyDown={(e) => {
                        handleTableCellKeyDown(e, block.key, cellOrder, maxCellOrder);
                      }}
                      style={{
                        padding: '8px 12px',
                        fontWeight: '600',
                        textAlign: (alignments[colIdx] || 'left') as any,
                        color: 'var(--text-main)',
                        borderBottom: '2px solid var(--border-color)',
                        outline: 'none',
                        backgroundColor: isCellActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                      }}
                    >
                      <span>{isCellActive ? cell : renderInline(cell, block.startLine)}</span>
                      {headerCells.length > 1 && (
                        <button
                          type="button"
                          contentEditable={false}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteTableColumn(block, colIdx);
                          }}
                          title="删除此列"
                          style={{
                            marginLeft: '6px',
                            border: '0',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '10px',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </th>
                  );
                })}
                <th style={{ width: '28px', padding: '0', borderBottom: '2px solid var(--border-color)' }} />
              </tr>
            </thead>
            <tbody>
              {dataRows.map((rowCells, rowIdx) => (
                <tr
                  key={`tr_${rowIdx}`}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: rowIdx % 2 === 1 ? 'rgba(0,0,0,0.005)' : 'transparent'
                  }}
                >
                  {headerCells.map((_, colIdx) => {
                    const cellVal = rowCells[colIdx] || '';
                    const cellLineIndex = block.startLine + 2 + rowIdx;
                    const isCellActive = activeCell?.lineIdx === cellLineIndex && activeCell?.colIdx === colIdx;
                    const cellOrder = (rowIdx + 1) * headerCells.length + colIdx;
                    return (
                      <td
                        key={`td_${rowIdx}_${colIdx}`}
                        data-dnote-table-key={block.key}
                        data-dnote-cell-order={cellOrder}
                        contentEditable={isCellActive}
                        suppressContentEditableWarning
                        onClick={(e) => {
                          e.stopPropagation();
                          const target = e.target as HTMLElement;
                          if (target.closest('a, audio, video, button, input, select')) return;
                          if (!isCellActive) {
                            setActiveCell({ lineIdx: cellLineIndex, colIdx });
                            focusTableCell(block.key, cellOrder);
                          }
                        }}
                        onBlur={(e) => {
                          if (!isCellActive) return;
                          const newCellVal = e.currentTarget.textContent || '';
                          handleTableCellEdit(cellLineIndex, colIdx, newCellVal);
                          setActiveCell(null);
                        }}
                        onKeyDown={(e) => {
                          handleTableCellKeyDown(e, block.key, cellOrder, maxCellOrder);
                        }}
                        style={{
                          padding: '8px 12px',
                          textAlign: (alignments[colIdx] || 'left') as any,
                          color: 'var(--text-main)',
                          outline: 'none',
                          backgroundColor: isCellActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                        }}
                      >
                        {isCellActive ? cellVal : renderInline(
                          cellVal,
                          cellLineIndex,
                          (matchIndex, currentlyChecked) => {
                            let currentIndex = 0;
                            const nextCellVal = cellVal.replace(/\[( |x|X)\](?!\()/g, (marker) => {
                              if (currentIndex++ !== matchIndex) return marker;
                              return currentlyChecked ? '[ ]' : '[x]';
                            });
                            handleTableCellEdit(cellLineIndex, colIdx, nextCellVal);
                          }
                        )}
                      </td>
                    );
                  })}
                  <td
                    contentEditable={false}
                    style={{
                      width: '28px',
                      padding: '0 4px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteTableRow(block, block.startLine + 2 + rowIdx);
                      }}
                      title="删除此行"
                      style={{
                        border: '0',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      
      return wrapBlock(tableEl, block);
    }

    if (block.type === 'hr') {
      return wrapBlock(
        <hr
          key={idx}
          style={{
            border: 'none',
            borderTop: '1px solid var(--border-color)',
            margin: '16px 0',
            width: '100%',
          }}
        />,
        block
      );
    }

    if (block.type === 'h1') {
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <h1
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', margin: '18px 0 10px 0', fontSize: '1.55em', fontWeight: '700', cursor: 'text' }}
        >
          {renderInline(contentVal.substring(2), block.startLine)}
        </h1>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'h2') {
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <h2
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '4px', margin: '16px 0 8px 0', fontSize: '1.3em', fontWeight: '600', cursor: 'text' }}
        >
          {renderInline(contentVal.substring(3), block.startLine)}
        </h2>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'h3') {
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <h3
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{ margin: '14px 0 6px 0', fontSize: '1.12em', fontWeight: '600', cursor: 'text' }}
        >
          {renderInline(contentVal.substring(4), block.startLine)}
        </h3>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'h4' || block.type === 'h5' || block.type === 'h6') {
      const level = Number(block.type.substring(1));
      const headingStyles: Record<number, React.CSSProperties> = {
        4: { fontSize: '1.04em', fontWeight: '650', margin: '12px 0 5px 0' },
        5: { fontSize: '0.98em', fontWeight: '650', margin: '10px 0 4px 0' },
        6: { fontSize: '0.92em', fontWeight: '650', margin: '9px 0 4px 0', color: 'var(--text-muted)' },
      };
      const blockEl = isEditing
        ? renderBlockEditor(block.startLine, contentVal)
        : React.createElement(
            `h${level}`,
            {
              key: idx,
              onClick: (e: React.MouseEvent) => beginEditingLineFromClick(e, block.startLine),
              style: { ...headingStyles[level], cursor: 'text' },
            },
            renderInline(contentVal.substring(level + 1), block.startLine)
          );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'todo' || block.type === 'quoteTodo') {
      const isQuotedTask = block.type === 'quoteTodo';
      const taskMatch = contentVal.match(/^(\s*(?:>\s*)*)[-*+]\s+\[( |x|X)\]\s+/);
      const isChecked = taskMatch?.[2].toLowerCase() === 'x';
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <div
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            margin: '6px 0',
            marginLeft: isQuotedTask ? 0 : `${(block.listIndent || 0) * 18}px`,
            padding: isQuotedTask ? '6px 12px' : undefined,
            borderLeft: isQuotedTask ? '3px solid var(--accent-color)' : undefined,
            borderRadius: isQuotedTask ? '0 4px 4px 0' : undefined,
            backgroundColor: isQuotedTask ? 'rgba(0,0,0,0.01)' : undefined,
            cursor: 'text',
            opacity: isChecked ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={isChecked}
            aria-label={isChecked ? '标记为未完成' : '标记为完成'}
            title={isChecked ? '标记为未完成' : '标记为完成'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleTaskCheckbox(block.startLine, isChecked)}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ textDecoration: isChecked ? 'line-through' : 'none' }}>
            {renderInline(contentVal.substring(block.listContentStart || 6), block.startLine)}
          </span>
        </div>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'li') {
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <li
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{ margin: '4px 0', marginLeft: `${16 + (block.listIndent || 0) * 18}px`, fontSize: 'inherit', cursor: 'text' }}
        >
          {renderInline(contentVal.substring(block.listContentStart || 2), block.startLine)}
        </li>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'oli') {
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <div
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{ display: 'flex', alignItems: 'baseline', gap: '7px', margin: '4px 0', marginLeft: `${(block.listIndent || 0) * 18}px`, cursor: 'text' }}
        >
          <span style={{ minWidth: '20px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 650 }}>
            {block.listMarker || '1'}.
          </span>
          <span>{renderInline(contentVal.substring(block.listContentStart || 3), block.startLine)}</span>
        </div>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'blockquote') {
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <blockquote
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{ borderLeft: '3px solid var(--accent-color)', paddingLeft: '12px', color: 'var(--text-muted)', margin: '10px 0', fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.01)', padding: '6px 12px', borderRadius: '0 4px 4px 0', cursor: 'text' }}
        >
          {renderInline(contentVal.substring(2), block.startLine)}
        </blockquote>
      );
      return wrapBlock(blockEl, block);
    }

    if (block.type === 'empty') {
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <div
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{
            minHeight: '26px',
            margin: '6px 0',
            cursor: 'text',
            border: '1px dashed transparent',
            borderRadius: '4px',
            width: '100%',
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            boxSizing: 'border-box',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-color, #7000ff)';
            e.currentTarget.style.backgroundColor = 'rgba(112, 0, 255, 0.03)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="点击在此输入新内容..."
        />
      );
      return wrapBlock(blockEl, block);
    }

    // Default paragraph (p)
    const isMediaParagraph = shouldTreatBlockAsMedia(block.rawText);
    const isReactiveMarkdownBlock = /^\s*\{\{[\s\S]+\}\}\s*$/.test(contentVal);
    const blockEl = isEditing ? (
      renderBlockEditor(block.startLine, contentVal)
    ) : isReactiveMarkdownBlock ? (
      <div
        key={idx}
        onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
        style={{ margin: '6px 0', lineHeight: 'inherit', fontSize: 'inherit', width: '100%' }}
      >
        {renderInline(contentVal, block.startLine)}
      </div>
    ) : (
      <p
        key={idx}
        onClick={(e) => {
          if (isMediaParagraph) {
            e.stopPropagation();
            return;
          }
          beginEditingLineFromClick(e, block.startLine);
        }}
        style={{ margin: '6px 0', lineHeight: 'inherit', fontSize: 'inherit', cursor: isMediaParagraph ? 'default' : 'text' }}
      >
        {renderInline(contentVal, block.startLine)}
      </p>
    );
    return wrapBlock(blockEl, block);
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
