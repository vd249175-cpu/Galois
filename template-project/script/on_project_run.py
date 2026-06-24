import os
import json
import time
import signal
import sys

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pid_file = os.path.join(script_dir, "on_project_run.pid")
    
    # Record PID
    with open(pid_file, "w") as f:
        f.write(str(os.getpid()))
        
    print(f"[Daemon] DNOTE background daemon started. PID: {os.getpid()}")
    
    # Establish output path
    output_file = os.environ.get('DNOTE_OUTPUT_FILE')
    if not output_file:
        output_file = os.path.join(script_dir, "on_project_run.json")
        
    start_time = time.time()
    
    # Set up graceful termination
    running = True
    def handle_sigterm(signum, frame):
        nonlocal running
        running = False
        
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)
    
    try:
        while running:
            uptime = int(time.time() - start_time)
            data = {
                "status": "🟢 守护进程正常运行中",
                "pid": os.getpid(),
                "uptime": f"{uptime} 秒",
                "last_active": time.strftime("%H:%M:%S")
            }
            
            os.makedirs(os.path.dirname(output_file), exist_ok=True)
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
            # Sleep responsive to SIGTERM
            for _ in range(20):
                if not running:
                    break
                time.sleep(0.1)
    finally:
        # Clean up
        if os.path.exists(pid_file):
            try:
                os.remove(pid_file)
            except OSError:
                pass
        # Write offline status
        offline_data = {
            "status": "🔴 守护进程已停止",
            "pid": 0,
            "uptime": "0 秒",
            "last_active": time.strftime("%H:%M:%S")
        }
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(offline_data, f, indent=2, ensure_ascii=False)
        print("[Daemon] DNOTE background daemon stopped.")

if __name__ == '__main__':
    main()
