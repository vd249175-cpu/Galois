---
name: dnote-command-scripts
description: Covenants and guidelines for authoring DNOTE project custom commands (commands.json), environment variables, JSON output protocols, and project lifecycle python scripts.
---

# DNOTE Project Commands & Shortcut Scripts (`dnote-command-scripts`)

本文档定义 DNOTE 笔记项目中自定义指令的声明方式、脚本执行协议、环境变量契约，以及项目生命周期钩子的编写规范。

---

## 1. 项目指令配置 (`command/commands.json`)

每个笔记项目可以在 `command/commands.json` 中注册自定义动作，并在其中指定要执行的脚本（静默运行于后台，隐藏在斜线菜单外，支持全局快捷键）或要在编辑器中插入的自定义文本片段（显示在斜线 `/` 菜单中）：

```json
{
  "commands": [
    {
      "id": "project.runStats",
      "label": "统计项目字数",
      "shortcut": "meta+shift+t",
      "script": "uv run script/note_stats.py"
    },
    {
      "id": "project.sysMonitorWidget",
      "label": "插入系统实时监控小部件",
      "desc": "在当前位置插入动态测量CPU和内存占用的反应式组件",
      "content": "⚡ 系统监控：{{script/sys_monitor.json:status | run=\"sys_monitor.py\" & interval=3}}"
    }
  ]
}
```

### 1.1 指令类型与斜线菜单过滤规则

为了保证编辑器斜线菜单的纯净度，DNOTE 将指令的运行分流如下：

| 指令配置字段 | 指令类型 | 斜线菜单 `/` 状态 | 触发行为 |
| :--- | :--- | :--- | :--- |
| **`script`**（配置脚本命令） | 外部静默执行脚本 | 🚫 **隐藏过滤** | 不在文档中插入任何文本。按下快捷键后静默通过 `execCommand` 执行脚本，结果输出至 `.dnote_cache/{id}.json`，状态显示在状态栏或弹出提示框。 |
| **`content`**（配置插入片段） | 占位符文本插值命令 | 🟢 **显示在菜单** | 选中后在光标处插入 `"content"` 中的文本片段（如 `{{ ... }}` 占位符）。随后触发编辑器的反应式组件解析执行。 |

### 1.2 快捷键有效作用域 (`"scope"`) 配置

为了避免页面间快捷键冲突，并提供更灵活的交互控制，DNOTE 支持通过 `"scope"` 字段配置项目指令的快捷键作用域：

* **`"scope": "global"`** (或 `"all"`, `true`)：**全局快捷键**。不论用户聚焦在文件树、图形视图、还是编辑器，甚至在页面无任何元素聚焦时，该快捷键均可被触发执行。
* **`"scope": "editor"`**：**编辑器局域快捷键**。只有当光标聚焦在编辑器内时，该快捷键才会被触发。
* **`"scope": "fileTree"` / `"graphView"` 等**：**特定页面局域快捷键**。只有当聚焦在对应的组件页面/视图上时，该快捷键才生效。
* **默认解析规则**：
  * 若指令配置了 `"script"` 且未声明 `"scope"`，默认其 `scope` 为 `"global"`。
  * 若指令配置了 `"content"` 且未声明 `"scope"`，默认其 `scope` 为 `"editor"`。

---

---

## 2. 标准环境变量

通过 DNOTE 执行的所有脚本（项目指令、生命周期钩子）均会注入以下环境变量：

| 变量名 | 说明 |
|--------|------|
| `DNOTE_PROJECT_PATH` | 当前笔记项目的根目录绝对路径 |
| `DNOTE_ACTIVE_FILE` | 当前编辑器聚焦的笔记文件绝对路径 |
| `DNOTE_OUTPUT_FILE` | 脚本必须将 JSON 结果写入的目标路径（通常为 `.dnote_cache/{command_id}.json`） |
| `DNOTE_CURSOR_LINE` | 光标当前所在行号（0 indexed） |
| `DNOTE_CURSOR_COL` | 光标当前所在列号（0 indexed） |
| `DNOTE_SELECTED_TEXT` | 编辑器中当前被选中的文本片段 |
| `DNOTE_THREAD_ID` | 脚本执行实例 ID（用于生命周期钩子的 "project_lifecycle" 标识） |

> **生命周期钩子** 会额外注入 `DNOTE_THREAD_ID="project_lifecycle"`，
> 用于在多次执行时区分同一类别钩子的不同实例。

---

## 3. 标准 JSON 输出协议

所有项目指令脚本**必须**将执行结果以 JSON 格式写入 `DNOTE_OUTPUT_FILE` 路径，
DNOTE 编辑器在脚本执行完毕后会自动读取该文件并显示结果摘要：

```python
# /// script
# requires-python = ">=3.11"
# ///
import os
import json
import time

project_path = os.environ.get('DNOTE_PROJECT_PATH', '.')
output_file  = os.environ.get('DNOTE_OUTPUT_FILE', 'output.json')

# ... 执行逻辑 ...

result = {
    "status":    "success",         # "success" | "error"
    "message":   "计算完成",         # 展示给用户的摘要文本
    "data": {                        # 任意 JSON 可序列化结构
        "file_count":   42,
        "total_chars":  18600,
    },
    "timestamp": int(time.time()),
}

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"[Done] {result['message']}")
```

### 3.1 输出文件路径规则

`DNOTE_OUTPUT_FILE` 的值由 Editor 组件在调用指令时自动计算，格式为：

```
{projectPath}/.dnote_cache/{command_id}.json
```

例如 `command.id` 为 `project.runStats` 时：
```
/Users/xxx/my-notes/.dnote_cache/project.runStats.json
```

---

## 4. 生命周期钩子脚本

DNOTE 在项目目录打开/切换/关闭时会自动触发对应的钩子脚本（如果存在）。
脚本统一放置在笔记项目的 `script/` 目录下：

| 脚本文件 | 触发时机 | 常见用途 |
|----------|----------|---------|
| `script/on_project_open.py` | 项目加载时**同步**运行（阻塞） | 初始化缓存目录、写入 lifecycle 日志 |
| `script/on_project_run.py` | `on_project_open.py` 完成后以**后台守护进程**方式运行 | 启动长期索引进程、云同步监听器 |
| `script/on_project_close.py` | 切换工作区或窗口关闭前运行 | 提交缓存、终止后台进程、释放文件锁 |

### 4.1 示例：on_project_open.py

```python
import os, json, time

project_path = os.environ.get('DNOTE_PROJECT_PATH', '.')
cache_dir    = os.path.join(project_path, '.dnote_cache')
os.makedirs(cache_dir, exist_ok=True)

log_path = os.path.join(cache_dir, 'lifecycle.json')
with open(log_path, 'w', encoding='utf-8') as f:
    json.dump({"event": "open", "timestamp": int(time.time())}, f, indent=2)

print("[Lifecycle] Project opened successfully.")
```

### 4.2 执行链路（useProjectLifecycle hook）

```
项目路径变更（projectPath Blood 更新）
  └──> useProjectLifecycle hook 检测到变化
       ├──> (旧项目) 同步执行 on_project_close.py
       ├──> 同步执行 on_project_open.py（阻塞等待完成）
       └──> 后台执行 on_project_run.py &（守护进程，不阻塞 UI）

窗口 beforeunload 事件
  └──> 阻止关闭 → 同步执行 on_project_close.py → 再触发 window.close()
```

---

## 5. uv 依赖管理

DNOTE 使用 `uv` 运行所有 Python 脚本，支持 PEP 723 内联元数据声明依赖，
无需配置独立 virtualenv，即拷即用：

```python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "numpy>=1.26",
#   "requests>=2.31",
# ]
# ///
import numpy as np
# 脚本正常运行，uv 自动安装 numpy
```

执行方式：
```bash
uv run script/my_script.py
```
