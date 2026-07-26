import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState, Extension, StateEffect } from '@codemirror/state';
import { drawSelection, dropCursor, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder as cmPlaceholder, ViewUpdate } from '@codemirror/view';
import { createLivePreviewExtension } from './livePreviewExtensions';

export interface EditorTextHandle {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  focus: () => void;
  setSelectionRange: (start: number, end: number) => void;
  getScrollPosition: () => { top: number; left: number };
  setScrollPosition: (top: number, left?: number) => void;
  getCaretCoordinates: (position: number) => { left: number; top: number };
  getPositionAtCoordinates: (clientX: number, clientY: number) => number | null;
}

interface LiveMarkdownEditorProps {
  value: string;
  placeholder?: string;
  onChange: (nextValue: string, selectionStart: number, selectionEnd: number) => void;
  onKeyDown: (event: KeyboardEvent, selectionStart: number, selectionEnd: number) => void;
  onFocus: () => void;
  onSelectionChange: () => void;
  onCompositionStart: () => void;
  onCompositionEnd: (nextValue: string) => void;
  onDropAtPosition?: (event: DragEvent, position: number) => void;
  onPasteAtPosition?: (event: ClipboardEvent, position: number) => void;
  livePreview?: boolean;
  projectPath?: string;
  onWikiLink?: (target: string) => void;
}

function createTheme(): Extension {
  return EditorView.theme({
    '&': {
      flex: '1 1 auto',
      minHeight: '0',
      height: '100%',
      color: 'var(--text-main)',
      backgroundColor: 'transparent',
      fontSize: 'var(--editor-font-size, 14px)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--editor-font-family, var(--font-mono))',
      lineHeight: 'var(--editor-line-height, 1.6)',
      overflow: 'auto',
    },
    '.cm-content': {
      minHeight: '100%',
      padding: '12px 16px',
      caretColor: 'var(--accent-color)',
    },
    '.cm-line': {
      padding: '0 2px',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      borderRight: '1px solid var(--border-color)',
      paddingLeft: '4px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--highlight-color)',
      color: 'var(--accent-color)',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--highlight-color) 45%, transparent)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--accent-color) 24%, transparent)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-placeholder': {
      color: 'var(--text-muted)',
      opacity: '0.75',
    },
  });
}

function getSelection(view: EditorView) {
  const range = view.state.selection.main;
  return {
    start: Math.min(range.anchor, range.head),
    end: Math.max(range.anchor, range.head),
  };
}

export const LiveMarkdownEditor = forwardRef<EditorTextHandle, LiveMarkdownEditorProps>(
  function LiveMarkdownEditor(
    {
      value,
      placeholder = 'Start writing note...',
      onChange,
      onKeyDown,
      onFocus,
      onSelectionChange,
      onCompositionStart,
      onCompositionEnd,
      onDropAtPosition,
      onPasteAtPosition,
      livePreview = false,
      projectPath = '',
      onWikiLink = () => {},
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const valueRef = useRef(value);
    const callbacksRef = useRef({
      onChange,
      onKeyDown,
      onFocus,
      onSelectionChange,
      onCompositionStart,
      onCompositionEnd,
      onDropAtPosition,
      onPasteAtPosition,
    });
    valueRef.current = value;
    callbacksRef.current = {
      onChange,
      onKeyDown,
      onFocus,
      onSelectionChange,
      onCompositionStart,
      onCompositionEnd,
      onDropAtPosition,
      onPasteAtPosition,
    };

    useImperativeHandle(ref, () => ({
      get value() {
        return viewRef.current?.state.doc.toString() ?? valueRef.current;
      },
      get selectionStart() {
        const view = viewRef.current;
        return view ? getSelection(view).start : 0;
      },
      get selectionEnd() {
        const view = viewRef.current;
        return view ? getSelection(view).end : 0;
      },
      focus() {
        viewRef.current?.focus();
      },
      setSelectionRange(start: number, end: number) {
        const view = viewRef.current;
        if (!view) return;
        const safeStart = Math.max(0, Math.min(start, view.state.doc.length));
        const safeEnd = Math.max(0, Math.min(end, view.state.doc.length));
        view.dispatch({
          selection: { anchor: safeStart, head: safeEnd },
          scrollIntoView: true,
        });
      },
      getScrollPosition() {
        const scrollDOM = viewRef.current?.scrollDOM;
        return { top: scrollDOM?.scrollTop || 0, left: scrollDOM?.scrollLeft || 0 };
      },
      setScrollPosition(top: number, left = 0) {
        const scrollDOM = viewRef.current?.scrollDOM;
        if (!scrollDOM) return;
        scrollDOM.scrollTop = top;
        scrollDOM.scrollLeft = left;
      },
      getCaretCoordinates(position: number) {
        const view = viewRef.current;
        const host = hostRef.current;
        if (!view || !host) return { left: 12, top: 36 };
        const safePosition = Math.max(0, Math.min(position, view.state.doc.length));
        const coords = view.coordsAtPos(safePosition);
        const hostRect = host.getBoundingClientRect();
        if (!coords) return { left: 12, top: 36 };
        return {
          left: Math.min(Math.max(coords.left - hostRect.left, 12), Math.max(hostRect.width - 330, 12)),
          top: Math.min(Math.max(coords.bottom - hostRect.top + 4, 28), Math.max(hostRect.height - 230, 28)),
        };
      },
      getPositionAtCoordinates(clientX: number, clientY: number) {
        const view = viewRef.current;
        if (!view) return null;
        return view.posAtCoords({ x: clientX, y: clientY }) ?? view.state.selection.main.head;
      },
    }), []);

    useEffect(() => {
      if (!hostRef.current || viewRef.current) return;

      const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
        const selection = getSelection(update.view);
        if (update.docChanged) {
          callbacksRef.current.onChange(update.state.doc.toString(), selection.start, selection.end);
        } else if (update.selectionSet) {
          callbacksRef.current.onSelectionChange();
        }
      });

      const view = new EditorView({
        parent: hostRef.current,
        state: EditorState.create({
          doc: valueRef.current,
          extensions: [
            lineNumbers(),
            drawSelection(),
            dropCursor(),
            indentOnInput(),
            bracketMatching(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            highlightActiveLine(),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ spellcheck: 'false' }),
            EditorView.theme({
              '.cm-content': {
                minHeight: '100%',
              },
            }),
            EditorView.domEventHandlers({
              keydown: (event, currentView) => {
                const selection = getSelection(currentView);
                callbacksRef.current.onKeyDown(event, selection.start, selection.end);
                return event.defaultPrevented;
              },
              focus: () => {
                callbacksRef.current.onFocus();
                return false;
              },
              keyup: () => {
                callbacksRef.current.onSelectionChange();
                return false;
              },
              mouseup: () => {
                callbacksRef.current.onSelectionChange();
                return false;
              },
              click: () => {
                callbacksRef.current.onSelectionChange();
                return false;
              },
              scroll: () => {
                callbacksRef.current.onSelectionChange();
                return false;
              },
              compositionstart: () => {
                callbacksRef.current.onCompositionStart();
                return false;
              },
              compositionend: (_event, currentView) => {
                callbacksRef.current.onCompositionEnd(currentView.state.doc.toString());
                return false;
              },
              drop: (event, currentView) => {
                const hasClip = event.dataTransfer?.types.includes('text/x-dnote-clip') ?? false;
                const hasFile = event.dataTransfer?.types.includes('Files') ?? false;
                if (!hasClip && !hasFile) return false;
                event.preventDefault();
                const position = currentView.posAtCoords({ x: event.clientX, y: event.clientY }) ?? currentView.state.selection.main.head;
                callbacksRef.current.onDropAtPosition?.(event, position);
                return true;
              },
              paste: (event, currentView) => {
                const files = Array.from(event.clipboardData?.files || []);
                const hasImage = files.some((file) => file.type.startsWith('image/'));
                if (!hasImage) {
                  requestAnimationFrame(() => {
                    const head = currentView.state.selection.main.head;
                    currentView.dispatch({
                      effects: EditorView.scrollIntoView(head, { y: 'nearest' }),
                    });
                  });
                  return false;
                }
                event.preventDefault();
                callbacksRef.current.onPasteAtPosition?.(event, currentView.state.selection.main.head);
                return true;
              },
            }),
            EditorView.editable.of(true),
            EditorState.tabSize.of(2),
            EditorView.theme({
              '.cm-placeholder': {
                pointerEvents: 'none',
              },
            }),
            cmPlaceholder(placeholder),
            keymap.of([indentWithTab, ...defaultKeymap]),
            livePreview ? createLivePreviewExtension({ projectPath, onWikiLink }) : [],
            updateListener,
            createTheme(),
          ],
        }),
      });

      viewRef.current = view;
      import('@codemirror/lang-markdown')
        .then((mod) => {
          if (viewRef.current === view) {
            view.dispatch({
              effects: StateEffect.appendConfig.of(mod.markdown()),
            });
          }
        })
        .catch((err) => console.error('[LiveMarkdownEditor] Failed to load markdown extension:', err));
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current === value) return;
      const selection = view.state.selection.main;
      const anchor = Math.min(selection.anchor, value.length);
      const head = Math.min(selection.head, value.length);
      const scrollDOM = view.scrollDOM;
      const scrollTop = scrollDOM.scrollTop;
      const scrollLeft = scrollDOM.scrollLeft;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor, head },
      });
      requestAnimationFrame(() => {
        scrollDOM.scrollTop = scrollTop;
        scrollDOM.scrollLeft = scrollLeft;
      });
    }, [value]);

    return <div ref={hostRef} className="live-markdown-editor" />;
  }
);
