import type React from 'react';
import { buildClipMarkdown, type VideoSegment } from './VideoAssetManager';

export function useSegmentOperations(props: any) {
  const { currentTimeRef, duration, formatTimeShort, generateColor, selectedSegmentIds,
    setSegments, setSelectedSegmentIds, videoPath } = props;
const handleSplit = () => {
  const t = currentTimeRef.current;
  if (duration <= 0 || isNaN(duration)) return;

    setSegments((prev: VideoSegment[]) => {
      const targetIndex = prev.findIndex((s: VideoSegment) => s.start <= t && t <= s.end);
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
    setSegments((prev: VideoSegment[]) => {
      const selected = prev.filter((s: VideoSegment) => selectedSegmentIds.has(s.id));
    if (selected.length < 2) return prev;
      const minStart = Math.min(...selected.map((s: VideoSegment) => s.start));
      const maxEnd = Math.max(...selected.map((s: VideoSegment) => s.end));
    const merged: VideoSegment = {
      id: `seg-merged-${Date.now()}`,
      start: minStart,
      end: maxEnd,
      name: `${formatTimeShort(minStart)} - ${formatTimeShort(maxEnd)}`,
      color: selected[0].color,
    };
    // Replace selected segments with merged one, keeping order
      const firstIdx = prev.findIndex((s: VideoSegment) => selectedSegmentIds.has(s.id));
      const remaining = prev.filter((s: VideoSegment) => !selectedSegmentIds.has(s.id));
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
  return { handleMergeSelected, handleSegmentDragStart, handleSplit };
}
