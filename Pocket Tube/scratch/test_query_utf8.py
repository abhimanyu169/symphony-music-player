import yt_dlp
import json
import sys
import io

# Force UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ydl_opts = {
    'extract_flat': True,
    'quiet': True,
    'no_warnings': True,
    'nocheckcertificate': True,
}

queries = [
    'trending India',
    'trending news comedy gaming music India',
    'latest viral videos India'
]

for q in queries:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            search_query = f"ytsearch12:{q}"
            res = ydl.extract_info(search_query, download=False)
            entries = res.get('entries', [])
            print(f"--- Query: {q} (entries: {len(entries)}) ---")
            for idx, entry in enumerate(entries):
                print(f"  {idx+1}. {entry.get('title')} [{entry.get('uploader')}]")
        except Exception as e:
            print(f"Error for {q}: {e}")
