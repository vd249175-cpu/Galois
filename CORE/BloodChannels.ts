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

    /** 所有文件的原始/静态标签 map。Writer: fileTree(tagResolver) → Reader: editor */
    staticTags: 'system.staticTags' as const,

    /** 左侧文件树搜索查询。Writer: fileTree/graphView → Reader: fileTree, graphView */
    fileSearchQuery: 'system.fileSearchQuery' as const,

    /** tag 解析的最大迭代次数（可通过 settings 修改）。Writer: settings → Reader: fileTree */
    maxIterations: 'system.maxIterations' as const,

    /** 全局配置。Writer: App / SettingsModal → Reader: 任意组件 */
    config: 'system.config' as const,

    /** 当前 App 运行模式。Writer: App(runtime bootstrap) → Reader: terminal, settings */
    runtimeMode: 'system.runtimeMode' as const,

    /** 历史扩展目录字段。当前默认开发入口是 external whole-code workbench。 */
    extensionPath: 'system.extensionPath' as const,

    /** 历史扩展清单字段。当前不作为默认运行路径。 */
    extensions: 'system.extensions' as const,

    /** 历史扩展命令字段。当前不作为默认运行路径。 */
    extensionCommands: 'system.extensionCommands' as const,

    /** 历史扩展刷新信号字段。当前不作为默认运行路径。 */
    extensionRefreshTimestamp: 'system.extensionRefreshTimestamp' as const,

    /** 外部 workbench 中的 APP 器官源码目录。Writer: App(runtime bootstrap) → Reader: terminal */
    sourcePluginPath: 'system.sourcePluginPath' as const,

    /** 源码插件目录是否可写。Writer: App(runtime bootstrap) → Reader: terminal, settings */
    canWriteSourcePlugins: 'system.canWriteSourcePlugins' as const,

    /** 命令行助手应加入的工作区目录集合。Writer: App(runtime bootstrap) → Reader: terminal */
    agentWorkspace: 'system.agentWorkspace' as const,

    /** 外部依赖探测结果（uv/python/agy/shell）。Writer: App(runtime bootstrap) → Reader: settings */
    environmentStatus: 'system.environmentStatus' as const,

    /** 当前项目声明驱动环境修复结果。Writer: FirstRun/settings → Reader: settings/onboarding */
    projectEnvironmentRepair: 'system.projectEnvironmentRepair' as const,

    /** 每个 area 的组件类型映射。Writer: AreaShell(mount) → Reader: RightSidebar, ActionRegistry */
    areaComponentTypes: (areaId: string) => `system.areaComponentTypes.${areaId}` as const,

    /** 每个 area 的屏幕坐标 frame（用于拖拽计算）。Writer: AreaShell → Reader: LayoutEngine */
    areaFrames: (areaId: string) => `system.areaFrames.${areaId}` as const,

    /** 拖拽状态（draggedId + location）。Writer: AreaShell → Reader: AreaShell(overlay) */
    dragState: 'system.dragState' as const,

    /** 当前正在被拖拽的 areaId。Writer: AreaShell(dragStart/dragEnd) → Reader: AreaShell(dragOver) */
    activeDraggedId: 'system.activeDraggedId' as const,

    /** 终端 Tab 列表。Writer: terminal → Reader: terminal */
    terminalTabs: 'system.terminalTabs' as const,

    /** 当前活跃的终端 Tab ID。Writer: terminal → Reader: terminal */
    terminalActiveTabId: 'system.terminalActiveTabId' as const,

    /** Editor 光标位置（按 areaId 区分）。Writer: editor → Reader: agent, App(runtimeSync) */
    editorCursor: (areaId: string) => `system.editorCursor.${areaId}` as const,

    /** 记录每个 componentType 最后聚焦的 areaId。Writer: AreaShell → Reader: fileTree,graphView */
    lastFocused: (componentType: string) => `system.lastFocused.${componentType}Id` as const,

    /** 注入到右侧栏的工具栏 actions 列表（按 componentType 分组）。Writer: ComponentRegistry → Reader: RightSidebar */
    toolbarInjection: (componentType: string) => `system.injections.${componentType}.toolbar` as const,
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

    /** 所有面板被关闭的信号（timestamp）。Writer: LayoutEngine → Reader: App */
    allClosed: 'layout.allClosed' as const,
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

    /**
     * 主题变更信号（timestamp）。Writer: SettingsModal → Reader: App
     * ⚠️ 主题名称字符串存储于 system.config.theme，此频道仅作触发信号使用。
     */
    themeChanged: 'events.themeChanged' as const,

    /** 脚本执行错误（包含 message 和 scriptName）。Writer: fileTree(tagResolver) | graphView(lattice) → Reader: 任意订阅者 */
    scriptError: (pluginName: string) => `events.scriptError.${pluginName}` as const,

    /** 项目自定义命令执行完成。Writer: 任意器官(execCommand) → Reader: 触发方器官 */
    commandExecuted: (commandId: string) => `events.commandExecuted.${commandId}` as const,
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
  /** Reactive expression script JSON output prefix */
  scriptJson: 'events.scriptJson:' as const,
  /** 所有 openFile 事件的前缀 */
  openFileAll: 'events.openFile.' as const,
  /** 所有 editorCursor 状态的前缀 */
  editorCursorAll: 'system.editorCursor.' as const,
  /** layout.changeAreaType. 的前缀 */
  changeAreaType: 'layout.changeAreaType.' as const,
  /** layout.removeArea. 的前缀 */
  removeArea: 'layout.removeArea.' as const,
  /** layout.splitArea. 的前缀 */
  splitArea: 'layout.splitArea.' as const,
  /** layout.mergeBackArea. 的前缀 */
  mergeBackArea: 'layout.mergeBackArea.' as const,
} as const;
