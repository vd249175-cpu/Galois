/**
 * InlineClipPlayer — A compact, self-contained video clip player
 * that renders inside the Markdown preview for @video[...](...)  syntax.
 *
 * Features:
 * - Loads the video from the project's .dnote_assets/videos path
 * - Plays only between [start, end] time range (loops by default)
 * - Has a mini draggable timeline scrubber below the video
 * - Mutes audio during scrubbing for performance
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { formatTimestamp } from '../utils';
import { InlineClipPlayerSurface } from './InlineClipPlayerSurface';

interface InlineClipPlayerProps {
  label: string;
  fileName: string;
  start: number;
  end: number;
  projectPath: string;
}

export function InlineClipPlayer({ label: _label, fileName, start, end, projectPath }: InlineClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubBarRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const timeReadRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number>(0);
  const isScrubbingRef = useRef(false);
  const wasMutedRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const duration = end - start;

  // Resolve video src — search .dnote_assets/videos/ for the file
  const getAbsoluteVideoSrc = () => {
    if (!projectPath) return '';
    const fullPath = `${projectPath}/.dnote_assets/videos/${fileName}`;
    const absolutePath = fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
    return `dnote-file://${encodeURI(absolutePath)}`;
  };
  const videoSrc = getAbsoluteVideoSrc();
  const absoluteVideoPath = projectPath ? `${projectPath}/.dnote_assets/videos/${fileName}` : '';

  const clampTime = (t: number) => Math.max(start, Math.min(end, t));

  // Update DOM elements from video currentTime
  const syncUI = useCallback((t: number) => {
    const pct = duration > 0 ? ((t - start) / duration) * 100 : 0;
    if (playheadRef.current) playheadRef.current.style.left = `${pct}%`;
    if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
    if (timeReadRef.current) timeReadRef.current.textContent = `${formatTimestamp(t - start)} / ${formatTimestamp(duration)}`;
  }, [start, end, duration]);

  // On metadata loaded — jump to start
  const handleLoaded = () => {
    setLoaded(true);
    if (videoRef.current) {
      videoRef.current.currentTime = start;
      syncUI(start);
    }
  };

  // Enforce [start, end] boundary during playback
  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || isScrubbingRef.current) return;
    const t = v.currentTime;
    syncUI(t);
    if (t >= end - 0.05) {
      v.currentTime = start;
      v.pause();
      setIsPlaying(false);
    }
  };

  // Play / Pause toggle
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !loaded) return;
    if (isPlaying) {
      v.pause();
      setIsPlaying(false);
    } else {
      if (v.currentTime >= end - 0.05) v.currentTime = start;
      v.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  // Mini scrubber mouse handling
  const startScrub = useCallback((clientX: number) => {
    const bar = scrubBarRef.current;
    const v = videoRef.current;
    if (!bar || !v || !loaded) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const t = clampTime(start + ratio * duration);
    if (!v.seeking) v.currentTime = t;
    syncUI(t);
  }, [start, end, duration, loaded]);

  const handleScrubStart = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    wasMutedRef.current = v.muted;
    wasPlayingBeforeScrubRef.current = !v.paused;
    v.muted = true;
    if (wasPlayingBeforeScrubRef.current) {
      v.pause();
      setIsPlaying(false);
    }
    startScrub(e.clientX);

    const onMove = (me: MouseEvent) => { me.preventDefault(); startScrub(me.clientX); };
    const onUp = () => {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      if (v) {
        v.muted = wasMutedRef.current;
        if (wasPlayingBeforeScrubRef.current) {
          v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        } else {
          v.pause();
          setIsPlaying(false);
        }
      }
      wasPlayingBeforeScrubRef.current = false;
      window.removeEventListener('mousemove', onMove, { capture: true });
      window.removeEventListener('mouseup', onUp, { capture: true });
    };
    window.addEventListener('mousemove', onMove, { capture: true });
    window.addEventListener('mouseup', onUp, { capture: true });
  };

  const handleFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) {
      v.requestFullscreen();
    } else if ((v as any).webkitRequestFullscreen) {
      (v as any).webkitRequestFullscreen();
    } else if ((v as any).mozRequestFullScreen) {
      (v as any).mozRequestFullScreen();
    } else if ((v as any).msRequestFullscreen) {
      (v as any).msRequestFullscreen();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  const showOverlay = isHovered || isScrubbing;

  return <InlineClipPlayerSurface {...{
    absoluteVideoPath, duration, end, error, fileName, handleFullscreen, handleLoaded,
    handleScrubStart, handleTimeUpdate, isHovered, isPlaying, label: _label, loaded,
    playheadRef, progressFillRef, setError, setIsHovered, setIsPlaying, showOverlay, start,
    scrubBarRef, timeReadRef, togglePlay, videoRef, videoSrc,
  }} />;
}
