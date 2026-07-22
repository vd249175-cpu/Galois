import { BC } from '../../CORE/BloodChannels';
import { videoTimelineActions } from './actions';
import { VideoTimelineView } from './VideoTimelineCanvas';

export const VideoTimelineComponent = {
  typeId: 'videoTimeline',
  displayName: '视频时间轴',
  iconName: 'video',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="9" height="10" rx="1.5" />
      <polygon points="11,5 15,3 15,13 11,11" />
    </svg>
  ),
  component: VideoTimelineView,
  actions: videoTimelineActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.focusedAreaId
  ],
  manifest: {
    description: '视频剪辑与时间轴插件，支持提取帧缩略图、多段切分与拖拽到 Markdown 引用',
    reads: [
      BC.system.projectPath,
      BC.system.focusedAreaId
    ],
    writes: [],
    dependsOn: []
  }
};
