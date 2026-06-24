# 🌲 Lattice Explorer（文件浏览器插件）

Lattice Explorer 是 DNOTE 的**数据根源器官**，负责笔记项目的打开与管理、文件列表渲染、标签解析，以及项目生命周期的调度。所有其他插件（编辑器、图谱、终端）所依赖的 `projectPath` 和 `resolvedTags` 均由此插件写入 Blood 状态总线。

---

## 🌟 核心功能特性

### 1. 📂 工作区文件夹管理
- 通过 **"打开文件夹"** 动作（`meta+o`）或右侧栏按钮调用 `electronAPI.openDirectory()`，选择并加载笔记项目根目录。
- 项目路径写入 `Blood: system.projectPath`，触发所有订阅该频道的器官（editor、graphView、terminal）同步更新状态。
- 上次打开的项目路径持久化至 `localStorage`，重启后自动恢复。

### 2. 📋 卡片式文件列表
- 将项目根目录所有 `.md` 文件渲染为卡片网格布局。
- 每张卡片显示：笔记图标（Emoji）、文件名、Frontmatter 标签 Pill 徽章。
- 鼠标悬停显示删除按钮（带确认对话框防误操作）。
- 点击文件卡片 → 通过 `Blood: events.openFile.{lastFocusedEditorId}` 路由到最后聚焦的编辑器实例打开文件。

### 3. 🔍 多维布尔标签搜索
搜索框支持文件名与标签的混合查询，并实现完整的布尔逻辑：

| 语法 | 说明 |
|------|------|
| 普通文本 | 文件名子字符串匹配 |
| `#tag` | 标签精确 / 子字符串匹配 |
| `#re:pattern` | 正则表达式标签匹配 |
| `#/pattern/flags` | 带 flags 的正则匹配 |
| `&&`、`and` | 逻辑 AND（交集） |
| `\|\|`、`or` | 逻辑 OR（并集） |
| `!`、`not` | 逻辑 NOT（排除） |
| `(`、`)` | 分组优先级 |

搜索框输入 `#` 时自动弹出**标签自动补全**下拉菜单，候选项来自项目所有文件的静态标签集合。

### 4. 🏷️ 多轮标签解析引擎（tagResolver）
文件保存或项目路径变更时，自动运行标签解析：

1. **静态解析**：解析所有 `.md` 文件 YAML Frontmatter 中的 `tags:` 列表
2. **正则解析（同步）**：对 `re:` 前缀标签，在 JS 端对笔记正文进行 Regex 全局匹配，提取捕获组作为动态标签
3. **脚本解析（异步）**：对 `run:` 前缀标签，调用 `uv run script/{scriptName}.py`，传入 `DNOTE_NOTE_PATH` 和 `DNOTE_RESOLVED_TAGS` 环境变量，迭代 `maxIterations` 轮
4. 最终将完整 map 写入 `Blood: system.resolvedTags` 和 `system.staticTags`，触发 editor 和 graphView 更新

### 5. 📌 图标选择器
- 每个笔记文件支持自定义 Emoji 图标（写入 Frontmatter `icon:` 字段）
- 内置 24 种预设图标 + 自定义 Emoji 输入 + 清除功能
- 点击文件卡片的图标区域即可唤起图标选择弹窗

### 6. 📄 模板系统
从 `{projectPath}/temple/*.md` 目录读取模板文件：
- `fileTree.openTemplates` 动作（`meta+t`）→ 弹出模板选择弹窗
- 选择模板后输入新文件名 → 自动剥除 `run:` 动态脚本标签 → 克隆文件到项目根目录
- 新文件广播 `events.fileSaved` + `events.openFile` 自动在编辑器中打开

### 7. ✨ 新建文件
`fileTree.createFile` 动作 → 弹出自定义命名对话框（非浏览器 prompt）→ 生成包含默认 YAML Frontmatter 的新 `.md` 文件 → 自动在编辑器中打开

### 8. 🔄 项目生命周期调度（useProjectLifecycle）
项目路径变更时自动执行对应钩子脚本：

| 时机 | 脚本 | 执行方式 |
|------|------|---------|
| 项目打开 | `script/on_project_open.py` | 同步阻塞运行 |
| 项目打开后 | `script/on_project_run.py` | 后台守护进程 |
| 项目切换/关闭 | `script/on_project_close.py` | 同步运行 |

---

## 🧬 仿生接入规范

```
typeId:     'fileTree'
reads:      system.projectPath, system.maxIterations, events.fileSaved.*, system.lastFocusedEditorId
writes:     system.projectPath, system.resolvedTags, system.staticTags, events.fileSaved.*, events.openFile.*
dependsOn:  []  （fileTree 是数据根源，不依赖其他插件）
```

## 📁 目录结构

```
APP/file-tree/
├── index.ts                  # 导出 FileTreeComponent + fileTreeActions
├── FileTree.tsx              # 主组件（含搜索引擎、文件网格、模态框）
├── tagResolver.ts            # 多轮标签解析引擎
├── useProjectLifecycle.ts    # 生命周期钩子调度 Hook
└── actions/
    ├── CreateFileAction.ts   # 新建笔记（meta+n 风格）
    ├── OpenFolderAction.ts   # 打开文件夹
    ├── TemplateAction.ts     # 从模板新建（meta+t）
    └── index.ts
```
