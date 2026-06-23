import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const colorNordicAction: OrganAction = {
  id: 'graphView.colorNordic',
  label: 'Nordic Palette (北欧森林)',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M1 13l4-7 4 7M6 13l4-9 5 9' })
  ),
};
