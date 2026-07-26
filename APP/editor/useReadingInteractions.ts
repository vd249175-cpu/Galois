import { useRef } from 'react';
import type { ParsedBlock } from './markdownBlockParser';
import {
  getDomCaretPointFromCoordinates,
  getRenderedCaretOffset,
  getMarkdownSourceRangeFromSelection,
  getRenderedTextBounds,
  mapRenderedOffsetToMarkdown,
  markdownForBlockRange,
  normalizedBlockRange,
  type ReadingBlockRange,
} from './readingInteraction';
import { removeMarkdownMediaToken } from './markdownMediaToken';

interface SelectedMedia {
  lineIdx: number;
  tokenIndex: number;
  markdown: string;
}

interface UseReadingInteractionsOptions {
  beginEditingLine: (lineIdx: number, caretPosition?: number | null) => void;
  blocks: ParsedBlock[];
  content: string;
  onContentChange: (content: string) => void;
  selectedBlockRange: ReadingBlockRange | null;
  selectedMedia: SelectedMedia | null;
  setSelectedBlockRange: (range: ReadingBlockRange | null) => void;
  setSelectedMedia: (media: SelectedMedia | null) => void;
  revealPastedMedia?: (content: string, caretIndex: number, insertedText: string) => boolean;
  finishEditingForSelection?: () => void;
}

interface PointerGesture {
  startX: number;
  startY: number;
  moved: boolean;
  blockMode: boolean;
  blockCandidate: boolean;
  anchorLine: number | null;
  selectionAnchor: { node: Node; offset: number } | null;
  editingOrigin: boolean;
  convertingEditorSelection: boolean;
  latestX: number;
  latestY: number;
}

const emptyGesture = (): PointerGesture => ({
  startX: 0,
  startY: 0,
  moved: false,
  blockMode: false,
  blockCandidate: false,
  anchorLine: null,
  selectionAnchor: null,
  editingOrigin: false,
  convertingEditorSelection: false,
  latestX: 0,
  latestY: 0,
});

function blockLineFromTarget(target: EventTarget | null): number | null {
  const element = target instanceof Element ? target : null;
  const wrapper = element?.closest<HTMLElement>('[data-dnote-block-start]');
  if (!wrapper) return null;
  const line = Number(wrapper.dataset.dnoteBlockStart);
  return Number.isFinite(line) ? line : null;
}

function blockLineFromPoint(container: HTMLElement, clientY: number): number | null {
  const wrappers = Array.from(container.querySelectorAll<HTMLElement>('[data-dnote-block-start]'));
  if (wrappers.length === 0) return null;
  const containing = wrappers.find((wrapper) => {
    const rect = wrapper.getBoundingClientRect();
    return clientY >= rect.top && clientY <= rect.bottom;
  });
  const closest = containing || wrappers.reduce((best, wrapper) => {
    const rect = wrapper.getBoundingClientRect();
    const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
    const bestRect = best.getBoundingClientRect();
    const bestDistance = clientY < bestRect.top ? bestRect.top - clientY : clientY - bestRect.bottom;
    return distance < bestDistance ? wrapper : best;
  });
  const line = Number(closest.dataset.dnoteBlockStart);
  return Number.isFinite(line) ? line : null;
}

export function useReadingInteractions(options: UseReadingInteractionsOptions) {
  const {
    beginEditingLine, blocks, content, onContentChange, selectedBlockRange, selectedMedia,
    setSelectedBlockRange, setSelectedMedia, revealPastedMedia, finishEditingForSelection,
  } = options;
  const gestureRef = useRef<PointerGesture>(emptyGesture());

  const onPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const line = blockLineFromTarget(target);
    const wrapper = target.closest<HTMLElement>('[data-dnote-block-start]');
    const contentRoot = wrapper?.querySelector<HTMLElement>('[data-dnote-block-content]');
    const bounds = contentRoot ? getRenderedTextBounds(contentRoot) : null;
    const wrapperRect = wrapper?.getBoundingClientRect();
    const startsInGutter = Boolean(wrapperRect && event.clientX <= wrapperRect.left + 20);
    const startsAfterContent = Boolean(bounds && event.clientX >= bounds.right + 8);
    const canSelectBlock = line !== null && !target.closest(
      'button, input, textarea, select, a, video, audio, .drag-handle, [contenteditable="true"]'
    );
    const canSelectText = !target.closest(
      'button, input, textarea, select, video, audio, .drag-handle, [contenteditable="true"]'
    );
    const blockMode = canSelectBlock && startsInGutter;
    const blockCandidate = canSelectBlock && startsAfterContent;

    gestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      blockMode,
      blockCandidate,
      anchorLine: line,
      selectionAnchor: canSelectText
        ? getDomCaretPointFromCoordinates(event.currentTarget, event.clientX, event.clientY)
        : null,
      editingOrigin: Boolean(target.closest('textarea[data-dnote-reading-editor]')),
      convertingEditorSelection: false,
      latestX: event.clientX,
      latestY: event.clientY,
    };
    if (blockMode && line !== null) {
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      window.getSelection()?.removeAllRanges();
      setSelectedMedia(null);
      setSelectedBlockRange({ anchorLine: line, focusLine: line });
    }
  };

  const onPointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if ((event.buttons & 1) === 0) return;
    gesture.latestX = event.clientX;
    gesture.latestY = event.clientY;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) gesture.moved = true;
    if (gesture.moved && gesture.editingOrigin && !gesture.convertingEditorSelection) {
      gesture.convertingEditorSelection = true;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      finishEditingForSelection?.();
      const container = event.currentTarget;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const anchor = getDomCaretPointFromCoordinates(container, gesture.startX, gesture.startY);
        const focus = getDomCaretPointFromCoordinates(container, gesture.latestX, gesture.latestY);
        if (!anchor || !focus) return;
        gesture.selectionAnchor = anchor;
        container.focus({ preventScroll: true });
        window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      }));
    }
    if (gesture.moved && gesture.blockCandidate && !gesture.blockMode && gesture.anchorLine !== null) {
      gesture.blockMode = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      window.getSelection()?.removeAllRanges();
      setSelectedMedia(null);
      setSelectedBlockRange({ anchorLine: gesture.anchorLine, focusLine: gesture.anchorLine });
    }
    if (gesture.moved && !gesture.blockMode && gesture.selectionAnchor) {
      const focus = getDomCaretPointFromCoordinates(event.currentTarget, event.clientX, event.clientY);
      if (focus) {
        event.preventDefault();
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        window.getSelection()?.setBaseAndExtent(
          gesture.selectionAnchor.node,
          gesture.selectionAnchor.offset,
          focus.node,
          focus.offset
        );
      }
    }
    if (!gesture.blockMode || gesture.anchorLine === null) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    const focusLine = blockLineFromPoint(event.currentTarget, event.clientY);
    if (focusLine !== null) setSelectedBlockRange({ anchorLine: gesture.anchorLine, focusLine });
  };

  const onPointerUpCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const moved = gesture.moved || Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!gesture.blockMode && moved && window.getSelection()?.toString()) {
      setSelectedBlockRange(null);
      setSelectedMedia(null);
    }
    window.setTimeout(() => {
      gestureRef.current = emptyGesture();
    }, 0);
  };

  const beginEditingLineFromClick = (event: React.MouseEvent, lineIdx: number, rawText: string) => {
    const target = event.target as HTMLElement | null;
    const selection = window.getSelection();
    if (
      gestureRef.current.moved || gestureRef.current.blockMode ||
      (selection && !selection.isCollapsed && selection.toString().length > 0) ||
      target?.closest('button, input, textarea, select, a, video, audio, img, .inline-clip-player, [contenteditable="true"]')
    ) {
      event.stopPropagation();
      return;
    }
    const root = event.currentTarget as HTMLElement;
    const renderedOffset = getRenderedCaretOffset(root, event.clientX, event.clientY);
    const caret = renderedOffset === null
      ? rawText.length
      : mapRenderedOffsetToMarkdown(rawText, root.textContent || '', renderedOffset);
    beginEditingLine(lineIdx, caret);
  };

  const copyText = (event: React.ClipboardEvent<HTMLDivElement>, text: string) => {
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
    void window.electronAPI?.writeClipboardText?.(text);
  };

  const onCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (
      selection && !selection.isCollapsed &&
      selection.anchorNode && selection.focusNode &&
      event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode)
    ) {
      const range = getMarkdownSourceRangeFromSelection(event.currentTarget, selection, content, blocks);
      if (range) {
        copyText(event, content.slice(range.start, range.end));
        return;
      }
      if (selection.toString()) return;
    }
    if (selectedMedia) {
      copyText(event, selectedMedia.markdown);
      return;
    }
    if (selectedBlockRange) {
      const markdown = markdownForBlockRange(content, blocks, selectedBlockRange);
      if (markdown) copyText(event, markdown);
    }
  };

  const replaceNativeSelection = (container: HTMLDivElement, replacement: string) => {
    const selection = window.getSelection();
    const range = getMarkdownSourceRangeFromSelection(container, selection, content, blocks);
    if (!range) return false;
    const nextContent = `${content.slice(0, range.start)}${replacement}${content.slice(range.end)}`;
    const nextCaret = range.start + replacement.length;
    const beforeCaret = nextContent.slice(0, nextCaret);
    const lineIdx = beforeCaret.split('\n').length - 1;
    const lineStart = beforeCaret.lastIndexOf('\n') + 1;
    selection?.removeAllRanges();
    const renderedPaste = revealPastedMedia?.(nextContent, nextCaret, replacement) || false;
    onContentChange(nextContent);
    if (!renderedPaste) beginEditingLine(lineIdx, nextCaret - lineStart);
    return true;
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const replacement = event.clipboardData.getData('text/plain');
    if (!replaceNativeSelection(event.currentTarget, replacement)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onCut = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    const range = getMarkdownSourceRangeFromSelection(event.currentTarget, selection, content, blocks);
    if (!range) return;
    const selectedText = content.slice(range.start, range.end);
    if (!replaceNativeSelection(event.currentTarget, '')) return;
    event.preventDefault();
    event.stopPropagation();
    event.clipboardData.setData('text/plain', selectedText);
    void window.electronAPI?.writeClipboardText?.(selectedText);
  };

  const removeSelectedMedia = () => {
    if (!selectedMedia) return;
    const lines = content.split('\n');
    const nextLine = removeMarkdownMediaToken(lines[selectedMedia.lineIdx] || '', selectedMedia.markdown);
    if (nextLine) lines[selectedMedia.lineIdx] = nextLine;
    else lines.splice(selectedMedia.lineIdx, 1);
    setSelectedMedia(null);
    onContentChange(lines.join('\n'));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const nativeRange = getMarkdownSourceRangeFromSelection(
      event.currentTarget, window.getSelection(), content, blocks
    );
    if (nativeRange) {
      const replacement = event.key === 'Enter'
        ? '\n'
        : event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
          ? event.key
          : '';
      if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter' || replacement) {
        event.preventDefault();
        event.stopPropagation();
        replaceNativeSelection(event.currentTarget, replacement);
        return;
      }
    }
    if (selectedMedia && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      removeSelectedMedia();
      return;
    }
    if (!selectedBlockRange || selectedBlockRange.anchorLine !== selectedBlockRange.focusLine) return;
    const selectedIndex = blocks.findIndex((block) => block.startLine === selectedBlockRange.anchorLine);
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && selectedIndex >= 0) {
      const target = blocks[selectedIndex + (event.key === 'ArrowUp' ? -1 : 1)];
      if (!target) return;
      event.preventDefault();
      setSelectedBlockRange({ anchorLine: target.startLine, focusLine: target.startLine });
      document.querySelector<HTMLElement>(`[data-dnote-block-start="${target.startLine}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      beginEditingLine(selectedBlockRange.anchorLine, 0);
    }
  };

  const isBlockSelected = (block: ParsedBlock) => {
    if (!selectedBlockRange) return false;
    const [start, end] = normalizedBlockRange(selectedBlockRange);
    return block.endLine >= start && block.startLine <= end;
  };

  return {
    beginEditingLineFromClick,
    isBlockSelected,
    onCopy,
    onCut,
    onKeyDown,
    onPaste,
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
  };
}
