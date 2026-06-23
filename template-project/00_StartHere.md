# Welcome to DNOTE Template Project!

This template project showcases **Reactive Document Automation** inside DNOTE. Document contents are driven by backend scripts with visual front-end updates, adhering to the pure decoupled, state-driven architecture.

## 🚀 Automation Pages to Explore

In the file tree, you can select and open the following files:

### 1. [Workspace Notes Analytics](file:///Users/apexwave/Desktop/DNOTE/template-project/NotesAnalytics.md)
* **Script**: `script/notes_analyzer.py`
* **Refreshes**: Every 3 seconds.
* **What to observe**: Displays the total count of markdown notes, unique tags, disk usage, and the list of recently modified files. 
* **How to test**: Toggle to Edit Mode (`Cmd+E`), add a new file, change a file name, or edit the `tags` metadata of any note (e.g. `狗.md`). Switch back to Preview Mode and watch the stats update!

### 2. [CI/CD Build Simulator](file:///Users/apexwave/Desktop/DNOTE/template-project/BuildSimulator.md)
* **Script**: `script/build_simulator.py`
* **Refreshes**: Every 2 seconds.
* **What to observe**: Displays a live-updating ASCII loading/progress bar and compiler logs (`0%` to `100%`) showing a simulated bundle-building process.

### 3. [macOS System Dashboard](file:///Users/apexwave/Desktop/DNOTE/template-project/SystemDashboard.md)
* **Script**: `script/sys_monitor.py`
* **Refreshes**: Every 3 seconds.
* **What to observe**: Displays real-time macOS CPU utilization, memory allocation, and disk space.

---

## 🛠️ Sandbox & Isolation Modes

DNOTE supports three levels of scripting isolation:
* **Project Level** (`isolate="project"`): The script output is shared globally across the project.
* **Window Level** (`isolate="window"`): The script state is isolated to this specific window.
* **Execution Level** (`isolate="execution"`): The script output is private to this exact rendering instance (ideal for independent widgets).

Feel free to open multiple secondary windows (use the layout buttons or shortcut `Cmd+Shift+N` on a component) to see how isolation handles different execution scopes!
