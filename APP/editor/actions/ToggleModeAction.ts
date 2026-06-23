import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const toggleModeAction: OrganAction = {
  id: 'editor.toggleMode',
  label: 'Toggle Markdown Mode',
  defaultShortcut: 'meta+e',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 1.5 }),
    React.createElement('path', { d: 'M6 2v12M2 6h8M2 10h8' })
  ),
};
