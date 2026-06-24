import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const deleteAction: OrganAction = {
  id: 'editor.delete',
  label: '删除当前笔记',
  defaultShortcut: 'meta+backspace',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('path', { d: 'M2 4h12M4 4v10a1 1 0 001 1h6a1 1 0 001-1V4M5.5 4V2.5a1 1 0 011-1h3a1 1 0 011 1V4M6.5 7v5M9.5 7v5' })
  ),
};
