import os
import json
import time

def main():
    output_file = os.environ.get('DNOTE_OUTPUT_FILE')
    if not output_file:
        print("Error: DNOTE_OUTPUT_FILE not set")
        return
        
    data = {
        "status": "✨ 脚本在文件加载/保存时已被触发立即运行！",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print(json.dumps(data, ensure_ascii=False))

if __name__ == '__main__':
    main()
