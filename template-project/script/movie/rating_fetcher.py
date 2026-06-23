import os
import json

def main():
    # Read environment variables injected by DNOTE
    output_file = os.environ.get('DNOTE_OUTPUT_FILE', 'movie_data.json')
    thread_id = os.environ.get('DNOTE_THREAD_ID', 'default')

    data = {
        "movie": {
            "name": "Interstellar",
            "rating": 9.8,
            "director": "Christopher Nolan",
            "thread": thread_id
        }
    }

    # Write JSON output
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

if __name__ == '__main__':
    main()
