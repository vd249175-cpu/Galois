import os
import json
import time
import re

# tagResolver 注入的环境变量
# DNOTE_NOTE_PATH = 当前笔记文件的绝对路径（如 /project/05_总结型笔记写法.md）
# DNOTE_PROJECT_PATH 不由 tagResolver 注入，但可从 NOTE_PATH 推导
note_path   = os.environ.get('DNOTE_NOTE_PATH', '')
output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'output.json')

# 项目根目录 = 笔记文件所在目录（或手动传入的 DNOTE_PROJECT_PATH 作为 fallback）
project_path = (
    os.environ.get('DNOTE_PROJECT_PATH')          # 手动测试时可以直接传
    or (os.path.dirname(note_path) if note_path else None)
    or os.path.dirname(os.getcwd())               # 最后 fallback：脚本在 script/ 里，上一级是项目根
)


def parse_yaml_tags(content: str) -> list[str]:
    """从 markdown 文件中提取 YAML frontmatter 里的 tags 列表（跳过 re: 和 run: 条目）"""
    match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return []
    
    frontmatter = match.group(1)
    
    # 找到 tags: 块
    tags_match = re.search(r'^tags:\s*\n((?:  - .+\n?)+)', frontmatter, re.MULTILINE)
    if not tags_match:
        return []
    
    tags_block = tags_match.group(1)
    raw_tags = re.findall(r'  - (.+)', tags_block)
    
    # 过滤掉正则和脚本触发器
    static_tags = [
        t.strip() for t in raw_tags
        if not t.strip().startswith('re:') and not t.strip().startswith('run:')
    ]
    return static_tags


# 收集项目内所有 .md 文件的标签（排除自身，避免自引用）
all_tags: set[str] = set()

for filename in os.listdir(project_path):
    if not filename.endswith('.md'):
        continue
    
    filepath = os.path.join(project_path, filename)
    
    # 跳过自身（总结笔记不需要把自己的标签算进去）
    if note_path and os.path.abspath(filepath) == os.path.abspath(note_path):
        continue
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        tags = parse_yaml_tags(content)
        all_tags.update(tags)
    except Exception:
        continue

# 也加入自身的静态标签（保留 05 本身的分类标签）
own_static = ["Galois", "指引", "总结", "写作技巧", "笔记结构", "知识管理"]
all_tags.update(own_static)

tags_list = sorted(all_tags)

result = {
    "status": "success",
    "message": f"已收集 {len(tags_list)} 个项目标签",
    "data": {
        "tags": tags_list
    },
    "timestamp": int(time.time())
}

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(json.dumps(tags_list, ensure_ascii=False))
