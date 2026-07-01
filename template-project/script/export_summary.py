import os
import json
import time
import re

def parse_metadata(content: str):
    """Parse title, tags, and WikiLinks from markdown content."""
    tags = []
    title = "未命名笔记"
    
    # Title
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if title_match:
        title = title_match.group(1).strip()
        
    # Tags from YAML frontmatter
    match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if match:
        frontmatter = match.group(1)
        tags_match = re.search(r'^tags:\s*\n((?:  - .+\n?)+)', frontmatter, re.MULTILINE)
        if tags_match:
            tags_block = tags_match.group(1)
            raw_tags = re.findall(r'  - (.+)', tags_block)
            tags = [t.strip() for t in raw_tags]
            
    # WikiLinks [[LinkTarget]]
    links = re.findall(r'\[\[([^\]]+)\]\]', content)
    return title, tags, links

def main():
    project_path = os.environ.get('DNOTE_PROJECT_PATH', '.')
    output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'export_summary.json')
    
    notes_data = []
    all_tags = {}
    total_chars = 0
    total_links = 0
    
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for file in files:
            # Analyze all markdown files except the report itself
            if file.endswith('.md') and not file.endswith('知识库概览报告.md'):
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, project_path)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    chars = len(content)
                    title, tags, links = parse_metadata(content)
                    
                    notes_data.append({
                        "filename": file,
                        "rel_path": rel_path,
                        "title": title,
                        "tags": tags,
                        "links_count": len(links),
                        "chars": chars
                    })
                    
                    total_chars += chars
                    total_links += len(links)
                    for t in tags:
                        # Skip special resolver patterns
                        if not t.startswith('run:') and not t.startswith('re:'):
                            all_tags[t] = all_tags.get(t, 0) + 1
                except Exception as e:
                    print(f"Error parsing {file}: {e}")
                    
    # Sort tags by frequency
    sorted_tags = sorted(all_tags.items(), key=lambda x: x[1], reverse=True)
    
    # Generate report file content
    report_path = os.path.join(project_path, "知识库概览报告.md")
    
    report_content = f"""# 📊 Galois 知识库概览报告

该报告由项目自定义指令 `project.exportSummary` 自动生成。你可以随时在任意笔记中通过斜线指令 `/` 或快捷键运行该脚本重新生成。

---

## 📈 总体数据统计
- **笔记总数**：{len(notes_data)} 篇
- **总字符数**：{total_chars} 字
- **双向链接总数**：{total_links} 个
- **独立标签类型**：{len(all_tags)} 个

## 🏷️ 高频标签 Top 5
| 标签名称 | 引用次数 |
| :--- | :--- |
"""
    for tag, freq in sorted_tags[:5]:
        report_content += f"| `{tag}` | {freq} 次 |\n"
        
    report_content += """
## 📝 笔记列表与字数统计
| 笔记标题 | 文件名 | 核心标签 | 字数 | 双链数 |
| :--- | :--- | :--- | :--- | :--- |
"""
    for note in sorted(notes_data, key=lambda x: x['chars'], reverse=True):
        clean_tags = [t for t in note['tags'] if not t.startswith('run:') and not t.startswith('re:')]
        tags_str = ", ".join([f"`{t}`" for t in clean_tags[:3]])
        if len(clean_tags) > 3:
            tags_str += "..."
        # Link using WikiLinks format
        link_target = note['filename'][:-3]
        report_content += f"| [[{link_target}]] | `{note['filename']}` | {tags_str} | {note['chars']} | {note['links_count']} |\n"
        
    report_content += f"""
---
*报告生成时间：{time.strftime("%Y-%m-%d %H:%M:%S")}*
"""
    
    # Write the markdown note
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report_content)
        
    result = {
        "status": "success",
        "message": f"成功导出知识库概览报告！报告已写入项目根目录的 '知识库概览报告.md'。",
        "data": {
            "file_created": "知识库概览报告.md",
            "notes_count": len(notes_data),
            "total_chars": total_chars
        },
        "timestamp": int(time.time())
    }
    
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    print(f"[Export] Saved report to {report_path}")

if __name__ == '__main__':
    main()
