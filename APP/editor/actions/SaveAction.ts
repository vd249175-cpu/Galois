import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const saveAction: OrganAction = {
  id: 'editor.save',
  label: 'Save Note',
  defaultShortcut: 'meta+s',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M3 2.5h7.5L13 5v8.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-11z' }),
    React.createElement('rect', { x: 5.5, y: 9.5, width: 5, height: 5 }),
    React.createElement('rect', { x: 5.5, y: 2.5, width: 4, height: 3 })
  ),
};
