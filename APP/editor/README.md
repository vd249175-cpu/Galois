# 🧬 Lattice Editor（文本编辑器插件）

Lattice Editor 是 Galois 的**核心编辑器官**。它支持 Markdown 双栏预览、实时 YAML 标签编辑、多媒体归档、Lattice Graph 联动、反应式脚本绑定和斜线指令系统。

---

## 🌟 核心功能特性

### 1. ✏️ Live Preview / Reading 双主模式
- `meta+e`（`editor.toggleMode`）在 **Live Preview** ↔ **Reading** 之间切换
- 模式状态持久化到 `localStorage dnote_editor_mode`，旧的 Source/编辑模式配置会迁移到 Live Preview
- **Live Preview**：CodeMirror 6 编辑态预览，`#` 标题、`**bold**`、`*italic*`、`` `code` ``、`[link](url)`、`[[WikiLink]]`、任务 checkbox、`{{ reactive }}`、`![media](path)`、`@video[](...)` 在光标离开时渲染为 widget/decoration，光标进入时显示原始 Markdown
- Live Preview 中任务 checkbox 可直接点击切换完成状态，保持 Markdown 源码为唯一真实数据
- **Reading**：阅读渲染 + 局部交互式编辑，继续使用 `MarkdownPreview` 展示 WikiLink、媒体、代码块、反应式表达式等内容
- Reading 中点击普通块会进入局部 textarea 编辑；在行首或空格后输入 `/` 可唤起与 Live Preview 共用的 slash commands
- Reading 中 Markdown 表格支持直接编辑单元格，鼠标悬停表格时显示 `+ 行` / `+ 列` 工具条，并写回标准 Markdown 表格
- Source 源码编辑路径保留为内部保底能力，不作为普通用户的主切换模式
- Markdown 语言支持按需异步加载，Live Preview 通过 decorations/widgets 渲染，不额外维护第二份文档模型

### 2. 🔄 Undo / Redo 撤销重做
- 内置 100 步历史栈（单词边界防抖入栈，不每个字符都记录）
- `meta+z` 撤销，`meta+shift+z` 重做
- 文件切换时自动清空历史栈

### 3. 💾 智能自动保存
- 编辑模式下内容变化后防抖 600ms 自动写入磁盘
- 保存后广播 `Blood: events.fileSaved.{filePath}`，触发 fileTree 重新计算标签、graphView 重建拓扑图
- `meta+s`（`editor.save`）强制立即保存

### 4. 📂 多媒体 / CLIP 拖入与自动归档系统
将图片/音频/视频文件或视频时间线 CLIP 片段拖入编辑器区域时：
- 利用 `electronAPI.getPathForFile(file)` 安全获取本地绝对路径（绕过 Chromium 沙箱限制）
- 调用 `electronAPI.archiveMedia(srcPath, projectPath)` 自动复制到 `{projectPath}/media/`（重名加时间戳后缀）
- **Live Preview**：通过 CodeMirror `posAtCoords` 按鼠标落点插入独立 Markdown 块
- **Reading**：行级拖拽感受体 — 拖入文件或 CLIP 时各段落行亮起玻璃态微动光环，松手后插入到悬停行下方
- 支持一次拖入多个媒体文件，按顺序归档并插入多行 Markdown

### 5. 🎬 特权媒体播放协议（`dnote-file://` Scheme）
本地媒体文件通过 Electron 注册的特权协议流式传输，完整支持：
- **HTTP 206 Partial Content**：解析 `Range` 请求头，按需读取磁盘字节块
- 任意拖拽进度条（Seek）和毫秒级响应，规避 `0:00` 初始化卡死问题
- 协议注册于 Electron 主进程：`standard: true`、`secure: true`、`stream: true`

### 6. ⚡ 斜线指令菜单（Slash Commands）
在 Live Preview 或 Reading 块编辑器中，行首或空格后输入 `/`，唤起三类指令插值菜单（键盘上下键导航）：

| 类型 | 来源 | 说明 |
|------|------|------|
| **内置格式指令** | 硬编码 | `/h1`–`/h3`、`/code`、`/todo` 等排版动作 |
| **用户自定义文本** | localStorage `dnote_custom_commands` | 用户在首选项中定义的自定义可复用文本快照 |
| **项目插值组件** | `command/commands.json`（带有 `content` 键） | 项目层面共用的反应式小部件（如：系统监控、生命周期监测） |

> ⚠️ **注意**：在 `commands.json` 中配置有 `"script"` 键的后台脚本命令会被**自动过滤并隐藏**在斜线 `/` 菜单之外，它们仅通过**全局快捷键**或**右侧栏动作面板**进行静默触发，从而避免插值菜单杂乱。
> 
> 💡 **项目指令的作用域自定义声明 (`"scope"` 字段)**：
> 每个在 `commands.json` 中定义的项目指令可以通过配置 `"scope"` 来声明其快捷键的有效区域：
> - `"global"` / `"all"` / `true`：全局快捷键，在系统任何视图处于聚焦时，或整个页面无特定聚焦时，均能激活该快捷键并执行指令。
> - `"editor"`、`"fileTree"`、`"graphView"` 等页面/组件类型：局部快捷键，只有当用户聚焦在对应的页面组件内时，该快捷键才会被触发，从而避免不同页面间的快捷键冲突。
> - *默认规则*：带有 `"script"`（脚本命令）的指令默认 `scope` 为 `"global"`，带有 `"content"`（插值命令）的指令默认 `scope` 为 `"editor"`。

### 7. ⌨️ Markdown 格式快捷键
内置快捷键（均可在快捷键编辑弹窗中自定义并持久化至 `localStorage dnote_markdown_shortcuts`）：

| 快捷键 | 效果 |
|--------|------|
| `meta+b` | **粗体** |
| `meta+i` | *斜体* |
| `meta+d` | `行内代码` |
| `meta+k` | [超链接] |
| `meta+1` | # H1 标题 |
| `meta+2` | ## H2 标题 |
| `meta+3` | ### H3 标题 |

### 8. 🏷️ YAML 标签 Toolbar
编辑器顶部集成 `TagToolbar` 组件：

- 静态标签显示为**可删除 Pill 徽章**，输入框支持自动补全（来自 `system.staticTags`）
- `re:` 正则标签显示为**虚线 ⚡ Pill**，展开后显示所有匹配到的值及数量
- `run:` 脚本标签同样显示为 ⚡ Pill，展开显示上次运行提取的动态标签
- **迭代轮数选择器**（1–10）：写入 `Blood: system.maxIterations`，控制脚本标签运行轮次

### 9. 🔗 双向 WikiLink 导航
- 预览模式渲染 `[[文件名]]` 为可点击链接
- 点击后在项目中查找对应 `.md` 文件，通过 `Blood: events.openFile.{areaId}` 广播打开
- 若文件不存在：提示确认创建，创建后广播 `fileSaved` + `openFile`

### 10. ⚡ 反应式脚本绑定（Reactive Python Bindings）

在 Markdown 正文中使用双大括号语法绑定 JSON 数据与 Python 脚本：

```markdown
系统状态：{{ script/sys.json:status | run="sys_monitor.py" & interval=3 }}
CPU：{{ script/sys.json:cpu.usage }}
```

- **三种隔离模式**：`project`（所有实例共享）、`window`（per areaId）、`execution`（每次挂载独立）
- 初始化时加载 JSON 文件；若有 `run=` 且无 `interval`，保存时立即执行一次
- 有 `interval=N` 时每 N 秒执行一次脚本并通过 `Blood: events.scriptJson:{path}` 刷新显示
- 渲染为**数据 Pill 芯片**：显示当前值、执行中显示 spinner、报错时显示错误状态

> 完整开发手册：[SCRIPT_GUIDE.md](./SCRIPT_GUIDE.md)

### 11. 📍 光标状态追踪（Runtime Sync）
每次光标移动或选区变化时，写入 `Blood: system.editorCursor.{areaId}`：

```typescript
{ line, column, selectedText, filePath }
```

`useRuntimeSync` 防抖 150ms 后将此状态写入 `{projectPath}/.dnote_runtime.json`，供 Agent 插件和外部工具感知用户上下文。

### 12. 📋 实用 Modal 弹窗

| 功能 | 触发方式 |
|------|---------|
| 快捷键编辑器 | `editor.editShortcuts` 动作 |
| 标签分组管理 | 点击标签 Toolbar 的分组按钮 |
| 自定义片段管理 | 斜线菜单中的 "管理自定义指令" 入口 |

---

## 🧬 仿生接入规范

```
typeId:     'editor'
reads:      system.projectPath, system.resolvedTags, system.staticTags,
            events.openFile.{areaId}, system.focusedAreaId,
            system.activeEditors, system.lastFocusedEditorId,
            events.fileSaved.*, events.scriptJson:*
writes:     events.fileSaved.{path}, system.activeEditors,
            system.lastFocusedEditorId, system.editorCursor.{areaId},
            events.openFile.{areaId}
dependsOn:  ['fileTree']
```

## ⚡ 右侧栏动作

| 动作 ID | 默认快捷键 | 说明 |
|---------|-----------|------|
| `editor.save` | `meta+s` | 立即保存 |
| `editor.toggleMode` | `meta+e` | 切换 Live Preview / Reading |
| `editor.delete` | `meta+backspace` | 删除当前笔记 |
| `editor.setAsTemplate` | — | 设为模板（保存到 `temple/` 目录） |
| `editor.editShortcuts` | — | 打开快捷键编辑弹窗 |

## 📁 目录结构

```
APP/editor/
├── index.ts                  # 导出 EditorComponent + editorActions
├── Editor.tsx                # 主组件（2000+ 行，核心功能全部在此）
├── MarkdownPreview.tsx       # 预览模式渲染器（WikiLink、媒体、代码高亮）
├── ReactiveExpression.tsx    # {{ }} 反应式脚本绑定组件
├── TagToolbar.tsx            # YAML 标签编辑工具栏
├── editorUtils.ts            # YAML 序列化、frontmatter 解析、表达式解析
├── SCRIPT_GUIDE.md           # 反应式脚本完整开发手册
├── actions/
│   ├── SaveAction.ts
│   ├── DeleteAction.ts
│   ├── ToggleModeAction.ts
│   ├── SetAsTemplateAction.ts
│   ├── EditShortcutsAction.ts
│   └── index.ts
└── hooks/
    ├── useFileIO.ts          # 文件读写、防抖自动保存
    ├── useLinkNavigator.ts   # WikiLink 导航 + 创建
    └── useMediaDrop.ts       # 媒体拖入归档处理
```
