import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const createFileAction: OrganAction = {
  id: 'fileTree.createFile',
  label: '新建笔记',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('path', { d: 'M8 3v10M3 8h10' })
  ),
};
