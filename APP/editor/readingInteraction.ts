import type { ParsedBlock } from './markdownBlockParser';
import { getMarkdownMediaKind } from './mediaUtils';

export interface ReadingBlockRange {
  anchorLine: number;
  focusLine: number;
}

export interface MarkdownImageToken {
  markdown: string;
  url: string;
  index: number;
  start: number;
  end: number;
}

export interface VerticalNavigationTarget {
  direction: -1 | 1;
  column: number;
}

const isComparableWhitespace = (value: string) => /\s/.test(value);

/**
 * Map a caret in rendered text back to the closest source-Markdown offset.
 * The rendered DOM omits markers such as `# `, `**`, and link destinations;
 * walking matching visible characters keeps clicks on the visible glyph near
 * the same glyph in the source without maintaining a second Markdown parser.
 */
export function mapRenderedOffsetToMarkdown(
  markdown: string,
  renderedText: string,
  renderedOffset: number
): number {
  if (renderedOffset <= 0) {
    const firstVisible = renderedText.charAt(0);
    if (!firstVisible) return markdown.length;
    const firstSourceIndex = markdown.indexOf(firstVisible);
    return firstSourceIndex >= 0 ? firstSourceIndex : 0;
  }

  let sourceIndex = 0;
  let visibleIndex = 0;
  const target = Math.min(renderedOffset, renderedText.length);
  while (visibleIndex < target && sourceIndex < markdown.length) {
    const visibleChar = renderedText.charAt(visibleIndex);
    let matchIndex = markdown.indexOf(visibleChar, sourceIndex);
    if (isComparableWhitespace(visibleChar)) {
      matchIndex = sourceIndex;
      while (matchIndex < markdown.length && !isComparableWhitespace(markdown.charAt(matchIndex))) {
        matchIndex += 1;
      }
    }
    if (matchIndex < 0 || matchIndex >= markdown.length) {
      // Rendered characters such as checkbox controls may not exist as text.
      visibleIndex += 1;
      continue;
    }
    sourceIndex = matchIndex + 1;
    visibleIndex += 1;
  }
  return Math.max(0, Math.min(sourceIndex, markdown.length));
}

export function getRenderedCaretOffset(root: HTMLElement, clientX: number, clientY: number): number | null {
  const doc = root.ownerDocument;
  let node: Node | null = null;
  let offset = 0;
  const caretPosition = doc.caretPositionFromPoint?.(clientX, clientY);
  if (caretPosition) {
    node = caretPosition.offsetNode;
    offset = caretPosition.offset;
  } else {
    const caretRange = (doc as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    }).caretRangeFromPoint?.(clientX, clientY);
    if (caretRange) {
      node = caretRange.startContainer;
      offset = caretRange.startOffset;
    }
  }
  if (!node || !root.contains(node)) return null;
  const prefix = doc.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(node, offset);
  return prefix.toString().length;
}

export function getVerticalNavigationTarget(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: string
): VerticalNavigationTarget | null {
  if (selectionStart !== selectionEnd || (key !== 'ArrowUp' && key !== 'ArrowDown')) return null;
  const before = value.slice(0, selectionStart);
  const row = before.split('\n').length - 1;
  const rows = value.split('\n');
  const column = before.length - before.lastIndexOf('\n') - 1;
  if (key === 'ArrowUp' && row === 0) return { direction: -1, column };
  if (key === 'ArrowDown' && row === rows.length - 1) return { direction: 1, column };
  return null;
}

export function normalizedBlockRange(range: ReadingBlockRange): [number, number] {
  return [Math.min(range.anchorLine, range.focusLine), Math.max(range.anchorLine, range.focusLine)];
}

export function markdownForBlockRange(content: string, blocks: ParsedBlock[], range: ReadingBlockRange): string {
  const [start, end] = normalizedBlockRange(range);
  const selected = blocks.filter((block) => block.endLine >= start && block.startLine <= end);
  if (selected.length === 0) return '';
  const lines = content.split('\n');
  return lines.slice(selected[0].startLine, selected[selected.length - 1].endLine + 1).join('\n');
}

export function isImageOnlyBlock(block: ParsedBlock): boolean {
  return getMarkdownImageTokens(block.rawText).length > 0 && stripMarkdownImageTokens(block.rawText).trim() === '';
}

export function getMarkdownImageTokens(markdown: string): MarkdownImageToken[] {
  const tokens: MarkdownImageToken[] = [];
  const matcher = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(markdown)) !== null) {
    if (getMarkdownMediaKind(match[1]) !== 'image') continue;
    tokens.push({
      markdown: match[0],
      url: match[1],
      index: tokens.length,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

export function stripMarkdownImageTokens(markdown: string): string {
  return markdown.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (token, url: string) => (
    getMarkdownMediaKind(url) === 'image' ? '' : token
  ));
}

export function isImageOnlyMarkdownLine(markdown: string): boolean {
  return getMarkdownImageTokens(markdown).length > 0 && stripMarkdownImageTokens(markdown).trim() === '';
}

export function removeMarkdownImageToken(markdown: string, tokenIndex: number): string {
  const tokens = getMarkdownImageTokens(markdown);
  const token = tokens[tokenIndex];
  if (!token) return markdown;
  return `${markdown.slice(0, token.start)}${markdown.slice(token.end)}`.replace(/[ \t]{2,}/g, ' ').trim();
}

export function insertMarkdownImageToken(
  markdown: string,
  token: string,
  targetTokenIndex: number | null,
  afterTarget: boolean
): string {
  const tokens = getMarkdownImageTokens(markdown);
  if (tokens.length === 0 || targetTokenIndex === null || !tokens[targetTokenIndex]) {
    return afterTarget ? `${markdown.trim()} ${token}`.trim() : `${token} ${markdown.trim()}`.trim();
  }
  const target = tokens[targetTokenIndex];
  const insertAt = afterTarget ? target.end : target.start;
  const prefix = afterTarget ? ' ' : '';
  const suffix = afterTarget ? '' : ' ';
  return `${markdown.slice(0, insertAt)}${prefix}${token}${suffix}${markdown.slice(insertAt)}`
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function moveMarkdownImageToken(
  sourceLines: string[],
  sourceLine: number,
  sourceTokenIndex: number,
  targetLine: number,
  targetTokenIndex: number | null,
  afterTarget: boolean
): string[] | null {
  const lines = [...sourceLines];
  const sourceToken = getMarkdownImageTokens(lines[sourceLine] || '')[sourceTokenIndex];
  if (!sourceToken || lines[targetLine] === undefined) return null;
  if (sourceLine === targetLine && sourceTokenIndex === targetTokenIndex) return lines;

  const sourceRemainder = removeMarkdownImageToken(lines[sourceLine], sourceTokenIndex);
  let adjustedTargetLine = targetLine;
  if (sourceRemainder) lines[sourceLine] = sourceRemainder;
  else {
    lines.splice(sourceLine, 1);
    if (sourceLine < adjustedTargetLine) adjustedTargetLine -= 1;
  }

  if (lines[adjustedTargetLine] !== undefined && isImageOnlyMarkdownLine(lines[adjustedTargetLine])) {
    let adjustedTargetToken = targetTokenIndex;
    if (sourceLine === targetLine && adjustedTargetToken !== null && sourceTokenIndex < adjustedTargetToken) {
      adjustedTargetToken -= 1;
    }
    lines[adjustedTargetLine] = insertMarkdownImageToken(
      lines[adjustedTargetLine],
      sourceToken.markdown,
      adjustedTargetToken,
      afterTarget
    );
  } else {
    lines.splice(Math.min(adjustedTargetLine + 1, lines.length), 0, sourceToken.markdown);
  }
  return lines;
}

export function mergeMarkdownImageLines(
  sourceLines: string[],
  sourceLine: number,
  targetLine: number,
  afterTarget: boolean
): string[] | null {
  if (sourceLine === targetLine) return [...sourceLines];
  const lines = [...sourceLines];
  const source = lines[sourceLine];
  const target = lines[targetLine];
  if (!isImageOnlyMarkdownLine(source || '') || !isImageOnlyMarkdownLine(target || '')) return null;
  lines[targetLine] = afterTarget ? `${target.trim()} ${source.trim()}` : `${source.trim()} ${target.trim()}`;
  lines.splice(sourceLine, 1);
  return lines;
}

export function getRenderedTextBounds(root: HTMLElement): DOMRect | null {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 ? rect : null;
}
