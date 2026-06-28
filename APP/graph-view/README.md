# 🕸️ Lattice Graph（标签拓扑图插件）

Lattice Graph 是 DNOTE 的**可视化拓扑器官**，将笔记项目中所有文件的标签关系渲染为一张实时交互的力导向有向无环图（DAG）。节点间的边代表标签集合的**子集包含关系**，图谱在每次文件保存后自动更新。

---

## 🌟 核心功能特性

### 1. 🧮 Python 驱动的晶格计算（lattice.py）
标签关系由 `graph-view/services/lattice.py` 计算，通过 `electronAPI.runScript` 调用：

**核心算法**：
- 构建标签词汇表，将每个文件的标签集合编码为整数 bitmask，避免 dense N×N 矩阵爆内存
- 真实笔记标签永远参与计算，但可见虚概念节点会按 support 等价类做闭包合并：同一批笔记所指完全相同的标签组合只显示一个最小概念节点
- 虚概念通过单标签候选 + 两两交集生成候选，并按 support、标签数量和桥接价值评分
- 通过 `virtualDetail`（0–1）连续控制虚概念保留数量：低粒度只保留少数高价值合并概念，高粒度逐步展开完整概念格
- 使用候选池上限、pair 检查上限和 `maxVirtualNodes` 保护大项目，避免虚节点计算爆炸
- 子集包含边通过 bitmask 直接计算最短 Hasse 边，减少不必要的传递边

### 2. 🌐 力导向物理模拟
图谱使用自定义 `requestAnimationFrame` 物理引擎（非 D3.js）：

| 力参数 | 说明 | 可调范围 |
|--------|------|---------|
| 排斥力（Repulsion） | 节点间斥力，防止重叠 | 500 – 5000 |
| 弹力（Spring） | 有边节点间的吸引弹力 | 随节点间距动态计算 |
| 层级径向力 | DAG 层级节点拉向对应半径圆环 | 随 spacing 参数 |
| 重力（Centering） | 对原点的弱引力（0.005） | 固定 |
| Alpha 冷却 | 模拟衰减至 < 0.015 时停止计算 | 固定（0.97/tick） |

### 3. 🔵 节点类型与渲染

| 节点类型 | 形态 | 半径/尺寸 |
|----------|------|----------|
| 真实节点（real） | 圆形，标签在下方 | `6 + 10 * (degree / (degree+3))`（度数越高越大） |
| FCA 虚拟节点（virtual） | 圆角矩形药丸，标签在内部 | 宽高按度数比例缩放 |

- 鼠标悬停节点：显示**光晕高亮环**，其余无关节点和边**降低透明度**
- 有边节点和边根据 DAG **层级深度**自动着色
- 双击节点：通过 `Blood: events.openFile.{lastFocusedEditorId}` 在编辑器中打开对应笔记

### 4. 🖱️ 交互操作

| 操作 | 效果 |
|------|------|
| 拖拽空白区域 | 平移视图（Pan） |
| 鼠标滚轮 | 缩放到光标位置（范围 0.2×–3.0×） |
| 拖拽节点 | 固定该节点位置，物理模拟继续 |
| 双击节点 | 在编辑器中打开对应笔记 |

### 5. 🎮 控制面板（GraphControls）
右下角悬浮控制面板（默认折叠，点击展开）：

- **排斥力滑块**：调整节点间斥力强度
- **箭头尺寸滑块**：调整边箭头大小
- **节点间距滑块**：调整布局疏密
- **概念粒度滑块**：连续控制虚概念密度；真实标签参与计算，显示节点按闭包合并和评分筛选
- **层级拆解模式开关**：开启/关闭 FCA 虚拟节点模式

### 6. 🎨 色组管理器（Palette Manager）
内置 4 种预设配色方案（Tahoe、Sunset、Nordic、Mono）+ 完整 CRUD 编辑器：

- 新建调色板、添加/编辑/删除颜色
- 选择调色板后实时更新图谱边和节点的颜色层级
- 通过 `graphView.openPaletteManager` 动作唤起管理器弹窗

---

## 🧬 仿生接入规范

```
typeId:     'graphView'
reads:      system.projectPath, system.resolvedTags, events.fileSaved.*, system.lastFocusedEditorId
writes:     events.openFile.{editorId}, events.scriptError.graphView
dependsOn:  ['fileTree']  （依赖 fileTree 提供 resolvedTags）
```

## ⚡ 右侧栏动作

| 动作 ID | 默认快捷键 | 说明 |
|---------|-----------|------|
| `graphView.zoomIn` | — | 放大 15% |
| `graphView.zoomOut` | — | 缩小 15% |
| `graphView.recenter` | — | 居中并重置视图 |
| `graphView.openPaletteManager` | — | 打开色组管理器 |

## 📁 目录结构

```
APP/graph-view/
├── index.ts                          # 导出 GraphViewComponent + graphViewActions
├── GraphView.tsx                     # 主组件（物理模拟 + 渲染 + 交互）
├── GraphControls.tsx                 # 悬浮控制面板
├── actions/
│   ├── ZoomInAction.ts
│   ├── ZoomOutAction.ts
│   ├── RecenterAction.ts
│   ├── OpenPaletteManagerAction.ts
│   └── index.ts
└── services/
    └── lattice.py                    # Python：子集矩阵 + FCA 虚拟节点计算
```
