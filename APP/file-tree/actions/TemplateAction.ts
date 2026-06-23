import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const templateAction: OrganAction = {
  id: 'fileTree.openTemplates',
  label: 'New from Template',
  defaultShortcut: 'meta+t',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 1.5 }),
    React.createElement('path', { d: 'M5 5.5h6M5 8h6M5 10.5h4' })
  ),
};
