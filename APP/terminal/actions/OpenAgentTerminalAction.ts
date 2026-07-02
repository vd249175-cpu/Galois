import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const openAgentTerminalAction: OrganAction = {
  id: 'terminal.openAgentNative',
  label: '在系统终端打开 AGY',
  defaultShortcut: 'control+shift+a',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 1.5 }),
    React.createElement('path', { d: 'M4 10.5l3.5-6 3.5 6' }),
    React.createElement('path', { d: 'M5.4 8.2h5.2' })
  ),
};
