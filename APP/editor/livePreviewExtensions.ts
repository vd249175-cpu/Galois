import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { addLivePreviewBlockDecorations } from './livePreviewBlockDecorations';
import { parseMarkdownEmphasis, type MarkdownEmphasisSegment } from './markdownEmphasis';
import { getMarkdownMediaKind } from './mediaUtils';
import {
  addHiddenSyntax, addMark, addReplace, MarkdownLinkWidget, MediaWidget,
  ReactiveWidget, selectionTouches, TaskCheckboxWidget, type HiddenRange, type LivePreviewOptions,
  type PendingDecoration, VideoClipWidget, WikiLinkWidget,
} from './livePreviewWidgets';
function buildDecorations(view: EditorView, options: LivePreviewOptions): DecorationSet {
  const pending: PendingDecoration[] = [];
  const hiddenRanges: HiddenRange[] = [];

	  for (const { from, to } of view.visibleRanges) {
	    const text = view.state.doc.sliceString(from, to);
	    addLivePreviewBlockDecorations(pending, hiddenRanges, view, from, to, text);

	    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      const lineIsActive = selectionTouches(view, line.from, line.to);

      if (!lineIsActive) {
        const headingMatch = lineText.match(/^(#{1,6})\s+/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          pending.push({
            from: line.from,
            to: line.from,
            decoration: Decoration.line({ class: `cm-dnote-heading cm-dnote-h${level}` }),
          });
          addHiddenSyntax(pending, hiddenRanges, view, line.from, line.from + headingMatch[0].length, line.from, line.to);
        }

        const taskMatch = lineText.match(/^- \[( |x|X)\]\s+/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x';
          pending.push({
            from: line.from,
            to: line.from,
            decoration: Decoration.line({ class: checked ? 'cm-dnote-task-line checked' : 'cm-dnote-task-line' }),
          });
          addReplace(
            pending,
            hiddenRanges,
            view,
            line.from,
            line.from + taskMatch[0].length,
            new TaskCheckboxWidget(checked, line.from + 3)
          );
        }
      }

      const addEmphasisDecorations = (segments: MarkdownEmphasisSegment[]) => segments.forEach((segment) => {
        if (!segment.style) return;
        const start = line.from + segment.start;
        const end = line.from + segment.end;
        const contentStart = line.from + segment.contentStart;
        const contentEnd = line.from + segment.contentEnd;
        addHiddenSyntax(pending, hiddenRanges, view, start, contentStart, start, end);
        addHiddenSyntax(pending, hiddenRanges, view, contentEnd, end, start, end);
        if (segment.style === 'bold' || segment.style === 'boldItalic') {
          addMark(pending, hiddenRanges, view, contentStart, contentEnd, start, end, 'cm-dnote-bold');
        }
        if (segment.style === 'italic' || segment.style === 'boldItalic') {
          addMark(pending, hiddenRanges, view, contentStart, contentEnd, start, end, 'cm-dnote-italic');
        }
        if (segment.children?.length) addEmphasisDecorations(segment.children);
      });
      addEmphasisDecorations(parseMarkdownEmphasis(lineText));

      if (line.to >= to) break;
      pos = line.to + 1;
    }

    for (const match of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      const start = from + (match.index || 0);
      const end = start + match[0].length;
      const target = match[1].trim();
      addReplace(pending, hiddenRanges, view, start, end, new WikiLinkWidget(target, (match[2] || target).trim(), options.onWikiLink));
    }

    for (const match of text.matchAll(/\{\{([\s\S]+?)\}\}/g)) {
      const start = from + (match.index || 0);
      addReplace(pending, hiddenRanges, view, start, start + match[0].length, new ReactiveWidget(match[1]));
    }

    for (const match of text.matchAll(/@video\[([^\]]*)\]\((.+?)[#?]t=([\d.]+),([\d.]+)\)/g)) {
      const start = from + (match.index || 0);
      const range = `${match[3]}s-${match[4]}s`;
      addReplace(pending, hiddenRanges, view, start, start + match[0].length, new VideoClipWidget(match[1], match[2], range));
    }

    for (const match of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
      const start = from + (match.index || 0);
      const kind = getMarkdownMediaKind(match[2]);
      addReplace(pending, hiddenRanges, view, start, start + match[0].length, new MediaWidget(kind, match[1], match[2], options.projectPath, start, start + match[0].length));
    }

    for (const match of text.matchAll(/(^|[^!])\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
      const prefixLength = match[1].length;
      const start = from + (match.index || 0) + prefixLength;
      const end = start + match[0].length - prefixLength;
      const widget = getMarkdownMediaKind(match[3]) === 'audio'
        ? new MediaWidget('audio', match[2], match[3], options.projectPath, start, end)
        : new MarkdownLinkWidget(match[2], match[3], options.onWikiLink);
      addReplace(pending, hiddenRanges, view, start, end, widget);
    }

    for (const match of text.matchAll(/`([^`\n]+)`/g)) {
      const start = from + (match.index || 0);
      const end = start + match[0].length;
      addHiddenSyntax(pending, hiddenRanges, view, start, start + 1, start, end);
      addHiddenSyntax(pending, hiddenRanges, view, end - 1, end, start, end);
      addMark(pending, hiddenRanges, view, start + 1, end - 1, start, end, 'cm-dnote-inline-code');
    }
  }

  return Decoration.set(pending.map((item) => item.decoration.range(item.from, item.to)), true);
}

export function createLivePreviewExtension(options: LivePreviewOptions) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, options);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, options);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  );
}
