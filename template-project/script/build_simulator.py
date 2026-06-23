import os
import json
import time

def main():
    output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'build_status.json')
    thread_id = os.environ.get('DNOTE_THREAD_ID', 'project')
    
    # Try to read the previous state to increment it
    progress = 0
    status = "Queued"
    log = "Build triggered."
    
    if os.path.exists(output_file):
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
                old_progress = old_data.get("build", {}).get("progress", 0)
                if old_progress < 100:
                    progress = old_progress + 20
                else:
                    progress = 0  # Loop back to beginning for visual testing
        except Exception:
            pass

    # Determine status messages based on progress
    if progress == 0:
        status = "Initializing"
        log = "Clearing build cache, launching bundler..."
    elif progress == 20:
        status = "Resolving Imports"
        log = "Parsed 34 source files, tree-shaking unused variables..."
    elif progress == 40:
        status = "Type Checking"
        log = "TypeScript compiler: 0 errors, 3 warnings resolved."
    elif progress == 60:
        status = "Transpiling"
        log = "Compiling React Components -> ES2022 bundle..."
    elif progress == 80:
        status = "Packaging"
        log = "Compressing app assets, copying html wrappers..."
    elif progress == 100:
        status = "Success"
        log = "App successfully compiled! Electron build output written."

    # Build ASCII progress bar
    bar_width = 15
    filled_chars = int((progress / 100) * bar_width)
    bar_str = "█" * filled_chars + "░" * (bar_width - filled_chars)
    progress_bar = f"|{bar_str}| {progress}%"

    data = {
        "build": {
            "progress": progress,
            "progress_bar": progress_bar,
            "status": status,
            "log": log,
            "last_updated": time.strftime("%H:%M:%S"),
            "thread_id": thread_id
        }
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    main()
