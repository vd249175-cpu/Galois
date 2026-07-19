export type MarkdownEmphasisStyle = 'italic' | 'bold' | 'boldItalic';

export interface MarkdownEmphasisSegment {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  text: string;
  style?: MarkdownEmphasisStyle;
  children?: MarkdownEmphasisSegment[];
}

function starRunLength(text: string, start: number): number {
  let end = start;
  while (end < text.length && text[end] === '*') end++;
  return end - start;
}

function findClosingRun(text: string, start: number, end: number, delimiterLength: number): number {
  let cursor = start;
  while (cursor < end) {
    if (text[cursor] === '\n') return -1;
    if (text[cursor] !== '*') {
      cursor++;
      continue;
    }
    const runLength = starRunLength(text, cursor);
    if (runLength === delimiterLength) return cursor;
    cursor += runLength;
  }
  return -1;
}

/**
 * Parses the emphasis subset supported by Galois Live/Reading modes in one
 * pass. Exact star-run matching prevents the spare star in ***...*** from
 * stealing the closing marker of adjacent *...* spans.
 */
function parseMarkdownEmphasisRange(text: string, rangeStart: number, rangeEnd: number): MarkdownEmphasisSegment[] {
  const segments: MarkdownEmphasisSegment[] = [];
  let plainStart = rangeStart;
  let cursor = rangeStart;

  while (cursor < rangeEnd) {
    if (text[cursor] !== '*') {
      cursor++;
      continue;
    }

    const runLength = starRunLength(text, cursor);
    const delimiterLength = runLength >= 3 ? 3 : runLength;
    const closeStart = findClosingRun(text, cursor + runLength, rangeEnd, delimiterLength);
    const candidateContent = closeStart >= 0
      ? text.slice(cursor + delimiterLength, closeStart)
      : '';
    if (
      delimiterLength < 1
      || delimiterLength > 3
      || closeStart <= cursor + delimiterLength
      || candidateContent.trim().length === 0
    ) {
      cursor += runLength;
      continue;
    }

    if (plainStart < cursor) {
      segments.push({
        start: plainStart,
        end: cursor,
        contentStart: plainStart,
        contentEnd: cursor,
        text: text.slice(plainStart, cursor),
      });
    }

    const contentStart = cursor + delimiterLength;
    const contentEnd = closeStart;
    segments.push({
      start: cursor,
      end: closeStart + delimiterLength,
      contentStart,
      contentEnd,
      text: text.slice(contentStart, contentEnd),
      style: delimiterLength === 3 ? 'boldItalic' : delimiterLength === 2 ? 'bold' : 'italic',
      children: parseMarkdownEmphasisRange(text, contentStart, contentEnd),
    });
    cursor = closeStart + delimiterLength;
    plainStart = cursor;
  }

  if (plainStart < rangeEnd) {
    segments.push({
      start: plainStart,
      end: rangeEnd,
      contentStart: plainStart,
      contentEnd: rangeEnd,
      text: text.slice(plainStart, rangeEnd),
    });
  }
  return segments;
}

export function parseMarkdownEmphasis(text: string): MarkdownEmphasisSegment[] {
  return parseMarkdownEmphasisRange(text, 0, text.length);
}
