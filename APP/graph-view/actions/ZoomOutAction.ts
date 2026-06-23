import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const zoomOutAction: OrganAction = {
  id: 'graphView.zoomOut',
  label: 'Zoom Out',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M3 8h10' })
  ),
};
