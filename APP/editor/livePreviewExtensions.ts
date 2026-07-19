import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { addLivePreviewBlockDecorations } from './livePreviewBlockDecorations';
import { parseMarkdownEmphasis, type MarkdownEmphasisSegment } from './markdownEmphasis';
import { getMarkdownMediaKind, toDnoteMediaUrl } from './mediaUtils';

interface LivePreviewOptions {
  projectPath: string;
  onWikiLink: (target: string) => void;
}

function selectionTouches(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) return range.from >= from && range.from <= to;
    return range.from < to && range.to > from;
  });
}

class WikiLinkWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly label: string,
    private readonly onWikiLink: (target: string) => void
  ) {
    super();
  }

  eq(other: WikiLinkWidget) {
    return this.target === other.target && this.label === other.label;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-dnote-wikilink';
    span.textContent = this.label;
    span.title = `打开笔记: ${this.target}`;
    span.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onWikiLink(this.target);
    };
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

class ReactiveWidget extends WidgetType {
  constructor(private readonly expression: string) {
    super();
  }

  eq(other: ReactiveWidget) {
    return this.expression === other.expression;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-dnote-reactive';
    span.textContent = `{{ ${this.expression.trim()} }}`;
    span.title = '反应式表达式。点击或移动光标进入此处可编辑原始 Markdown。';
    return span;
  }
}

class MediaWidget extends WidgetType {
  constructor(
    private readonly kind: 'image' | 'audio' | 'video' | 'file',
    private readonly label: string,
    private readonly url: string,
    private readonly projectPath: string,
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  eq(other: MediaWidget) {
    return this.kind === other.kind && this.label === other.label && this.url === other.url && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement('span');
    wrapper.className = `cm-dnote-media cm-dnote-media-${this.kind}`;
    wrapper.title = this.kind === 'image' ? '媒体。点击叉号可从正文移除引用。' : this.url;

    const removeButton = document.createElement('button');
    removeButton.className = 'cm-dnote-media-remove';
    removeButton.type = 'button';
    removeButton.textContent = '×';
    removeButton.title = '从正文移除此媒体引用';
    removeButton.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: '' },
        selection: { anchor: this.from },
        scrollIntoView: true,
      });
      view.focus();
    };

    if (this.kind === 'image') {
      const img = document.createElement('img');
      img.src = toDnoteMediaUrl(this.url, this.projectPath);
      img.alt = this.label;
      img.loading = 'lazy';
      wrapper.appendChild(img);
      wrapper.appendChild(removeButton);
      return wrapper;
    }

    if (this.kind === 'audio') {
      const label = document.createElement('span');
      label.textContent = `♪ ${this.label || '播放音频'}`;
      const audio = document.createElement('audio');
      audio.src = toDnoteMediaUrl(this.url, this.projectPath);
      audio.controls = true;
      audio.preload = 'metadata';
      audio.style.width = '240px';
      audio.style.maxWidth = '60vw';
      audio.style.height = '30px';
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '7px';
      wrapper.appendChild(label);
      wrapper.appendChild(audio);
      wrapper.appendChild(removeButton);
      return wrapper;
    }

    const icon = this.kind === 'video' ? '▶' : '□';
    const label = document.createElement('span');
    label.textContent = `${icon} ${this.label || this.url}`;
    wrapper.appendChild(label);
    wrapper.appendChild(removeButton);
    wrapper.title = this.url;
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

class VideoClipWidget extends WidgetType {
  constructor(private readonly label: string, private readonly fileName: string, private readonly range: string) {
    super();
  }

  eq(other: VideoClipWidget) {
    return this.label === other.label && this.fileName === other.fileName && this.range === other.range;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-dnote-video-clip';
    span.textContent = `▶ ${this.label || this.fileName} ${this.range}`;
    span.title = `${this.fileName} ${this.range}`;
    return span;
  }
}

interface PendingDecoration {
  from: number;
  to: number;
  decoration: Decoration;
}

interface HiddenRange {
  from: number;
  to: number;
}

function rangesOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && aTo > bFrom;
}

function overlapsHidden(hiddenRanges: HiddenRange[], from: number, to: number): boolean {
  return hiddenRanges.some((range) => rangesOverlap(from, to, range.from, range.to));
}

function addReplace(
  pending: PendingDecoration[],
  hiddenRanges: HiddenRange[],
  view: EditorView,
  from: number,
  to: number,
  widget: WidgetType
) {
  if (selectionTouches(view, from, to)) return;
  if (overlapsHidden(hiddenRanges, from, to)) return;
  pending.push({ from, to, decoration: Decoration.replace({ widget }) });
  hiddenRanges.push({ from, to });
}

function addHiddenSyntax(
  pending: PendingDecoration[],
  hiddenRanges: HiddenRange[],
  view: EditorView,
  from: number,
  to: number,
  fullFrom: number,
  fullTo: number
) {
  if (selectionTouches(view, fullFrom, fullTo)) return;
  if (overlapsHidden(hiddenRanges, from, to)) return;
  pending.push({ from, to, decoration: Decoration.replace({}) });
  hiddenRanges.push({ from, to });
}

function addMark(
  pending: PendingDecoration[],
  hiddenRanges: HiddenRange[],
  view: EditorView,
  from: number,
  to: number,
  fullFrom: number,
  fullTo: number,
  className: string
) {
  if (selectionTouches(view, fullFrom, fullTo)) return;
  if (overlapsHidden(hiddenRanges, from, to)) return;
  pending.push({ from, to, decoration: Decoration.mark({ class: className }) });
}

class MarkdownLinkWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly url: string,
    private readonly onWikiLink: (target: string) => void
  ) {
    super();
  }

  eq(other: MarkdownLinkWidget) {
    return this.label === other.label && this.url === other.url;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-dnote-md-link';
    span.textContent = this.label;
    span.title = this.url;
    span.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.url.endsWith('.md')) {
        this.onWikiLink(this.url.replace(/\.md$/, ''));
      } else {
        window.open(this.url, '_blank');
      }
    };
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean, private readonly checkboxPosition: number) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return this.checked === other.checked && this.checkboxPosition === other.checkboxPosition;
  }

  toDOM(view: EditorView) {
    const span = document.createElement('span');
    span.className = `cm-dnote-taskbox ${this.checked ? 'checked' : ''}`;
    span.textContent = this.checked ? '☑' : '☐';
    span.setAttribute('role', 'checkbox');
    span.setAttribute('aria-checked', String(this.checked));
    span.title = this.checked ? '标记为未完成' : '标记为完成';
    span.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: {
          from: this.checkboxPosition,
          to: this.checkboxPosition + 1,
          insert: this.checked ? ' ' : 'x',
        },
      });
    };
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

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
