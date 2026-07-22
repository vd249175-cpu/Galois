import { useEffect } from 'react';
import { BC } from '../../CORE/BloodChannels';

export function useTimelineZoom(props: any) {
  const { areaId, containerWidth, currentTimeRef, duration, handlePlayPause, setZoom, state, timelineRef } = props;
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

    setZoom((prev: number) => {
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
  return { zoomAroundPlayhead };
}
