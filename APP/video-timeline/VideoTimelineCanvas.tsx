import React, { useEffect, useState, useRef } from 'react';
import { BC } from '../../CORE/BloodChannels';
import {
  VideoSegment,
} from './VideoAssetManager';
import { useFrameReference } from './useFrameReference';
import { VideoTimelineStyles } from './VideoTimelineStyles';
import { VideoTimelineHome } from './VideoTimelineHome';
import { VideoTimelineActive } from './VideoTimelineActive';
import { renderFilmstripSlots as renderVideoFilmstripSlots } from './filmstripSlots';
import { useSavedVideoAssets } from './useSavedVideoAssets';
import { useVideoTimelinePersistence } from './useVideoTimelinePersistence';
import { useTimelineViewport } from './useTimelineViewport';
import { useVideoAssetRestore } from './useVideoAssetRestore';
import { useSegmentOperations } from './useSegmentOperations';
import { useVideoFileDrop } from './useVideoFileDrop';
import { useTimelineZoom } from './useTimelineZoom';
import { useTimelineScrubbing } from './useTimelineScrubbing';




const generateColor = (index: number) => `hsl(${(index * 137.5) % 360}, 70%, 45%)`;
const formatTimeShort = (time: number) => {
  if (isNaN(time)) return '00:00';
  return `${Math.floor(time / 60).toString().padStart(2, '0')}:${Math.floor(time % 60).toString().padStart(2, '0')}`;
};

export function VideoTimelineView({
  areaId,
  state,
  updateBloodKey,
  lastAction
}: {
  areaId: string;
  state: Record<string, any>;
  updateBloodKey: (key: string, value: any) => void;
  lastAction: any;
}) {
  const [videoPath, setVideoPath] = useState<string>(() => {
    return localStorage.getItem(`dnote_video_path_${areaId}`) || '';
  });
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [jumpSeconds, setJumpSeconds] = useState<number>(5);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isExtractingThumbnails, setIsExtractingThumbnails] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1); // Timeline zoom factor
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false); // Playhead dragging state
  const [containerWidth, setContainerWidth] = useState<number>(800); // Measured viewport width
  const [isAssetLoaded, setIsAssetLoaded] = useState<boolean>(false);
  // Multi-select: Set of selected segment IDs (replaces single selectedSegmentId)
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<Set<string>>(new Set());
  const selectedSegmentId = selectedSegmentIds.size === 1 ? [...selectedSegmentIds][0] : null;

  const projectPath = state[BC.system.projectPath] || '';
  const savedAssets = useSavedVideoAssets(projectPath, videoPath);

  const panRef = useRef({
    isPanning: false,
    startX: 0,
    startScrollLeft: 0,
    lastX: 0,
    lastTime: Date.now(),
    velocity: 0,
    animationFrameId: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const playheadRef = useRef<HTMLDivElement | null>(null);
  const timeReadoutRef = useRef<HTMLSpanElement | null>(null);
  const isScrubbingRef = useRef<boolean>(false);
  const scrubbedTimeRef = useRef<number | null>(null);
  const wasMutedRef = useRef<boolean>(false);
  const wasPlayingBeforeScrubRef = useRef<boolean>(false);
  const smoothTimeRef = useRef<number>(0);
  const scrubLoopActiveRef = useRef<boolean>(false);
  const lastSeekTimeRef = useRef<number>(0);
  const { frameCopyStatus, handleCopyFrameReference, isCopyingFrame } = useFrameReference({
    videoRef,
    projectPath: state[BC.system.projectPath] || '',
    videoPath,
  });

  // Sync references to avoid closure capture issues in global action triggers and scrub events
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const jumpSecondsRef = useRef(jumpSeconds);
  jumpSecondsRef.current = jumpSeconds;

  // Diagnostic lifecycle logger
  useEffect(() => {
    console.log('[VideoTimeline] Component mounted, videoPath from localStorage:', videoPath);
    return () => {
      console.log('[VideoTimeline] Component unmounted');
    };
  }, []);

  useVideoTimelinePersistence({
    areaId, duration, isAssetLoaded, projectPath, segments, setDuration, setIsAssetLoaded,
    setSegments, setSelectedSegmentIds, setThumbnails, setVideoPath, setZoom, videoPath, videoRef,
  });

  useTimelineViewport({ containerWidth, currentTime, duration, isPlaying, setContainerWidth, timelineRef, videoPath });
  useVideoAssetRestore({
    areaId, duration, projectPath, setIsAssetLoaded, setIsExtractingThumbnails, setSegments,
    setSelectedSegmentIds, setThumbnails, videoPath,
  });

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    console.log('[VideoTimeline] Loaded video metadata: duration =', dur);
    setDuration(dur);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isScrubbingRef.current && !videoRef.current.seeking) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeeked = () => {
    if (videoRef.current && !isScrubbingRef.current) {
      console.log('[VideoTimeline] Video element handleSeeked: currentTime =', videoRef.current.currentTime);
      setCurrentTime(videoRef.current.currentTime);
    }
  };


  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (!videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const { handleMergeSelected, handleSegmentDragStart, handleSplit } = useSegmentOperations({
    currentTimeRef, duration, formatTimeShort, generateColor, selectedSegmentIds,
    setSegments, setSelectedSegmentIds, videoPath,
  });

  const handleJump = (direction: 'forward' | 'backward') => {
    if (!videoRef.current) return;
    const delta = direction === 'forward' ? jumpSecondsRef.current : -jumpSecondsRef.current;
    let nextTime = videoRef.current.currentTime + delta;
    if (nextTime < 0) nextTime = 0;
    if (nextTime > duration) nextTime = duration;
    videoRef.current.currentTime = nextTime;
  };

  const handleStepFrame = (direction: 'forward' | 'backward') => {
    if (!videoRef.current) return;
    const frameTime = 0.033;
    const delta = direction === 'forward' ? frameTime : -frameTime;
    let nextTime = videoRef.current.currentTime + delta;
    if (nextTime < 0) nextTime = 0;
    if (nextTime > duration) nextTime = duration;
    videoRef.current.currentTime = nextTime;
  };

  // Action / Shortcut Signal Antibody binding
  useEffect(() => {
    if (!lastAction || !videoRef.current) return;
    
    const isFocused = state[BC.system.focusedAreaId] === areaId;
    if (!isFocused) return;

    switch (lastAction.id) {
      case 'videoTimeline.playPause':
        handlePlayPause();
        break;
      case 'videoTimeline.split':
        handleSplit();
        break;
      case 'videoTimeline.jumpForward':
        handleJump('forward');
        break;
      case 'videoTimeline.jumpBackward':
        handleJump('backward');
        break;
      case 'videoTimeline.stepForward':
        handleStepFrame('forward');
        break;
      case 'videoTimeline.stepBackward':
        handleStepFrame('backward');
        break;
      case 'videoTimeline.copyFrameReference':
        void handleCopyFrameReference();
        break;
      default:
        break;
    }
  }, [lastAction, areaId, state]);

  const { zoomAroundPlayhead } = useTimelineZoom({
    areaId, containerWidth, currentTimeRef, duration, handlePlayPause, setZoom, state, timelineRef,
  });

  const { handleTimelineMouseDown } = useTimelineScrubbing({
    containerWidth, duration, formatTime: (time: number) => {
      if (isNaN(time)) return '00:00.00';
      const mins = Math.floor(time / 60);
      const secs = Math.floor(time % 60);
      const ms = Math.floor((time % 1) * 100);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }, isScrubbing, isScrubbingRef,
    lastSeekTimeRef, panRef, playheadRef, scrubbedTimeRef, scrubLoopActiveRef, setCurrentTime,
    setIsPlaying, setIsScrubbing, smoothTimeRef, timeReadoutRef, timelineRef, videoRef,
    wasMutedRef, wasPlayingBeforeScrubRef,
  });
  const { handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handleManualFileOpen, isDraggingVideo } =
    useVideoFileDrop(projectPath, setVideoPath);

  // handleSegmentDragStart is defined below with multi-select and @video clip format

  const handleDeleteSegment = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSegments(prev => {
      if (prev.length <= 1) return prev;
      const targetIndex = prev.findIndex(s => s.id === id);
      if (targetIndex === -1) return prev;

      const next = [...prev];
      const deleted = next[targetIndex];

      if (targetIndex > 0) {
        next[targetIndex - 1].end = deleted.end;
      } else if (targetIndex < next.length - 1) {
        next[targetIndex + 1].start = deleted.start;
      }
      next.splice(targetIndex, 1);
      return next;
    });
  };

  // Jump speed adjustment
  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };



  // Format Helper: ss.hh or mm:ss.hh
  const formatTime = (time: number) => {
    if (isNaN(time)) return '00:00.00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };



  const renderFilmstripSlots = () => renderVideoFilmstripSlots(thumbnails, containerWidth, zoom);

  // Sync playhead DOM position and time readout from React currentTime state (only when not scrubbing)
  // This avoids React JSX reconciler overwriting the direct DOM updates from the lerp scrub loop
  useEffect(() => {
    if (isScrubbingRef.current) return;
    if (playheadRef.current && duration > 0) {
      playheadRef.current.style.left = `${(currentTime / duration) * 100}%`;
    }
    if (timeReadoutRef.current) {
      timeReadoutRef.current.textContent = formatTime(currentTime);
    }
  }, [currentTime, duration]);

  // Visible ruler and scroll tracking isolated into sub-component

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-main, #1e1e1e)',
        color: 'var(--text-main, #d4d4d4)',
        fontFamily: 'Outfit, Inter, sans-serif',
        fontSize: 'var(--video-timeline-font-size, 11px)',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
      }}
      onMouseDown={() => {
        // Claim focus only if not already focused — timeline child handlers will stopPropagation
        // if they handle the event, so this only fires for unhandled mousedowns (video area, etc.)
        if (state[BC.system.focusedAreaId] !== areaId) {
          updateBloodKey(BC.system.focusedAreaId, areaId);
        }
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingVideo && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(112, 0, 255, 0.12)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          border: '2.5px dashed var(--accent-color, #7000ff)',
          margin: '8px',
          borderRadius: '10px',
          pointerEvents: 'none',
          transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <div style={{
            padding: '20px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.08)',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(112,0,255,0.2)',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #7000ff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M12 7v6" />
              <path d="M9 10l3-3 3 3" />
            </svg>
          </div>
          <span style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) + 2px)', fontWeight: 600, color: 'var(--text-main, #d4d4d4)' }}>
            拖放视频文件以加载到时间轴中
          </span>
        </div>
      )}

      {/* Dynamic Style Sheet Injected Client-Side */}
      <VideoTimelineStyles />

      {!videoPath ? (
        /* Empty/Home State with list of previously used projects */
      <VideoTimelineHome
        fileInputRef={fileInputRef}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        handleManualFileOpen={handleManualFileOpen}
        savedAssets={savedAssets}
        setVideoPath={setVideoPath}
      />
      ) : (
        /* Active Video State */
      <VideoTimelineActive
        containerWidth={containerWidth} duration={duration} formatTime={formatTime}
        frameCopyStatus={frameCopyStatus} handleCopyFrameReference={handleCopyFrameReference}
        handleDeleteSegment={handleDeleteSegment} handleJump={handleJump} handleLoadedMetadata={handleLoadedMetadata}
        handleMergeSelected={handleMergeSelected} handlePlaybackRateChange={handlePlaybackRateChange}
        handlePlayPause={handlePlayPause} handleSegmentDragStart={handleSegmentDragStart} handleSeeked={handleSeeked}
        handleSplit={handleSplit} handleStepFrame={handleStepFrame} handleTimelineMouseDown={handleTimelineMouseDown}
        handleTimeUpdate={handleTimeUpdate} isCopyingFrame={isCopyingFrame} isExtractingThumbnails={isExtractingThumbnails}
        isPlaying={isPlaying} jumpSeconds={jumpSeconds} playheadRef={playheadRef} playbackRate={playbackRate} renderFilmstripSlots={renderFilmstripSlots}
        segments={segments} selectedSegmentId={selectedSegmentId} selectedSegmentIds={selectedSegmentIds}
        setIsPlaying={setIsPlaying} setIsScrubbing={setIsScrubbing} setJumpSeconds={setJumpSeconds}
        setSelectedSegmentIds={setSelectedSegmentIds} setVideoPath={setVideoPath} timelineRef={timelineRef}
        timeReadoutRef={timeReadoutRef} videoPath={videoPath} videoRef={videoRef} zoom={zoom} zoomAroundPlayhead={zoomAroundPlayhead}
      />
      )}
    </div>
  );
}
