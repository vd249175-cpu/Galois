import { useRef } from 'react';
import type { ParsedBlock } from './markdownBlockParser';
import {
  getRenderedCaretOffset,
  getRenderedTextBounds,
  mapRenderedOffsetToMarkdown,
  markdownForBlockRange,
  normalizedBlockRange,
  removeMarkdownImageToken,
  type ReadingBlockRange,
} from './readingInteraction';

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
}

interface PointerGesture {
  startX: number;
  startY: number;
  moved: boolean;
  blockMode: boolean;
  anchorLine: number | null;
}

const emptyGesture = (): PointerGesture => ({ startX: 0, startY: 0, moved: false, blockMode: false, anchorLine: null });

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
    setSelectedBlockRange, setSelectedMedia,
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
    const blockMode = line !== null && !target.closest('button, input, textarea, select, a, video, audio, .drag-handle, [contenteditable="true"]')
      && (startsInGutter || startsAfterContent);

    gestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      blockMode,
      anchorLine: line,
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
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) gesture.moved = true;
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
      selection && !selection.isCollapsed && selection.toString() &&
      selection.anchorNode && selection.focusNode &&
      event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode)
    ) {
      return;
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

  const removeSelectedMedia = () => {
    if (!selectedMedia) return;
    const lines = content.split('\n');
    const nextLine = removeMarkdownImageToken(lines[selectedMedia.lineIdx] || '', selectedMedia.tokenIndex);
    if (nextLine) lines[selectedMedia.lineIdx] = nextLine;
    else lines.splice(selectedMedia.lineIdx, 1);
    setSelectedMedia(null);
    onContentChange(lines.join('\n'));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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
    onKeyDown,
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
  };
}
