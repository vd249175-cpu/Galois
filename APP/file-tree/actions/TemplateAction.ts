import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const templateAction: OrganAction = {
  id: 'fileTree.openTemplates',
  label: '从模板新建',
  defaultShortcut: 'meta+t',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 1.5 }),
    React.createElement('path', { d: 'M5 5.5h6M5 8h6M5 10.5h4' })
  ),
};

export const manageTemplatesAction: OrganAction = {
  id: 'fileTree.manageTemplates',
  label: '管理模板',
  defaultShortcut: 'meta+shift+m',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M3 1.5h5.5L12 5v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-13z' }),
    React.createElement('circle', { cx: 7, cy: 9, r: 2 }),
    React.createElement('path', { d: 'M7 6v1M7 11v1M4 9h1M10 9h1' })
  ),
};
