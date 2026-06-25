import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const playPauseAction: OrganAction = {
  id: 'video-timeline.playPause',
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
  id: 'video-timeline.split',
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
  id: 'video-timeline.jumpBackward',
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
  id: 'video-timeline.jumpForward',
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
  id: 'video-timeline.stepBackward',
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
  id: 'video-timeline.stepForward',
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

export const videoTimelineActions = [
  playPauseAction,
  splitAction,
  jumpBackwardAction,
  jumpForwardAction,
  stepBackwardAction,
  stepForwardAction
];
