import { parseMarkdownBody } from '../utils';

export interface ParsedBlock {
  key: string;
  type: string;
  startLine: number;
  endLine: number;
  rawText: string;
  codeLang?: string;
  codeText?: string;
  mathText?: string;
  tableHeaders?: string[];
  tableAlignments?: string[];
  tableRows?: string[][];
  listIndent?: number;
  listMarker?: string;
  listContentStart?: number;
}

const withKey = (type: string, rawText: string, occurrences: Record<string, number>) => {
  const baseKey = `${type}:${rawText}`;
  const index = occurrences[baseKey] || 0;
  occurrences[baseKey] = index + 1;
  return `${baseKey}_${index}`;
};

export function parseMarkdownIntoBlocks(md: string): ParsedBlock[] {
  const body = parseMarkdownBody(md);
  const bodyIndex = body === md ? 0 : md.indexOf(body);
  const frontmatterLinesOffset = bodyIndex > 0 ? md.slice(0, bodyIndex).split('\n').length - 1 : 0;
  const allLines = md.split('\n');
  const lines = body.split('\n');
  const blocks: ParsedBlock[] = [];
  const occurrences: Record<string, number> = {};
  const isTableRow = (line: string) => line.trim().startsWith('|') && line.trim().endsWith('|');
  const isSeparatorRow = (line: string) => line.trim().startsWith('|') && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line.trim());

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const startLine = frontmatterLinesOffset + i;
    if (line.trim().startsWith('```')) {
      const codeLang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      let end = i + 1;
      while (end < lines.length && !lines[end].trim().startsWith('```')) codeLines.push(lines[end++]);
      const endLine = frontmatterLinesOffset + Math.min(end, lines.length - 1);
      const rawText = allLines.slice(startLine, endLine + 1).join('\n');
      blocks.push({ key: withKey('code', rawText, occurrences), type: 'code', startLine, endLine, rawText, codeLang, codeText: codeLines.join('\n') });
      i = end + 1;
      continue;
    }

    const delimiter = line.trim().startsWith('$$') ? { open: '$$', close: '$$' } : line.trim().startsWith('\\[') ? { open: '\\[', close: '\\]' } : null;
    if (delimiter) {
      const mathLines: string[] = [];
      const remainder = line.trim().slice(delimiter.open.length);
      let end = i;
      if (remainder.endsWith(delimiter.close)) {
        mathLines.push(remainder.slice(0, -delimiter.close.length));
      } else {
        if (remainder) mathLines.push(remainder);
        end = i + 1;
        while (end < lines.length) {
          const candidate = lines[end];
          if (candidate.trim().endsWith(delimiter.close)) {
            mathLines.push(candidate.slice(0, candidate.lastIndexOf(delimiter.close)));
            break;
          }
          mathLines.push(candidate);
          end++;
        }
      }
      const endLine = frontmatterLinesOffset + Math.min(end, lines.length - 1);
      const rawText = allLines.slice(startLine, endLine + 1).join('\n');
      blocks.push({ key: withKey('math', rawText, occurrences), type: 'math', startLine, endLine, rawText, mathText: mathLines.join('\n') });
      i = end + 1;
      continue;
    }

    if (i + 1 < lines.length && isTableRow(line) && isSeparatorRow(lines[i + 1])) {
      const trimCells = (row: string) => {
        const cells = row.split('|').map((cell) => cell.trim());
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();
        return cells;
      };
      const headers = trimCells(line);
      const separators = trimCells(lines[i + 1]);
      const alignments = separators.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
      const rows: string[][] = [];
      let end = i + 2;
      while (end < lines.length && isTableRow(lines[end])) rows.push(trimCells(lines[end++]));
      const endLine = frontmatterLinesOffset + end - 1;
      const rawText = allLines.slice(startLine, endLine + 1).join('\n');
      blocks.push({ key: withKey('table', rawText, occurrences), type: 'table', startLine, endLine, rawText, tableHeaders: headers, tableAlignments: alignments, tableRows: rows });
      i = end;
      continue;
    }

    let type = 'p';
    const heading = line.match(/^(#{1,6})\s+/);
    const task = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/);
    const quoteTask = line.match(/^(\s*(?:>\s*)+)[-*+]\s+\[( |x|X)\]\s+/);
    const unordered = line.match(/^(\s*)[-*+]\s+/);
    const ordered = line.match(/^(\s*)(\d+)[.)]\s+/);
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) type = 'hr';
    else if (heading) type = `h${heading[1].length}`;
    else if (task) type = 'todo';
    else if (quoteTask) type = 'quoteTodo';
    else if (unordered) type = 'li';
    else if (ordered) type = 'oli';
    else if (line.startsWith('> ')) type = 'blockquote';
    else if (line.trim() === '') type = 'empty';
    blocks.push({ key: withKey(type, line, occurrences), type, startLine, endLine: startLine, rawText: line, listIndent: (task?.[1] || quoteTask?.[1] || unordered?.[1] || ordered?.[1] || '').length, listMarker: ordered?.[2], listContentStart: task?.[0].length || quoteTask?.[0].length || unordered?.[0].length || ordered?.[0].length });
    i++;
  }
  return blocks;
}
