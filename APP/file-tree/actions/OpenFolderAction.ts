import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const openFolderAction: OrganAction = {
  id: 'fileTree.openFolder',
  label: 'Open Folder',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z' }),
    React.createElement('path', { d: 'M4 10.5h8' })
  ),
};
