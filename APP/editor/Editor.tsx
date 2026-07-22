import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { editorActions } from './actions';
import { EditorView } from './EditorCanvas';
export const EditorComponent = {
  typeId: 'editor',
  displayName: '文本编辑器',
  shortName: '编辑器',
  iconName: 'document',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 1.5h7.5L13 4v10.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-14z" />
    </svg>
  ),
  component: EditorView,
  actions: editorActions,
  bloodChannels: (areaId: string) => [
    BC.system.projectPath,
    BC.system.resolvedTags,
    BC.system.staticTags,
    BC.events.openFile(areaId),
    BC.system.editorCursor(areaId),
    BC.system.focusedAreaId,
    BC.system.activeEditors,
    BC.system.lastFocusedEditorId,
    BC_PREFIX.fileSavedAll,
    BC_PREFIX.scriptJson,
  ],
  manifest: {
    description: 'Markdown 笔记编辑器，支持 YAML frontmatter 标签 and WikiLink 导航',
    reads: [
      BC.system.projectPath,        // 项目根目录（由 fileTree 写入）
      BC.system.resolvedTags,       // 解析后的全局标签 map（由 fileTree 写入）
      BC.system.staticTags,         // 所有文件的原始/静态标签 map（由 fileTree 写入）
      BC.events.openFile('*'),      // 打开文件请求（由 fileTree/graphView 写入）
      BC.system.editorCursor('*'),  // 恢复项目状态中的编辑器光标
      BC_PREFIX.fileSavedAll,       // 读取外部脚本修改文件的保存事件
      BC.system.focusedAreaId,
      BC.system.activeEditors,
      BC.system.lastFocusedEditorId,
    ],
    writes: [
      BC_PREFIX.fileSavedAll,           // 文件保存事件 → fileTree, graphView
      BC.system.activeEditors,          // 注册/注销自身
      BC.system.lastFocusedEditorId,    // 聚焦时更新
      BC.system.focusedAreaId,          // 聚焦时更新
      BC.system.editorCursor('*'),      // 光标位置与选区状态
      BC.events.openFile('*'),          // WikiLink 跳转时写入目标 areaId
    ],
    dependsOn: ['fileTree'],           // 需要 fileTree 提供 system.resolvedTags
  },
  /**
   * Editor 支持的动态 action 前缀：
   * - 'custom.'  : 项目自定义命令（来自 commands.json 的 content 类型）
   * - 'project.' : 项目级脚本动作（来自 commands.json 的 script 类型）
   * AreaShell 的 ComponentWrapper 会将这些前缀的 action 信号注入到 lastAction prop。
   */
  dynamicActionPrefixes: ['custom.', 'project.'],
};
