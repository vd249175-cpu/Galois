import { useEffect } from 'react';
import type React from 'react';

export function useTimelineScrubbing(props: any) {
  const { containerWidth, duration, formatTime, isScrubbing, isScrubbingRef,
    lastSeekTimeRef, panRef, playheadRef, scrubbedTimeRef, scrubLoopActiveRef, setCurrentTime,
    setIsPlaying, setIsScrubbing, smoothTimeRef, timeReadoutRef, timelineRef, videoRef,
    wasMutedRef, wasPlayingBeforeScrubRef } = props;
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
        }).catch((err: unknown) => {
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
  return { handleTimelineMouseDown };
}
