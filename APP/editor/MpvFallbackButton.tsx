import React, { useState } from 'react';

interface MpvFallbackButtonProps {
  filePath: string;
  title?: string;
  start?: number;
  end?: number;
}

export function MpvFallbackButton({ filePath, title, start, end }: MpvFallbackButtonProps) {
  const [status, setStatus] = useState<'idle' | 'starting' | 'started' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const launch = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setStatus('starting');
    setMessage('');
    try {
      const result = await window.electronAPI.playMediaWithMpv({ filePath, title, start, end });
      setStatus('started');
      setMessage(`mpv 已启动${result.version ? ` · ${result.version}` : ''}`);
    } catch (error: any) {
      setStatus('error');
      setMessage(error?.message || '无法启动 mpv');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
      <button
        type="button"
        onClick={launch}
        disabled={status === 'starting'}
        style={{
          border: '1px solid rgba(255,255,255,0.28)',
          borderRadius: 7,
          padding: '7px 12px',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          cursor: status === 'starting' ? 'wait' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {status === 'starting' ? '正在启动 mpv…' : '使用 mpv 原格式播放'}
      </button>
      {message && (
        <span style={{ color: status === 'error' ? '#ff8a80' : 'rgba(255,255,255,0.62)', fontSize: 10 }}>
          {message}
        </span>
      )}
    </div>
  );
}
