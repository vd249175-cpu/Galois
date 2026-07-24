import { useState } from 'react';
import { MpvFallbackButton } from './MpvFallbackButton';

interface UniversalVideoPlayerProps {
  src: string;
  filePath: string | null;
  title?: string;
}

export function UniversalVideoPlayer({ src, filePath, title }: UniversalVideoPlayerProps) {
  const [nativeError, setNativeError] = useState(false);

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: nativeError ? 260 : undefined,
        margin: '8px 0',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        background: '#111',
      }}
    >
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        draggable={false}
        onError={() => setNativeError(true)}
        onLoadedMetadata={() => setNativeError(false)}
        onDragStart={(event) => event.preventDefault()}
        style={{ width: '100%', display: nativeError ? 'none' : 'block' }}
      />
      {nativeError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 20,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 24 }}>⚠️</span>
          <span style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: 600 }}>
            浏览器解码失败，原文件未被修改
          </span>
          {filePath ? (
            <MpvFallbackButton filePath={filePath} title={title} />
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>远程视频暂不能交给本机 mpv</span>
          )}
        </div>
      )}
    </div>
  );
}
