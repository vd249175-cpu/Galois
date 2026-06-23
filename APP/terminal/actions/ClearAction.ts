import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const clearAction: OrganAction = {
  id: 'terminal.clear',
  label: 'Clear Console',
  defaultShortcut: 'control+l',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M2.5 4h11M4.5 4v9.5a1 1 0 001 1h5a1 1 0 001-1V4M5.5 2.5h5' }),
    React.createElement('line', { x1: 6.5, y1: 7, x2: 6.5, y2: 11 }),
    React.createElement('line', { x1: 9.5, y1: 7, x2: 9.5, y2: 11 })
  ),
};
