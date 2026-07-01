import React, { useEffect, useState, useRef } from 'react';
import { BC } from '../../CORE/BloodChannels';
import { videoTimelineActions } from './actions';
import {
  VideoSegment,
  VideoAsset,
  saveAsset,
  loadAsset,
  buildClipMarkdown,
} from './VideoAssetManager';

export const VideoTimelineComponent = {
  typeId: 'videoTimeline',
  displayName: '视频时间轴',
  iconName: 'video',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="9" height="10" rx="1.5" />
      <polygon points="11,5 15,3 15,13 11,11" />
    </svg>
  ),
  component: VideoTimelineView,
  actions: videoTimelineActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.focusedAreaId
  ],
  manifest: {
    description: '视频剪辑与时间轴插件，支持提取帧缩略图、多段切分与拖拽到 Markdown 引用',
    reads: [
      BC.system.projectPath,
      BC.system.focusedAreaId
    ],
    writes: [],
    dependsOn: []
  }
};

interface TimeRulerProps {
  duration: number;
  zoom: number;
  containerWidth: number;
  timelineRef: React.RefObject<HTMLDivElement | null>;
}

function TimeRuler({ duration, zoom, containerWidth, timelineRef }: TimeRulerProps) {
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    const handleScroll = () => {
      setScrollLeft(el.scrollLeft);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    // Initialize
    setScrollLeft(el.scrollLeft);

    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [timelineRef, zoom, containerWidth]);

  const trackWidth = containerWidth * zoom;
  const pxPerSec = duration > 0 ? trackWidth / duration : 0;

  const getTickInterval = (pps: number) => {
    const candidates = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];
    for (const c of candidates) {
      if (c * pps >= 60) return c;
    }
    return 3600;
  };

  const tickInterval = getTickInterval(pxPerSec);

  const visibleStart = duration > 0 ? (scrollLeft / trackWidth) * duration : 0;
  const visibleEnd = duration > 0 ? ((scrollLeft + containerWidth) / trackWidth) * duration : 0;

  const ticks = [];
  if (duration > 0 && tickInterval > 0) {
    const startTick = Math.max(0, Math.floor(visibleStart / tickInterval) * tickInterval);
    const endTick = Math.min(duration, Math.ceil(visibleEnd / tickInterval) * tickInterval);
    for (let t = startTick; t <= endTick; t += tickInterval) {
      ticks.push(t);
    }
  }

  const minorTicks = [];
  const minorInterval = tickInterval / 5;
  if (duration > 0 && minorInterval > 0) {
    const startTick = Math.max(0, Math.floor(visibleStart / minorInterval) * minorInterval);
    const endTick = Math.min(duration, Math.ceil(visibleEnd / minorInterval) * minorInterval);
    for (let t = startTick; t <= endTick; t += minorInterval) {
      const isMajor = Math.abs(t % tickInterval) < 0.0001 || Math.abs((t % tickInterval) - tickInterval) < 0.0001;
      if (!isMajor) {
        minorTicks.push(t);
      }
    }
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return '00:00.00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const formatTimeShort = (time: number) => {
    if (isNaN(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTickLabel = (t: number) => {
    if (tickInterval < 1) {
      return formatTime(t);
    } else {
      return formatTimeShort(t);
    }
  };

  return (
    <div
      className="time-ruler"
      style={{
        height: '24px',
        background: '#151515',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {minorTicks.map((t, idx) => (
        <div
          key={`min-${idx}`}
          style={{
            position: 'absolute',
            left: `${(t / duration) * 100}%`,
            top: 0,
            width: '1px',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.15)',
          }}
        />
      ))}

      {ticks.map((t, idx) => (
        <div
          key={`maj-${idx}`}
          style={{
            position: 'absolute',
            left: `${(t / duration) * 100}%`,
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: '1px',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.3)',
            }}
          />
          <span
            style={{
              fontSize: '9px',
              color: 'rgba(255, 255, 255, 0.5)',
              fontFamily: 'monospace',
              marginTop: '1px',
              marginLeft: '2px',
              whiteSpace: 'nowrap',
            }}
          >
            {formatTickLabel(t)}
          </span>
        </div>
      ))}
    </div>
  );
}



function VideoTimelineView({
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

  const [savedAssets, setSavedAssets] = useState<VideoAsset[]>([]);

  // Load saved video projects (assets) from project directory
  useEffect(() => {
    const projectPath = state[BC.system.projectPath] || '';
    if (!projectPath) return;

    const loadSavedAssets = async () => {
      try {
        const assetDir = `${projectPath}/.dnote_assets/videos`;
        const items = await (window as any).electronAPI.listDir(assetDir);
        const assetFiles = items.filter((item: any) => !item.isDir && item.name.endsWith('.asset.json'));
        
        const assets: VideoAsset[] = [];
        for (const file of assetFiles) {
          try {
            const raw = await (window as any).electronAPI.readFile(file.path);
            const parsed = JSON.parse(raw) as VideoAsset;
            if (parsed.version === 1 && parsed.videoPath) {
              assets.push(parsed);
            }
          } catch (e) {
            console.error('Error loading asset file:', file.path, e);
          }
        }
        
        // Sort by updatedAt descending
        assets.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        setSavedAssets(assets);
      } catch (err) {
        // Folder might not exist yet, that's fine
        setSavedAssets([]);
      }
    };

    loadSavedAssets();
  }, [state[BC.system.projectPath], videoPath]);

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

  // Load video source via direct DOM property to avoid React reconciliation reload loop
  useEffect(() => {
    if (videoRef.current) {
      if (videoPath) {
        const absolutePath = videoPath.startsWith('/') ? videoPath : `/${videoPath}`;
        const cleanPath = encodeURI(absolutePath);
        console.log('[VideoTimeline] Setting video src to:', `dnote-file://${cleanPath}`);
        videoRef.current.src = `dnote-file://${cleanPath}`;
      } else {
        console.log('[VideoTimeline] Setting video src to empty string');
        videoRef.current.src = '';
      }
    }
  }, [videoPath]);

  // Persist video path to localStorage and reset states on change
  useEffect(() => {
    console.log('[VideoTimeline] videoPath state changed, resetting dependent states:', videoPath);
    setThumbnails([]);
    setSegments([]);
    setSelectedSegmentIds(new Set());
    setZoom(1);
    setDuration(0);
    setIsAssetLoaded(false);

    if (videoPath) {
      localStorage.setItem(`dnote_video_path_${areaId}`, videoPath);
    } else {
      localStorage.removeItem(`dnote_video_path_${areaId}`);
    }
  }, [videoPath, areaId]);

  // Auto-save asset whenever segments change (debounced)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const projectPath = state[BC.system.projectPath] || '';
    if (!isAssetLoaded || !projectPath || !videoPath || segments.length === 0 || duration <= 0 || isNaN(duration)) {
      console.log('[VideoTimeline] Auto-save skipped:', { isAssetLoaded, projectPath, videoPath, segmentsCount: segments.length, duration });
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const asset: VideoAsset = {
        version: 1,
        videoPath,
        videoName: videoPath.split('/').pop() || 'video',
        duration,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        segments,
      };
      console.log('[VideoTimeline] Auto-saving asset file:', asset);
      saveAsset(projectPath, asset);
    }, 600);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [segments, videoPath, duration, state[BC.system.projectPath], isAssetLoaded]);

  // Measure container width dynamically to support Blender-style panel resizing
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [videoPath]);

  // Keep playhead visible during playback (auto-scroll)
  useEffect(() => {
    if (!isPlaying || duration <= 0 || isNaN(duration)) return;
    const el = timelineRef.current;
    if (!el) return;

    const trackWidth = el.scrollWidth;
    const playheadX = (currentTime / duration) * trackWidth;
    const viewportLeft = el.scrollLeft;
    const viewportRight = el.scrollLeft + containerWidth;

    if (playheadX > viewportRight - 40 || playheadX < viewportLeft + 40) {
      el.scrollLeft = playheadX - containerWidth / 2;
    }
  }, [currentTime, isPlaying, duration, containerWidth]);

  // Generate HSL colors dynamically
  const generateColor = (index: number) => {
    const hue = (index * 137.5) % 360; // golden angle distribution
    return `hsl(${hue}, 70%, 45%)`;
  };

  // Format Helper: mm:ss
  const formatTimeShort = (time: number) => {
    if (isNaN(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Setup initial segments and load asset when duration, videoPath, and projectPath are resolved
  useEffect(() => {
    const projectPath = state[BC.system.projectPath] || '';
    console.log('[VideoTimeline] restoreAsset hook fired:', { projectPath, videoPath, duration });
    if (!projectPath || !videoPath || duration <= 0 || isNaN(duration)) {
      console.log('[VideoTimeline] restoreAsset hook skipped (incomplete parameters)');
      return;
    }

    let active = true;
    const restoreAsset = async () => {
      console.log('[VideoTimeline] restoreAsset: Loading asset JSON...');
      const asset = await loadAsset(projectPath, videoPath);
      if (!active) {
        console.log('[VideoTimeline] restoreAsset: hook unmounted during load, aborting');
        return;
      }

      if (asset && asset.segments.length > 0) {
        console.log('[VideoTimeline] restoreAsset success: loaded segments:', asset.segments);
        setSegments(asset.segments);
        setSelectedSegmentIds(new Set([asset.segments[0].id]));
      } else {
        // No saved asset — create the default full-video segment
        console.log('[VideoTimeline] restoreAsset: no saved asset found. Creating default segment.');
        const defaultSeg: VideoSegment = {
          id: 'seg-1',
          start: 0,
          end: duration,
          name: `${formatTimeShort(0)} - ${formatTimeShort(duration)}`,
          color: generateColor(0),
        };
        setSegments([defaultSeg]);
        setSelectedSegmentIds(new Set(['seg-1']));
      }

      setIsAssetLoaded(true);
      console.log('[VideoTimeline] restoreAsset complete. Triggering extractThumbnails...');
      extractThumbnails(videoPath, duration, projectPath);
    };

    restoreAsset();

    return () => {
      active = false;
    };
  }, [state[BC.system.projectPath], videoPath, duration]);

  // Setup video duration when video metadata is resolved
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      console.log('[VideoTimeline] Loaded video metadata: duration =', dur);
      setDuration(dur);
    }
  };

  // Dual-mode fast frame extractor (FFmpeg background command with HTML5 fallback)
  const extractThumbnails = async (path: string, dur: number, projectPath: string) => {
    if (!path || dur <= 0) {
      console.log('[VideoTimeline] extractThumbnails skipped: invalid parameters');
      return;
    }
    console.log('[VideoTimeline] extractThumbnails start:', { path, dur, projectPath });
    setIsExtractingThumbnails(true);
    
    // We pre-extract 30 thumbnails to cover high zoom density details
    const frameCount = 30;
    const step = dur / frameCount;
    
    // 1. Try native FFmpeg extraction first for ultra-fast performance
    if (projectPath) {
      try {
        const cacheDir = `${projectPath}/.dnote_cache/video-timeline/${areaId}`;
        console.log('[VideoTimeline] extractThumbnails trying native FFmpeg in directory:', cacheDir);
        
        // Build parallel commands running with & and wait
        const cleanCacheCmd = `mkdir -p "${cacheDir}" && rm -f "${cacheDir}/thumb_*.jpg"`;
        const ffmpegTasks = [];
        
        for (let i = 0; i < frameCount; i++) {
          const t = (i * step + step / 2).toFixed(2);
          ffmpegTasks.push(`ffmpeg -y -ss ${t} -i "${path}" -vframes 1 -vf "scale=-1:68" "${cacheDir}/thumb_${i + 1}.jpg" >/dev/null 2>&1 &`);
        }
        
        const shellCmd = `${cleanCacheCmd} && ${ffmpegTasks.join(' ')} wait`;

        console.log('[VideoTimeline] extractThumbnails executing native FFmpeg command:', shellCmd);
        // Run in shell asynchronously (does not block renderer UI)
        await (window as any).electronAPI.execCommand(shellCmd, projectPath);

        // Populate thumbnails state with local custom scheme URLs
        const paths = Array.from({ length: frameCount }).map((_, i) => {
          const fullPath = `${cacheDir}/thumb_${i + 1}.jpg`;
          const absolutePath = fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
          return `dnote-file://${encodeURI(absolutePath)}`;
        });
        console.log('[VideoTimeline] extractThumbnails native extraction success, thumbnail count:', paths.length);
        setThumbnails(paths);
        setIsExtractingThumbnails(false);
        return; // Success! Exit early
      } catch (err) {
        console.warn('[Video Timeline] Native FFmpeg extraction failed, falling back to HTML5 seeker:', err);
      }
    }

    // 2. Fallback to HTML5 browser-level canvas sequential seeking if projectPath is empty or FFmpeg fails
    console.log('[VideoTimeline] extractThumbnails falling back to HTML5 canvas seeking...');
    const fallbackCount = 15;
    const fallbackStep = dur / fallbackCount;
    const list: string[] = new Array(fallbackCount).fill('');
    setThumbnails(list);

    try {
      const tempVideo = document.createElement('video');
      const absolutePath = path.startsWith('/') ? path : `/${path}`;
      const normalizedPath = encodeURI(absolutePath);
      tempVideo.src = `dnote-file://${normalizedPath}`;
      tempVideo.muted = true;
      tempVideo.playsInline = true;

      await new Promise<void>((resolve) => {
        tempVideo.onloadedmetadata = () => resolve();
        tempVideo.onloadeddata = () => resolve();
        tempVideo.onerror = () => resolve();
        setTimeout(resolve, 2000);
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < fallbackCount; i++) {
        const targetTime = i * fallbackStep + fallbackStep / 2;
        tempVideo.currentTime = targetTime;

        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };
          tempVideo.onseeked = done;
          tempVideo.onerror = done;
          setTimeout(done, 1500);
        });

        let w = 120;
        let h = 68;
        if (tempVideo.videoWidth && tempVideo.videoHeight) {
          const ratio = tempVideo.videoWidth / tempVideo.videoHeight;
          if (ratio > 1) {
            w = 120;
            h = Math.round(120 / ratio);
          } else {
            h = 68;
            w = Math.round(68 * ratio);
          }
        }
        canvas.width = w;
        canvas.height = h;

        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, w, h);
          list[i] = canvas.toDataURL('image/jpeg', 0.5);
        }
        setThumbnails([...list]);
      }

      console.log('[VideoTimeline] extractThumbnails HTML5 fallback extraction complete.');
      tempVideo.src = '';
      tempVideo.load();
    } catch (e) {
      console.error('[Video Timeline] HTML5 fallback extraction error:', e);
    } finally {
      setIsExtractingThumbnails(false);
    }
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

  const handleSplit = () => {
    const t = currentTimeRef.current;
    if (duration <= 0 || isNaN(duration)) return;

    setSegments((prev) => {
      const targetIndex = prev.findIndex((s) => s.start <= t && t <= s.end);
      if (targetIndex === -1) return prev;
      const target = prev[targetIndex];

      // Avoid creating segments smaller than 0.2 seconds
      if (t - target.start < 0.2 || target.end - t < 0.2) return prev;

      const next = [...prev];
      const indexSuffix = Date.now().toString().slice(-4);
      
      const newSeg1: VideoSegment = {
        id: `${target.id}-1-${indexSuffix}`,
        start: target.start,
        end: t,
        name: `${formatTimeShort(target.start)} - ${formatTimeShort(t)}`,
        color: target.color,
      };

      const newSeg2: VideoSegment = {
        id: `${target.id}-2-${indexSuffix}`,
        start: t,
        end: target.end,
        name: `${formatTimeShort(t)} - ${formatTimeShort(target.end)}`,
        color: generateColor(prev.length),
      };

      next.splice(targetIndex, 1, newSeg1, newSeg2);
      setTimeout(() => setSelectedSegmentIds(new Set([newSeg2.id])), 0);
      return next;
    });
  };

  // Merge all selected segments into one spanning their combined range
  const handleMergeSelected = () => {
    if (selectedSegmentIds.size < 2) return;
    setSegments((prev) => {
      const selected = prev.filter((s) => selectedSegmentIds.has(s.id));
      if (selected.length < 2) return prev;
      const minStart = Math.min(...selected.map((s) => s.start));
      const maxEnd = Math.max(...selected.map((s) => s.end));
      const merged: VideoSegment = {
        id: `seg-merged-${Date.now()}`,
        start: minStart,
        end: maxEnd,
        name: `${formatTimeShort(minStart)} - ${formatTimeShort(maxEnd)}`,
        color: selected[0].color,
      };
      // Replace selected segments with merged one, keeping order
      const firstIdx = prev.findIndex((s) => selectedSegmentIds.has(s.id));
      const remaining = prev.filter((s) => !selectedSegmentIds.has(s.id));
      remaining.splice(firstIdx, 0, merged);
      setTimeout(() => setSelectedSegmentIds(new Set([merged.id])), 0);
      return remaining;
    });
  };

  // Build @video clip markdown from a segment and put it in the drag data
  const handleSegmentDragStart = (e: React.DragEvent<HTMLDivElement>, seg: VideoSegment) => {
    const clipMd = buildClipMarkdown(videoPath, seg);
    e.dataTransfer.setData('text/x-dnote-clip', clipMd);
    e.dataTransfer.setData('text/plain', clipMd);
    e.dataTransfer.effectAllowed = 'copy';
  };

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

  // Archive a video file to .dnote_assets/videos/ and return the asset path.
  // Uses `cp -n` (no-clobber) so existing files are never overwritten.
  const archiveVideoFile = async (srcPath: string): Promise<string> => {
    const projectPath = state[BC.system.projectPath] || '';
    if (!projectPath) return srcPath; // No project open — use original path

    const fileName = srcPath.split('/').pop() || 'video.mp4';
    const assetDir = `${projectPath}/.dnote_assets/videos`;
    const destPath = `${assetDir}/${fileName}`;

    try {
      // Create dir + copy file without overwriting an existing copy
      await (window as any).electronAPI.execCommand(
        `mkdir -p "${assetDir}" && cp -n "${srcPath}" "${destPath}"`,
        projectPath
      );
      return destPath;
    } catch (err) {
      console.warn('[VideoTimeline] Could not copy video to assets dir, using original path:', err);
      return srcPath;
    }
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



  // Render the tiled keyframe filmstrip slots dynamically (aspect-ratio preserved, non-stretched)
  const renderFilmstripSlots = () => {
    if (thumbnails.length === 0) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--video-timeline-font-size, 11px)', opacity: 0.3 }}>
          正在初始化时间轴预览...
        </div>
      );
    }

    const trackWidth = containerWidth * zoom;
    const slotWidth = 100; // Fixed width per keyframe image block (NLE standard)
    const numSlots = Math.ceil(trackWidth / slotWidth);

    const slots = [];
    for (let i = 0; i < numSlots; i++) {
      const pct = (i + 0.5) / numSlots;
      // Fetch nearest preloaded thumbnail from cache
      const thumbIdx = Math.max(0, Math.min(thumbnails.length - 1, Math.floor(pct * thumbnails.length)));
      const imgUrl = thumbnails[thumbIdx];

      slots.push(
        imgUrl ? (
          <img
            key={i}
            src={imgUrl}
            style={{
              width: slotWidth,
              height: '100%',
              objectFit: 'cover',
              flexShrink: 0,
              borderRight: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          />
        ) : (
          <div
            key={i}
            style={{
              width: slotWidth,
              height: '100%',
              background: 'rgba(255,255,255,0.02)',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ width: 8, height: 8, border: '1px solid rgba(255,255,255,0.2)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        )
      );
    }
    return slots;
  };

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
      <style dangerouslySetInnerHTML={{ __html: `
        .dropzone {
          border: 2px dashed rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 20px;
          flex: 1;
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(8px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }
        .dropzone:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--accent-color, #7000ff);
          box-shadow: 0 0 20px rgba(112, 0, 255, 0.15);
        }
        .ctrl-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-main, #d4d4d4);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: calc(var(--video-timeline-font-size, 11px) + 1px);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .ctrl-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .ctrl-btn:active {
          transform: translateY(1px);
        }
        .ctrl-btn.active {
          background: var(--accent-color, #7000ff);
          color: #fff;
          border-color: transparent;
        }
        .segment-block {
          position: absolute;
          top: 0px;
          bottom: 0px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 6px 8px;
          font-size: var(--video-timeline-font-size, 11px);
          color: white;
          cursor: grab;
          transition: border-color 0.2s, background-color 0.2s;
          box-shadow: inset 0 0 6px rgba(0,0,0,0.3);
          overflow: hidden;
        }
        .segment-block:hover {
          background: rgba(255, 255, 255, 0.03) !important;
        }
        .segment-block.selected {
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.2), inset 0 0 6px rgba(0,0,0,0.3);
        }
        .segment-delete-btn {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          cursor: pointer;
          font-size: calc(var(--video-timeline-font-size, 11px) - 1px);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .segment-block:hover .segment-delete-btn {
          opacity: 1;
        }
        .segment-delete-btn:hover {
          background: #ff3b30;
        }
        .timeline-container {
          position: relative;
          background: #121212;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          margin: 0;
          overflow: hidden;
        }
        .timeline-scroll-container {
          position: relative;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .timeline-scroll-container::-webkit-scrollbar {
          height: 6px;
        }
        .timeline-scroll-container::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.02);
        }
        .timeline-scroll-container::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 3px;
        }
        .settings-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: calc(var(--video-timeline-font-size, 11px) + 1px);
          width: 48px;
          text-align: center;
        }
        .settings-input:focus {
          border-color: var(--accent-color, #7000ff);
          outline: none;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      ` }} />

      {!videoPath ? (
        /* Empty/Home State with list of previously used projects */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', padding: '24px', boxSizing: 'border-box' }}>
          {/* Drag and drop input zone */}
          <div
            className="dropzone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ margin: 0, minHeight: '180px', flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.7 }}>
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
              <path d="M12 7v6" />
              <path d="M9 10l3-3 3 3" />
            </svg>
            <div style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) + 3px)', fontWeight: 500, marginBottom: 6 }}>拖拽视频文件到此区域</div>
            <div style={{ fontSize: 'var(--video-timeline-font-size, 11px)', opacity: 0.5 }}>支持 .mp4, .webm, .ogg 格式</div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleManualFileOpen}
              accept="video/*"
              style={{ display: 'none' }}
            />
          </div>

          {/* Saved Video Projects list */}
          {savedAssets.length > 0 && (
            <div style={{ marginTop: 24, textAlign: 'left', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) + 2px)', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.7 }}>
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                最近使用过的视频项目
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
                {savedAssets.map((asset) => (
                  <div
                    key={asset.videoPath}
                    onClick={() => setVideoPath(asset.videoPath)}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 6,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.2s, border-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', marginRight: 16 }}>
                      <span style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) + 2px)', color: 'rgba(255,255,255,0.95)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {asset.videoName}
                      </span>
                      <span style={{ fontSize: 'var(--video-timeline-font-size, 11px)', color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        {asset.videoPath}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <span style={{ fontSize: 'var(--video-timeline-font-size, 11px)', color: '#ff3b30', background: 'rgba(255,59,48,0.1)', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
                        {asset.segments.length} 个剪辑点
                      </span>
                      <span style={{ fontSize: 'var(--video-timeline-font-size, 11px)', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                        {new Date(asset.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Active Video State */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          
          {/* 2. Center Video Player Display Container */}
          <div
            style={{
              flex: 1,
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <video
              ref={videoRef}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleSeeked}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => {
                const err = videoRef.current?.error;
                console.error('[VideoTimeline] Video load error:', err ? { code: err.code, message: err.message } : e);
              }}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />

            {/* Selected segment boundary highlight banner */}
            {selectedSegmentId && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  background: 'rgba(0,0,0,0.7)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 'var(--video-timeline-font-size, 11px)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  zIndex: 2
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: segments.find(s => s.id === selectedSegmentId)?.color || 'white'
                  }}
                />
                <span style={{ fontWeight: 600 }}>
                  {segments.find(s => s.id === selectedSegmentId)?.name}
                </span>
                <span style={{ opacity: 0.5 }}>
                  ({formatTime(segments.find(s => s.id === selectedSegmentId)?.start || 0)} - {formatTime(segments.find(s => s.id === selectedSegmentId)?.end || 0)})
                </span>
              </div>
            )}

            {isExtractingThumbnails && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 12,
                  right: 12,
                  background: 'rgba(0,0,0,0.8)',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)',
                  color: 'rgba(255,255,255,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  zIndex: 2
                }}
              >
                <div style={{ width: 8, height: 8, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                正在提取时间轴预览...
              </div>
            )}
          </div>

          {/* 3. Controls Toolbar Row (Very thin, docked directly above the timeline) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 12px',
              background: '#181818',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              gap: 8,
              zIndex: 5
            }}
          >
            {/* Playback rate and navigation arrows */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className="ctrl-btn"
                onClick={() => handleJump('backward')}
                title={`后退 ${jumpSeconds} 秒 (Left)`}
                style={{ padding: '3px 6px', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)' }}
              >
                ◀◀
              </button>
              <button
                className="ctrl-btn"
                onClick={() => handleStepFrame('backward')}
                title="退后1帧 (Comma)"
                style={{ padding: '3px 6px', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)' }}
              >
                ◀
              </button>
              <button
                className={`ctrl-btn ${isPlaying ? 'active' : ''}`}
                onClick={handlePlayPause}
                title="播放/暂停 (Space)"
                style={{ width: 32, padding: '3px 0', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)' }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                className="ctrl-btn"
                onClick={() => handleStepFrame('forward')}
                title="前进1帧 (Period)"
                style={{ padding: '3px 6px', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)' }}
              >
                ▶
              </button>
              <button
                className="ctrl-btn"
                onClick={() => handleJump('forward')}
                title={`前进 ${jumpSeconds} 秒 (Right)`}
                style={{ padding: '3px 6px', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)' }}
              >
                ▶▶
              </button>

              <button
                className="ctrl-btn"
                onClick={handleSplit}
                style={{ border: '1px solid #ff3b30', background: 'rgba(255, 59, 48, 0.08)', color: '#ff3b30', marginLeft: 6, padding: '3px 8px', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)', fontWeight: 600 }}
                title="在当前位置切分视频 (C)"
              >
                ✂️ 切分
              </button>

              {/* Merge selected — only visible when 2+ segments are selected */}
              {selectedSegmentIds.size >= 2 && (
                <button
                  className="ctrl-btn"
                  onClick={handleMergeSelected}
                  style={{ border: '1px solid #5ac8fa', background: 'rgba(90,200,250,0.1)', color: '#5ac8fa', marginLeft: 4, padding: '3px 8px', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                  title={`合并 ${selectedSegmentIds.size} 个选中片段为一个`}
                >
                  <span>⊕ 合并</span>
                  <span style={{ background: '#5ac8fa', color: '#000', borderRadius: 8, fontSize: 'calc(var(--video-timeline-font-size, 11px) - 2px)', padding: '0 4px', fontWeight: 700 }}>
                    {selectedSegmentIds.size}
                  </span>
                </button>
              )}
            </div>

            {/* Readout of current playhead / duration - content managed via ref to survive scrubbing re-renders */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace', fontSize: 'var(--video-timeline-font-size, 11px)', color: 'rgba(255,255,255,0.7)' }}>
              <span ref={timeReadoutRef} style={{ color: '#ff3b30', fontWeight: 'bold' }} />
              <span style={{ opacity: 0.4 }}>/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Compact controls block: jump delta, play speed, zoom indicator, close button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Jump span */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--video-timeline-font-size, 11px)' }}>
                <span style={{ opacity: 0.5 }}>跨度:</span>
                <select
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    borderRadius: 4,
                    padding: '2px 4px',
                    fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)',
                    outline: 'none'
                  }}
                  value={jumpSeconds.toString()}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setJumpSeconds(val);
                  }}
                >
                  <option value="2">2s</option>
                  <option value="5">5s</option>
                  <option value="10">10s</option>
                  <option value="30">30s</option>
                </select>
              </div>

              {/* Speed multiplier */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--video-timeline-font-size, 11px)' }}>
                <span style={{ opacity: 0.5 }}>速度:</span>
                <select
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white',
                    borderRadius: 4,
                    padding: '2px 4px',
                    fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)',
                    outline: 'none'
                  }}
                  value={playbackRate}
                  onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                >
                  <option value="0.25">0.25x</option>
                  <option value="0.5">0.5x</option>
                  <option value="1">1.0x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2.0x</option>
                </select>
              </div>

              {/* Zoom multiplier indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--video-timeline-font-size, 11px)', opacity: 0.8 }} title="以时间指针为中心缩放">
                <button
                  className="ctrl-btn"
                  onClick={() => zoomAroundPlayhead('out')}
                  style={{ width: 22, height: 22, padding: 0, fontSize: 'calc(var(--video-timeline-font-size, 11px) + 2px)' }}
                  title="缩小时间轴"
                >
                  −
                </button>
                <span style={{ fontFamily: 'monospace' }}>{zoom.toFixed(1)}x</span>
                <button
                  className="ctrl-btn"
                  onClick={() => zoomAroundPlayhead('in')}
                  style={{ width: 22, height: 22, padding: 0, fontSize: 'calc(var(--video-timeline-font-size, 11px) + 2px)' }}
                  title="放大时间轴"
                >
                  +
                </button>
              </div>

              {/* Tighter separator */}
              <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.15)' }} />

              {/* Tiny Close Video Button */}
              <button
                className="ctrl-btn"
                onClick={() => setVideoPath('')}
                style={{ padding: '2px 6px', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)', background: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
                title="关闭视频并返回拖拽区域"
              >
                ✖ 关闭
              </button>
            </div>
          </div>

          {/* 4. Bottom Interactive Timeline Track */}
          <div style={{ background: 'rgba(0,0,0,0.15)' }}>
            
            {/* Main Visual Timeline Container (outer wrapper) */}
            <div
              className="timeline-container"
              onDoubleClick={(e) => {
                // Swallowing double click to prevent triggering markdown edits/rename prompts
                e.preventDefault();
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                // Prevent context menu to support right-click drag panning!
                e.preventDefault();
              }}
            >
              <div
                ref={timelineRef}
                onMouseDown={handleTimelineMouseDown}
                className="timeline-scroll-container"
              >
                {/* Zoomed Inner Wrapper */}
                <div style={{ width: `${zoom * 100}%`, minWidth: '100%', height: '92px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* 1. Time Ruler */}
                  <TimeRuler
                    duration={duration}
                    zoom={zoom}
                    containerWidth={containerWidth}
                    timelineRef={timelineRef}
                  />

                  {/* 2. Filmstrip Track */}
                  <div
                    className="filmstrip-track"
                    style={{
                      height: '68px',
                      position: 'relative',
                      background: '#0d0d0d',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Filmstrip Keyframe Thumbnails Background (tiled 100px blocks) */}
                    <div style={{ display: 'flex', width: '100%', height: '100%', opacity: 0.4, pointerEvents: 'none' }}>
                      {renderFilmstripSlots()}
                    </div>

                    {/* Clips segment blocks overlay */}
                    {duration > 0 && segments.map((seg) => {
                      const leftPct = (seg.start / duration) * 100;
                      const widthPct = ((seg.end - seg.start) / duration) * 100;
                      const isSelected = selectedSegmentIds.has(seg.id);
                      const isMultiSelected = selectedSegmentIds.size > 1 && isSelected;
                      
                      return (
                        <div
                          key={seg.id}
                          className={`segment-block ${isSelected ? 'selected' : ''}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            borderTop: `5px solid ${isMultiSelected ? '#5ac8fa' : seg.color}`,
                            borderLeft: isSelected ? `2px solid ${isMultiSelected ? '#5ac8fa' : 'white'}` : `1.5px solid ${seg.color}`,
                            borderRight: isSelected ? `2px solid ${isMultiSelected ? '#5ac8fa' : 'white'}` : `1.5px solid ${seg.color}`,
                            borderBottom: isSelected ? `2.5px solid ${isMultiSelected ? '#5ac8fa' : 'white'}` : '1px solid rgba(255, 255, 255, 0.2)',
                            background: isMultiSelected ? 'rgba(90,200,250,0.1)' : isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.15)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '6px 8px',
                            color: 'white',
                            fontSize: 'var(--video-timeline-font-size, 11px)',
                            cursor: 'grab',
                            overflow: 'hidden',
                            boxShadow: isMultiSelected ? 'inset 0 0 6px rgba(90,200,250,0.2)' : 'inset 0 0 6px rgba(0,0,0,0.3)',
                          }}
                          draggable
                          onDragStart={(e) => {
                            setIsScrubbing(false);
                            handleSegmentDragStart(e, seg);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Multi-select: Shift or Ctrl/Cmd adds to selection
                            if (e.shiftKey || e.metaKey || e.ctrlKey) {
                              setSelectedSegmentIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(seg.id)) next.delete(seg.id);
                                else next.add(seg.id);
                                return next;
                              });
                            } else {
                              setSelectedSegmentIds(new Set([seg.id]));
                            }
                          }}
                          title={`拖拽到编辑器插入剪辑引用 | Shift/Ctrl+点击 多选`}
                        >
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 'var(--video-timeline-font-size, 11px)' }}>
                            {seg.name}
                          </div>
                          
                          <div style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) - 2px)', opacity: 0.8, fontFamily: 'monospace' }}>
                            {(seg.end - seg.start).toFixed(1)}s
                          </div>

                          <div
                            className="segment-delete-btn"
                            onClick={(e) => handleDeleteSegment(seg.id, e)}
                            title="删除并合并此片段"
                          >
                            ×
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 3. Red Current Playhead Line - position managed via ref to survive React re-renders during scrubbing */}
                  {duration > 0 && (
                    <div
                      ref={playheadRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: '0%',
                        width: 0,
                        pointerEvents: 'none',
                        zIndex: 20,
                        willChange: 'left',
                      }}
                    >
                      {/* Vertical red line */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          width: '2px',
                          background: '#ff3b30',
                          boxShadow: '0 0 4px rgba(255,59,48,0.5)',
                          transform: 'translateX(-1px)'
                        }}
                      />
                      {/* Playhead Grab Handle pentagon needle head in Time Ruler */}
                      <div
                        className="playhead-handle"
                        style={{
                          position: 'absolute',
                          top: 0,
                          width: '12px',
                          height: '14px',
                          background: '#ff3b30',
                          clipPath: 'polygon(0% 0%, 100% 0%, 100% 60%, 50% 100%, 0% 60%)',
                          transform: 'translateX(-5px)',
                          cursor: 'ew-resize',
                          pointerEvents: 'auto'
                        }}
                      />
                    </div>
                  )}

                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
