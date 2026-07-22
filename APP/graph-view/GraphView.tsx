import { graphViewActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { GraphView } from './GraphViewCanvas';

/**
 * GraphViewComponent — Lattice Graph 插件注册对象
 *
 * 契约声明：
 *   READS:  system.projectPath, system.resolvedTags, system.config,
 *           events.fileSaved.*, system.lastFocusedEditorId, system.activeEditors
 *   WRITES: events.openFile.{editorId}  (双击节点跳转)
 *           events.scriptError.graphView (lattice 脚本错误)
 *   DEPENDS ON: fileTree (提供 system.resolvedTags)
 */
export const GraphViewComponent = {
  typeId: 'graphView',
  displayName: '标签拓扑图',
  shortName: '拓扑图',
  iconName: 'git-branch',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <path d="M4 5.5l3.5 5M12 5.5l-3.5 5" />
    </svg>
  ),
  component: GraphView,
  actions: graphViewActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.resolvedTags,
    BC.system.fileSearchQuery,
    BC.system.config,
    BC_PREFIX.fileSavedAll,
    BC.system.lastFocusedEditorId,
    BC.system.activeEditors,
  ],
  manifest: {
    description: 'Tag Lattice 关系图，使用 Python subset-inclusion 算法绘制笔记包含关系',
    reads: [
      BC.system.projectPath,
      BC.system.resolvedTags,       // 由 fileTree 写入，graphView 是消费者
      BC.system.fileSearchQuery,    // 与左侧文件树搜索联动
      BC.system.config,             // 图谱字号配置
      BC_PREFIX.fileSavedAll,       // 文件保存时重建图谱
      BC.system.lastFocusedEditorId,
      BC.system.activeEditors,
    ],
    writes: [
      BC.events.openFile('*'),              // 双击节点时发送打开请求
      BC.system.fileSearchQuery,            // 点击节点时反向更新左侧搜索
      BC.events.scriptError('graphView'),   // lattice.py 失败时广播错误
    ],
    dependsOn: ['fileTree'],  // 依赖 fileTree 提供 resolvedTags（必须先 mount）
  },
};
