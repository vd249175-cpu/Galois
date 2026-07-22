import { useRef, useState } from 'react';
import type React from 'react';

export function useVideoFileDrop(projectPath: string, setVideoPath: (path: string) => void) {
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const dragCounter = useRef(0);
// Drag and Drop File Handlers
const getAbsoluteFilePath = (file: File): string => {
  if ((window as any).electronAPI && (window as any).electronAPI.getPathForFile) {
    return (window as any).electronAPI.getPathForFile(file) || '';
  }
  return (file as any).path || '';
};

const handleDragEnter = (e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current++;
  const hasFiles = e.dataTransfer.types.includes('Files');
  if (hasFiles) {
    setIsDraggingVideo(true);
  }
};

const handleDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current--;
  if (dragCounter.current <= 0) {
    dragCounter.current = 0;
    setIsDraggingVideo(false);
  }
};

const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
};

// Archive a video file to .dnote_assets/videos/ and return the project path.
const archiveVideoFile = async (srcPath: string): Promise<string> => {
    if (!projectPath) throw new Error('请先打开笔记项目，再导入视频');
  return (window as any).electronAPI.archiveVideo(srcPath, projectPath);
};

const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  dragCounter.current = 0;
  setIsDraggingVideo(false);
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    const srcPath = getAbsoluteFilePath(file);
    if (srcPath && /\.(mp4|webm|ogg|mov)$/i.test(srcPath)) {
      const assetPath = await archiveVideoFile(srcPath);
      setVideoPath(assetPath);
    }
  }
};

const handleManualFileOpen = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files && e.target.files.length > 0) {
    const file = e.target.files[0];
    const srcPath = getAbsoluteFilePath(file);
    if (srcPath) {
      const assetPath = await archiveVideoFile(srcPath);
      setVideoPath(assetPath);
    }
  }
};
  return { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handleManualFileOpen, isDraggingVideo };
}

