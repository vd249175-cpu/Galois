---
tags:
  - Automation
  - CI-CD
---
# CI/CD Bundle Builder Simulator

This note acts as a mock continuous integration panel. It runs a Python compilation script in the background to build the DNOTE distribution bundle.

### 🔨 Live Build Status (Compiling every 2 seconds)
- **Progress Bar**: {{ build_status.json:build.progress_bar | run="build_simulator.py" & interval=2 }}
- **Status**: `{{ build_status.json:build.status }}`
- **Last Compiler Log**: 
  > `{{ build_status.json:build.log }}`

---

### 🔍 Runtime Details
- **Simulator Updated At**: {{ build_status.json:build.last_updated }}
- **Sandbox Environment ID**: `{{ build_status.json:build.thread_id }}`

---
*Notice: The progress resets back to 0% once it hits 100% so you can watch the simulation cycle continuously.*
