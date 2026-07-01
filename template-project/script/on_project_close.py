import os
import json
import time
import signal

print("[Lifecycle] Galois project closed.")
project_path = os.environ.get('DNOTE_PROJECT_PATH', '.')
cache_dir = os.path.join(project_path, '.dnote_cache')
os.makedirs(cache_dir, exist_ok=True)

# Write lifecycle close log
log_path = os.path.join(cache_dir, 'lifecycle.json')
with open(log_path, 'w', encoding='utf-8') as f:
    json.dump({"event": "close", "timestamp": int(time.time())}, f, indent=2)

# Find and terminate background daemon (on_project_run.py)
script_dir = os.path.join(project_path, 'script')
pid_file = os.path.join(script_dir, "on_project_run.pid")
if os.path.exists(pid_file):
    try:
        with open(pid_file, "r") as f:
            pid = int(f.read().strip())
        print(f"[Lifecycle] Attempting to terminate background daemon PID: {pid}")
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        print("[Lifecycle] Daemon process already terminated.")
    except Exception as e:
        print(f"[Lifecycle] Failed to terminate daemon: {e}")
    finally:
        if os.path.exists(pid_file):
            try:
                os.remove(pid_file)
            except OSError:
                pass

