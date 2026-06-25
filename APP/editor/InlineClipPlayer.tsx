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
import { formatTimestamp } from '../video-timeline/VideoAssetManager';

interface InlineClipPlayerProps {
  label: string;
  fileName: string;
  start: number;
  end: number;
  projectPath: string;
}

export function InlineClipPlayer({ label, fileName, start, end, projectPath }: InlineClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubBarRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const timeReadRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number>(0);
  const isScrubbingRef = useRef(false);
  const wasMutedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const duration = end - start;

  // Resolve video src — search .dnote_assets/videos/ for the file
  const videoSrc = projectPath
    ? `dnote-file://${projectPath}/.dnote_assets/videos/${fileName}`.replace(/^dnote-file:\/\/\//, 'dnote-file://')
    : '';

  const clampTime = (t: number) => Math.max(start, Math.min(end, t));

  // Update DOM elements from video currentTime
  const syncUI = useCallback((t: number) => {
    const pct = duration > 0 ? ((t - start) / duration) * 100 : 0;
    if (playheadRef.current) playheadRef.current.style.left = `${pct}%`;
    if (timeReadRef.current) timeReadRef.current.textContent = formatTimestamp(t - start);
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
      if (!isPlaying) v.pause();
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
    wasMutedRef.current = v.muted;
    v.muted = true;
    if (isPlaying) { v.pause(); }
    startScrub(e.clientX);

    const onMove = (me: MouseEvent) => { me.preventDefault(); startScrub(me.clientX); };
    const onUp = () => {
      isScrubbingRef.current = false;
      if (v) v.muted = wasMutedRef.current;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove, { capture: true });
    window.addEventListener('mouseup', onUp, { capture: true });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '480px',
        margin: '10px 0',
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'linear-gradient(135deg, rgba(20,20,30,0.95) 0%, rgba(30,25,45,0.95) 100%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        userSelect: 'none',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <span style={{ fontSize: 11, color: '#ff3b30', fontWeight: 700, letterSpacing: 0.5 }}>▶ CLIP</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {formatTimestamp(start)} – {formatTimestamp(end)}
        </span>
      </div>

      {/* Video */}
      <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9', cursor: 'pointer' }} onClick={togglePlay}>
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
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
        {/* Play overlay */}
        {!isPlaying && loaded && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(255,59,48,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 12px rgba(255,59,48,0.5)',
            }}>
              <span style={{ fontSize: 18, color: '#fff', marginLeft: 3 }}>▶</span>
            </div>
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>视频文件未找到</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace' }}>{fileName}</span>
          </div>
        )}
        {!loaded && !error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>加载中…</span>
          </div>
        )}
      </div>

      {/* Mini scrubber timeline */}
      <div style={{ padding: '8px 10px 8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Track */}
        <div
          ref={scrubBarRef}
          onMouseDown={handleScrubStart}
          style={{
            position: 'relative',
            height: 6,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.1)',
            cursor: 'col-resize',
          }}
        >
          {/* Progress fill */}
          <div style={{
            position: 'absolute',
            left: 0, top: 0, bottom: 0,
            background: 'linear-gradient(90deg, #ff3b30, #ff6b35)',
            borderRadius: 3,
            pointerEvents: 'none',
            transition: 'width 0.05s linear',
          }} />
          {/* Playhead dot */}
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
              boxShadow: '0 0 6px rgba(255,59,48,0.7)',
              pointerEvents: 'none',
              willChange: 'left',
            }}
          />
        </div>
        {/* Time readout + controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span ref={timeReadRef} style={{ fontSize: 10, fontFamily: 'monospace', color: '#ff3b30', fontWeight: 700 }}>
            {formatTimestamp(0)}
          </span>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
            {formatTimestamp(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
