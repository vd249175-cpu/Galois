import React from 'react';
import type { ParsedBlock } from './markdownBlockParser';
import { getMarkdownImageTokens, stripMarkdownImageTokens } from './readingInteraction';

interface MarkdownTextBlockProps {
  beginEditingLineFromClick: any;
  block: ParsedBlock;
  contentVal: string;
  idx: number;
  isEditing: boolean;
  renderBlockEditor: any;
  renderInline: any;
  shouldTreatBlockAsMedia: (rawText: string) => boolean;
  toggleTaskCheckbox: (lineIdx: number, currentlyChecked: boolean) => void;
  wrapBlock: any;
}

export function MarkdownTextBlock({
  beginEditingLineFromClick, block, contentVal, idx, isEditing, renderBlockEditor,
  renderInline, shouldTreatBlockAsMedia, toggleTaskCheckbox, wrapBlock,
}: MarkdownTextBlockProps) {
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
const imageTokens = getMarkdownImageTokens(block.rawText);
const isImageRow = imageTokens.length > 0 && stripMarkdownImageTokens(block.rawText).trim() === '';
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
    className={isImageRow ? 'reading-image-row' : undefined}
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
}
