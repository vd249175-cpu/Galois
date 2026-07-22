import { useEffect } from 'react';
import { loadAsset, type VideoSegment } from './VideoAssetManager';
import { extractVideoThumbnails } from './extractVideoThumbnails';

export function useVideoAssetRestore(props: any) {
  const { areaId, duration, projectPath, setIsAssetLoaded, setIsExtractingThumbnails, setSegments,
    setSelectedSegmentIds, setThumbnails, videoPath } = props;

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
    extractVideoThumbnails({ areaId, path: videoPath, dur: duration, projectPath, setIsExtractingThumbnails, setThumbnails });
  };

  restoreAsset();

  return () => {
    active = false;
  };
}, [projectPath, videoPath, duration]);

}
