import os
import json
import time

def main():
    output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'on_project_open.json')
    data = {
        "event": "project_open",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "status": "success",
        "message": "Project open hook executed successfully!"
    }
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

if __name__ == '__main__':
    main()
