import os
import json
import time
import signal
import sys

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    pid_file = os.path.join(script_dir, "on_project_run.pid")
    
    # Record PID
    with open(pid_file, "w") as f:
        f.write(str(os.getpid()))
        
    print(f"[Daemon] Galois background daemon started. PID: {os.getpid()}")
    
    # Establish output path
    output_file = os.environ.get('DNOTE_OUTPUT_FILE')
    if not output_file:
        output_file = os.path.join(script_dir, "on_project_run.json")
        
    runtime_file = os.path.join(project_dir, ".dnote_runtime.json")
    
    start_time = time.time()
    last_timestamp = 0
    
    # Set up graceful termination
    running = True
    def handle_sigterm(signum, frame):
        nonlocal running
        running = False
        
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)
    
    # Initial state for typing feedback
    live_typing_data = {
        "active_file_name": "等待编辑...",
        "current_line_num": 0,
        "current_line_length": 0,
        "selected_char_count": 0,
        "todo_status": "🟢 无挂起任务"
    }
    
    try:
        while running:
            uptime = int(time.time() - start_time)
            
            # Check .dnote_runtime.json for active coordinates
            if os.path.exists(runtime_file):
                try:
                    with open(runtime_file, "r", encoding="utf-8") as rf:
                        runtime_data = json.load(rf)
                    
                    current_ts = runtime_data.get("timestamp", 0)
                    if current_ts != last_timestamp:
                        last_timestamp = current_ts
                        
                        # User typed or moved cursor: process coordinates!
                        active_file = runtime_data.get("activeFile")
                        cursor = runtime_data.get("cursor", {})
                        line_num = cursor.get("line", 0)  # 0-indexed
                        selected_text = cursor.get("selectedText", "")
                        
                        file_name = os.path.basename(active_file) if active_file else "无"
                        line_length = 0
                        todo_status = "🟢 本行无待办事项"
                        
                        # Read active file to inspect the current line
                        if active_file and os.path.exists(active_file):
                            with open(active_file, "r", encoding="utf-8") as af:
                                lines = af.readlines()
                            if 0 <= line_num < len(lines):
                                current_line = lines[line_num]
                                line_length = len(current_line.rstrip('\r\n'))
                                if "- [ ]" in current_line or "TODO" in current_line:
                                    todo_status = "⚠️ 检测到本行有待办任务！"
                        
                        live_typing_data = {
                            "active_file_name": file_name,
                            "current_line_num": line_num + 1,  # Translate to 1-indexed for display
                            "current_line_length": line_length,
                            "selected_char_count": len(selected_text),
                            "todo_status": todo_status
                        }
                except Exception:
                    # Occasional file read collision during typing is ignored
                    pass
            
            # Write updated status report
            data = {
                "status": "🟢 守护进程监测中",
                "pid": os.getpid(),
                "uptime": f"{uptime} 秒",
                "last_active": time.strftime("%H:%M:%S"),
                "live_typing": live_typing_data
            }
            
            os.makedirs(os.path.dirname(output_file), exist_ok=True)
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
            # Response sleep (100ms for responsive keystroke detection)
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
            "last_active": time.strftime("%H:%M:%S"),
            "live_typing": {
                "active_file_name": "已离线",
                "current_line_num": 0,
                "current_line_length": 0,
                "selected_char_count": 0,
                "todo_status": "🔴 守护进程已停止"
            }
        }
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(offline_data, f, indent=2, ensure_ascii=False)
        print("[Daemon] Galois background daemon stopped.")

if __name__ == '__main__':
    main()
