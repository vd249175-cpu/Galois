export type MarkdownEmphasisStyle = 'italic' | 'bold' | 'boldItalic';

export interface MarkdownEmphasisSegment {
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  text: string;
  style?: MarkdownEmphasisStyle;
}

function starRunLength(text: string, start: number): number {
  let end = start;
  while (end < text.length && text[end] === '*') end++;
  return end - start;
}

function findClosingRun(text: string, start: number, delimiterLength: number): number {
  let cursor = start;
  while (cursor < text.length) {
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
export function parseMarkdownEmphasis(text: string): MarkdownEmphasisSegment[] {
  const segments: MarkdownEmphasisSegment[] = [];
  let plainStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    if (text[cursor] !== '*') {
      cursor++;
      continue;
    }

    const runLength = starRunLength(text, cursor);
    const delimiterLength = runLength >= 3 ? 3 : runLength;
    const closeStart = findClosingRun(text, cursor + runLength, delimiterLength);
    if (delimiterLength < 1 || delimiterLength > 3 || closeStart <= cursor + delimiterLength) {
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
    });
    cursor = closeStart + delimiterLength;
    plainStart = cursor;
  }

  if (plainStart < text.length) {
    segments.push({
      start: plainStart,
      end: text.length,
      contentStart: plainStart,
      contentEnd: text.length,
      text: text.slice(plainStart),
    });
  }
  return segments;
}
