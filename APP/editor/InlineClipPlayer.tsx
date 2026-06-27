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
    v.muted = true;
    if (isPlaying) { v.pause(); }
    startScrub(e.clientX);

    const onMove = (me: MouseEvent) => { me.preventDefault(); startScrub(me.clientX); };
    const onUp = () => {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      if (v) v.muted = wasMutedRef.current;
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

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '100%',
        margin: '12px 0',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        background: '#000',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Video Container */}
      <div
        style={{
          position: 'relative',
          background: '#000',
          aspectRatio: loaded ? undefined : '16/9',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          muted={false}
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoaded}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onError={() => setError(true)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleFullscreen();
          }}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />

        {/* Play Overlay Button */}
        {!isPlaying && loaded && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.25)',
              transition: 'background 0.2s',
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: 'rgba(255,59,48,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(255,59,48,0.5)',
                transition: 'transform 0.2s, background 0.2s',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
              }}
            >
              <span style={{ fontSize: 20, color: '#fff', marginLeft: 4 }}>▶</span>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#111',
              flexDirection: 'column',
              gap: 8,
              zIndex: 3,
            }}
          >
            <span style={{ fontSize: 24 }}>⚠️</span>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500 }}>视频加载失败</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
              {fileName}
            </span>
          </div>
        )}

        {/* Loading Overlay */}
        {!loaded && !error && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#111',
              zIndex: 2,
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>加载中…</span>
          </div>
        )}

        {/* Time Readout Overlay Pill */}
        {loaded && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 12,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: 10,
              fontFamily: 'monospace',
              color: '#fff',
              pointerEvents: 'none',
              opacity: showOverlay ? 1 : 0,
              transition: 'opacity 0.2s ease',
              border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 4,
            }}
          >
            <span ref={timeReadRef}>0:00 / {formatTimestamp(duration)}</span>
          </div>
        )}

        {/* Fullscreen Overlay Button */}
        {loaded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFullscreen();
            }}
            style={{
              position: 'absolute',
              bottom: 16,
              right: 12,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '11px',
              color: '#fff',
              cursor: 'pointer',
              opacity: showOverlay ? 1 : 0,
              transition: 'opacity 0.2s ease, background-color 0.2s',
              zIndex: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.65)';
            }}
            title="全屏播放"
          >
            ⛶
          </button>
        )}

        {/* Draggable Scrubber Overlay (Absolute Bottom) */}
        {loaded && (
          <div
            ref={scrubBarRef}
            onMouseDown={handleScrubStart}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: showOverlay ? 10 : 4,
              cursor: 'col-resize',
              background: 'rgba(255,255,255,0.15)',
              transition: 'height 0.15s ease, background 0.15s ease',
              zIndex: 5,
            }}
          >
            {/* Progress Fill */}
            <div
              ref={progressFillRef}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '0%',
                background: 'linear-gradient(90deg, #ff3b30, #ff6b35)',
                pointerEvents: 'none',
              }}
            />
            {/* Playhead Dot */}
            <div
              ref={playheadRef}
              style={{
                position: 'absolute',
                top: '50%',
                left: '0%',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#ff3b30',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 6px rgba(255,59,48,0.8)',
                pointerEvents: 'none',
                willChange: 'left',
                opacity: showOverlay ? 1 : 0,
                transition: 'opacity 0.15s ease',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
