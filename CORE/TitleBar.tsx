/**
 * CORE/TitleBar.tsx
 *
 * 窗口标题栏组件（无框窗口标题）。
 * 从 CORE/App.tsx 拆分至此。
 */

import React from 'react';

export function TitleBar({ title = 'DNOTE Workspace' }: { title?: string }) {
  const isMac = typeof window !== 'undefined' && navigator.userAgent.includes('Mac');
  return (
    <div className="window-titlebar" style={{ paddingLeft: isMac ? '80px' : '12px' }}>
      <span className="window-titlebar-title">{title}</span>
    </div>
  );
}
