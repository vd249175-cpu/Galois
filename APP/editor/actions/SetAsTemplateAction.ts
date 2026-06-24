import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const setAsTemplateAction: OrganAction = {
  id: 'editor.setAsTemplate',
  label: '设为模板',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 1.5 }),
    React.createElement('path', { d: 'M5 8h6M8 5v6' })
  ),
};
