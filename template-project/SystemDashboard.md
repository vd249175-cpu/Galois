---
tags:
  - System
  - Monitor
---
# macOS System Dashboard

Welcome to the live reactive system diagnostics dashboard.

### Core Metrics (Running dynamically on a 3-second loop)
- **CPU Load**: {{ sys_monitor.json:system.cpu | run="sys_monitor.py" & interval=3 }}
- **RAM Usage**: {{ sys_monitor.json:system.ram }}
- **Disk Space**: {{ sys_monitor.json:system.disk }}
- **System Uptime**: {{ sys_monitor.json:system.uptime }}

---
### Runtime Metadata
- **Last Updated Time**: {{ sys_monitor.json:system.last_updated }}
- **Active Thread Scope**: {{ sys_monitor.json:system.thread_id }}
