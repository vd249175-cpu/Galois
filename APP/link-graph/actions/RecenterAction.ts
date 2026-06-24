import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const recenterAction: OrganAction = {
  id: 'linkGraph.recenter',
  label: '重置视角',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M2 8a6 6 0 1112 0A6 6 0 012 8z' }),
    React.createElement('circle', { cx: 8, cy: 8, r: 2 })
  ),
};
