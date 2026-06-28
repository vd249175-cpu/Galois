export interface EditResult {
  text: string;
  newStart: number;
  newEnd: number;
}

export interface SmartEditResult extends EditResult {
  handled: boolean;
}

function lineBounds(content: string, position: number) {
  const lineStart = content.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const lineEndIndex = content.indexOf('\n', position);
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  return { lineStart, lineEnd, lineText: content.substring(lineStart, lineEnd) };
}

function replaceRange(content: string, start: number, end: number, replacement: string, cursorOffset = replacement.length): EditResult {
  return {
    text: content.substring(0, start) + replacement + content.substring(end),
    newStart: start + cursorOffset,
    newEnd: start + cursorOffset,
  };
}

function handled(result: EditResult): SmartEditResult {
  return { ...result, handled: true };
}

function wrapInline(content: string, start: number, end: number, left: string, right = left, placeholder = ''): EditResult {
  const selectedText = content.substring(start, end) || placeholder;
  const replacement = `${left}${selectedText}${right}`;
  return {
    text: content.substring(0, start) + replacement + content.substring(end),
    newStart: start + left.length,
    newEnd: start + left.length + selectedText.length,
  };
}

function prefixCurrentLine(content: string, start: number, end: number, prefix: string): EditResult {
  const { lineStart, lineEnd, lineText } = lineBounds(content, start);
  const cleanLine = lineText.replace(/^(#{1,6}\s+|[-*+]\s+|\d+\.\s+|- \[[ xX]\]\s+|>\s*)/, '');
  const replacement = `${prefix}${cleanLine}`;
  return {
    text: content.substring(0, lineStart) + replacement + content.substring(lineEnd),
    newStart: start + prefix.length,
    newEnd: end + prefix.length,
  };
}

export function applyMarkdownFormatting(
  type: string,
  currentVal: string,
  start: number,
  end: number,
  urlArg?: string
): EditResult {
  switch (type) {
    case 'bold':
      return wrapInline(currentVal, start, end, '**', '**', 'bold');
    case 'italic':
      return wrapInline(currentVal, start, end, '*', '*', 'italic');
    case 'strike':
      return wrapInline(currentVal, start, end, '~~', '~~', 'strike');
    case 'highlight':
      return wrapInline(currentVal, start, end, '==', '==', 'highlight');
    case 'code-inline':
      return wrapInline(currentVal, start, end, '`', '`', 'code');
    case 'wiki-link':
      return wrapInline(currentVal, start, end, '[[', ']]', 'Note');
    case 'link': {
      const url = urlArg !== undefined ? urlArg : 'https://';
      const selectedText = currentVal.substring(start, end) || 'link';
      const replacement = `[${selectedText}](${url})`;
      return {
        text: currentVal.substring(0, start) + replacement + currentVal.substring(end),
        newStart: start + 1,
        newEnd: start + 1 + selectedText.length,
      };
    }
    case 'h1':
      return prefixCurrentLine(currentVal, start, end, '# ');
    case 'h2':
      return prefixCurrentLine(currentVal, start, end, '## ');
    case 'h3':
      return prefixCurrentLine(currentVal, start, end, '### ');
    case 'todo':
      return prefixCurrentLine(currentVal, start, end, '- [ ] ');
    case 'bullet':
      return prefixCurrentLine(currentVal, start, end, '- ');
    case 'number':
      return prefixCurrentLine(currentVal, start, end, '1. ');
    case 'quote':
      return prefixCurrentLine(currentVal, start, end, '> ');
    case 'callout':
      return replaceRange(currentVal, start, end, '> [!note]\n> ', 12);
    case 'hr':
      return replaceRange(currentVal, start, end, '---\n', 4);
    case 'table':
      return replaceRange(currentVal, start, end, '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n', 2);
    case 'code-block': {
      const selectedText = currentVal.substring(start, end);
      const replacement = `\`\`\`\n${selectedText}\n\`\`\``;
      return {
        text: currentVal.substring(0, start) + replacement + currentVal.substring(end),
        newStart: start + 4,
        newEnd: start + 4 + selectedText.length,
      };
    }
    default:
      return { text: currentVal, newStart: start, newEnd: end };
  }
}

export function handleSmartEnter(content: string, start: number, end: number): SmartEditResult {
  if (start !== end) return { handled: false, text: content, newStart: start, newEnd: end };
  const { lineStart, lineEnd, lineText } = lineBounds(content, start);
  const beforeCaret = content.substring(lineStart, start);
  const afterCaret = content.substring(start, lineEnd);
  const indent = lineText.match(/^\s*/)?.[0] || '';

  const tableCells = lineText.trim().startsWith('|') && lineText.trim().endsWith('|')
    ? lineText.split('|').slice(1, -1).length
    : 0;
  if (tableCells > 0 && !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lineText.trim())) {
    const row = `\n| ${Array(Math.max(tableCells, 1)).fill(' ').join(' | ')} |`;
    return handled(replaceRange(content, lineEnd, lineEnd, row, 3));
  }

  const task = beforeCaret.match(/^(\s*)- \[( |x|X)\]\s*(.*)$/);
  if (task) {
    if (task[3].trim() === '' && afterCaret.trim() === '') {
      return handled(replaceRange(content, lineStart, lineEnd, indent));
    }
    return handled(replaceRange(content, start, end, `\n${task[1]}- [ ] `));
  }

  const bullet = beforeCaret.match(/^(\s*)[-*+]\s+(.*)$/);
  if (bullet) {
    if (bullet[2].trim() === '' && afterCaret.trim() === '') {
      return handled(replaceRange(content, lineStart, lineEnd, indent));
    }
    return handled(replaceRange(content, start, end, `\n${bullet[1]}- `));
  }

  const number = beforeCaret.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (number) {
    if (number[3].trim() === '' && afterCaret.trim() === '') {
      return handled(replaceRange(content, lineStart, lineEnd, indent));
    }
    return handled(replaceRange(content, start, end, `\n${number[1]}${Number(number[2]) + 1}. `));
  }

  const quote = beforeCaret.match(/^(\s*)>\s?(.*)$/);
  if (quote) {
    if (quote[2].trim() === '' && afterCaret.trim() === '') {
      return handled(replaceRange(content, lineStart, lineEnd, indent));
    }
    return handled(replaceRange(content, start, end, `\n${quote[1]}> `));
  }

  return { handled: false, text: content, newStart: start, newEnd: end };
}

export function handleSmartTab(content: string, start: number, end: number, outdent: boolean): SmartEditResult {
  if (start !== end) return { handled: false, text: content, newStart: start, newEnd: end };
  const { lineStart, lineText } = lineBounds(content, start);
  if (lineText.trim().startsWith('|') && lineText.trim().endsWith('|')) {
    const direction = outdent ? -1 : 1;
    const separators = [...lineText.matchAll(/\|/g)].map((match) => lineStart + (match.index || 0));
    const nextSep = direction > 0
      ? separators.find((pos) => pos > start)
      : [...separators].reverse().find((pos) => pos < start - 1);
    if (nextSep !== undefined) {
      const nextPos = direction > 0 ? Math.min(nextSep + 2, content.length) : Math.max(nextSep + 2, lineStart);
      return { handled: true, text: content, newStart: nextPos, newEnd: nextPos };
    }
  }

  const marker = /^(\s*)([-*+]|\d+\.|- \[[ xX]\])\s+/.exec(lineText);
  if (!marker) return { handled: false, text: content, newStart: start, newEnd: end };
  if (outdent) {
    if (marker[1].length < 2) return { handled: true, text: content, newStart: start, newEnd: end };
    return handled(replaceRange(content, lineStart, lineStart + 2, '', 0));
  }
  return handled(replaceRange(content, lineStart, lineStart, '  ', 2));
}
