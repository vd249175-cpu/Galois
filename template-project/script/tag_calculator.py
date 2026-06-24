import os
import json
import time

# Dynamic tags script calculator
output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'output.json')

# Output two dynamic tags for demonstration
result = {
    "status": "success",
    "message": "动态标签计算成功",
    "data": {
        "tags": ["AI推荐", "系统运算", "高频标签"]
    },
    "timestamp": int(time.time())
}

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

# Print to stdout for DNOTE tagResolver parsing
print(json.dumps(result["data"]["tags"], ensure_ascii=False))

