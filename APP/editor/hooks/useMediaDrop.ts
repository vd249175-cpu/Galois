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

  const archiveAndInsert = async (file: File, insertAtLine?: number) => {
    if (!projectPath || !currentFile) {
      setStatusMessage('Open a notebook directory and select a note first.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isMedia = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(ext);
    if (!isMedia) {
      setStatusMessage('Only image, audio, and video files are supported.');
      return;
    }

    try {
      setStatusMessage('Archiving media...');
      const sysPath = (window as any).electronAPI.getPathForFile(file);
      if (!sysPath) throw new Error('Could not retrieve file path.');
      const relativePath = await (window as any).electronAPI.archiveMedia(sysPath, projectPath);
      const markup = buildMediaMarkup(relativePath);

      let nextContent = '';
      if (insertAtLine !== undefined) {
        const lines = contentRef.current.split('\n');
        lines.splice(insertAtLine + 1, 0, markup);
        nextContent = lines.join('\n');
      } else if (isPreviewMode) {
        nextContent = contentRef.current + '\n' + markup + '\n';
      } else {
        nextContent = contentRef.current + '\n' + markup + '\n';
      }

      setContent(nextContent);
      saveNodeFile(nextContent);
      setStatusMessage('Media archived and embedded successfully.');
    } catch (err: any) {
      console.error('[useMediaDrop] archive failed:', err);
      setStatusMessage(`Failed to archive ${file.name}: ${err.message}`);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingFile(false);
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    await archiveAndInsert(files[0]);
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
    await archiveAndInsert(files[0], lineIdx);
  };

  return {
    isDraggingFile,
    hoveredLineIndex,
    setHoveredLineIndex,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleLineDrop,
  };
}
