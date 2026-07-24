import os
import json
import time

# Dynamic tag output is stdout-first. DNOTE_OUTPUT_FILE is optional for tag
# scripts and should never fall back to a stray project-root output.json.
output_file = os.environ.get('DNOTE_OUTPUT_FILE')

# Output two dynamic tags for demonstration
result = {
    "status": "success",
    "message": "动态标签计算成功",
    "data": {
        "tags": ["Galois", "标签", "脚本计算", "推荐"]
    },
    "timestamp": int(time.time())
}

if output_file:
    output_dir = os.path.dirname(output_file)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

# Print to stdout for Galois tagResolver parsing
print(json.dumps(result["data"]["tags"], ensure_ascii=False))
