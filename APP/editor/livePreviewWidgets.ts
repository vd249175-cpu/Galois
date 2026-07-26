import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { toDnoteMediaUrl } from './mediaUtils';


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
    wrapper.onpointerdown = (event) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button, audio, video, input, select')) return;
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    };

    const removeButton = document.createElement('button');
    removeButton.className = 'cm-dnote-media-remove';
    removeButton.type = 'button';
    removeButton.textContent = '×';
    removeButton.title = '从正文移除此媒体引用';
    const preserveMediaWidget = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const removeMediaReference = (event: Event) => {
      preserveMediaWidget(event);
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: '' },
        selection: { anchor: this.from },
        scrollIntoView: true,
      });
      view.focus();
    };
    removeButton.onpointerdown = (event) => {
      if (event.button === 0) removeMediaReference(event);
      else preserveMediaWidget(event);
    };
    removeButton.onmousedown = preserveMediaWidget;
    removeButton.onclick = preserveMediaWidget;
    removeButton.oncontextmenu = preserveMediaWidget;

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
    // The widget routes its own pointerdown: media body reveals the source,
    // while remove/playback controls keep ownership of their events.
    return true;
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

export {
  addHiddenSyntax,
  addMark,
  addReplace,
  MarkdownLinkWidget,
  MediaWidget,
  ReactiveWidget,
  selectionTouches,
  TaskCheckboxWidget,
  VideoClipWidget,
  WikiLinkWidget,
  type HiddenRange,
  type LivePreviewOptions,
  type PendingDecoration,
};
