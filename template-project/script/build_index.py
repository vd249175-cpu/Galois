import os
import json
import time
import re

def parse_yaml_tags(content: str) -> list[str]:
    """Parse tags list from YAML frontmatter."""
    match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return []
    
    frontmatter = match.group(1)
    tags_match = re.search(r'^tags:\s*\n((?:  - .+\n?)+)', frontmatter, re.MULTILINE)
    if not tags_match:
        return []
    
    tags_block = tags_match.group(1)
    raw_tags = re.findall(r'  - (.+)', tags_block)
    return [t.strip() for t in raw_tags]

def main():
    project_path = os.environ.get('DNOTE_PROJECT_PATH', '.')
    output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'build_index.json')
    
    tag_counts = {}
    file_tags = {}
    
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for file in files:
            if file.endswith('.md'):
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, project_path)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    tags = parse_yaml_tags(content)
                    file_tags[rel_path] = tags
                    for t in tags:
                        tag_counts[t] = tag_counts.get(t, 0) + 1
                except Exception:
                    pass
                    
    # Sort tags by frequency
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
    
    result = {
        "status": "success",
        "message": f"标签索引构建完成。共发现 {len(tag_counts)} 个独立标签类型。",
        "data": {
            "tags_count": len(tag_counts),
            "tag_frequencies": dict(sorted_tags[:10]),  # Top 10 tags
            "files_indexed": len(file_tags)
        },
        "timestamp": int(time.time())
    }
    
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    print(f"[Index] Built index for {len(file_tags)} files, found {len(tag_counts)} unique tags.")

if __name__ == '__main__':
    main()
