import { TimeRuler } from './TimeRuler';
import type { VideoSegment } from './VideoAssetManager';

export function VideoTimelineActive(props: any) {
  const { containerWidth, duration, formatTime, frameCopyStatus, handleCopyFrameReference,
    handleDeleteSegment, handleJump, handleLoadedMetadata, handleMergeSelected, handlePlaybackRateChange,
    handlePlayPause, handleSegmentDragStart, handleSeeked, handleSplit, handleStepFrame, handleTimelineMouseDown,
    handleTimeUpdate, isCopyingFrame, isExtractingThumbnails, isPlaying, jumpSeconds, playheadRef, playbackRate,
    renderFilmstripSlots, segments, selectedSegmentId, selectedSegmentIds, setIsPlaying, setIsScrubbing,
    setJumpSeconds, setSelectedSegmentIds, setVideoPath, timelineRef, timeReadoutRef, videoPath, videoRef,
    zoom, zoomAroundPlayhead } = props;
  return (
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
      crossOrigin="anonymous"
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
            background: segments.find((s: VideoSegment) => s.id === selectedSegmentId)?.color || 'white'
          }}
        />
        <span style={{ fontWeight: 600 }}>
          {segments.find((s: VideoSegment) => s.id === selectedSegmentId)?.name}
        </span>
        <span style={{ opacity: 0.5 }}>
          ({formatTime(segments.find((s: VideoSegment) => s.id === selectedSegmentId)?.start || 0)} - {formatTime(segments.find((s: VideoSegment) => s.id === selectedSegmentId)?.end || 0)})
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

      <button
        className="ctrl-btn frame-reference-btn"
        onClick={() => void handleCopyFrameReference()}
        disabled={isCopyingFrame || !videoPath}
        style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)' }}
        title="保存当前关键帧并复制 Markdown 图片引用 (Ctrl+Alt+F)"
      >
        {isCopyingFrame ? '保存中…' : '▣ 帧引用'}
      </button>

      {frameCopyStatus && (
        <span
          title={frameCopyStatus}
          style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: frameCopyStatus.startsWith('复制失败') ? '#ff817a' : '#9dcced', fontSize: 'calc(var(--video-timeline-font-size, 11px) - 1px)', fontWeight: 600 }}
        >
          {frameCopyStatus}
        </span>
      )}

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
            {duration > 0 && segments.map((seg: VideoSegment) => {
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
                      setSelectedSegmentIds((prev: Set<string>) => {
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
  );
}
