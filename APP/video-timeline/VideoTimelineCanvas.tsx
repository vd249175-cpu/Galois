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

  const [isDraggingVideo, setIsDraggingVideo] = useState<boolean>(false);
  const dragCounter = useRef<number>(0);

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

  // Calculate minimum/maximum zoom level based on video duration to enable frame-accurate zooming
  const getMinMaxZoom = () => {
    const minZ = 1;
    const maxZ = duration > 0 ? Math.max(10, Math.round((duration * 200) / Math.max(100, containerWidth))) : 10;
    return { minZ, maxZ };
  };

  const zoomAroundPlayhead = (direction: 'in' | 'out') => {
    const el = timelineRef.current;
    if (!el || duration <= 0 || isNaN(duration)) return;

    const { minZ, maxZ } = getMinMaxZoom();
    const zoomFactor = direction === 'in' ? 1.25 : 1 / 1.25;

    setZoom(prev => {
      const nextZoom = Math.max(minZ, Math.min(maxZ, prev * zoomFactor));
      if (nextZoom === prev) return prev;

      const playheadPct = currentTimeRef.current / duration;
      const playheadOffset = playheadPct * el.scrollWidth - el.scrollLeft;

      requestAnimationFrame(() => {
        const newScrollWidth = el.clientWidth * nextZoom;
        el.scrollLeft = playheadPct * newScrollWidth - playheadOffset;
      });

      return nextZoom;
    });
  };

  // Alt + Mouse Wheel timeline zooming listener, and vertical scroll horizontal redirection
  useEffect(() => {
    const el = timelineRef.current;
    if (!el || duration <= 0 || isNaN(duration)) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        zoomAroundPlayhead(e.deltaY < 0 ? 'in' : 'out');
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Horizontal trackpad swipe: let browser scroll natively for butter-smooth OS momentum!
        // Do NOT preventDefault() or stopPropagation()
      } else {
        // Vertical mouse wheel: redirect to horizontal scroll
        e.preventDefault();
        e.stopPropagation();
        el.scrollLeft += e.deltaY * 2.5; // snaps horizontal scrolling speed
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [duration, containerWidth]);

  // Keyboard shortcut +/- zooming listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isFocused = state[BC.system.focusedAreaId] === areaId;
      if (!isFocused) return;

      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        e.stopPropagation();
        zoomAroundPlayhead('in');
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        e.stopPropagation();
        zoomAroundPlayhead('out');
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        handlePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state, areaId, duration]);

  // Easing/smooth loop for scrubbing to ensure buttery-smooth video decoding & playhead rendering
  const startScrubLoop = () => {
    const loop = () => {
      if (!isScrubbingRef.current || !videoRef.current || duration <= 0 || isNaN(duration)) {
        scrubLoopActiveRef.current = false;
        return;
      }

      const target = scrubbedTimeRef.current ?? videoRef.current.currentTime;
      const current = smoothTimeRef.current;
      const diff = target - current;

      if (Math.abs(diff) > 0.002) {
        // Linear interpolation (lerp) easing factor (0.35) for a responsive yet incredibly smooth playhead glide
        const nextTime = current + diff * 0.35;
        smoothTimeRef.current = nextTime;
        
        // Direct DOM updates (playhead needle and text readout) follow smoothTime immediately
        const playheadPct = (nextTime / duration) * 100;
        if (playheadRef.current) {
          playheadRef.current.style.left = `${playheadPct}%`;
        }
        if (timeReadoutRef.current) {
          timeReadoutRef.current.textContent = formatTime(nextTime);
        }

        // Throttled Video Seek - allow seek if not seeking, OR if at least 100ms has passed since the last seek
        // This guarantees that we get intermediate visual frames even during large/fast scrubs
        const now = Date.now();
        if (!videoRef.current.seeking || now - lastSeekTimeRef.current > 100) {
          videoRef.current.currentTime = nextTime;
          lastSeekTimeRef.current = now;
        }
      }

      requestAnimationFrame(loop);
    };

    if (!scrubLoopActiveRef.current) {
      scrubLoopActiveRef.current = true;
      requestAnimationFrame(loop);
    }
  };

  // Scrub calculation utility (handles scroll offsets & scaled track width)
  const scrub = (clientX: number) => {
    const el = timelineRef.current;
    if (!el || duration <= 0 || isNaN(duration) || !videoRef.current) return;
    const rect = el.getBoundingClientRect();
    const currentScrollLeft = el.scrollLeft;
    const clickX = clientX - rect.left + currentScrollLeft;
    const totalWidth = el.scrollWidth;
    const ratio = Math.max(0, Math.min(1, clickX / totalWidth));
    const targetTime = ratio * duration;

    scrubbedTimeRef.current = targetTime;

    // Auto-scroll when scrubbing near edges of viewport
    const mouseXInViewport = clientX - rect.left;
    const scrollSpeed = 15; // pixels to scroll per frame
    if (mouseXInViewport < 45) {
      el.scrollLeft = Math.max(0, el.scrollLeft - scrollSpeed);
    } else if (mouseXInViewport > containerWidth - 45) {
      el.scrollLeft = Math.min(el.scrollWidth - containerWidth, el.scrollLeft + scrollSpeed);
    }
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Always stop propagation on any timeline interaction to prevent focus-claim
    // from bubbling up and triggering global Blood state updates during scrubbing.
    e.stopPropagation();

    if (!timelineRef.current || duration <= 0 || isNaN(duration) || !videoRef.current) return;
    
    // Ignore scrub if clicking delete button
    if ((e.target as HTMLElement).closest('.segment-delete-btn')) return;

    const isSegment = (e.target as HTMLElement).closest('.segment-block');
    const isRulerOrPlayhead = (e.target as HTMLElement).closest('.time-ruler') || (e.target as HTMLElement).closest('.playhead-handle');

    // Middle-click (1), Right-click (2), or Left-click (0) on empty track initiates timeline drag panning
    if (e.button === 1 || e.button === 2 || (e.button === 0 && !isRulerOrPlayhead && !isSegment)) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[VideoTimeline] Empty track mousedown: initiating pan drag');
      if (panRef.current.animationFrameId) {
        cancelAnimationFrame(panRef.current.animationFrameId);
        panRef.current.animationFrameId = 0;
      }
      
      panRef.current = {
        isPanning: true,
        startX: e.clientX,
        startScrollLeft: timelineRef.current.scrollLeft,
        lastX: e.clientX,
        lastTime: Date.now(),
        velocity: 0,
        animationFrameId: 0,
      };
      timelineRef.current.style.cursor = 'grabbing';
      return;
    }

    // Left-click (0) initiates playhead scrubbing ONLY if clicking on the ruler or playhead needle
    if (e.button === 0) {
      if (isRulerOrPlayhead) {
        e.preventDefault();
        e.stopPropagation();

        console.log('[VideoTimeline] Ruler/playhead mousedown: initiating playhead scrub at clientX =', e.clientX);
        wasPlayingBeforeScrubRef.current = !videoRef.current.paused;
        if (wasPlayingBeforeScrubRef.current && videoRef.current) {
          console.log('[VideoTimeline] Video was playing, pausing during scrub');
          videoRef.current.pause();
          setIsPlaying(false);
        }

        setIsScrubbing(true);
        isScrubbingRef.current = true;

        if (videoRef.current) {
          wasMutedRef.current = videoRef.current.muted;
          videoRef.current.muted = true;
          smoothTimeRef.current = videoRef.current.currentTime;
        }

        scrub(e.clientX);
        startScrubLoop();
      }
    }
  };

  // Drag-to-scrub event loop
  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      scrub(e.clientX);
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[VideoTimeline] MouseUp event triggered. Ending scrub. scrubbedTime =', scrubbedTimeRef.current);
      setIsScrubbing(false);
      isScrubbingRef.current = false;

      if (videoRef.current) {
        videoRef.current.muted = wasMutedRef.current;
      }

      if (scrubbedTimeRef.current !== null) {
        if (videoRef.current) {
          console.log('[VideoTimeline] MouseUp final video currentTime seek to:', scrubbedTimeRef.current);
          videoRef.current.currentTime = scrubbedTimeRef.current;
        }
        setCurrentTime(scrubbedTimeRef.current);
        scrubbedTimeRef.current = null;
      } else {
        console.log('[VideoTimeline] MouseUp final video currentTime fallback to smoothTime:', smoothTimeRef.current);
        setCurrentTime(smoothTimeRef.current);
      }

      if (videoRef.current && wasPlayingBeforeScrubRef.current) {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch((err) => {
          console.warn('[VideoTimeline] Failed to resume playback after scrub:', err);
          setIsPlaying(false);
        });
      } else {
        setIsPlaying(false);
      }
      wasPlayingBeforeScrubRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove, { capture: true });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [isScrubbing, duration, containerWidth]);

  // Global mouse event listener for Right-click / Middle-click Drag Panning with inertia!
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (panRef.current.isPanning) {
        const el = timelineRef.current;
        if (el) {
          e.preventDefault();
          e.stopPropagation();
          const dx = e.clientX - panRef.current.startX;
          el.scrollLeft = panRef.current.startScrollLeft - dx;

          const now = Date.now();
          const dt = now - panRef.current.lastTime;
          if (dt > 10) {
            const deltaX = e.clientX - panRef.current.lastX;
            panRef.current.velocity = -deltaX / dt;
            panRef.current.lastX = e.clientX;
            panRef.current.lastTime = now;
          }
        }
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (panRef.current.isPanning) {
        panRef.current.isPanning = false;
        const el = timelineRef.current;
        if (el) {
          el.style.cursor = '';
          
          let vel = panRef.current.velocity;
          if (Math.abs(vel) > 0.15) {
            vel = Math.max(-15, Math.min(15, vel));
            const inertiaScroll = () => {
              if (Math.abs(vel) < 0.1) return;
              el.scrollLeft += vel * 12; // Scale velocity to px per frame
              vel *= 0.92; // Friction factor
              panRef.current.animationFrameId = requestAnimationFrame(inertiaScroll);
            };
            panRef.current.animationFrameId = requestAnimationFrame(inertiaScroll);
          }
        }
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { capture: true });
    window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true });

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove, { capture: true });
      window.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true });
    };
  }, []);

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
    const projectPath = state[BC.system.projectPath] || '';
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
