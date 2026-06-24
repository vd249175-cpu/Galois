import os
import json
import time

project_path = os.environ.get('DNOTE_PROJECT_PATH', '.')
output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'stats.json')

word_count = 0
file_count = 0

for root, dirs, files in os.walk(project_path):
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for file in files:
        if file.endswith('.md'):
            file_count += 1
            try:
                with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                    word_count += len(f.read())
            except Exception:
                pass

result = {
    "status": "success",
    "message": "文档统计计算完成",
    "data": {
        "files_count": file_count,
        "total_characters": word_count
    },
    "timestamp": int(time.time())
}

if os.path.dirname(output_file):
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"[Stats] Counted {file_count} markdown notes with total {word_count} characters.")
