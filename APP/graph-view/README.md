# 🕸️ Lattice Graph（标签拓扑图插件）

Lattice Graph 是 Galois 的**可视化拓扑器官**，将笔记项目中所有文件的标签关系渲染为一张实时交互的力导向有向无环图（DAG）。节点间的边代表标签集合的**子集包含关系**，图谱在每次文件保存后自动更新。

---

## 🌟 核心功能特性

### 1. 🧮 Python 驱动的晶格计算（lattice.py）
标签关系由 `graph-view/services/lattice.py` 计算，通过 `electronAPI.runScript` 调用：

**核心算法**：
- 构建标签词汇表，将每个文件的标签集合编码为整数 bitmask，避免 dense N×N 矩阵爆内存
- 真实笔记标签永远参与计算，但可见虚概念节点会按 support 等价类做闭包合并：同一批笔记所指完全相同的标签组合只显示一个最小概念节点
- 虚概念通过单标签候选 + 两两交集生成候选，并按 support、标签数量和桥接价值评分
- 通过 `virtualDetail`（0–1）连续控制虚概念保留数量：0 为无虚概念硬边界，其余低粒度只保留少数高价值合并概念，高粒度逐步展开完整概念格
- 滑杆计算采用最新请求生效规则；旧档位的异步结果不得覆盖新档位，回到 0 时会先同步清除已有虚节点
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
- 悬浮或聚焦节点：保留一层直接上游作为语境，并沿有向边显示全部下游节点和边，贯穿到最底层叶子节点
- 有边节点和边根据 DAG **层级深度**自动着色
- 单击真实节点：通过 `Blood: events.openFile.{lastFocusedEditorId}` 在编辑器中打开对应笔记，不修改左侧文件搜索
- 单击虚拟节点：在项目根目录创建 `概念-*.md` 临时笔记，写入概念标签和关联笔记，并在编辑器打开
- 临时概念笔记实际修改并保存后转为正式笔记；只打开未修改时，在离开、切换节点/项目或图谱卸载时自动删除
- 单击画布空白：清除节点焦点、关闭详情抽屉并结算未编辑的临时概念笔记

### 4. 🖱️ 交互操作

| 操作 | 效果 |
|------|------|
| 拖拽空白区域 | 平移视图（Pan） |
| 鼠标滚轮 | 缩放到光标位置（范围 0.2×–3.0×） |
| 拖拽节点 | 固定该节点位置，物理模拟继续 |
| 单击真实节点 | 在最后聚焦的编辑器中打开对应笔记 |
| 单击虚拟节点 | 创建并打开可编辑的临时概念 Markdown |
| 编辑并保存临时概念 | 移除临时标记并永久保留笔记 |
| 离开未编辑的临时概念 | 删除临时文件并刷新文件树/图谱 |
| 单击画布空白 | 取消图谱焦点并清理未编辑临时笔记；画布拖拽不触发失焦 |
| 悬浮/聚焦节点 | 高亮完整下游路径到最底层，而非只显示一跳邻居 |

### 5. 🎮 控制面板（GraphControls）
右下角悬浮控制面板（默认折叠，点击展开）：

- **排斥力滑块**：调整节点间斥力强度
- **箭头尺寸滑块**：调整边箭头大小
- **节点间距滑块**：调整布局疏密
- **概念粒度滑块**：连续控制虚概念密度；0% 只显示真实节点，其余档位按闭包合并和评分筛选
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
reads:      system.projectPath, system.resolvedTags, system.fileSearchQuery, events.fileSaved.*, system.lastFocusedEditorId
writes:     events.openFile.{editorId}, events.fileSaved.*, events.scriptError.graphView
dependsOn:  ['fileTree']  （依赖 fileTree 提供 resolvedTags）
```

`system.fileSearchQuery` 只用于文件树搜索对图谱的单向高亮；图谱节点点击不写回该频道。
临时概念笔记始终位于项目根目录，因此与普通笔记走同一套编辑、保存、标签解析和图谱刷新逻辑。

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
