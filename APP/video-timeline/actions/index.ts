import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

// Action IDs use camelCase prefix "videoTimeline." (consistent with fileTree., graphView., etc.)

export const playPauseAction: OrganAction = {
  id: 'videoTimeline.playPause',
  label: '播放/暂停 (Space)',
  defaultShortcut: 'space',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('polygon', { points: '5,3 12,8 5,13', fill: 'currentColor' }),
    React.createElement('line', { x1: 11, y1: 3, x2: 11, y2: 13, strokeWidth: 2, stroke: 'currentColor' })
  )
};

export const splitAction: OrganAction = {
  id: 'videoTimeline.split',
  label: '切分视频 (C)',
  defaultShortcut: 'c',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('circle', { cx: 5, cy: 5, r: 2.5 }),
    React.createElement('circle', { cx: 5, cy: 11, r: 2.5 }),
    React.createElement('line', { x1: 5, y1: 5, x2: 13, y2: 11 }),
    React.createElement('line', { x1: 5, y1: 11, x2: 13, y2: 5 })
  )
};

export const jumpBackwardAction: OrganAction = {
  id: 'videoTimeline.jumpBackward',
  label: '后退秒数 (Left)',
  defaultShortcut: 'left',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M8 3L3 8l5 5' }),
    React.createElement('path', { d: 'M13 3L8 8l5 5' })
  )
};

export const jumpForwardAction: OrganAction = {
  id: 'videoTimeline.jumpForward',
  label: '前进秒数 (Right)',
  defaultShortcut: 'right',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M3 3l5 5-5 5' }),
    React.createElement('path', { d: 'M8 3l5 5-5 5' })
  )
};

export const stepBackwardAction: OrganAction = {
  id: 'videoTimeline.stepBackward',
  label: '后退1帧 (Comma)',
  defaultShortcut: 'comma',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M10 4L6 8l4 4' }),
    React.createElement('line', { x1: 5, y1: 4, x2: 5, y2: 12 })
  )
};

export const stepForwardAction: OrganAction = {
  id: 'videoTimeline.stepForward',
  label: '前进1帧 (Period)',
  defaultShortcut: 'period',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('path', { d: 'M6 4l4 4-4 4' }),
    React.createElement('line', { x1: 11, y1: 4, x2: 11, y2: 12 })
  )
};

export const copyFrameReferenceAction: OrganAction = {
  id: 'videoTimeline.copyFrameReference',
  label: '复制当前帧引用 (Ctrl+Alt+F)',
  defaultShortcut: 'control+alt+f',
  isToolbar: true,
  icon: React.createElement(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
    React.createElement('rect', { x: 4.5, y: 4.5, width: 8.5, height: 9, rx: 1.5 }),
    React.createElement('path', { d: 'M3.5 11.5H3A1.5 1.5 0 0 1 1.5 10V3A1.5 1.5 0 0 1 3 1.5h7A1.5 1.5 0 0 1 11.5 3v.5' }),
    React.createElement('circle', { cx: 7.2, cy: 7.3, r: 1 }),
    React.createElement('path', { d: 'm5.5 12 2.2-2.2 1.5 1.4 1.2-1.1 2.1 1.9' })
  )
};

export const videoTimelineActions = [
  playPauseAction,
  splitAction,
  jumpBackwardAction,
  jumpForwardAction,
  stepBackwardAction,
  stepForwardAction,
  copyFrameReferenceAction
];
