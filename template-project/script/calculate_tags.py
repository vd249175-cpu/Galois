# /// script
# dependencies = [
#   "requests",
# ]
# ///
import os
import json
import re
import sys

def calculate_tags(note_path):
    tags = []
    if not os.path.exists(note_path):
        return tags
        
    try:
        with open(note_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Example 1: Calculate tags based on content analysis
        if re.search(r'Canis|犬科|狗|金毛|哈士奇', content, re.IGNORECASE):
            tags.append("Canine")
            
        if re.search(r'Lattice|Graph|Subset', content, re.IGNORECASE):
            tags.append("Topology")
            
        # Example 2: Tag inheritance from referenced notes (WikiLinks)
        # Parse resolved tags from the environment variable injected by the frontend
        resolved_tags = {}
        resolved_tags_env = os.environ.get('DNOTE_RESOLVED_TAGS')
        if resolved_tags_env:
            try:
                resolved_tags = json.loads(resolved_tags_env)
            except Exception:
                pass
                
        # Find all WikiLinks in the content, e.g. [[聪明的狗]]
        wikilinks = re.findall(r'\[\[(.*?)\]\]', content)
        for link in wikilinks:
            link_name = link.strip()
            # Check if the linked note exists in resolved_tags
            for path, val_tags in resolved_tags.items():
                if path.endswith(f"/{link_name}.md") or path.endswith(f"\\{link_name}.md"):
                    # If the referenced note is tagged with '聪明' or 'Intelligent_Inherited', propagate the intelligence tag
                    if ("聪明" in val_tags or "Intelligent_Inherited" in val_tags) and "Intelligent_Inherited" not in tags:
                        tags.append("Intelligent_Inherited")
                        
    except Exception as e:
        sys.stderr.write(f"Error in calculate_tags: {str(e)}\n")
        
    return tags

def main():
    # Retrieve the note path from environment variable
    note_path = os.environ.get('DNOTE_NOTE_PATH')
    if not note_path and len(sys.argv) > 1:
        note_path = sys.argv[1]
        
    if not note_path:
        # Fallback if no path provided
        print(json.dumps([]))
        return
        
    calculated = calculate_tags(note_path)
    
    # Print the tags list directly to stdout as JSON array
    # React will parse this output string directly
    print(json.dumps(calculated, ensure_ascii=False))

if __name__ == '__main__':
    main()
