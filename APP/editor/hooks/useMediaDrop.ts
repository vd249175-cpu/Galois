import { useRef, useState } from 'react';

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
    const ext = relativePath.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'webm'].includes(ext)) return `![video](${relativePath})`;
    if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) return `![audio](${relativePath})`;
    return `![media](${relativePath})`;
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

  const archiveAndInsert = async (filesInput: FileList | File[], insertAtLine?: number, insertAtIndex?: number) => {
    if (!projectPath || !currentFile) {
      setStatusMessage('Open a notebook directory and select a note first.');
      return;
    }
    const files = Array.from(filesInput);
    const mediaFiles = files.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'aac', 'm4a', 'mp4', 'webm', 'ogg'].includes(ext);
    });
    if (mediaFiles.length === 0) {
      setStatusMessage('Only image, audio, and video files are supported.');
      return;
    }

    try {
      setStatusMessage(mediaFiles.length > 1 ? `Archiving ${mediaFiles.length} media files...` : 'Archiving media...');
      const markups: string[] = [];
      for (const file of mediaFiles) {
        const sysPath = (window as any).electronAPI.getPathForFile(file);
        if (!sysPath) throw new Error(`Could not retrieve file path for ${file.name}.`);
        const relativePath = await (window as any).electronAPI.archiveMedia(sysPath, projectPath);
        markups.push(buildMediaMarkup(relativePath));
      }
      const blockText = markups.join('\n');

      let nextContent = '';
      if (insertAtLine !== undefined) {
        const lines = contentRef.current.split('\n');
        lines.splice(insertAtLine + 1, 0, ...markups);
        nextContent = lines.join('\n');
      } else if (insertAtIndex !== undefined) {
        nextContent = insertBlockAtIndex(contentRef.current, insertAtIndex, blockText);
      } else if (isPreviewMode) {
        nextContent = appendBlock(contentRef.current, blockText);
      } else {
        nextContent = appendBlock(contentRef.current, blockText);
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

  const handleLineDrop = async (e: React.DragEvent, lineIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredLineIndex(null);

    // Priority 1: Block line drag (moving blocks)
    const sourceLineStr = e.dataTransfer.getData('text/x-dnote-block-line');
    if (sourceLineStr !== '') {
      const sourceLineIdx = parseInt(sourceLineStr, 10);
      if (!isNaN(sourceLineIdx) && sourceLineIdx !== lineIdx) {
        const allLines = contentRef.current.split('\n');
        const lineText = allLines[sourceLineIdx];
        if (lineText !== undefined) {
          allLines.splice(sourceLineIdx, 1);
          allLines.splice(lineIdx, 0, lineText);
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
    handleLineDrop,
  };
}
