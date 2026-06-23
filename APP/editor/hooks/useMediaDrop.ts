import { useRef, useState } from 'react';
import { getFrontmatterLineCount } from '../editorUtils';

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
    if (e.dataTransfer.types.includes('Files') && !isPreviewMode) {
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
        const yamlLines = getFrontmatterLineCount(contentRef.current);
        const lines = contentRef.current.split('\n');
        lines.splice(yamlLines + insertAtLine + 1, 0, markup);
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
