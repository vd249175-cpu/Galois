# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psutil",
# ]
# ///
import os
import json
import time
import psutil

def main():
    output_file = os.environ.get('DNOTE_OUTPUT_FILE')
    if not output_file:
        print("Error: DNOTE_OUTPUT_FILE environment variable not set.")
        return
    
    # Measure CPU and memory usage
    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory().percent
    
    data = {
        "status": "🟢 运行中",
        "cpu": f"{cpu}%",
        "memory": f"{mem}%",
        "timestamp": time.strftime("%H:%M:%S")
    }
    
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print(json.dumps(data, ensure_ascii=False))

if __name__ == '__main__':
    main()
