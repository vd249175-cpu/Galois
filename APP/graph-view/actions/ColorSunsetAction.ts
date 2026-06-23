import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const colorSunsetAction: OrganAction = {
  id: 'graphView.colorSunset',
  label: 'Sunset Palette (落日熔金)',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M2 13h12M4 10a4 4 0 018 0' })
  ),
};
