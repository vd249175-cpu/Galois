# ⚙️ Preferences（偏好设置插件）

Preferences 是 DNOTE 的**系统配置器官**，提供键盘快捷键的录制与自定义、主题偏好查看等功能。

---

## 🌟 核心功能特性

### 1. ⌨️ 快捷键录制与管理

Settings 面板列出所有通过 `ActionRegistry` 注册的动作，支持完整的快捷键自定义工作流：

- **全量动作列表**：调用 `shortcutAPI.getAllActions()` 获取所有已注册动作（包含所有插件的动作和全局面板动作）
- **搜索过滤**：在搜索框中输入关键字，实时过滤动作列表
- **录制快捷键**：点击任意动作 → 界面进入**等待录制**状态 → 按下目标按键组合 → 自动捕获并显示
- **取消录制**：按 `Escape` 取消当前录制
- **重置默认值**：点击重置按钮恢复该动作的默认快捷键
- **持久化存储**：录制成功后调用 `shortcutAPI.registerShortcut(actionId, combo)` + `electronAPI.setShortcuts()`，写入用户配置

### 2. 🎨 外观设置（预留）

目前显示当前主题信息（"温暖米色 - 已启用"），后续扩展为完整主题切换面板。

### 3. 🖥️ 系统信息（预留）

显示当前工作区路径等系统信息，后续扩展为系统级偏好设置。

---

## 🔗 与 ActionRegistry 的关系

Settings 插件通过 `shortcutAPI` prop（由 `ComponentWrapper` 注入）与 `ActionRegistry` 通信：

```typescript
shortcutAPI = {
  getAllActions():               Action[]       // 获取所有已注册动作
  getShortcutForAction(id):     string | undefined  // 获取当前绑定快捷键
  registerShortcut(id, combo):  void           // 更新快捷键绑定
  removeShortcutForAction(id):  void           // 清除快捷键绑定
  serializeShortcuts():         string         // 序列化为 JSON（用于持久化）
}
```

快捷键格式：全小写 + `+` 连接，修饰键使用 `meta`、`control`、`alt`、`shift`。
例如：`meta+s`、`control+shift+t`、`meta+backspace`。

---

## 🧬 仿生接入规范

```
typeId:     'settings'
reads:      system.focusedAreaId
writes:     system.maxIterations
dependsOn:  []
```

## 📁 目录结构

```
APP/settings/
├── index.ts          # 导出 SettingsComponent + settingsActions（空数组）
├── Settings.tsx      # 主组件（三栏侧边栏 + 快捷键录制 UI）
└── actions/
    └── index.ts      # settingsActions = []（Settings 无自定义动作）
```

## ⚠️ 注意事项

- Settings 插件**没有自定义 OrganAction**（`settingsActions = []`），快捷键录制逻辑完全内嵌在组件 UI 中
- `maxIterations`（标签解析迭代轮数）可通过 Settings 的系统 Tab 修改，写入 `Blood: system.maxIterations`
