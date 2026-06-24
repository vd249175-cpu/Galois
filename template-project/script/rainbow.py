import os
import json
import time

def hsl_to_span(char, hue):
    if char.isspace():
        return char
    # Simple inline style span for HSL coloring
    return f'<span style="color: hsl({int(hue)}, 90%, 55%); font-weight: 700;">{char}</span>'

def main():
    note_path = os.environ.get('DNOTE_NOTE_PATH')
    line_index = os.environ.get('DNOTE_NOTE_LINE')
    output_file = os.environ.get('DNOTE_OUTPUT_FILE')
    
    if not note_path or not line_index or not output_file:
        print("Missing environment variables.")
        return
        
    try:
        line_num = int(line_index)
    except ValueError:
        return
        
    if not os.path.exists(note_path):
        return
        
    with open(note_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    if line_num < 0 or line_num >= len(lines):
        return
        
    # Search for the next non-empty line below the hook line
    target_idx = -1
    for i in range(line_num + 1, len(lines)):
        if lines[i].strip():
            # If already styled, stop to prevent infinite re-formatting loops
            if lines[i].strip().startswith('<span style="color: hsl('):
                break
            target_idx = i
            break
            
    message = "未执行任何着色。"
    if target_idx != -1:
        target_text = lines[target_idx].rstrip('\r\n')
        # Skip if it is already HTML styled
        if not target_text.startswith('<span'):
            chars = list(target_text)
            colored_chars = []
            total_chars = sum(1 for c in chars if not c.isspace())
            if total_chars > 0:
                char_idx = 0
                for c in chars:
                    if c.isspace():
                        colored_chars.append(c)
                    else:
                        hue = (char_idx / total_chars) * 360
                        colored_chars.append(hsl_to_span(c, hue))
                        char_idx += 1
                
                # Replace line content in memory
                lines[target_idx] = "".join(colored_chars) + "\n"
                
                # Write changes back to the markdown note file
                with open(note_path, 'w', encoding='utf-8') as f:
                    f.writelines(lines)
                    
                message = "🌈 成功对下方文字应用了彩虹渐变魔法！"
            else:
                message = "下方的行没有可供着色的文字。"
        else:
            message = "下方文字已处于着色状态。"
    else:
        message = "未找到下方需要着色的非空行。"
        
    result = {
        "status": "success",
        "message": message,
        "timestamp": int(time.time())
    }
    
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
