import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const editShortcutsAction: OrganAction = {
  id: 'editor.editShortcuts',
  label: '编辑快捷键',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('rect', { x: 1.5, y: 4.5, width: 13, height: 7, rx: 1 }),
    React.createElement('path', { d: 'M4 7h1M6.5 7h1M9 7h1M12 7h1M5.5 9.5h5' })
  ),
};
