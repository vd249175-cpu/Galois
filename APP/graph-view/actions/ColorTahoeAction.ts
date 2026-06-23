import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const colorTahoeAction: OrganAction = {
  id: 'graphView.colorTahoe',
  label: 'Tahoe Palette (极光霓虹)',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('circle', { cx: 8, cy: 8, r: 6 }),
    React.createElement('path', { d: 'M5 8a3 3 0 016 0' })
  ),
};
