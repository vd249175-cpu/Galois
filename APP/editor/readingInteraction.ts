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

export interface ReadingSourceRange {
  start: number;
  end: number;
}

export interface DomCaretPoint {
  node: Node;
  offset: number;
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
  const point = getDomCaretPointFromCoordinates(root, clientX, clientY);
  return point ? getRenderedOffsetForDomPosition(root, point.node, point.offset) : null;
}

export function getDomCaretPointFromCoordinates(
  root: HTMLElement,
  clientX: number,
  clientY: number
): DomCaretPoint | null {
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
  if (!node || (node !== root && !root.contains(node))) return null;
  return { node, offset };
}

export function getRenderedOffsetForDomPosition(
  root: HTMLElement,
  node: Node,
  offset: number
): number | null {
  if (node !== root && !root.contains(node)) return null;
  const doc = root.ownerDocument;
  const prefix = doc.createRange();
  prefix.selectNodeContents(root);
  try {
    prefix.setEnd(node, offset);
    return prefix.toString().length;
  } catch {
    return null;
  }
}

function sourceOffsetForSelectionEndpoint(
  container: HTMLElement,
  node: Node,
  offset: number,
  content: string,
  blocks: ParsedBlock[]
): number | null {
  const element = node instanceof Element ? node : node.parentElement;
  const wrapper = element?.closest<HTMLElement>('[data-dnote-block-start]');
  if (!wrapper || !container.contains(wrapper)) return null;
  const contentRoot = wrapper.querySelector<HTMLElement>('[data-dnote-block-content]');
  if (!contentRoot) return null;
  const renderedOffset = getRenderedOffsetForDomPosition(contentRoot, node, offset);
  if (renderedOffset === null) return null;
  const line = Number(wrapper.dataset.dnoteBlockStart);
  const block = blocks.find((candidate) => candidate.startLine === line);
  if (!block) return null;
  const blockStart = sourceStartForLine(content, block.startLine);
  const localOffset = mapRenderedOffsetToMarkdown(
    block.rawText,
    contentRoot.textContent || '',
    renderedOffset
  );
  return blockStart + localOffset;
}

function sourceStartForLine(content: string, line: number): number {
  return content.split('\n').slice(0, line).reduce((total, value) => total + value.length + 1, 0);
}

function selectedMediaSourceRange(
  container: HTMLElement,
  selection: Selection,
  content: string,
  blocks: ParsedBlock[]
): ReadingSourceRange | null {
  let start = Number.POSITIVE_INFINITY;
  let end = -1;
  const mediaElements = Array.from(container.querySelectorAll<HTMLElement>('[data-dnote-media-token]'));
  for (const media of mediaElements) {
    let intersects = false;
    for (let index = 0; index < selection.rangeCount; index += 1) {
      try { intersects ||= selection.getRangeAt(index).intersectsNode(media); } catch { /* detached node */ }
    }
    if (!intersects) continue;
    const token = media.dataset.dnoteMediaToken;
    const wrapper = media.closest<HTMLElement>('[data-dnote-block-start]');
    const contentRoot = wrapper?.querySelector<HTMLElement>('[data-dnote-block-content]');
    const line = Number(wrapper?.dataset.dnoteBlockStart);
    const block = blocks.find((candidate) => candidate.startLine === line);
    if (!token || !wrapper || !contentRoot || !block) continue;
    const peers = Array.from(contentRoot.querySelectorAll<HTMLElement>('[data-dnote-media-token]'));
    const peerIndex = peers.indexOf(media);
    const duplicateIndex = peers.slice(0, peerIndex).filter((peer) => peer.dataset.dnoteMediaToken === token).length;
    let localStart = -1;
    let searchFrom = 0;
    for (let occurrence = 0; occurrence <= duplicateIndex; occurrence += 1) {
      localStart = block.rawText.indexOf(token, searchFrom);
      if (localStart < 0) break;
      searchFrom = localStart + token.length;
    }
    if (localStart < 0) continue;
    const absoluteStart = sourceStartForLine(content, block.startLine) + localStart;
    start = Math.min(start, absoluteStart);
    end = Math.max(end, absoluteStart + token.length);
  }
  return Number.isFinite(start) && end > start ? { start, end } : null;
}

export function getMarkdownSourceRangeFromSelection(
  container: HTMLElement,
  selection: Selection | null,
  content: string,
  blocks: ParsedBlock[]
): ReadingSourceRange | null {
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return null;
  const anchor = sourceOffsetForSelectionEndpoint(
    container, selection.anchorNode, selection.anchorOffset, content, blocks
  );
  const focus = sourceOffsetForSelectionEndpoint(
    container, selection.focusNode, selection.focusOffset, content, blocks
  );
  const media = selectedMediaSourceRange(container, selection, content, blocks);
  const offsets = [anchor, focus, media?.start, media?.end].filter((value): value is number => value !== null && value !== undefined);
  if (offsets.length < 2) return null;
  const start = Math.min(...offsets);
  const end = Math.max(...offsets);
  return end > start ? { start, end } : null;
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

export function isTextareaCaretOnVerticalBoundary(
  textarea: HTMLTextAreaElement,
  direction: -1 | 1
): boolean {
  if (textarea.selectionStart !== textarea.selectionEnd) return false;
  const style = textarea.ownerDocument.defaultView?.getComputedStyle(textarea);
  if (!style) return true;
  const mirror = textarea.ownerDocument.createElement('div');
  const properties = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'textIndent', 'wordSpacing', 'tabSize',
  ] as const;
  for (const property of properties) (mirror.style as any)[property] = style[property];
  mirror.style.position = 'fixed';
  mirror.style.left = '-10000px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.wordBreak = style.wordBreak;

  const before = textarea.value.slice(0, textarea.selectionStart);
  const after = textarea.value.slice(textarea.selectionStart);
  mirror.append(textarea.ownerDocument.createTextNode(before));
  const marker = textarea.ownerDocument.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(marker, textarea.ownerDocument.createTextNode(after || '\u200b'));
  textarea.ownerDocument.body.appendChild(mirror);
  const markerTop = marker.offsetTop;
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 16;
  const contentTop = Number.parseFloat(style.paddingTop) || 0;
  const contentBottom = mirror.scrollHeight - (Number.parseFloat(style.paddingBottom) || 0);
  mirror.remove();
  return direction < 0
    ? markerTop <= contentTop + lineHeight * 0.35
    : markerTop + lineHeight >= contentBottom - lineHeight * 0.35;
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
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.trim()) {
      const range = root.ownerDocument.createRange();
      range.selectNodeContents(node);
      rects.push(...Array.from(range.getClientRects()));
    }
    node = walker.nextNode();
  }
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}
