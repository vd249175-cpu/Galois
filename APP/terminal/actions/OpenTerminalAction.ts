import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const openTerminalAction: OrganAction = {
  id: 'terminal.openNative',
  label: '在当前目录打开系统终端',
  defaultShortcut: 'control+shift+t',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 1.5 }),
    React.createElement('path', { d: 'M10.5 7.5l2 1.5-2 1.5' }),
    React.createElement('line', { x1: 3.5, y1: 10.5, x2: 8.5, y2: 10.5 })
  ),
};
