export function renderFilmstripSlots(thumbnails: string[], containerWidth: number, zoom: number) {
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
