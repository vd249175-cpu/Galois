import os
import sys
import json

def apply_rainbow():
    note_path = os.environ.get('DNOTE_NOTE_PATH')
    line_index_str = os.environ.get('DNOTE_NOTE_LINE')
    output_file = os.environ.get('DNOTE_OUTPUT_FILE')

    if not note_path or not os.path.exists(note_path) or line_index_str is None:
        return {"status": "error", "message": "Missing environment parameters"}

    try:
        line_idx = int(line_index_str)
    except ValueError:
        return {"status": "error", "message": "Invalid line index"}

    try:
        # Read the file content
        with open(note_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        if line_idx >= len(lines):
            return {"status": "error", "message": f"Line index {line_idx} out of range ({len(lines)})"}

        # Define vibrant rainbow colors (Red, Orange, Yellow, Green, Blue, Indigo, Violet)
        colors = ["#FF0000", "#FF7F00", "#E6C300", "#00B300", "#0000FF", "#4B0082", "#8B00FF"]
        color_idx = 0

        # Scan for subsequent paragraph lines (consecutive lines until an empty line is hit)
        start_paragraph_idx = line_idx + 1
        end_paragraph_idx = start_paragraph_idx

        while end_paragraph_idx < len(lines) and lines[end_paragraph_idx].strip() != "":
            end_paragraph_idx += 1

        # Replace characters with styled spans in the gathered paragraph
        for i in range(start_paragraph_idx, end_paragraph_idx):
            original_line = lines[i]
            has_newline = original_line.endswith('\n')
            clean_line = original_line.rstrip('\r\n')
            
            colored_line = ""
            for char in clean_line:
                if char.strip():
                    color = colors[color_idx % len(colors)]
                    color_idx += 1
                    colored_line += f'<span style="color: {color}; font-weight: bold;">{char}</span>'
                else:
                    colored_line += char
            
            if has_newline:
                colored_line += '\n'
            
            lines[i] = colored_line

        # Remove the trigger line itself
        lines.pop(line_idx)

        # Write back the modified content to the note
        with open(note_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)

        # If DNOTE_OUTPUT_FILE is provided, write a status JSON
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump({"status": "applied", "chars_colored": color_idx}, f)

        return {"status": "success", "chars_colored": color_idx}

    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == '__main__':
    res = apply_rainbow()
    # Output result to stdout
    print(json.dumps(res))
