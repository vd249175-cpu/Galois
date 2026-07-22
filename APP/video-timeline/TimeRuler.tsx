import React, { useEffect, useState } from 'react';

interface TimeRulerProps {
  duration: number;
  zoom: number;
  containerWidth: number;
  timelineRef: React.RefObject<HTMLDivElement | null>;
}

export function TimeRuler({ duration, zoom, containerWidth, timelineRef }: TimeRulerProps) {
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
