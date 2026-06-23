import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const recenterAction: OrganAction = {
  id: 'graphView.recenter',
  label: 'Recenter Graph',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('circle', { cx: 8, cy: 8, r: 4 }),
    React.createElement('path', { d: 'M8 1v2M8 13v2M1 8h2M13 8h2' })
  ),
};
