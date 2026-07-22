import { useEffect } from 'react';

export function useTimelineViewport(props: any) {
  const { containerWidth, currentTime, duration, isPlaying, setContainerWidth, timelineRef, videoPath } = props;
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
}

