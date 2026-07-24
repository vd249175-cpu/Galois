import { useEffect, useRef } from 'react';
import type { VideoAsset } from './VideoAssetManager';
import { saveAsset } from './VideoAssetManager';

export function useVideoTimelinePersistence(props: any) {
  const { areaId, duration, isAssetLoaded, projectPath, segments, setDuration, setIsAssetLoaded,
    setSegments, setSelectedSegmentIds, setThumbnails, setVideoPath, setZoom, videoPath, videoRef } = props;
// localStorage from older versions may still restore an external absolute
// path. Resolve it to (or copy it into) the notebook before loading media.
useEffect(() => {
    if (!projectPath || !videoPath) return;
  const projectVideoDir = `${projectPath}/.dnote_assets/videos`;
  if (videoPath === projectVideoDir || videoPath.startsWith(`${projectVideoDir}/`)) return;

  let active = true;
  (window as any).electronAPI.archiveVideo(videoPath, projectPath)
    .then((projectVideoPath: string) => {
      if (active && projectVideoPath && projectVideoPath !== videoPath) {
        setVideoPath(projectVideoPath);
      }
    })
    .catch((err: unknown) => {
      console.warn('[VideoTimeline] Could not migrate legacy external video path:', err);
    });
  return () => { active = false; };
}, [projectPath, videoPath]);

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
}, [segments, videoPath, duration, projectPath, isAssetLoaded]);
}
