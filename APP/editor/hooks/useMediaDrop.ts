import { useRef, useState } from 'react';
import { getMarkdownMediaKind } from '../mediaUtils';
import {
  isImageOnlyMarkdownLine,
  mergeMarkdownImageLines,
  moveMarkdownImageToken,
} from '../readingInteraction';

interface UseMediaDropOptions {
  projectPath: string;
  currentFile: string;
  isPreviewMode: boolean;
  contentRef: React.MutableRefObject<string>;
  setContent: (content: string) => void;
  saveNodeFile: (content: string) => void;
  setStatusMessage: (msg: string) => void;
}

type DropEvent = React.DragEvent | DragEvent;
type PasteEvent = React.ClipboardEvent | ClipboardEvent;

export function useMediaDrop({
  projectPath,
  currentFile,
  isPreviewMode,
  contentRef,
  setContent,
  saveNodeFile,
  setStatusMessage,
}: UseMediaDropOptions) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    const hasClip = e.dataTransfer.types.includes('text/x-dnote-clip');
    const hasFile = e.dataTransfer.types.includes('Files');
    if ((hasFile || hasClip) && !isPreviewMode) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDraggingFile(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const buildMediaMarkup = (relativePath: string): string => {
    const kind = getMarkdownMediaKind(relativePath);
    if (kind === 'video') return `![video](${relativePath})`;
    if (kind === 'audio') return `![audio](${relativePath})`;
    return `![media](${relativePath})`;
  };

  const isSupportedMediaFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return (
      ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'mp4', 'webm', 'mov', 'm4v'].includes(ext) ||
      file.type.startsWith('image/') ||
      file.type.startsWith('audio/') ||
      file.type.startsWith('video/')
    );
  };

  const archiveFile = async (file: File): Promise<string> => {
    const sysPath = (window as any).electronAPI.getPathForFile(file);
    if (sysPath) {
      return (window as any).electronAPI.archiveMedia(sysPath, projectPath);
    }
    const data = await file.arrayBuffer();
    return (window as any).electronAPI.archiveMediaData(file.name || 'pasted-image.png', file.type || 'image/png', data, projectPath);
  };

  const insertBlockAtIndex = (source: string, insertIndex: number, blockText: string): string => {
    const safeIndex = Math.max(0, Math.min(insertIndex, source.length));
    const before = source.substring(0, safeIndex);
    const after = source.substring(safeIndex);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
    return `${before}${prefix}${blockText}${suffix}${after}`;
  };

  const appendBlock = (source: string, blockText: string): string => {
    const prefix = source.length > 0 && !source.endsWith('\n') ? '\n' : '';
    return `${source}${prefix}${blockText}\n`;
  };

  const archiveAndInsert = async (
    filesInput: FileList | File[],
    insertAtLine?: number,
    insertAtIndex?: number,
    sourceContent?: string
  ) => {
    if (!projectPath || !currentFile) {
      setStatusMessage('Open a notebook directory and select a note first.');
      return;
    }
    const files = Array.from(filesInput);
    const mediaFiles = files.filter(isSupportedMediaFile);
    if (mediaFiles.length === 0) {
      setStatusMessage('Only image, audio, and video files are supported.');
      return;
    }

    try {
      setStatusMessage(mediaFiles.length > 1 ? `Archiving ${mediaFiles.length} media files...` : 'Archiving media...');
      const markups: string[] = [];
      for (const file of mediaFiles) {
        const relativePath = await archiveFile(file);
        markups.push(buildMediaMarkup(relativePath));
      }
      const blockText = markups.join('\n');
      const baseContent = sourceContent ?? contentRef.current;

      let nextContent = '';
      if (insertAtLine !== undefined) {
        const lines = baseContent.split('\n');
        lines.splice(insertAtLine + 1, 0, ...markups);
        nextContent = lines.join('\n');
      } else if (insertAtIndex !== undefined) {
        nextContent = insertBlockAtIndex(baseContent, insertAtIndex, blockText);
      } else if (isPreviewMode) {
        nextContent = appendBlock(baseContent, blockText);
      } else {
        nextContent = appendBlock(baseContent, blockText);
      }

      setContent(nextContent);
      saveNodeFile(nextContent);
      const skippedCount = files.length - mediaFiles.length;
      setStatusMessage(
        skippedCount > 0
          ? `Imported ${mediaFiles.length} media file(s), skipped ${skippedCount} unsupported file(s).`
          : `Imported ${mediaFiles.length} media file(s).`
      );
    } catch (err: any) {
      console.error('[useMediaDrop] archive failed:', err);
      setStatusMessage(`Failed to archive media: ${err.message}`);
    }
  };

  const resetDragState = () => {
    dragCounter.current = 0;
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    resetDragState();

    const clipText = e.dataTransfer.getData('text/x-dnote-clip');
    if (clipText) {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'TEXTAREA') {
        const textarea = target as HTMLTextAreaElement;
        const insertIndex = textarea.selectionStart;
        const val = contentRef.current;
        const before = val.substring(0, insertIndex);
        const after = val.substring(insertIndex);
        const nextContent = before + clipText + after;
        setContent(nextContent);
        saveNodeFile(nextContent);
        setStatusMessage('剪辑片段已插入');
      } else {
        const nextContent = contentRef.current + '\n' + clipText + '\n';
        setContent(nextContent);
        saveNodeFile(nextContent);
        setStatusMessage('剪辑片段已追加到末尾');
      }
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'TEXTAREA') {
      const textarea = target as HTMLTextAreaElement;
      const insertIndex = textarea.selectionStart;
      // For files, we can also insert at the drop line if we split by newline
      const linesBefore = contentRef.current.substring(0, insertIndex).split('\n');
      const lineIdx = linesBefore.length - 1;
      await archiveAndInsert(files, lineIdx);
    } else {
      await archiveAndInsert(files);
    }
  };

  const handleDropAtIndex = async (e: DropEvent, insertIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    resetDragState();

    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) return;

    const clipText = dataTransfer.getData('text/x-dnote-clip');
    if (clipText) {
      const nextContent = insertBlockAtIndex(contentRef.current, insertIndex, clipText);
      setContent(nextContent);
      saveNodeFile(nextContent);
      setStatusMessage('剪辑片段已插入');
      return;
    }

    const files = dataTransfer.files;
    if (files.length === 0) return;
    await archiveAndInsert(files, undefined, insertIndex);
  };

  const handlePasteAtIndex = async (e: PasteEvent, insertIndex: number, sourceContent?: string) => {
    e.preventDefault();
    const files = Array.from(e.clipboardData?.files || []).filter(isSupportedMediaFile);
    if (files.length === 0) return;
    await archiveAndInsert(files, undefined, insertIndex, sourceContent);
  };

  const handleLineDrop = async (e: React.DragEvent, lineIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredLineIndex(null);

    const targetElement = e.target instanceof Element
      ? e.target.closest<HTMLElement>('[data-dnote-media-token]')
      : null;
    const targetTokenIndex = targetElement ? Number(targetElement.dataset.dnoteMediaTokenIndex) : null;
    const targetRect = targetElement?.getBoundingClientRect();
    const insertAfterTarget = targetRect ? e.clientX >= targetRect.left + targetRect.width / 2 : true;
    // Priority 0: a single image from a persisted horizontal image row.
    const mediaToken = e.dataTransfer.getData('text/x-dnote-media-token');
    const mediaSourceLineText = e.dataTransfer.getData('text/x-dnote-media-source-line');
    const mediaSourceIndexText = e.dataTransfer.getData('text/x-dnote-media-source-index');
    if (mediaToken && mediaSourceLineText !== '' && mediaSourceIndexText !== '') {
      const sourceLine = Number(mediaSourceLineText);
      const sourceTokenIndex = Number(mediaSourceIndexText);
      const lines = contentRef.current.split('\n');
      if (Number.isInteger(sourceLine) && Number.isInteger(sourceTokenIndex) && lines[sourceLine] !== undefined) {
        const movedLines = moveMarkdownImageToken(
          lines, sourceLine, sourceTokenIndex, lineIdx, targetTokenIndex, insertAfterTarget
        );
        if (!movedLines) return;
        const nextContent = movedLines.join('\n');
        setContent(nextContent);
        saveNodeFile(nextContent);
        setStatusMessage('图片排布已保存');
        return;
      }
    }

    // Priority 1: Block line drag (moving blocks)
    const sourceLineStr = e.dataTransfer.getData('text/x-dnote-block-line');
    if (sourceLineStr !== '') {
      const sourceLineIdx = parseInt(sourceLineStr, 10);
      if (!isNaN(sourceLineIdx) && sourceLineIdx !== lineIdx) {
        const allLines = contentRef.current.split('\n');
        const lineText = allLines[sourceLineIdx];
        if (lineText !== undefined) {
          const targetLineText = allLines[lineIdx];
          if (isImageOnlyMarkdownLine(lineText) && targetLineText !== undefined && isImageOnlyMarkdownLine(targetLineText)) {
            const mergedLines = mergeMarkdownImageLines(allLines, sourceLineIdx, lineIdx, insertAfterTarget);
            if (!mergedLines) return;
            const nextContent = mergedLines.join('\n');
            setContent(nextContent);
            saveNodeFile(nextContent);
            setStatusMessage('图片已合并到同一行');
            return;
          }
          let insertIdx = lineIdx + 1;
          if (sourceLineIdx < insertIdx) insertIdx -= 1;
          allLines.splice(sourceLineIdx, 1);
          allLines.splice(Math.max(0, Math.min(insertIdx, allLines.length)), 0, lineText);
          const nextContent = allLines.join('\n');
          setContent(nextContent);
          saveNodeFile(nextContent);
          setStatusMessage('区块已移动');
          return;
        }
      }
    }

    // Priority 2: Video clip text (from timeline segment drag)
    const clipText = e.dataTransfer.getData('text/x-dnote-clip');
    if (clipText) {
      const lines = contentRef.current.split('\n');
      lines.splice(lineIdx + 1, 0, clipText);
      const nextContent = lines.join('\n');
      setContent(nextContent);
      saveNodeFile(nextContent);
      setStatusMessage('剪辑片段已插入');
      return;
    }

    // Priority 3: File drop (image/video/audio)
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    await archiveAndInsert(files, lineIdx);
  };

  return {
    isDraggingFile,
    hoveredLineIndex,
    setHoveredLineIndex,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleDropAtIndex,
    handlePasteAtIndex,
    handleLineDrop,
  };
}
