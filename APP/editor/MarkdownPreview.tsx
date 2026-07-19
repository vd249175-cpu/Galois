import React, { useEffect, useRef, useState } from 'react';
import { ReactiveExpression } from './ReactiveExpression';
import { parseMarkdownBody } from '../utils';
import { InlineClipPlayer } from './InlineClipPlayer';
import { SlashMenu } from './SlashMenu';
import { addTableColumn, deleteTableColumn, deleteTableRow, insertTableRow } from './tableEditing';
import { handleSmartEnter, handleSmartTab } from './markdownEditing';
import { filterAndRankSlashCommands } from './slashCommandSearch';
import { parseMarkdownEmphasis, type MarkdownEmphasisSegment } from './markdownEmphasis';

// Global state to track dynamic loading of Mermaid CDN library
let mermaidLoading = false;
let mermaidLoaded = false;
const mermaidLoadCallbacks = new Set<() => void>();

function loadMermaid(callback: () => void) {
  if (mermaidLoaded) {
    callback();
    return;
  }
  mermaidLoadCallbacks.add(callback);
  if (mermaidLoading) return;
  mermaidLoading = true;

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
  script.async = true;
  script.onload = () => {
    mermaidLoaded = true;
    const mermaid = (window as any).mermaid;
    if (mermaid) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
    }
    mermaidLoadCallbacks.forEach((cb) => cb());
    mermaidLoadCallbacks.clear();
  };
  document.body.appendChild(script);
}

export function MermaidRenderer({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadMermaid(() => {
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const mermaid = (window as any).mermaid;
    if (!mermaid || !containerRef.current) return;

    let isMounted = true;
    const renderId = `mermaid-render-${Math.random().toString(36).substring(2, 9)}`;

    const renderDiagram = async () => {
      try {
        const cleanCode = code.trim();
        const { svg: renderedSvg } = await mermaid.render(renderId, cleanCode);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        console.error('[Mermaid] render error:', err);
        const badEl = document.getElementById(renderId);
        if (badEl) badEl.remove();

        if (isMounted) {
          setError(err.message || String(err));
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, loaded]);

  if (error) {
    return (
      <div style={{ margin: '14px 0', border: '1px solid #fecaca', backgroundColor: '#fef2f2', padding: '10px 14px', borderRadius: '6px' }}>
        <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>Mermaid 渲染失败</div>
        <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#991b1b', whiteSpace: 'pre-wrap' }}>
          {error}
        </pre>
        <details style={{ marginTop: '6px' }}>
          <summary style={{ fontSize: '11px', cursor: 'pointer', color: '#7f1d1d' }}>查看源代码</summary>
          <pre style={{ margin: '4px 0 0 0', padding: '6px', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#374151' }}>
            {code}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        margin: '14px 0',
        padding: '12px',
        border: '1.2px solid var(--border-color)',
        borderRadius: '6px',
        backgroundColor: 'var(--bg-secondary, rgba(0,0,0,0.01))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflowX: 'auto'
      }}
    >
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          正在渲染 Mermaid 图表...
        </div>
      )}
    </div>
  );
}

interface ParsedBlock {
  key: string;
  type: string;
  startLine: number;
  endLine: number;
  rawText: string;
  codeLang?: string;
  codeText?: string;
  tableHeaders?: string[];
  tableAlignments?: string[];
  tableRows?: string[][];
  listIndent?: number;
  listMarker?: string;
  listContentStart?: number;
}

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

  const parseMarkdownIntoBlocks = (md: string): ParsedBlock[] => {
    let frontmatterLinesOffset = 0;
    const body = parseMarkdownBody(md);
    if (body !== md) {
      const bodyIndex = md.indexOf(body);
      const prefix = md.substring(0, bodyIndex);
      frontmatterLinesOffset = prefix.split('\n').length - 1;
    }

    const allLines = md.split('\n');
    const lines = body.split('\n');
    const blocks: ParsedBlock[] = [];
    
    const occurrenceMap: Record<string, number> = {};

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const startLine = frontmatterLinesOffset + i;

      // 1. Code Block
      if (line.trim().startsWith('```')) {
        const lang = line.trim().substring(3).trim();
        const codeLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith('```')) {
          codeLines.push(lines[j]);
          j++;
        }
        const endLine = frontmatterLinesOffset + Math.min(j, lines.length - 1);
        const rawText = allLines.slice(startLine, endLine + 1).join('\n');
        
        const baseKey = `code:${rawText}`;
        const idx = occurrenceMap[baseKey] || 0;
        occurrenceMap[baseKey] = idx + 1;
        const key = `${baseKey}_${idx}`;

        blocks.push({
          key,
          type: 'code',
          startLine,
          endLine,
          rawText,
          codeLang: lang,
          codeText: codeLines.join('\n')
        });

        i = j + 1;
        continue;
      }

      // 2. Table
      const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|');
      const isSeparatorRow = (l: string) => l.trim().startsWith('|') && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(l.trim());
      
      if (i + 1 < lines.length && isTableRow(line) && isSeparatorRow(lines[i+1])) {
        const headerRow = line;
        const separatorRow = lines[i+1];
        
        const headerCells = headerRow.split('|').map(c => c.trim());
        if (headerCells[0] === '') headerCells.shift();
        if (headerCells[headerCells.length - 1] === '') headerCells.pop();

        const separatorCells = separatorRow.split('|').map(c => c.trim());
        if (separatorCells[0] === '') separatorCells.shift();
        if (separatorCells[separatorCells.length - 1] === '') separatorCells.pop();

        const alignments = separatorCells.map(cell => {
          const left = cell.startsWith(':');
          const right = cell.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          return 'left';
        });

        const dataRows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && isTableRow(lines[j])) {
          const cells = lines[j].split('|').map(c => c.trim());
          if (cells[0] === '') cells.shift();
          if (cells[cells.length - 1] === '') cells.pop();
          dataRows.push(cells);
          j++;
        }

        const endLine = frontmatterLinesOffset + j - 1;
        const rawText = allLines.slice(startLine, endLine + 1).join('\n');
        
        const baseKey = `table:${rawText}`;
        const idx = occurrenceMap[baseKey] || 0;
        occurrenceMap[baseKey] = idx + 1;
        const key = `${baseKey}_${idx}`;

        blocks.push({
          key,
          type: 'table',
          startLine,
          endLine,
          rawText,
          tableHeaders: headerCells,
          tableAlignments: alignments,
          tableRows: dataRows
        });

        i = j;
        continue;
      }

      // 3. Single-line blocks
      let type = 'p';
      const isHorizontalRule = (l: string) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l);
      const headingMatch = line.match(/^(#{1,6})\s+/);
      const taskMatch = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/);
      const unorderedListMatch = line.match(/^(\s*)[-*+]\s+/);
      const orderedListMatch = line.match(/^(\s*)(\d+)[.)]\s+/);
      if (isHorizontalRule(line)) {
        type = 'hr';
      } else if (headingMatch) {
        type = `h${headingMatch[1].length}`;
      } else if (taskMatch) {
        type = 'todo';
      } else if (unorderedListMatch) {
        type = 'li';
      } else if (orderedListMatch) {
        type = 'oli';
      } else if (line.startsWith('> ')) {
        type = 'blockquote';
      } else if (line.trim() === '') {
        type = 'empty';
      }

      const rawText = line;
      const baseKey = `${type}:${rawText}`;
      const idx = occurrenceMap[baseKey] || 0;
      occurrenceMap[baseKey] = idx + 1;
      const key = `${baseKey}_${idx}`;

      blocks.push({
        key,
        type,
        startLine,
        endLine: startLine,
        rawText,
        listIndent: (taskMatch?.[1] || unorderedListMatch?.[1] || orderedListMatch?.[1] || '').length,
        listMarker: orderedListMatch?.[2],
        listContentStart: taskMatch?.[0].length || unorderedListMatch?.[0].length || orderedListMatch?.[0].length,
      });

      i++;
    }

    return blocks;
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
                      contentEditable
                      suppressContentEditableWarning
                      onFocus={() => setActiveCell({ lineIdx: block.startLine, colIdx })}
                      onBlur={(e) => {
                        const newCellVal = e.currentTarget.textContent || '';
                        handleTableCellEdit(block.startLine, colIdx, newCellVal);
                        setActiveCell(null);
                      }}
                      onKeyDown={(e) => {
                        handleTableCellKeyDown(e, block.key, cellOrder, maxCellOrder);
                      }}
                      onClick={(e) => e.stopPropagation()}
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
                        contentEditable
                        suppressContentEditableWarning
                        onFocus={() => setActiveCell({ lineIdx: cellLineIndex, colIdx })}
                        onBlur={(e) => {
                          const newCellVal = e.currentTarget.textContent || '';
                          handleTableCellEdit(cellLineIndex, colIdx, newCellVal);
                          setActiveCell(null);
                        }}
                        onKeyDown={(e) => {
                          handleTableCellKeyDown(e, block.key, cellOrder, maxCellOrder);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '8px 12px',
                          textAlign: (alignments[colIdx] || 'left') as any,
                          color: 'var(--text-main)',
                          outline: 'none',
                          backgroundColor: isCellActive ? 'rgba(255,255,255,0.05)' : 'transparent',
                        }}
                      >
                        {isCellActive ? cellVal : renderInline(cellVal, cellLineIndex)}
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

    if (block.type === 'todo') {
      const taskMatch = contentVal.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/);
      const isChecked = taskMatch?.[2].toLowerCase() === 'x';
      const blockEl = isEditing ? (
        renderBlockEditor(block.startLine, contentVal)
      ) : (
        <div
          key={idx}
          onClick={(e) => beginEditingLineFromClick(e, block.startLine)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0', marginLeft: `${(block.listIndent || 0) * 18}px`, cursor: 'text', opacity: isChecked ? 0.55 : 1 }}
        >
          <input type="checkbox" disabled checked={isChecked} />
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
    const blockEl = isEditing ? (
      renderBlockEditor(block.startLine, contentVal)
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

  const renderInline = (text: string, lineIndex: number) => {
    let parts: React.ReactNode[] = [text];

    // -1. @video clip embeds — @video[label](filename?t=start,end) (supports legacy #t= format as well)
    parts = splitByRegex(parts, /@video\[([^\]]*)\]\((.+?)[#?]t=([\d.]+),([\d.]+)\)/g, (match, idx) => {
      const label = match[1];
      const fileName = match[2];
      const start = parseFloat(match[3]);
      const end = parseFloat(match[4]);
      return (
        <InlineClipPlayer
          key={`clip_${fileName}_${start}_${idx}`}
          label={label}
          fileName={fileName}
          start={start}
          end={end}
          projectPath={projectPath}
        />
      );
    });

    // 0. Reactive template bindings {{ ... }}
    parts = splitByRegex(parts, /\{\{([\s\S]+?)\}\}/g, (match, idx) => {
      const rawExpression = match[1];
      const stableKey = `reactive_${rawExpression.replace(/\s+/g, '_')}_${idx}`;
      return (
        <ReactiveExpression
          key={stableKey}
          rawExpression={rawExpression}
          areaId={areaId}
          projectPath={projectPath}
          state={state}
          updateBloodKey={updateBloodKey}
          currentFile={currentFile}
          lineIndex={lineIndex}
        />
      );
    });

    // 0.5 HTML Spans with inline styles (e.g. for rainbow colors)
    parts = splitByRegex(parts, /<span\s+[^>]*?style=["']([^"']*)["'][^>]*?>([\s\S]*?)<\/span>/gi, (match, idx) => {
      const styleStr = match[1];
      const innerText = match[2];
      
      const styleObj: React.CSSProperties = {};
      const stylePairs = styleStr.split(';');
      for (const pair of stylePairs) {
        const colonIdx = pair.indexOf(':');
        if (colonIdx !== -1) {
          const key = pair.substring(0, colonIdx).trim().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
          const val = pair.substring(colonIdx + 1).trim();
          if (key && val) {
            (styleObj as any)[key] = val;
          }
        }
      }
      
      const stableKey = `html_span_${idx}`;
      return (
        <span key={stableKey} style={styleObj}>
          {renderInline(innerText, lineIndex)}
        </span>
      );
    });

    // 1. WikiLinks [[Note Name]]
    parts = splitByRegex(parts, /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, idx) => {
      const target = match[1].trim();
      const label = match[2] ? match[2].trim() : target;
      const stableKey = `wiki_${target}_${idx}`;
      return (
        <span
          key={stableKey}
          onClick={(e) => {
            e.stopPropagation();
            handleLinkClick(target);
          }}
          className="wiki-link"
          style={{
            color: 'var(--accent-color)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      );
    });

    // 2. Standard Markdown Images / Media tags
    parts = splitByRegex(parts, /!\[([^\]]*)\]\(([^)]+)\)/g, (match, idx) => {
      const alt = match[1];
      const url = match[2];
      
      let finalSrc = url;
      const isWeb = url.startsWith('http://') || url.startsWith('https://');
      
      if (!isWeb) {
        let cleanPath = url;
        if (url.startsWith('file://')) {
          cleanPath = url.replace('file://', '');
        }
        const isRelative = !cleanPath.startsWith('/');
        const absolutePath = isRelative ? `${projectPath}/${cleanPath}` : cleanPath;
        const normalizedPath = absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`;
        finalSrc = `dnote-file://${encodeURI(normalizedPath)}`;
      }

      const cleanUrl = url.split('#')[0].split('?')[0];
      const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';
      const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
      const isAudio = ['mp3', 'wav', 'aac', 'm4a'].includes(ext);

      if (isVideo) {
        return (
          <video
            key={`video_${url}_${idx}`}
            src={finalSrc}
            controls
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            style={{ maxWidth: '100%', borderRadius: '6px', border: '1px solid var(--border-color)', margin: '8px 0', display: 'block' }}
          />
        );
      }
      if (isAudio) {
        return (
          <audio
            key={`audio_${url}_${idx}`}
            src={finalSrc}
            controls
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
            style={{ width: '100%', margin: '8px 0', display: 'block' }}
          />
        );
      }

      return (
        <img
          key={`img_${url}_${idx}`}
          src={finalSrc}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            display: 'block',
            margin: '10px 0',
            objectFit: 'contain',
          }}
        />
      );
    });

    // 3. Document links
    parts = splitByRegex(parts, /\[([^\]]+)\]\(([^)]+)\)/g, (match, idx) => {
      const label = match[1];
      const url = match[2];
      const isMd = url.endsWith('.md');
      const stableKey = `link_${url}_${idx}`;
      return (
        <span
          key={stableKey}
          onClick={(e) => {
            e.stopPropagation();
            if (isMd) {
              handleLinkClick(url.replace('.md', ''));
            } else {
              window.open(url, '_blank');
            }
          }}
          style={{ color: 'var(--accent-color)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 500 }}
        >
          {label}
        </span>
      );
    });

    // 4. Emphasis is parsed in one pass. Sequential bold/italic regexes leave
    // spare stars for adjacent patterns such as *first* ***middle*** *last*.
    const renderEmphasisSegments = (segments: MarkdownEmphasisSegment[], keyPrefix: string): React.ReactNode[] => (
      segments.map((segment, segmentIndex) => {
        const key = `${keyPrefix}_${segmentIndex}_${segment.start}`;
        const children = segment.children?.length
          ? renderEmphasisSegments(segment.children, key)
          : segment.text;
        if (segment.style === 'boldItalic') return <strong key={key}><em>{children}</em></strong>;
        if (segment.style === 'bold') return <strong key={key}>{children}</strong>;
        if (segment.style === 'italic') return <em key={key}>{children}</em>;
        return segment.text;
      })
    );

    const emphasizedParts: React.ReactNode[] = [];
    parts.forEach((part, partIndex) => {
      if (typeof part !== 'string') {
        emphasizedParts.push(part);
        return;
      }
      emphasizedParts.push(...renderEmphasisSegments(parseMarkdownEmphasis(part), `emphasis_${partIndex}`));
    });
    parts = emphasizedParts;

    // 5. Code
    parts = splitByRegex(parts, /`([^`]+)`/g, (match, idx) => (
      <code
        key={`code_${match[1]}_${idx}`}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          backgroundColor: 'rgba(0, 0, 0, 0.04)',
          padding: '2px 5px',
          borderRadius: '4px',
          color: 'var(--text-main)',
        }}
      >
        {match[1]}
      </code>
    ));

    return parts;
  };

  const splitByRegex = (
    parts: React.ReactNode[],
    regex: RegExp,
    renderMatch: (match: RegExpExecArray, matchIndex: number) => React.ReactNode
  ): React.ReactNode[] => {
    const activeRegex = regex.global
      ? regex
      : new RegExp(regex.source, regex.flags + 'g');

    const result: React.ReactNode[] = [];
    parts.forEach((part) => {
      if (typeof part !== 'string') {
        result.push(part);
        return;
      }
      let lastIndex = 0;
      let match;
      let count = 0;
      activeRegex.lastIndex = 0;
      while ((match = activeRegex.exec(part)) !== null) {
        if (match.index > lastIndex) {
          result.push(part.substring(lastIndex, match.index));
        }
        result.push(renderMatch(match, count++));
        lastIndex = activeRegex.lastIndex;
      }
      if (lastIndex < part.length) {
        result.push(part.substring(lastIndex));
      }
    });
    return result;
  };

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
        flexGrow: 1,
        overflowY: 'auto',
        padding: '20px 40px',
        backgroundColor: 'transparent',
        color: 'var(--text-main)',
        fontSize: 'var(--editor-font-size, 14px)',
        lineHeight: 'var(--editor-line-height, 1.6)',
        fontFamily: 'var(--editor-font-family, var(--font-sans))',
        userSelect: 'text',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        height: 0,
        minHeight: 0,
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
