import os
import re
import sys
import argparse

def tokenize_query(query):
    # Match tag regular expressions, parentheses, operators and words
    pattern = r'(#re:\S+|re:\S+|\(|\)|#/[^/]+/[a-z]*|#[^\s()#]+|and|add|or|not|&&|\|\||!|\S+)'
    raw_tokens = re.findall(pattern, query, re.IGNORECASE)
    tokens = []
    for token in raw_tokens:
        lower = token.lower()
        if lower in ('(', ')'):
            tokens.append(('operator', token))
        elif lower in ('and', '&&', 'add'):
            tokens.append(('operator', '&'))
        elif lower in ('or', '||'):
            tokens.append(('operator', '|'))
        elif lower in ('not', '!'):
            tokens.append(('operator', '!'))
        elif token.startswith('#'):
            if token.startswith('#/') or token.startswith('#re:'):
                tokens.append(('tag', token))
            else:
                parts = [p for p in token.split('#') if p]
                for i, part in enumerate(parts):
                    if i > 0:
                        tokens.append(('operator', '&'))
                    tokens.append(('tag', '#' + part))
        else:
            tokens.append(('filename', token))
    return tokens

def evaluate_boolean(postfix_tokens):
    stack = []
    for type_val, val in postfix_tokens:
        if val == 'true':
            stack.append(True)
        elif val == 'false':
            stack.append(False)
        elif val == '!':
            if not stack:
                return False
            stack.append(not stack.pop())
        elif val == '&':
            if len(stack) < 2:
                return False
            b = stack.pop()
            a = stack.pop()
            stack.append(a and b)
        elif val == '|':
            if len(stack) < 2:
                return False
            b = stack.pop()
            a = stack.pop()
            stack.append(a or b)
    return stack[0] if stack else False

def check_single_tag_match(file_tags, tag_query):
    # Strip leading '#'
    query = tag_query[1:] if tag_query.startswith('#') else tag_query
    
    # Check if regex
    is_regex = False
    pattern = ''
    flags = re.IGNORECASE
    
    if query.startswith('re:'):
        is_regex = True
        pattern = query[3:]
    elif query.startswith('/') and '/' in query[1:]:
        is_regex = True
        idx = query.rfind('/')
        pattern = query[1:idx]
        flag_str = query[idx+1:]
        if 'i' not in flag_str:
            flags = 0
            
    if is_regex:
        try:
            rx = re.compile(pattern, flags)
            return any(rx.search(t) for t in file_tags)
        except Exception:
            return False
            
    # Substring / exact match
    return any(query.lower() in t.lower() for t in file_tags)

def matches_tag_query(file_tags, tag_tokens):
    # Convert infix to postfix
    output_queue = []
    operator_stack = []
    precedence = {'|': 1, '&': 2, '!': 3}
    
    for type_val, val in tag_tokens:
        if type_val == 'tag':
            is_match = check_single_tag_match(file_tags, val)
            output_queue.append(('boolean', 'true' if is_match else 'false'))
        elif val == '(':
            operator_stack.append(val)
        elif val == ')':
            while operator_stack and operator_stack[-1] != '(':
                output_queue.append(('operator', operator_stack.pop()))
            if operator_stack:
                operator_stack.pop() # Remove '('
        elif val in ('&', '|', '!'):
            while (operator_stack and operator_stack[-1] != '(' and 
                   precedence.get(operator_stack[-1], 0) >= precedence.get(val, 0)):
                output_queue.append(('operator', operator_stack.pop()))
            operator_stack.append(val)
            
    while operator_stack:
        output_queue.append(('operator', operator_stack.pop()))
        
    return evaluate_boolean(output_queue)

def matches_filename(filename, filename_tokens):
    if not filename_tokens:
        return True
    return all(token.lower() in filename.lower() for token in filename_tokens)

def scan_tags_in_file(filepath):
    tags = []
    if not os.path.exists(filepath):
        return tags
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            # Matches tag style #words
            tags.extend(re.findall(r'#([^\s#()]+)', content))
    except Exception:
        pass
    return list(set(tags))

def search_files(directory, query):
    tokens = tokenize_query(query)
    tag_tokens = [t for t in tokens if t[0] in ('tag', 'operator')]
    filename_tokens = [t[1] for t in tokens if t[0] == 'filename']
    
    # Filter filename tokens that might have been classified as operators if there are no tag tags
    has_tag = any(t[0] == 'tag' for t in tokens)
    if not has_tag:
        tag_tokens = []
        filename_tokens = [t[1] for t in tokens]
        
    results = []
    for root, dirs, files in os.walk(directory):
        # Exclude hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for file in files:
            if file.endswith('.md'):
                filepath = os.path.join(root, file)
                file_tags = scan_tags_in_file(filepath)
                
                tag_match = matches_tag_query(file_tags, tag_tokens) if tag_tokens else True
                file_match = matches_filename(file, filename_tokens)
                
                if tag_match and file_match:
                    results.append({
                        'name': file,
                        'path': filepath,
                        'tags': file_tags
                    })
    return results

def main():
    parser = argparse.ArgumentParser(description="DNOTE Offline Tag and File Query Engine")
    parser.add_argument('--dir', required=True, help="Directory to search")
    parser.add_argument('--query', required=True, help="Query string")
    args = parser.parse_args()
    
    if not os.path.isdir(args.dir):
        print(f"Error: {args.dir} is not a valid directory.")
        sys.exit(1)
        
    results = search_files(args.dir, args.query)
    print(f"Found {len(results)} note(s) matching query:")
    for res in results:
        tags_str = ", ".join(f"#{t}" for t in res['tags'])
        print(f"- {res['name']} ({tags_str}) -> {res['path']}")

if __name__ == '__main__':
    main()
