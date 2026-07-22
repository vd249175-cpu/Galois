import React from 'react';
import type { ParsedBlock } from './markdownBlockParser';
import { MathRenderer } from './MathRenderer';
import { MermaidRenderer } from './MermaidRenderer';

interface MarkdownCodeMathBlockProps {
  block: ParsedBlock;
  content: string;
  idx: number;
  isEditing: boolean;
  beginEditingLineFromClick: (event: React.MouseEvent, lineIdx: number) => void;
  getAbsoluteIndex: (lineIdx: number, offset: number) => number;
  handlePasteAtIndex: (event: React.ClipboardEvent, insertIndex: number, sourceContent?: string) => void;
  setEditingLineIdx: (lineIdx: number | null) => void;
  updateMarkdownLines: (startLineIdx: number, endLineIdx: number, newLines: string[]) => void;
  wrapBlock: (element: React.ReactNode, block: ParsedBlock) => React.ReactNode;
}

export function MarkdownCodeMathBlock({
  beginEditingLineFromClick,
  block,
  content,
  getAbsoluteIndex,
  handlePasteAtIndex,
  idx,
  isEditing,
  setEditingLineIdx,
  updateMarkdownLines,
  wrapBlock,
}: MarkdownCodeMathBlockProps) {
  if (block.type === 'code') {
    const lang = block.codeLang || '';
    const codeText = block.codeText || '';
    const blockEl = isEditing ? (
      <textarea
        defaultValue={codeText}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData?.files || []);
          if (!files.some((file) => file.type.startsWith('image/'))) return;
          const textarea = event.currentTarget;
          const selectionStart = textarea.selectionStart ?? textarea.value.length;
          const draftLines = content.split('\n');
          const newCodeLines = textarea.value.split('\n');
          draftLines.splice(block.startLine, block.endLine - block.startLine + 1, ['```' + lang, ...newCodeLines, '```'].join('\n'));
          handlePasteAtIndex(event, getAbsoluteIndex(block.startLine + 1, selectionStart), draftLines.join('\n'));
        }}
        onBlur={(event) => {
          const newLines = ['```' + lang, ...event.currentTarget.value.split('\n'), '```'];
          updateMarkdownLines(block.startLine, block.endLine, newLines);
          setEditingLineIdx(null);
        }}
        style={{
          width: '100%', minHeight: '120px', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px',
          backgroundColor: 'var(--bg-secondary, rgba(0, 0, 0, 0.05))', padding: '12px', borderRadius: '6px',
          border: '1px solid var(--accent-color, #7000ff)', color: 'var(--text-main)', resize: 'vertical',
          outline: 'none', boxSizing: 'border-box', margin: '12px 0',
        }}
        ref={(element) => element?.focus()}
      />
    ) : (
      <div onClick={(event) => beginEditingLineFromClick(event, block.startLine)} style={{ cursor: 'text', width: '100%' }}>
        {lang.toLowerCase() === 'mermaid' ? (
          <MermaidRenderer key={`mermaid_${idx}`} code={codeText} />
        ) : (
          <div key={`codeblock_${idx}`} style={{ margin: '14px 0', overflowX: 'auto' }}>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', backgroundColor: 'var(--bg-secondary, rgba(0, 0, 0, 0.03))', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', color: 'var(--text-main)', margin: 0, whiteSpace: 'pre' }}>
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
        style={{ width: '100%', minHeight: '96px', boxSizing: 'border-box', resize: 'vertical', border: '1.2px dashed var(--accent-color, #7000ff)', borderRadius: 6, padding: '10px 12px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none' }}
        ref={(element) => element?.focus()}
      />
    ) : (
      <div onClick={(event) => beginEditingLineFromClick(event, block.startLine)} style={{ cursor: 'text', overflowX: 'auto', padding: '8px 4px' }}>
        <MathRenderer expression={block.mathText || ''} displayMode />
      </div>
    );
    return wrapBlock(blockEl, block);
  }

  return null;
}
