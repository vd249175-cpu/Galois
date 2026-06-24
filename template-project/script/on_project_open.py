import os
import json
import time

print("[Lifecycle] DNOTE project opened successfully.")
# Create a cache directory and log the event
project_path = os.environ.get('DNOTE_PROJECT_PATH', '.')
cache_dir = os.path.join(project_path, '.dnote_cache')
os.makedirs(cache_dir, exist_ok=True)

log_path = os.path.join(cache_dir, 'lifecycle.json')
with open(log_path, 'w', encoding='utf-8') as f:
    json.dump({"event": "open", "timestamp": int(time.time())}, f, indent=2)
