import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const openPaletteManagerAction: OrganAction = {
  id: 'graphView.openPaletteManager',
  label: 'Color Themes (色组管理)',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z' }),
    React.createElement('circle', { cx: 5.5, cy: 5.5, r: 1, fill: 'currentColor' }),
    React.createElement('circle', { cx: 8, cy: 4.5, r: 1, fill: 'currentColor' }),
    React.createElement('circle', { cx: 10.5, cy: 5.5, r: 1, fill: 'currentColor' }),
    React.createElement('circle', { cx: 11.5, cy: 8, r: 1, fill: 'currentColor' }),
    React.createElement('path', { d: 'M6.5 10.5a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z' })
  ),
};
