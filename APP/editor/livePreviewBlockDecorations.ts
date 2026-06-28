import { Decoration, EditorView, WidgetType } from '@codemirror/view';

interface PendingDecoration {
  from: number;
  to: number;
  decoration: Decoration;
}

interface HiddenRange {
  from: number;
  to: number;
}

function selectionTouches(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) return range.from >= from && range.from <= to;
    return range.from < to && range.to > from;
  });
}

function overlapsHidden(hiddenRanges: HiddenRange[], from: number, to: number): boolean {
  return hiddenRanges.some((range) => from < range.to && to > range.from);
}

function addReplace(pending: PendingDecoration[], hiddenRanges: HiddenRange[], view: EditorView, from: number, to: number, widget?: WidgetType) {
  if (selectionTouches(view, from, to) || overlapsHidden(hiddenRanges, from, to)) return;
  pending.push({ from, to, decoration: Decoration.replace(widget ? { widget } : {}) });
  hiddenRanges.push({ from, to });
}

function addMark(pending: PendingDecoration[], hiddenRanges: HiddenRange[], view: EditorView, from: number, to: number, fullFrom: number, fullTo: number, className: string) {
  if (selectionTouches(view, fullFrom, fullTo) || overlapsHidden(hiddenRanges, from, to)) return;
  pending.push({ from, to, decoration: Decoration.mark({ class: className }) });
}

class ListMarkerWidget extends WidgetType {
  constructor(private readonly label: string, private readonly className: string) {
    super();
  }

  eq(other: ListMarkerWidget) {
    return this.label === other.label && this.className === other.className;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.className;
    span.textContent = this.label;
    return span;
  }
}

export function addLivePreviewBlockDecorations(
  pending: PendingDecoration[],
  hiddenRanges: HiddenRange[],
  view: EditorView,
  visibleFrom: number,
  visibleTo: number,
  text: string
) {
  let pos = visibleFrom;
  while (pos <= visibleTo) {
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const active = selectionTouches(view, line.from, line.to);

    if (!active) {
      const bullet = lineText.match(/^(\s*)[-*+]\s+/);
      if (bullet && !lineText.match(/^(\s*)- \[( |x|X)\]\s+/)) {
        pending.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: 'cm-dnote-list-line' }) });
        addReplace(pending, hiddenRanges, view, line.from + bullet[1].length, line.from + bullet[0].length, new ListMarkerWidget('•', 'cm-dnote-list-marker'));
      }

      const ordered = lineText.match(/^(\s*)(\d+)\.\s+/);
      if (ordered) {
        pending.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: 'cm-dnote-list-line' }) });
        addReplace(pending, hiddenRanges, view, line.from + ordered[1].length, line.from + ordered[0].length, new ListMarkerWidget(`${ordered[2]}.`, 'cm-dnote-number-marker'));
      }

      const callout = lineText.match(/^>\s*\[!(\w+)\]\s*(.*)$/);
      if (callout) {
        pending.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: 'cm-dnote-callout-line' }) });
        addReplace(pending, hiddenRanges, view, line.from, line.from + lineText.indexOf(']') + 1, new ListMarkerWidget(callout[1].toUpperCase(), 'cm-dnote-callout-badge'));
      } else if (/^>\s?/.test(lineText)) {
        pending.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: 'cm-dnote-quote-line' }) });
      }

      const trimmed = lineText.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const separator = /^\|(?:\s*:?-+:?\s*\|)+$/.test(trimmed);
        pending.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: separator ? 'cm-dnote-table-separator' : 'cm-dnote-table-line' }) });
      }
    }

    if (line.to >= visibleTo) break;
    pos = line.to + 1;
  }

  for (const match of text.matchAll(/~~([^~\n]+)~~/g)) {
    const start = visibleFrom + (match.index || 0);
    const end = start + match[0].length;
    addReplace(pending, hiddenRanges, view, start, start + 2);
    addReplace(pending, hiddenRanges, view, end - 2, end);
    addMark(pending, hiddenRanges, view, start + 2, end - 2, start, end, 'cm-dnote-strike');
  }

  for (const match of text.matchAll(/==([^=\n]+)==/g)) {
    const start = visibleFrom + (match.index || 0);
    const end = start + match[0].length;
    addReplace(pending, hiddenRanges, view, start, start + 2);
    addReplace(pending, hiddenRanges, view, end - 2, end);
    addMark(pending, hiddenRanges, view, start + 2, end - 2, start, end, 'cm-dnote-highlight');
  }
}
