import yt_dlp
import json

ydl_opts = {
    'extract_flat': True,
    'quiet': True,
    'no_warnings': True,
    'nocheckcertificate': True,
}

queries = [
    'trending India',
    'latest trending videos India',
    'popular videos India'
]

for q in queries:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            search_query = f"ytsearch10:{q}"
            res = ydl.extract_info(search_query, download=False)
            entries = res.get('entries', [])
            print(f"--- Query: {q} (entries: {len(entries)}) ---")
            for idx, entry in enumerate(entries[:3]):
                print(f"  {idx+1}. {entry.get('title')} [{entry.get('uploader')}]")
        except Exception as e:
            print(f"Error for {q}: {e}")
