import { fileTreeActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';
import { FileTreeView } from './FileTreeCanvas';

/**
 * FileTreeComponent — Lattice Explorer 插件注册对象
 *
 * 契约声明：
 *   WRITES: system.projectPath, system.resolvedTags, system.maxIterations,
 *           events.fileSaved.*, events.openFile.{editorId}
 *   READS:  system.projectPath, system.resolvedTags, system.maxIterations,
 *           events.fileSaved.* (触发重算), system.lastFocusedEditorId, system.activeEditors
 *   DEPENDS ON: 无（fileTree 是数据源头）
 */
export const FileTreeComponent = {
  typeId: 'fileTree',
  displayName: '文本浏览器',
  shortName: '浏览器',
  iconName: 'folder',
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1.5 3.5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-9z" />
    </svg>
  ),
  component: FileTreeView,
  actions: fileTreeActions,
  bloodChannels: [
    BC.system.projectPath,
    BC.system.resolvedTags,
    BC.system.staticTags,
    BC.system.fileSearchQuery,
    BC.system.maxIterations,
    BC_PREFIX.fileSavedAll,
    BC.system.lastFocusedEditorId,
    BC.system.activeEditors,
  ],
  manifest: {
    description: 'Lattice 笔记文件浏览器，负责计算全量 resolvedTags 并广播给其他插件',
    reads: [
      BC.system.projectPath,
      BC.system.maxIterations,
      BC_PREFIX.fileSavedAll,           // 监听任意文件保存 → 触发 tag 重算
      BC.system.lastFocusedEditorId,    // 确定点击文件发送到哪个 editor
      BC.system.activeEditors,
    ],
    writes: [
      BC.system.projectPath,            // 用户选择新目录时写入
      BC.system.resolvedTags,           // 计算后的全量标签 map（其他插件的核心数据来源）
      BC.system.staticTags,
      BC.system.fileSearchQuery,        // 左侧搜索状态，供 graphView 联动高亮/过滤
      BC.events.fileSaved('*'),         // 新建文件时广播
      BC.events.openFile('*'),          // 点击文件时发给目标 editor
      BC.events.scriptError('fileTree'), // 脚本执行错误广播
    ],
    dependsOn: [],                      // fileTree 是数据源，无依赖
  },
};
