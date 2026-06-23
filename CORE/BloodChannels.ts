/**
 * BloodChannels — 全局血液频道注册表（明文契约）
 *
 * 所有 Blood key 必须在此处声明，禁止在组件内部硬编码字符串。
 * 四个命名空间：system.* / layout.* / actions.* / events.*
 *
 * 每个频道注释注明：Writer（写入者插件）→ Reader（读取者插件）
 */

// ─────────────────────────────────────────────────────────────────────────────
// system.* — 焦点、窗口、区域、运行时状态
// ─────────────────────────────────────────────────────────────────────────────
export const BC = {
  system: {
    /** 当前聚焦的 areaId。Writer: AreaShell → Reader: RightSidebar, ActionRegistry */
    focusedAreaId: 'system.focusedAreaId' as const,

    /** 所有活跃 editor areaId 列表。Writer: editor → Reader: fileTree, graphView */
    activeEditors: 'system.activeEditors' as const,

    /** 最后聚焦的 editor areaId。Writer: editor → Reader: fileTree, graphView */
    lastFocusedEditorId: 'system.lastFocusedEditorId' as const,

    /** 当前打开的项目根目录路径。Writer: fileTree(openFolder) → Reader: editor, graphView, fileTree */
    projectPath: 'system.projectPath' as const,

    /** 所有文件的已解析标签 map。Writer: fileTree(tagResolver) → Reader: editor, graphView */
    resolvedTags: 'system.resolvedTags' as const,

    /** tag 解析的最大迭代次数（可通过 settings 修改）。Writer: settings → Reader: fileTree */
    maxIterations: 'system.maxIterations' as const,

    /** 每个 area 的组件类型映射。Writer: AreaShell(mount) → Reader: RightSidebar, ActionRegistry */
    areaComponentTypes: (areaId: string) => `system.areaComponentTypes.${areaId}` as const,

    /** 每个 area 的屏幕坐标 frame（用于拖拽计算）。Writer: AreaShell → Reader: LayoutEngine */
    areaFrames: (areaId: string) => `system.areaFrames.${areaId}` as const,

    /** 拖拽状态（draggedId + location）。Writer: AreaShell → Reader: AreaShell(overlay) */
    dragState: 'system.dragState' as const,

    /** 记录每个 componentType 最后聚焦的 areaId。Writer: AreaShell → Reader: fileTree,graphView */
    lastFocused: (componentType: string) => `system.lastFocused.${componentType}Id` as const,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // layout.* — 面板拆分、关闭、弹出、合并（LayoutEngine 监听）
  // ─────────────────────────────────────────────────────────────────────────
  layout: {
    /** 拆分面板信号。Writer: ActionRegistry(panel.splitH/V) → Reader: LayoutEngine */
    splitArea: (areaId: string) => `layout.splitArea.${areaId}` as const,

    /** 移除/折叠面板。Writer: ActionRegistry(panel.close) | AreaShell(popOut) → Reader: LayoutEngine */
    removeArea: (areaId: string) => `layout.removeArea.${areaId}` as const,

    /** 弹出面板信号（timestamp）。Writer: ActionRegistry(panel.popOut) → Reader: AreaShell */
    popArea: (areaId: string) => `layout.popArea.${areaId}` as const,

    /** 合并弹出窗口回主窗口。Writer: AreaShell(mergeBack) → Reader: LayoutEngine */
    mergeBackArea: (areaId: string) => `layout.mergeBackArea.${areaId}` as const,

    /** 变更 area 的组件类型。Writer: AreaShell(header select) → Reader: LayoutEngine */
    changeAreaType: (areaId: string) => `layout.changeAreaType.${areaId}` as const,

    /** 记录已弹出 area 的原组件类型（用于 drag-merge 还原）。Writer: AreaShell → Reader: LayoutEngine */
    poppedAreas: (areaId: string) => `layout.poppedAreas.${areaId}` as const,

    /** drag-merge 事件 payload。Writer: AreaShell(onDrop) → Reader: LayoutEngine */
    dragMerge: 'layout.dragMerge' as const,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // actions.* — 用户输入转译后的动作信号（timestamp，不用 boolean）
  // Writer: ComponentRegistry(runAction) → Reader: ComponentWrapper → 注入 lastAction prop
  // 格式: actions.[pluginName].[actionName].[areaId]
  // ─────────────────────────────────────────────────────────────────────────
  actions: {
    signal: (pluginName: string, actionName: string, areaId: string) =>
      `actions.${pluginName}.${actionName}.${areaId}` as const,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // events.* — 业务事件（文件保存、打开文件、脚本完成等）
  // ─────────────────────────────────────────────────────────────────────────
  events: {
    /** 请求在指定 area 打开文件。Writer: fileTree(click) | editor(wikilink) | graphView(dblclick) → Reader: editor */
    openFile: (areaId: string) => `events.openFile.${areaId}` as const,

    /** 文件已保存通知（timestamp）。Writer: editor(save) | fileTree(createFile) → Reader: fileTree, graphView */
    fileSaved: (filePath: string) => `events.fileSaved.${filePath}` as const,

    /** 脚本执行错误（包含 message 和 scriptName）。Writer: fileTree(tagResolver) | graphView(lattice) → Reader: 任意订阅者 */
    scriptError: (pluginName: string) => `events.scriptError.${pluginName}` as const,

    /** 注入到右侧栏的工具栏 actions 列表（按 componentType 分组）。Writer: ComponentRegistry → Reader: RightSidebar */
    toolbarInjection: (componentType: string) => `injections.${componentType}.toolbar` as const,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 频道前缀（用于 useBloodChannel 的前缀订阅）
// ─────────────────────────────────────────────────────────────────────────────
export const BC_PREFIX = {
  /** 所有 fileSaved 事件的前缀（用于订阅任意文件保存） */
  fileSavedAll: 'events.fileSaved.' as const,
  /** 所有 areaComponentTypes 的前缀 */
  areaComponentTypes: 'system.areaComponentTypes.' as const,
  /** 所有 areaFrames 的前缀 */
  areaFrames: 'system.areaFrames.' as const,
  /** script_json 脚本输出前缀（保留兼容性） */
  scriptJson: 'script_json:' as const,
} as const;
