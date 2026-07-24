import type React from 'react';
import type { VideoAsset } from './VideoAssetManager';

interface VideoTimelineHomeProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDragOver: any;
  handleDrop: any;
  handleManualFileOpen: any;
  savedAssets: VideoAsset[];
  setVideoPath: (path: string) => void;
}

export function VideoTimelineHome({
  fileInputRef, handleDragOver, handleDrop, handleManualFileOpen, savedAssets, setVideoPath,
}: VideoTimelineHomeProps) {
  return (
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
      <div style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) + 2px)', fontWeight: 600, color: 'var(--text-main)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
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
              background: 'var(--bg-file-card, var(--bg-input))',
              border: '1px solid var(--border-file-card, var(--border-color))',
              borderRadius: 6,
              padding: '10px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.2s, border-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-file-card-hover, var(--bg-area-btn-hover))';
              e.currentTarget.style.borderColor = 'var(--border-area-btn-hover, var(--border-color))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-file-card, var(--bg-input))';
              e.currentTarget.style.borderColor = 'var(--border-file-card, var(--border-color))';
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', marginRight: 16 }}>
              <span style={{ fontSize: 'calc(var(--video-timeline-font-size, 11px) + 2px)', color: 'var(--text-main)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asset.videoName}
              </span>
              <span style={{ fontSize: 'var(--video-timeline-font-size, 11px)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                {asset.videoPath}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--video-timeline-font-size, 11px)', color: '#ff3b30', background: 'rgba(255,59,48,0.1)', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
                {asset.segments.length} 个剪辑点
              </span>
              <span style={{ fontSize: 'var(--video-timeline-font-size, 11px)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {new Date(asset.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )}
</div>
  );
}

