import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type RefObject } from 'react';

interface ReadingPasteRevealOptions {
  content: string;
  onContentChange: (content: string) => void;
  previewContainerRef: RefObject<HTMLDivElement | null>;
  setEditingLineIdx: (line: number | null) => void;
}

const mediaTokenPattern = /!\[[^\]]*\]\([^)]+\)|@video\[[^\]]*\]\([^)]+\)/;

export function containsMediaMarkdown(value: string): boolean {
  return mediaTokenPattern.test(value);
}

function targetLineForInsertion(content: string, caretIndex: number, insertedText: string): number {
  const insertionStart = Math.max(0, caretIndex - insertedText.length);
  const visibleLength = insertedText.trimEnd().length;
  const targetIndex = Math.max(insertionStart, insertionStart + visibleLength - 1);
  return content.slice(0, targetIndex).split('\n').length - 1;
}

export function useReadingPasteReveal({
  content,
  onContentChange,
  previewContainerRef,
  setEditingLineIdx,
}: ReadingPasteRevealOptions) {
  const pendingLineRef = useRef<number | null>(null);
  const [revealRequest, setRevealRequest] = useState(0);

  const revealPastedMedia = useCallback((nextContent: string, caretIndex: number, insertedText: string) => {
    if (!containsMediaMarkdown(insertedText)) return false;
    pendingLineRef.current = targetLineForInsertion(nextContent, caretIndex, insertedText);
    setEditingLineIdx(null);
    setRevealRequest((request) => request + 1);
    return true;
  }, [setEditingLineIdx]);

  useEffect(() => {
    if (pendingLineRef.current === null) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const targetLine = pendingLineRef.current;
        const container = previewContainerRef.current;
        if (targetLine === null || !container) return;
        const wrappers = Array.from(container.querySelectorAll<HTMLElement>('[data-dnote-block-start]'));
        const wrapper = wrappers.find((candidate) => {
          const start = Number(candidate.dataset.dnoteBlockStart);
          const end = Number(candidate.dataset.dnoteBlockEnd);
          return targetLine >= start && targetLine <= end;
        });
        if (!wrapper) return;

        const reveal = () => wrapper.scrollIntoView({ block: 'end', inline: 'nearest' });
        container.focus({ preventScroll: true });
        reveal();
        wrapper.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
          if (!image.complete) image.addEventListener('load', reveal, { once: true });
        });
        pendingLineRef.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [content, previewContainerRef, revealRequest]);

  const commitMediaTextPaste = useCallback((
    event: ClipboardEvent<HTMLTextAreaElement>,
    lineIdx: number,
    textarea: HTMLTextAreaElement
  ) => {
    const insertedText = event.clipboardData.getData('text/plain');
    if (!containsMediaMarkdown(insertedText)) return false;

    event.preventDefault();
    event.stopPropagation();
    const selectionStart = textarea.selectionStart ?? textarea.value.length;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const nextLine = `${textarea.value.slice(0, selectionStart)}${insertedText}${textarea.value.slice(selectionEnd)}`;
    const lines = content.split('\n');
    const prefixLength = lines.slice(0, lineIdx).reduce((total, line) => total + line.length + 1, 0);
    lines.splice(lineIdx, 1, ...nextLine.split('\n'));
    const nextContent = lines.join('\n');
    const nextCaret = prefixLength + selectionStart + insertedText.length;
    revealPastedMedia(nextContent, nextCaret, insertedText);
    onContentChange(nextContent);
    return true;
  }, [content, onContentChange, revealPastedMedia]);

  return { commitMediaTextPaste, revealPastedMedia };
}
