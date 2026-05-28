import yt_dlp
import json

def test_search():
    query = "Kesariya"
    limit = 5
    search_query = f"ytsearch{limit}:{query}"
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'skip_download': True,
    }
    
    print(f"Searching YouTube for '{query}' using yt-dlp...")
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(search_query, download=False)
            entries = result.get('entries', [])
            print(f"Found {len(entries)} entries.")
            for i, entry in enumerate(entries):
                if entry:
                    print(f"\n[{i+1}] Title: {entry.get('title')}")
                    print(f"    ID: {entry.get('id')}")
                    print(f"    Uploader: {entry.get('uploader')}")
                    print(f"    Thumbnail: {entry.get('thumbnail')}")
    except Exception as e:
        print("Search failed:", e)

if __name__ == "__main__":
    test_search()
