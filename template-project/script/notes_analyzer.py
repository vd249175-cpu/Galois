import os
import sys
import json
import re
import time

def parse_frontmatter_tags(file_path):
    tags = []
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            # Simple match for frontmatter
            match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
            if match:
                fm_text = match.group(1)
                # Look for tags:
                # Case 1: list format
                # tags:
                #   - tag1
                #   - tag2
                tag_section_match = re.search(r'^tags:\s*\n((?:\s*-\s*\S+\s*\n?)+)', fm_text, re.MULTILINE)
                if tag_section_match:
                    lines = tag_section_match.group(1).strip().split('\n')
                    for line in lines:
                        t = line.replace('-', '').strip()
                        if t:
                            tags.append(t)
                else:
                    # Case 2: inline format tags: [tag1, tag2] or tags: tag1, tag2
                    inline_match = re.search(r'^tags:\s*\[?(.*?)\]?\s*$', fm_text, re.MULTILINE)
                    if inline_match:
                        items = inline_match.group(1).split(',')
                        for item in items:
                            t = item.strip()
                            if t:
                                tags.append(t)
    except Exception as e:
        pass
    return tags

def main():
    output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'notes_stats.json')
    thread_id = os.environ.get('DNOTE_THREAD_ID', 'project')

    # Since workingDir is projectPath/script, the project path is ".."
    project_dir = ".."
    
    md_files = []
    all_tags = []
    recent_notes = []
    total_size = 0

    if os.path.exists(project_dir):
        for root, dirs, files in os.walk(project_dir):
            # Exclude hidden directories like .git or node_modules
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for file in files:
                if file.endswith('.md'):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, project_dir)
                    
                    try:
                        stat = os.stat(full_path)
                        mtime = stat.st_mtime
                        size = stat.st_size
                        total_size += size
                        
                        tags = parse_frontmatter_tags(full_path)
                        all_tags.extend(tags)
                        
                        md_files.append({
                            "name": file,
                            "path": rel_path,
                            "size_bytes": size,
                            "mtime": mtime,
                            "mtime_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime)),
                            "tags": tags
                        })
                    except Exception:
                        pass

    # Sort files by modification time descending to find recent updates
    md_files.sort(key=lambda x: x['mtime'], reverse=True)
    recent_list = md_files[:4]  # top 4 recent

    # Count tag frequencies
    tag_counts = {}
    for tag in all_tags:
        tag_counts[tag] = tag_counts.get(tag, 0) + 1
    
    # Format tags for sorting/rendering
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
    tag_frequency_list = [{"tag": k, "count": v} for k, v in sorted_tags]

    total_size_kb = round(total_size / 1024, 2)

    data = {
        "stats": {
            "total_notes": len(md_files),
            "total_tags": len(set(all_tags)),
            "total_size_kb": f"{total_size_kb} KB",
            "last_run_time": time.strftime("%H:%M:%S"),
            "thread_id": thread_id,
            # Top tags and recent items
            "top_tag": tag_frequency_list[0]["tag"] if tag_frequency_list else "None",
            "top_tag_count": tag_frequency_list[0]["count"] if tag_frequency_list else 0,
            "most_recent_note": recent_list[0]["name"] if recent_list else "None",
            "most_recent_time": recent_list[0]["mtime_str"] if recent_list else "N/A"
        },
        # We can also output raw arrays if the parsing supports it (though nested json path replacement is usually key-based)
        "recent_0_name": recent_list[0]["name"] if len(recent_list) > 0 else "-",
        "recent_0_time": recent_list[0]["mtime_str"] if len(recent_list) > 0 else "-",
        "recent_1_name": recent_list[1]["name"] if len(recent_list) > 1 else "-",
        "recent_1_time": recent_list[1]["mtime_str"] if len(recent_list) > 1 else "-",
        "recent_2_name": recent_list[2]["name"] if len(recent_list) > 2 else "-",
        "recent_2_time": recent_list[2]["mtime_str"] if len(recent_list) > 2 else "-",
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    main()
