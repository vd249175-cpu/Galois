import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { copyCurrentFrameReference } from './frameReference';

interface UseFrameReferenceOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  projectPath: string;
  videoPath: string;
}

export function useFrameReference({
  videoRef,
  projectPath,
  videoPath,
}: UseFrameReferenceOptions) {
  const [isCopyingFrame, setIsCopyingFrame] = useState(false);
  const [frameCopyStatus, setFrameCopyStatus] = useState('');
  const isCopyingRef = useRef(false);
  const statusTimerRef = useRef<number | null>(null);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearStatusTimer, [clearStatusTimer]);

  const handleCopyFrameReference = useCallback(async () => {
    const video = videoRef.current;
    if (isCopyingRef.current) return;
    if (!video) {
      setFrameCopyStatus('复制失败：请先载入视频');
      return;
    }

    isCopyingRef.current = true;
    setIsCopyingFrame(true);
    setFrameCopyStatus('正在保存关键帧…');
    clearStatusTimer();
    try {
      const result = await copyCurrentFrameReference(video, projectPath, videoPath);
      setFrameCopyStatus(`已复制：${result.relativePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[VideoTimeline] Failed to copy frame reference:', error);
      setFrameCopyStatus(`复制失败：${message}`);
    } finally {
      isCopyingRef.current = false;
      setIsCopyingFrame(false);
      statusTimerRef.current = window.setTimeout(() => {
        setFrameCopyStatus('');
        statusTimerRef.current = null;
      }, 3500);
    }
  }, [clearStatusTimer, projectPath, videoPath, videoRef]);

  return { frameCopyStatus, handleCopyFrameReference, isCopyingFrame };
}
