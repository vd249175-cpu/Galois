# 🧬 Lattice Editor Organ (Plugin)

Lattice Editor 是 DNOTE 仿生工作区中的核心编辑“器官”。它不仅是一个支持 Markdown 双栏预览与实时 YAML 标签编辑的编辑器，更是连接 DNOTE 多媒体归档、Lattice Graph 网格拓扑与 Reactive Python 执行绑定的枢纽。

---

## 🌟 核心功能特性

### 1. 📂 多媒体拖入与自动归档系统 (Media Auto-Archiving)
当用户将媒体文件（图片、音频、视频）拖入编辑器区域时，系统会自动执行本地文件系统的流式归档与安全转移：
* **沙箱路径解析**：利用 Electron Preload 暴露的 `webUtils.getPathForFile` 接口，绕过 Chromium 对本地绝对路径的安全限制，安全获取真实物理路径。
* **重名冲突防护**：自动复制并转移至当前 Project 的 `media/` 目录下。若文件名冲突，系统会自动拼接精确的时间戳后缀。
* **双模式智能定位插入**：
  * **编辑模式（Edit Mode）**：将归档后的相对路径生成为标准 Markdown 链接，并在光标（Cursor）处直接插入，自动进行首尾换行隔离。
  * **预览模式（Preview Mode）**：渲染树各段落具备行级拖拽感受体。当文件移过段落行时，该行边缘会自动亮起玻璃态微动光环（Glow Border），松手后直接精准拼接插入在该行下方。若拖至空白区域，则追加于文末。

### 2. ⚡️ 特权媒体播放协议 (`dnote-file://` Scheme)
为了在 Electron 沙箱环境下流畅播放在线或本地高清视频/音频，我们实现了一套底层的特权媒体流式通道：
* **标准协议注册**：在 Electron 主进程初始化阶段，将 `dnote-file` 注册为 `standard: true`、`secure: true` 和 `stream: true` 的特权协议，使其能完全承载 Chromium network 层的流式解析机制。
* **HTTP 206 Partial Content (分片 Seek 支持)**：
  * 系统自动解析 Chromium 媒体播放器发送的 `Range` 请求头（例如 `bytes=start-end`）。
  * 采用 Node `fs` 流式同步文件句柄读取，按需读取磁盘上对应的媒体字节块。
  * 返回 `206 Partial Content` 状态，并精确装配 `Content-Range`、`Accept-Ranges: bytes` 及 `Content-Length` 头部。
  * 完美支持高清 MP4 视频的任意拖拽进度条（Seek）和毫秒级响应加载，彻底规避了 `0:00` 无法初始化的情况。

### 3. 🐍 反应式脚本绑定 (Reactive Python Bindings)
编辑器能够解析并实时响应特定语法的大括号双向绑定：
$$\{\{\text{ file.json:key }|\text{ run="script.py" \& interval=5 }\}\}$$
* **数据流向**：每次渲染段落时，解析器识别绑定结构，自动读取并渲染对应的 `JSON` 数据。
* **细胞抗体反馈**：通过 `Blood` 状态广播总线监听底层 `script_json:*` 的数值变动，无缝重绘对应的局部 UI，使 Markdown 文件成为动态的控制面板。

### 4. 🏷️ YAML 标签拓扑与 WikiLinks
* **Frontmatter 编辑器**：顶部集成的 YAML 标签输入组件。标签的添加/移除会实时重写文件头部的 YAML block。
* **Lattice Graph 联动**：标签更新后直接修改 `Blood` 状态，从而触发右侧 2D Lattice 拓扑图重新计算节点子集关系并产生力导向浮动动画。
* **双向连结 WikiLinks**：支持 `[[双向链接]]` 渲染，点击链接即可通过 Blood 信号广播打开对应笔记的编辑器实例。

---

## 🧬 仿生接入规范 (Plugin Specifications)

### 1. 注册表元配置 `plugin.json`
Lattice Editor 的输入输出通道遵循如下规范：
```json
{
  "id": "editor",
  "name": "Lattice Editor",
  "version": "1.0.0",
  "description": "Custom Markdown note editor with real-time tag editing, media drop, and reactive python execution bindings.",
  "bloodChannels": [
    "project.path",               // 订阅当前笔记本工作目录
    "events.openFile.editor-root", // 订阅主编辑器打开文件事件
    "events.openFile.${areaId}",  // 订阅特定多实例窗口打开文件事件
    "script_json:*"               // 订阅底层 Python 脚本输出的数据通道
  ],
  "triggerConditions": {
    "open": "events.openFile.${areaId}",
    "save": "actions.editor.save.${areaId}",
    "toggleMode": "actions.editor.toggleMode.${areaId}"
  }
}
```

### 2. 核心状态与抗体关系 (State & Receptors)
* **状态源订阅**：使用 `useBloodChannel` 监听当前打开的笔记路径。
* **触发反射 (Antibody)**：
  * 接收到 `actions.editor.toggleMode.${areaId}` 时，触发编辑模式/预览模式状态切换，并清除对应的拖拽缓存指针。

---

## 💻 反应式脚本开发 (Reactive Scripts)

DNOTE 支持一种低代码、双向绑定的反应式脚本机制。用户只需在 Markdown 笔记中声明数据占位符与关联脚本，编辑器就会在后台调度运行脚本并自动刷新数据视图。

### 1. 🔗 快速语法示例
在 Markdown 笔记中，您可以使用双大括号绑定数据源和运行脚本：
```markdown
当前系统状态：{{ script/sys_monitor.json:status | run="sys_monitor.py" & interval=3 }}
CPU 使用率：{{ script/sys_monitor.json:cpu.usage }}
```

### 2. 📝 完整脚本开发手册
针对 Python 脚本开发者，我们提供了一份全面且独立的开发指南，内容包括：
* **`uv` 依赖管理**：基于 PEP 723 格式声明第三方库依赖（即拷即用，无需配置 virtualenv）。
* **环境变量接收**：获取 `DNOTE_OUTPUT_FILE` 输出绝对路径及 `DNOTE_THREAD_ID` 实例 ID。
* **数据落盘规范**：JSON 编码、多级嵌套点号寻址等。
* **分步教程与调试技巧**：编写流程与命令行本地调试测试命令。

详细内容请参阅独立手册：**[DNOTE 反应式脚本开发手册 (SCRIPT_GUIDE.md)](file:///Users/apexwave/Desktop/DNOTE/APP/editor/SCRIPT_GUIDE.md)**
