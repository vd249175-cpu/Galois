---
name: dnote-app-plugins
description: Authoring guide for DNOTE APP plugins (organs), covering directory structure, index entry configurations, OrganAction buttons injection, and bionic feedback state loop patterns.
---

# DNOTE APP Organ Plugins Specification (`dnote-app-plugins`)

本文档定义在 DNOTE `APP/` 目录下创建新插件（器官）所需遵循的目录规范、接口配置和执行链路。

---

## 1. 目录结构规范

在 `APP/` 下的任何插件必须严格遵循以下标准布局：

```
APP/[plugin-name]/
├── index.ts                # 统一入口：导出插件对象与 actions 数组
├── [PluginView].tsx        # 主渲染界面组件（直接放在插件根目录，非 components/ 子目录）
├── actions/                # 动作逻辑与按钮声明目录
│   ├── [SaveAction].ts     # 具体动作逻辑与图标 SVG 定义
│   └── index.ts            # 导出所有 actions 列表
├── hooks/                  # 器官专属逻辑与自定义 Hook（可选）
├── services/               # 专属计算服务与数据读取逻辑（可选）
└── plugin.json             # 插件元数据描述（可选，供文档使用）
```

> ⚠️ **注意**：主组件文件（如 `Editor.tsx`、`FileTree.tsx`）直接放在插件根目录，
> **不要**建立额外的 `components/` 子目录。

---

## 2. 插件入口注册 (`index.ts`)

每个插件的 `index.ts` 必须导出一个满足 `AreaComponent` 接口的对象，以及其 actions 数组：

```typescript
import React from 'react';
import { PluginView } from './PluginView';
import { pluginActions } from './actions';
import { BC, BC_PREFIX } from '../../CORE/BloodChannels';

export const MyPlugin = {
  typeId: 'myPlugin',                    // 全局唯一标识（camelCase）
  displayName: '插件显示名称',
  iconName: 'custom-icon',              // 面板 header 图标名
  component: PluginView,
  actions: pluginActions,               // OrganAction 数组

  // bloodChannels 可以是静态数组，也可以是接收 areaId 的函数（用于多实例隔离）
  bloodChannels: (areaId: string) => [
    BC.system.projectPath,
    BC.events.openFile(areaId),          // 实例隔离：每个 area 独立订阅
    BC_PREFIX.fileSavedAll,              // 前缀订阅：订阅所有 fileSaved 事件
  ],

  manifest: {
    description: '描述这个插件的功能...',
    reads: [
      BC.system.projectPath,
      BC_PREFIX.fileSavedAll,
    ],
    writes: [
      BC.events.fileSaved('some/path'),
    ],
    dependsOn: ['fileTree'],             // 依赖其他插件提供数据（如 fileTree 提供 projectPath）
  },
};

export { pluginActions };
```

### 2.1 bloodChannels 前缀订阅

当需要订阅"所有同类"事件时（如任意文件保存），使用 `BC_PREFIX` 中的前缀常量：

```typescript
import { BC_PREFIX } from '../../CORE/BloodChannels';

bloodChannels: (areaId: string) => [
  BC_PREFIX.fileSavedAll,    // 等价于 'events.fileSaved.' — 匹配所有 events.fileSaved.* 键
  BC_PREFIX.scriptJson,      // 等价于 'script_json:' — 匹配所有脚本输出频道
],
```

### 2.2 插件自动发现机制

App.tsx 在启动时通过 Vite 的 `import.meta.glob` 自动扫描所有 `APP/*/index.ts`，
将导出对象中含有 `typeId` 和 `component` 字段的值自动注册到 `ComponentRegistry`：

```typescript
// CORE/App.tsx（无需手动修改）
const modules = import.meta.glob('../APP/*/index.ts', { eager: true });
for (const path in modules) {
  const mod = modules[path] as any;
  for (const key in mod) {
    const exportVal = mod[key];
    if (exportVal && typeof exportVal === 'object' && exportVal.typeId && exportVal.component) {
      ComponentRegistry.register(exportVal);
    }
  }
}
```

---

## 3. 右侧栏自定义动作 (`OrganAction`)

插件中每个可绑定快捷键或右侧栏工具按钮的动作，必须实现 `OrganAction` 接口：

```typescript
import React from 'react';

export interface OrganAction {
  id: string;               // 全局唯一: "[plugin-name].[actionName]"，例如 "editor.save"
  label: string;            // 按钮 tooltip / 动作显示名称
  defaultShortcut?: string; // 默认快捷键，全小写 + "+" 连接（如 "meta+s", "control+l"）
  isToolbar?: boolean;      // true 时自动挂载到右侧栏工具栏（聚焦该面板时显示）
  icon?: React.ReactNode;   // 14×14px 细线条线框 SVG（currentColor，strokeWidth=1.5）
}
```

### 3.1 动作文件示例 (`actions/SaveAction.ts`)

```typescript
import React from 'react';
import type { OrganAction } from '../../../CORE/ComponentRegistry';

export const saveAction: OrganAction = {
  id: 'editor.save',
  label: '保存笔记',
  defaultShortcut: 'meta+s',
  isToolbar: true,
  icon: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2h8l2 2v8H2V2z" />
      <rect x="4" y="8" width="6" height="4" />
      <rect x="4" y="2" width="5" height="3" />
    </svg>
  ),
};
```

### 3.2 actions 入口文件 (`actions/index.ts`)

```typescript
import { saveAction } from './SaveAction';
import { deleteAction } from './DeleteAction';
import { toggleModeAction } from './ToggleModeAction';

export const myPluginActions = [saveAction, deleteAction, toggleModeAction];
```

---

## 4. 仿生双向反射链路（抗体捕获）

插件**不直接与其他组件通信**，只通过 Blood 状态总线接收信号。

### 4.1 完整链路

```
用户操作（点击按钮 / 按快捷键）
  └──> ActionRegistry.runAction(actionId, context)
       └──> ComponentRegistry 内部 run 函数执行
            └──> Blood.updateKey('actions.editor.save.{areaId}', Date.now())
                 └──> ComponentWrapper 订阅 actions.* 变化
                      └──> 提取 lastAction = { id: 'editor.save', timestamp }
                           └──> 注入到 <PluginView lastAction={lastAction} />
                                └──> useEffect([lastAction]) 捕获并执行逻辑
```

> ⚠️ **动作信号必须使用 `Date.now()` 时间戳**，不要用 `true`。
> 原因：同一个按钮连续点击时 boolean 值相同无法区分，timestamp 每次都不同。
>
> Action key 格式：`actions.{actionId}.{areaId}`
> 例如：`actions.editor.save.editor-root`

### 4.2 抗体捕获模式（`[PluginView].tsx`）

```typescript
import React, { useEffect } from 'react';

interface PluginViewProps {
  areaId: string;
  state: Record<string, any>;
  lastAction: { id: string; timestamp: number } | null;
  updateBloodKey: (key: string, value: any) => void;
  shortcutAPI: { /* ... */ };
}

export function PluginView({ areaId, state, lastAction }: PluginViewProps) {

  // 1. 读取 Blood 状态（通过 state prop，ComponentWrapper 已注入）
  const projectPath = state['system.projectPath'] as string | undefined;

  // 2. 捕获动作信号（标准抗体捕获模式）
  useEffect(() => {
    if (!lastAction) return;
    switch (lastAction.id) {
      case 'myPlugin.save':
        handleSave();
        break;
      case 'myPlugin.clear':
        handleClear();
        break;
    }
  }, [lastAction]);

  const handleSave = () => { /* ... */ };
  const handleClear = () => { /* ... */ };
}
```

### 4.3 直接订阅 Blood 频道（`useBloodChannel`）

对于动态 areaId 等运行时才确定的频道，可以在组件内直接使用 `useBloodChannel`：

```typescript
import { useBloodChannel, Blood } from '../../CORE/Blood';
import { BC } from '../../CORE/BloodChannels';

// 监听某个特定 editor 的光标位置（areaId 在运行时确定）
const editorCursor = useBloodChannel(
  [`system.editorCursor.${lastFocusedEditorId}`],
  () => Blood.getValue(`system.editorCursor.${lastFocusedEditorId}`, null)
);
```

---

## 5. Blood 频道命名规范（Blood Channel Namespace）

所有 Blood key 必须属于以下四个命名空间之一，**禁止**使用 `project.*`、`debug.*` 等自定义前缀：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `system.*` | 焦点、窗口、区域、运行时状态 | `system.focusedAreaId`、`system.projectPath` |
| `layout.*` | 面板拆分、关闭、弹出、合并 | `layout.splitArea.{id}`、`layout.removeArea.{id}` |
| `actions.*` | 用户输入转译后的动作信号（timestamp） | `actions.editor.save.{areaId}` = `Date.now()` |
| `events.*` | 文件保存、打开文件、脚本完成等业务事件 | `events.fileSaved.{path}`、`events.openFile.{areaId}` |

所有标准频道常量均在 `CORE/BloodChannels.ts` 的 `BC` 对象中声明。**禁止**在组件内部硬编码频道字符串，必须通过 `BC.*` 引用。

---

## 6. 已注册插件一览（typeId 速查）

| `typeId` | displayName | 主要功能 |
|----------|-------------|---------|
| `editor` | 文本编辑器 | Markdown 编辑、预览、YAML 标签、WikiLink |
| `fileTree` | 文本浏览器 | 文件树、标签搜索、模板系统、项目生命周期 |
| `graphView` | 标签拓扑图 | 力导向 DAG、FCA 虚拟节点、色组管理 |
| `linkGraph` | 双链关系图谱 | Obsidian 风格双链图谱，动态展示笔记文件之间的引用链接结构 |
| `terminal` | 终端控制台 | xterm.js PTY、多标签、自动 agy 会话 |
| `settings` | 偏好设置 | 快捷键录制、外观配置 |
| `agent` | Antigravity 助手 | AI 聊天、编辑器上下文感知 |
