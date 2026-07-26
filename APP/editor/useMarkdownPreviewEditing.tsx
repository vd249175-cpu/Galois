import React, { useEffect, useRef, useState } from 'react';
import { parseMarkdownIntoBlocks, type ParsedBlock } from './markdownBlockParser';
import { addTableColumn, deleteTableColumn, deleteTableRow, insertTableRow } from './tableEditing';
import { handleSmartEnter, handleSmartTab } from './markdownEditing';
import { filterAndRankSlashCommands } from './slashCommandSearch';
import { getVerticalNavigationTarget, isTextareaCaretOnVerticalBoundary, type ReadingBlockRange } from './readingInteraction';

export function useMarkdownPreviewEditing(props: any) {
  const { content, currentFile, handlePasteAtIndex, onContentChange, onExecuteSlashCommand, projectPath, slashCommands } = props;

const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null);
const [activeCell, setActiveCell] = useState<{ lineIdx: number; colIdx: number } | null>(null);
const [draggedBlockKey, setDraggedBlockKey] = useState<string | null>(null);
const [selectedBlockRange, setSelectedBlockRange] = useState<ReadingBlockRange | null>(null);
const [selectedMedia, setSelectedMedia] = useState<{ lineIdx: number; tokenIndex: number; markdown: string } | null>(null);
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
const pendingEditorFocusRef = useRef<{ lineIdx: number; position: number } | null>(null);
const previewSlashDraftRef = useRef<string | null>(null);
const isExecutingPreviewSlashRef = useRef(false);
const previewContainerRef = useRef<HTMLDivElement>(null);
const editingDraftRef = useRef<{ lineIdx: number; value: string } | null>(null);
const suppressClickAfterDragRef = useRef(false);
const readingScrollKey = projectPath && currentFile
  ? `galois_reading_scroll:${projectPath}:${currentFile}`
  : '';

useEffect(() => {
  // Source-line/token indexes are intentionally ephemeral. A save, drag move,
  // external edit, or file switch invalidates them and must not leave a stale
  // highlight pointing at a different block.
  setSelectedBlockRange(null);
  setSelectedMedia(null);
}, [content, currentFile]);

useEffect(() => {
  const container = previewContainerRef.current;
  if (!container || !readingScrollKey) return;
  const saved = Number(localStorage.getItem(readingScrollKey) || 0);
  requestAnimationFrame(() => {
    container.scrollTop = Number.isFinite(saved) ? saved : 0;
  });
}, [readingScrollKey]);

useEffect(() => {
  const request = pendingEditorFocusRef.current;
  if (!request || request.lineIdx !== editingLineIdx) return;
  const frame = requestAnimationFrame(() => {
    const editor = previewContainerRef.current?.querySelector<HTMLTextAreaElement>(
      `[data-dnote-reading-editor="${request.lineIdx}"]`
    );
    pendingEditorFocusRef.current = null;
    if (!editor) return;
    const target = Math.max(0, Math.min(request.position, editor.value.length));
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(target, target);
    editor.scrollIntoView({ block: 'nearest' });
  });
  return () => cancelAnimationFrame(frame);
}, [editingLineIdx, content]);

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

const beginEditingLine = (lineIdx: number, caretPosition?: number | null) => {
  if (editingDraftRef.current?.lineIdx !== lineIdx) {
    commitEditingDraft(false);
  }
  const sourceLine = content.split('\n')[lineIdx] || '';
  pendingEditorFocusRef.current = {
    lineIdx,
    position: caretPosition === undefined || caretPosition === null ? sourceLine.length : caretPosition,
  };
  setSelectedBlockRange(null);
  setSelectedMedia(null);
  setEditingLineIdx(lineIdx);
};

const moveEditingToAdjacentBlock = (
  lineIdx: number,
  value: string,
  direction: -1 | 1,
  preferredColumn: number
) => {
  const lines = content.split('\n');
  const replacementLines = value.split('\n');
  lines.splice(lineIdx, 1, ...replacementLines);
  let nextContent = lines.join('\n');
  let blocks = parseMarkdownIntoBlocks(nextContent);
  let targetBlock = direction < 0
    ? [...blocks].reverse().find((block) => block.endLine < lineIdx)
    : blocks.find((block) => block.startLine >= lineIdx + replacementLines.length);

  if (!targetBlock && direction === 1) {
    nextContent = `${nextContent}${nextContent.endsWith('\n') ? '' : '\n'}`;
    blocks = parseMarkdownIntoBlocks(nextContent);
    targetBlock = blocks[blocks.length - 1];
  }
  if (!targetBlock) return;

  const targetLine = direction < 0 ? targetBlock.endLine : targetBlock.startLine;
  const targetValue = nextContent.split('\n')[targetLine] || '';
  editingDraftRef.current = null;
  isJumpingToNextLineRef.current = true;
  pendingEditorFocusRef.current = {
    lineIdx: targetBlock.startLine,
    position: Math.min(preferredColumn, targetValue.length),
  };
  onContentChange(nextContent);
  setEditingLineIdx(targetBlock.startLine);
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
    const textarea = e.currentTarget;
    if (!files.some((file) => file.type.startsWith('image/'))) {
      requestAnimationFrame(() => textarea.scrollIntoView({ block: 'nearest' }));
      return;
    }
    const selectionStart = textarea.selectionStart ?? textarea.value.length;
    const draft = replaceLineInDraft(textarea.value);
    void Promise.resolve(handlePasteAtIndex(e, getAbsoluteIndex(lineIdx, selectionStart), draft)).then((result: any) => {
      if (!result?.content || !Number.isFinite(result.caretIndex)) return;
      const targetLine = result.content.slice(0, result.caretIndex).split('\n').length - 1;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const wrappers = Array.from(
          previewContainerRef.current?.querySelectorAll<HTMLElement>('[data-dnote-block-start]') || []
        );
        wrappers.find((wrapper) => {
          const start = Number(wrapper.dataset.dnoteBlockStart);
          const end = Number(wrapper.dataset.dnoteBlockEnd);
          return targetLine >= start && targetLine <= end;
        })?.scrollIntoView({ block: 'nearest' });
      }));
    });
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

    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      const verticalTarget = getVerticalNavigationTarget(
        e.currentTarget.value,
        e.currentTarget.selectionStart ?? 0,
        e.currentTarget.selectionEnd ?? 0,
        e.key
      );
      if (verticalTarget && isTextareaCaretOnVerticalBoundary(e.currentTarget, verticalTarget.direction)) {
        e.preventDefault();
        moveEditingToAdjacentBlock(
          lineIdx,
          e.currentTarget.value,
          verticalTarget.direction,
          verticalTarget.column
        );
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
          const nextLineStart = smart.text.lastIndexOf('\n', Math.max(0, smart.newStart - 1)) + 1;
          pendingEditorFocusRef.current = { lineIdx: nextLineIdx, position: smart.newStart - nextLineStart };
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
        pendingEditorFocusRef.current = { lineIdx: nextLineIdx, position: 0 };
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
        const nextLineStart = smart.text.lastIndexOf('\n', Math.max(0, smart.newStart - 1)) + 1;
        pendingEditorFocusRef.current = { lineIdx: nextLineIdx, position: smart.newStart - nextLineStart };
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
        pendingEditorFocusRef.current = { lineIdx: lineIdx - 1, position: prevText.length };

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
      data-dnote-reading-editor={lineIdx}
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
        fontWeight: 'inherit',
        fontStyle: 'inherit',
        letterSpacing: 'inherit',
        lineHeight: 'inherit',
        color: 'var(--text-main)',
        background: 'transparent',
        border: 0,
        outline: 'none',
        padding: 0,
        borderRadius: 0,
        margin: 0,
        width: '100%',
        boxSizing: 'border-box',
        resize: 'none',
        overflow: 'hidden',
        display: 'block',
      }}
      ref={(el) => {
        if (el) {
          editingDraftRef.current = { lineIdx, value: el.value };
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

  return {
    editingLineIdx, setEditingLineIdx, activeCell, setActiveCell, draggedBlockKey, setDraggedBlockKey,
    selectedBlockRange, setSelectedBlockRange, selectedMedia, setSelectedMedia,
    isDraggingOverBottom, setIsDraggingOverBottom, previewSlashMenu, setPreviewSlashMenu,
    previewContainerRef, suppressClickAfterDragRef, persistReadingScroll, updateMarkdownLines,
    toggleTaskCheckbox, beginEditingLine, getAbsoluteIndex, handleAddTableRow, handleAddTableColumn,
    handleDeleteTableRow, handleDeleteTableColumn, handleTableCellEdit, filteredPreviewCommands, executePreviewSlashCommand,
    openTrailingEditableLine, countTrailingEmptyLines, focusTableCell, handleTableCellKeyDown, renderBlockEditor,
  };
}
