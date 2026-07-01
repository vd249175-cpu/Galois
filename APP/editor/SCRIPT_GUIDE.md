# 🐍 Galois 反应式脚本开发手册 (Galois Reactive Script Development Manual)

Galois 采用了一种非侵入式、极简的双向绑定架构。通过在 Markdown 笔记中插入表达式，编辑器会在后台自动调度运行 Python 脚本，捕获其 JSON 输出并更新局部渲染视图。

本手册旨在指导开发者如何在 Galois 工作区中正确创建、配置和调试这些脚本。

---

## 📂 1. 命名与目录规范

所有用于反应式绑定的脚本及其中间数据文件都必须保存在当前项目目录下的 `script/` 文件夹中。

```
<project-root>/
├── script/                     # 脚本与数据存放根目录 (工作目录)
│   ├── *.py                    # 所有的 Python 业务脚本 (命名规范: snake_case)
│   ├── *.json                  # 脚本输出的 JSON 状态文件
│   └── <sub-folder>/           # 可选的子系统目录 (如 movie/ 存放特定分析脚本和结果)
```

### 🏷️ 命名约定
* **Python 脚本**：采用小写字母加下划线命名（例如：`sys_monitor.py`, `build_simulator.py`）。
* **JSON 数据文件**：基本命名与 Python 脚本保持一致（例如：`sys_monitor.py` 对应 `sys_monitor.json`）。

### 🧬 三种数据隔离级别与物理文件命名映射
Galois 在解析 Markdown 表达式时，支持通过 `isolate` 参数定义三种数据隔离模式。**强烈注意：输出文件的物理文件名会由编辑器层动态修改，您的脚本严禁在内部硬编码输出文件名，必须始终通过 `DNOTE_OUTPUT_FILE` 获取目标路径。**

| 隔离级别 (Mode) | 表达式声明示例 | 物理生成的文件名示例 | `DNOTE_THREAD_ID` 值 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **项目级共享（Default）** | `{{ script/sys_monitor.json:cpu \| run="..." }}` | `sys_monitor.json` | `project` | 全局单例的系统监控，所有窗口渲染相同数据。 |
| **窗口级隔离（Window）** | `{{ script/sys_monitor.json:cpu \| run="..." & isolate="window" }}` | `sys_monitor_editor-root.json`<br>（格式：`[name]_[areaId].json`） | 窗口面板ID（如 `editor-root`） | 多窗口分栏时，各分栏独立运行脚本并显示自己窗口的状态。 |
| **单例执行隔离（Execution）** | `{{ script/sys_monitor.json:cpu \| run="..." & isolate="execution" }}` | `sys_monitor_exec_x7y2z9.json`<br>（格式：`[name]_[uniqueId].json`） | 随机运行ID（如 `exec_x7y2z9`） | 强隔离测试，每次挂载均拥有完全独立的数据通道与运行线程。 |

---

## ⚙️ 2. 执行环境与依赖管理 (UV & PEP 723)

Galois 底层使用 **[UV](https://github.com/astral-sh/uv)** 作为默认的 Python 运行时调度器。
`uv` 运行速度极快，且允许我们在**不配置繁琐的 `virtualenv` 或全局安装依赖**的情况下，运行包含第三方库的脚本。

### 📦 声明第三方库依赖 (PEP 723 inline metadata)
如果您的脚本需要使用第三方库（如 `psutil`、`requests`、`numpy`），您无需在终端中运行 `pip install`。只需在 Python 脚本的头部，以标准的 PEP 723 格式声明依赖：

```python
# /// script
# dependencies = [
#   "requests>=2.31.0",
#   "psutil>=5.9.0",
# ]
# ///

import os
import json
import requests
import psutil
```
当 Galois 执行 `uv run <script>.py` 时，`uv` 会自动在临时沙箱中下载并缓存这些依赖。即使在一台全新的电脑上打开该项目，脚本也能开箱即用！

---

## 🌐 3. 环境变量注入

Galois 在调用脚本时，会通过系统 Shell 将上下文信息注入到子进程的**环境变量**中。您的脚本需要读取这些变量来决定数据流向。

| 环境变量名 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `DNOTE_OUTPUT_FILE` | **【核心】** 脚本必须将最终的 JSON 结果写入该绝对路径。 | `/Users/.../template-project/script/sys_monitor.json` |
| `DNOTE_THREAD_ID` | 当前调用该脚本的编辑器实例 ID，用于并发冲突控制。 | `editor-root` 或 dynamic UUID |
| `PATH` | 系统可执行文件搜索路径。Galois 会自动拼接 Homebrew 及用户常用 bin 路径。 | `/opt/homebrew/bin:/usr/local/bin:...` |

### 🛠️ Python 获取环境变量示例
```python
import os

# 读取输出文件的物理绝对路径 (Galois 会自动计算并传过来)
output_path = os.environ.get('DNOTE_OUTPUT_FILE')
# 读取调用线程 ID
thread_id = os.environ.get('DNOTE_THREAD_ID', 'default')

if not output_path:
    raise RuntimeError("无法找到 DNOTE_OUTPUT_FILE 环境变量，请确保脚本在 Galois 的 Markdown 中被触发！")
```

---

## 📝 4. 输出数据规范 (JSON Schema)

脚本输出的数据必须是合法的 JSON 格式。

### 📌 格式准则
1. 必须使用 `utf-8` 编码写入。
2. 顶层可以是一个 JSON 对象（Object）或数组（Array），但为了便于在 Markdown 中用 `key.subkey` 的路径方式寻址，推荐使用**嵌套的 JSON 对象**。
3. 路径支持使用 `.`（点号）进行多级寻址（例如 `cpu.usage` 映射到 `{"cpu": {"usage": "45%"}}`）。

---

## 🚀 5. 快速开发步骤 (Step-by-Step)

### 第一步：创建脚本
在 `script/` 目录下创建一个新的脚本 `network_ping.py`，它利用 `requests` 测量网络延时并查询 IP 地理位置：

```python
# /// script
# dependencies = [
#   "requests",
# ]
# ///

import os
import json
import time
import requests

def main():
    # 1. 取得输出路径
    output_file = os.environ.get('DNOTE_OUTPUT_FILE')
    if not output_file:
        return
        
    # 2. 执行网络测速
    start_time = time.time()
    try:
        response = requests.get("https://api.ipify.org?format=json", timeout=3)
        latency = int((time.time() - start_time) * 1000)
        ip = response.json().get("ip", "Unknown")
        status = "🟢 正常"
    except Exception as e:
        latency = 999
        ip = "连接失败"
        status = "🔴 异常"

    # 3. 构造数据
    data = {
        "status": status,
        "metrics": {
            "ping": f"{latency} ms",
            "my_ip": ip
        },
        "updated_at": time.strftime("%H:%M:%S")
    }

    # 4. 写入文件 (注意: 务必使用 utf-8 且自动创建目录)
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    main()
```

### 第二步：在 Markdown 笔记中声明绑定
在您的笔记（如 `00_StartHere.md`）中，使用 `{{ }}` 语法引入这个脚本和对应的输出 JSON。

```markdown
### 🌐 网络状态监控

* 当前连通性: {{ script/network_ping.json:status | run="network_ping.py" & interval=5 }}
* 延迟反馈: {{ script/network_ping.json:metrics.ping }}
* 公网 IP: {{ script/network_ping.json:metrics.my_ip }} (最后同步: {{ script/network_ping.json:updated_at }})
```

### 💡 核心渲染规则
* **初次绑定定义**：`| run="network_ping.py" & interval=5` 指令表示将 `script/network_ping.json` 数据源的调度交给 `network_ping.py` 脚本，并且每 **5 秒** 执行一次。
* **单次渲染**：如果希望脚本仅在笔记被打开时运行一次，请去掉 `& interval=X` 字段，即 `| run="network_ping.py"`。
* **多处复用**：在同一个 Markdown 文档中，后续凡是读取 `script/network_ping.json` 中其它字段的占位符，**不要**再重复写 `| run=...`，只需简单写数据路径即可（如：`{{ script/network_ping.json:metrics.ping }}`）。

---

## 🐛 6. 调试方法

如果您在编辑器中发现占位符一直显示为加载状态或报错，可以通过以下方式进行调试：

1. **终端直接测试**：
   在命令行中模拟 Electron 的调用方式。进入 `script/` 目录并运行：
   ```bash
   DNOTE_OUTPUT_FILE="test_output.json" uv run network_ping.py
   ```
   检查生成的 `test_output.json` 内容是否符合预期，以及是否有 Python 语法错误。
2. **检查 Galois 控制台日志**：
   在开发模式下，按 `Option + Cmd + I` 打开 Electron DevTools，在 Console 栏目中查看是否有 `[ReactiveExpression] Execution error` 等报错信息。

---

## 📂 7. 项目级全局生命周期脚本 (Workspace Lifecycle Hooks)

除了渲染 Markdown 笔记内嵌入的占位符脚本外，Galois 还支持在笔记项目的**根目录加载/切换/卸载**阶段，执行项目级别的全局脚本钩子。

开发者只需在 `script/` 目录下放置符合特定命名规范的脚本，Galois 的 Lattice Explorer（侧边栏文件管理器）便会在相应阶段自动触发执行：

### 🛠️ 周期钩子列表

| 脚本规范命名 | 运行模式 | 触发时机 | 典型适用场景 |
| :--- | :--- | :--- | :--- |
| **`on_project_open.py`** | **单次阻塞运行** | 打开/切换笔记本目录时（执行完毕后才会触发后续绑定） | 项目全局配置初始化、生成缓存、解析全量数据。 |
| **`on_project_run.py`** | **后台常驻 (Daemon)** | 项目加载完成后（即 `on_project_open.py` 退出后） | 启动持续性监控、启动本地简易 HTTP API 服务器等。 |
| **`on_project_close.py`** | **单次阻塞运行** | 切换到其他项目，或**关闭 Galois 应用窗口**时 | 销毁守护进程、释放端口占用、最终状态落盘、临时数据清理。 |

### 🧬 项目卸载/软件退出防断机制 (Unload Interception)
当用户选择切换项目，或直接退出 Galois 时，主进程的卸载拦截器（Unload Interception）会捕获该事件：
* 拦截器会暂停窗口注销，开始调度 `on_project_close.py`。
* 该脚本会被自动注入 `DNOTE_OUTPUT_FILE` （目标路径为 `script/on_project_close.json`）。
* 主程序会等待该脚本完全执行完毕并落盘，然后才会真正关闭窗口释放系统进程，从而确保您的收尾工作（如优雅杀死 `on_project_run.py` 进程）100% 成功执行。

### 💻 编写建议：常驻守护进程 (Daemon) 与 PID 管理
由于 `on_project_run.py` 是以系统后台进程方式分叉（Fork）运行的，在项目退出时，推荐在 `on_project_close.py` 中编写杀死该进程的代码。

**示例：通过 PID 文件管理常驻后台进程**

1. 在 **`on_project_run.py`** 启动时写入 PID 到文件：
```python
import os
import time

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pid_file = os.path.join(script_dir, "on_project_run.pid")
    
    # 记录当前进程的 PID
    with open(pid_file, "w") as f:
        f.write(str(os.getpid()))
        
    try:
        # 常驻后台守护进程主循环
        while True:
            # 执行某些全局背景扫描任务...
            time.sleep(1)
    finally:
        # 退出时清理 PID 文件
        if os.path.exists(pid_file):
            os.remove(pid_file)

if __name__ == '__main__':
    main()
```

2. 在 **`on_project_close.py`** 中读取 PID 并将其优雅终止：
```python
import os
import signal

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pid_file = os.path.join(script_dir, "on_project_run.pid")
    
    if os.path.exists(pid_file):
        try:
            with open(pid_file, "r") as f:
                pid = int(f.read().strip())
            # 发送 SIGTERM 终止守护进程
            os.kill(pid, signal.SIGTERM)
            print(f"成功终止项目常驻守护进程，PID: {pid}")
        except ProcessLookupError:
            pass # 进程已被终止
        except Exception as e:
            print(f"终止守护进程失败: {e}")
        finally:
            if os.path.exists(pid_file):
                os.remove(pid_file)

if __name__ == '__main__':
    main()
```
