export interface MarkdownTableBlock {
  startLine: number;
  endLine: number;
  tableHeaders?: string[];
  tableAlignments?: string[];
  tableRows?: string[][];
}

export function formatTableRow(cells: string[]) {
  return `| ${cells.map((cell) => cell.trim()).join(' | ')} |`;
}

export function formatSeparatorRow(alignments: string[]) {
  return formatTableRow(alignments.map((alignment) => {
    if (alignment === 'center') return ':---:';
    if (alignment === 'right') return '---:';
    return '---';
  }));
}

export function insertTableRow(lines: string[], block: MarkdownTableBlock) {
  const nextLines = [...lines];
  const colCount = Math.max(block.tableHeaders?.length || 0, 1);
  nextLines.splice(block.endLine + 1, 0, formatTableRow(Array(colCount).fill('')));
  return nextLines;
}

export function addTableColumn(block: MarkdownTableBlock) {
  const headers = [...(block.tableHeaders || [])];
  const alignments = [...(block.tableAlignments || [])];
  const rows = (block.tableRows || []).map((row) => [...row]);
  const nextIndex = headers.length + 1;

  headers.push(`Column ${nextIndex}`);
  alignments.push('left');
  rows.forEach((row) => row.push(''));

  return [
    formatTableRow(headers),
    formatSeparatorRow(alignments),
    ...rows.map((row) => formatTableRow(row)),
  ];
}

export function deleteTableRow(lines: string[], block: MarkdownTableBlock, rowLineIndex: number) {
  const nextLines = [...lines];
  if (rowLineIndex < block.startLine + 2 || rowLineIndex > block.endLine) return nextLines;
  if ((block.tableRows || []).length <= 1) {
    nextLines[rowLineIndex] = formatTableRow(Array(Math.max(block.tableHeaders?.length || 1, 1)).fill(''));
    return nextLines;
  }
  nextLines.splice(rowLineIndex, 1);
  return nextLines;
}

export function deleteTableColumn(block: MarkdownTableBlock, colIdx: number) {
  const headers = [...(block.tableHeaders || [])];
  const alignments = [...(block.tableAlignments || [])];
  const rows = (block.tableRows || []).map((row) => [...row]);
  if (headers.length <= 1 || colIdx < 0 || colIdx >= headers.length) {
    return [
      formatTableRow(headers),
      formatSeparatorRow(alignments),
      ...rows.map((row) => formatTableRow(row)),
    ];
  }

  headers.splice(colIdx, 1);
  alignments.splice(colIdx, 1);
  rows.forEach((row) => row.splice(colIdx, 1));

  return [
    formatTableRow(headers),
    formatSeparatorRow(alignments),
    ...rows.map((row) => formatTableRow(row)),
  ];
}
