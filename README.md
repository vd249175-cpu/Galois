# DNOTE Workspace 💻

DNOTE 是一个基于 **TypeScript / Electron / Vite / React** 打造的现代化、高可定制性桌面工作区。项目核心采用**仿生设计理念**（Biomimetic Architecture），最大程度地实现了各面板组件的模块化解耦与自治性。

![DNOTE Workspace Showcase](assets/workspace.png)

---

## 🧬 仿生设计核心理念 (Biomimetic Concept)

本项目不采用传统的组件间直接通信（回调、Event Bus 等），而是模拟生物体的生命运行机制：

```mermaid
graph TD
    %% Sensory Input (Sensors)
    subgraph Sensors ["感受器 (Sensors)"]
        K["键盘按键 (Shortcuts)"] --> AR["反射区 (ActionRegistry)"]
        B["工具栏按钮 (Toolbar Buttons)"] --> AR
    end

    %% State & Blood
    subgraph BloodStream ["血管 (Blood State)"]
        AR -- "写入信号" --> Blood["血液 (Blood.ts)"]
        Blood -- "广播变动频道" --> AntibodyHook["抗体 (Antibody/Receptors)"]
    end

    %% Receptors & Organs
    subgraph OrganCells ["器官与细胞 (Organs & Cells)"]
        AntibodyHook -- "触发特定行为" --> FileTree["Lattice Explorer 器官"]
        AntibodyHook -- "触发特定行为" --> Editor["Lattice Editor 器官"]
        AntibodyHook -- "触发特定行为" --> Graph["Lattice Graph 器官"]
        AntibodyHook -- "触发特定行为" --> Terminal["Terminal Console 器官"]
        AntibodyHook -- "触发特定行为" --> Settings["Settings Panel 器官"]
    end

    style Sensors fill:#1e1e2e,stroke:#313244,color:#cdd6f4
    style BloodStream fill:#311b1b,stroke:#f38ba8,color:#f5e0dc
    style OrganCells fill:#181825,stroke:#cba6f7,color:#cdd6f4
```

### 1. 🩸 血液 (Blood.ts) —— 状态管理中心
*   整个项目维持一个全局统一的单一数据源（Single Source of Truth）：`Blood` 状态机。
*   所有的组件、按钮、键盘监听器**不直接与其它组件通信，只修改 Blood 状态**。
*   状态被修改后，`Blood` 会向所有订阅的器官广播哪些“频道（State Keys）”发生了变化。

### 2. 🫀 器官 (Organs) —— 模块化插件
*   位于 `APP/` 目录下的组件都是“器官”（Plugins）。例如：
    *   **Lattice Explorer (file-tree/)**：文件及标签目录管理器（解析 YAML 标签与运行生命周期脚本）。
    *   **Lattice Editor (editor/)**：实例隔离的代码及 YAML 属性编辑器，支持 Draft 未保存模式。
    *   **Lattice Graph (graph-view/)**：力导向拓扑关系图谱，支持 Hill Node 算法非线性缩放及色板（Palette）管理。
    *   **Obsidian Link Graph (link-graph/)**：Obsidian 风格的双向链接图谱，实时扫描解析 WikiLinks 并在 2D 力导向画布上渲染笔记关联拓扑，支持幻影节点与物理模拟参数微调。
    *   **Terminal Console (terminal/)**：基于 xterm.js 的独立多标签 Shell 终端。
    *   **Settings Panel (settings/)**：自定义首选项、3D 实体键帽快捷键录制及一键 Reset 页面。
*   **插件即是组件即是应用本身**。器官在运行时可以自由被销毁、复用或任意组合。

### 3. 🛡️ 器官抗体 (Antibodies / Receptors) —— 反应接收体
*   器官内部通过 React 响应式钩子 `useBloodChannel` 或 `useOrganAntibody` 作为“抗体”。
*   收到血液广播后，抗体检查自己关注的频道是否有变化，无变化则不做响应，有变化则立即执行对应的细胞反应程序（如保存文件、清空终端历史）。
*   执行完毕后，抗体负责将血液中的事件触发器状态复位（重置为 `false` 或 `null`），防止重复触发。

---

## 🛠️ 核心功能子系统 (Subsystems)

### 1. 🎛️ 窗口排版布局引擎 ([LayoutEngine.tsx](file:///Users/apexwave/Desktop/DNOTE/CORE/LayoutEngine.tsx))
*   基于 Blender 风格的递归网格分割算法。
*   支持拖拽分栏边界实时改变尺寸比例。
*   支持拖拽面板头部标题：
    *   在面板边缘放置时：**网格拼合分割（Merge Split）**。
    *   拖拽至窗口物理边界外时：**独立弹出辅助窗口（Window Popout）**（利用 Electron IPC 新开辟渲染进程窗口）。
    *   在辅助窗口点击“归位”或关闭时：**平滑合并回主格栅窗口**。

### 2. ⌨️ 动作与快捷键反射系统 ([ActionRegistry.ts](file:///Users/apexwave/Desktop/DNOTE/CORE/ActionRegistry.ts))
*   通过 `ActionRegistry` 收集注册的所有动作和快捷键。
*   **动态装配**：插件在 `ComponentRegistry` 注册时，会自动向反射系统注册其支持 of Action、默认快捷键（Shortcut）以及对应的头部工具栏按钮。
*   **多实例隔离**：按快捷键时，系统通过 `focusedAreaId` 智能将动作路由到目前处于 Focus 状态下的那个具体面板实例中，实现多个编辑器实例的独立热键响应。
*   **本地持久化**：用户自定义快捷键会以 JSON 结构序列化并存储至 [dnote_shortcuts.json](file:///Users/apexwave/Desktop/DNOTE/dnote_shortcuts.json)。支持在设置面板中进行物理 3D 键帽交互录制和一键 Reset。

---

## 📂 项目目录结构 (Directory Structure)

```
DNOTE/
├── CORE/                        # 核心中枢系统层 (System Core)
│   ├── main.ts                  # Electron 主进程 (窗口管理、生命周期、安全 Shell 及文件 I/O 桥接)
│   ├── preload.ts               # 渲染层 IPC 隔离安全沙箱桥接器
│   ├── App.tsx                  # 渲染主入口 (渲染网格系统、右侧动作工具栏、键盘监听)
│   ├── Blood.ts                 # 仿生双向血液状态总线 (Blood)
│   ├── BloodChannels.ts         # 统一血液频道命名空间声明 (Blood Channel Spec)
│   ├── ComponentRegistry.ts     # 器官插件自动化加载与依赖校验中心
│   ├── ActionRegistry.ts        # 全局动作与键盘热键注册中心
│   ├── LayoutEngine.tsx         # 网格排版分割及辅助窗口弹出/合并引擎
│   ├── AreaShell.tsx            # 器官面板外观装饰器 (包含焦点的感觉输入转译、拖拽和 actions 绑定)
│   ├── RightSidebar.tsx         # 统一动作工具栏 (右侧边栏)
│   ├── SettingsModal.tsx        # 键盘热键录制弹窗与快捷键个性化设定
│   ├── index.css                # 全局 UI 样式系统 (高级暗黑、毛玻璃、3D 实体键帽)
│   └── index.tsx                # React 挂载入口
│
├── APP/                         # 仿生器官插件层 (Organ Plugins)
│   ├── file-tree/               # 真实目录浏览器 (Lattice Explorer)
│   │   ├── index.ts             # 插件入口与 manifest 依赖定义
│   │   ├── FileTree.tsx         # Explorer UI 主组件 (支持 YAML 标签/正则/脚本解析展示)
│   │   ├── tagResolver.ts       # YAML 标签多轮循环与 Python 脚本计算引擎
│   │   ├── useProjectLifecycle.ts# 项目生命周期工作流控制 (on_project_open / run / close)
│   │   └── actions/             # 新建文件、切换目录动作定义
│   ├── editor/                  # 实例隔离的代码编辑器 (Lattice Editor)
│   │   ├── index.ts             # 插件入口
│   │   ├── Editor.tsx           # 编辑器 UI 主组件 (支持 draft 模式、Yaml 标签显示与删除)
│   │   ├── MarkdownPreview.tsx  # 支持拖拽媒体文件、WikiLink 导航的预览组件
│   │   ├── TagToolbar.tsx       # YAML / Regex / Python 标签交互管理条
│   │   ├── editorUtils.ts       # YAML 标签内容替换工具
│   │   ├── actions/             # 保存、切换编辑模式、删除文档动作定义
│   │   └── hooks/               # useMediaDrop, useLinkNavigator 等逻辑钩子
│   ├── graph-view/              # 拓扑关系力导向图 (Lattice Graph)
│   │   ├── index.ts             # 插件入口
│   │   ├── GraphView.tsx        # 关系图 UI 主组件 (包含 Hill Node 衰减计算与 Palette 颜色管理)
│   │   ├── GraphControls.tsx    # 浮动折叠参数调节面板
│   │   ├── actions/             # 缩放、居中、色板动作定义
│   │   └── services/
│   │       └── lattice.py       # Python 多维度层级极小化（Transitive Reduction）计算脚本
│   ├── link-graph/              # 双链关系图谱 (Obsidian Link Graph)
│   │   ├── index.ts             # 插件入口
│   │   ├── LinkGraphView.tsx    # 2D力导向模拟与关系图谱主渲染组件
│   │   └── actions/             # 缩放、重置视角动作定义
│   ├── terminal/                # 独立分页的 Shell 终端 (Terminal Console)
│   │   ├── index.ts             # 插件入口
│   │   ├── Terminal.tsx         # 终端 UI 主组件 (基于 xterm.js 桥接)
│   │   └── actions/             # 清空终端动作定义
│   ├── settings/                # 首选项控制台 (Settings Panel)
│   │   ├── index.ts             # 插件入口
│   │   └── Settings.tsx         # 快捷键 Reset 和设置显示主组件
│   └── utils.ts                 # 共享的 yaml 标签解析和同步标签计算工具
│
├── dnote_shortcuts.json         # 用户自定义键盘快捷键配置文件
├── package.json                 # 项目依赖与开发/构建脚本
└── tsconfig.json                # TypeScript 编译器配置
```

---

## 🚀 启动与开发 (Get Started)

### 安装依赖
```bash
npm install
```

### 启动本地热重载开发服务器 (Concurrent Electron & Vite)
```bash
npm run dev
```

### 静态类型检查
```bash
npx tsc --noEmit
```

### 生产打包构建
```bash
npm run build
```

---

## 🔌 独立开发与拓展自定义插件 (Organ Plugin Development)

DNOTE 采用了高度松耦合的**器官 (Organ) 插件机制**。任何开发者在本地拉取代码后，均可自由在 `APP/` 下新建或修改插件，无需重新打包：

1. **新建插件文件夹**：
   在 `APP/` 目录下新建一个以插件命名的文件夹，例如 `APP/my-custom-plugin/`。
2. **编写插件入口 (`index.ts`)**：
   创建 `APP/my-custom-plugin/index.ts`，导出满足 DNOTE `AreaComponent` 规范的插件配置：
   ```typescript
   import { MyCustomView } from './MyCustomView';
   import { BC } from '../../CORE/BloodChannels';

   export const MyCustomPlugin = {
     typeId: 'myCustomPlugin',          // 全局唯一标识
     displayName: '我的自定义插件',      // 界面显示名称
     iconName: 'star',                 // 界面图标
     component: MyCustomView,          // UI 视图组件
     bloodChannels: [                  // 订阅的血液状态频道
       BC.system.projectPath
     ],
     manifest: {
       description: '描述你的插件功能...',
       reads: [BC.system.projectPath],
       writes: []
     }
   };
   ```
3. **编写 React 视图组件 (`MyCustomView.tsx`)**：
   直接在文件夹根目录下编写 React 组件：
   ```typescript
   import React from 'react';

   export function MyCustomView({ state, updateBloodKey }: any) {
     const projectPath = state[BC.system.projectPath] || '';
     return (
       <div style={{ padding: '12px', color: 'var(--text-main)' }}>
         <h3>自定义插件面板</h3>
         <p>当前项目：{projectPath}</p>
       </div>
     );
   }
   ```
4. **实时热重载调试**：
   在终端运行 `npm run dev`。Vite 拥有自动发现机制（`import.meta.glob`），它会自动扫描、注册并加载您的新插件。您可以在编辑器右上角的网格布局菜单中选择切换为您刚才新加的 `我的自定义插件`，编写 TSX 时界面会实时热重载更新。

---

## 🧮 核心技术特性 (Core Technical Features)

### 1. 🕸️ 概念格与形式概念分析 (Formal Concept Analysis & Relation Discovery)

DNOTE 内置了**形式概念分析（Formal Concept Analysis, FCA）**引擎。它不仅能展示普通的双向链接，还能从海量笔记中自动挖掘和发现知识概念的层次包含关系：

*   **对象-属性形式背景构建**：将**笔记文档**视为“形式对象”（Objects），将文档中包含的**知识标签**视为“形式属性”（Attributes）。FCA 引擎会实时扫描所有笔记，建立二元关系矩阵。
*   **伽罗瓦连接与概念自动推导**：基于数学上的 Galois Connection，系统自动归纳出“最大共性概念”（即包含相同属性子集的最大对象集合，以及包含相同对象子集的最大属性集合），生成概念格（Concept Lattice）。
*   **层次包含关系自动发现**：通过概念格的拓扑层级结构，系统能自动挖掘出标签之间的蕴含关系（Implications）。例如，若包含 `#机器学习` 的笔记总是包含 `#人工智能`，概念格拓扑图谱中将自动生成指向关系。这无需用户手动建立父子标签，实现了自底向上的知识树演化与层次拓扑发现。

### 2. 🐍 复杂 Python 脚本高级支持与异步血流闭环 (Advanced Python Scripting & Asynchronous Loop)

为了提供极高的自由度与强大的计算能力，DNOTE 深度集成了对复杂 Python 脚本的调用支持：

*   **动态标签计算器 (Dynamic Tag Resolvers)**：支持配置并运行 Python 动态脚本。脚本能接收并扫描当前文档内容，运行复杂的自然语言处理（NLP）或统计学模型，并按照约定的 JSON 标准通过标准输出（stdout）将解析结果返回给 DNOTE 主进程，实现动态标签计算与标签自动填充。
*   **静默后台指令执行 (`commands.json` & Slash Menu)**：定义在 `commands.json` 中的高级指令可以指定运行外部复杂的 Python 脚本（如 `sys_monitor.py` 或双链图谱优化算法 `lattice.py`）。主进程通过异步子进程安全地运行这些脚本，不会阻塞前端 UI 的渲染和输入响应。
*   **基于缓存与血液的事件闭环**：
    1. Python 脚本在后台独立运行，执行大量 CPU 密集型计算。
    2. 计算完成后，脚本将结果静默写入 `.dnote_cache/` 缓存文件夹。
    3. 脚本退出时通过主进程广播血液事件 `events.commandExecuted.{id}`。
    4. 对应面板器官的“抗体”（Antibody）监听到血液信号变化，自动读取对应的缓存文件并刷新 UI。这种设计完全解耦了核心进程，保证了编辑器的丝滑体验。
