---
tags:
  - Analytics
  - Meta
---
# DNOTE Workspace Analytics

This is an automated, real-time dashboard analyzing your current Tag Lattice notes. Modify any file, add a tag, or create a new note to watch this page update dynamically.

### 📊 Workspace Statistics (Refreshes every 3 seconds)
- **Total Notes**: {{ notes_stats.json:stats.total_notes | run="notes_analyzer.py" & interval=3 }}
- **Unique Tags**: {{ notes_stats.json:stats.total_tags }}
- **Disk Usage (Markdown)**: {{ notes_stats.json:stats.total_size_kb }}
- **Most Popular Tag**: `{{ notes_stats.json:stats.top_tag }}` (used {{ notes_stats.json:stats.top_tag_count }} times)

---

### ⏱️ Diagnostics Info
- **Script Last Executed**: {{ notes_stats.json:stats.last_run_time }}
- **Execution Thread Scope**: `{{ notes_stats.json:stats.thread_id }}`

---

### 📂 Recently Modified Notes
1. **{{ notes_stats.json:recent_0_name }}** 
   - *Last Updated*: {{ notes_stats.json:recent_0_time }}
2. **{{ notes_stats.json:recent_1_name }}** 
   - *Last Updated*: {{ notes_stats.json:recent_1_time }}
3. **{{ notes_stats.json:recent_2_name }}** 
   - *Last Updated*: {{ notes_stats.json:recent_2_time }}

---
*Tip: Change to Edit Mode (`Cmd+E`), write a new tag in the frontmatter of any file in this project, and switch back to Preview Mode to see the popular tag count or recently modified notes react immediately.*
