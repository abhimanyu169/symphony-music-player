import yt_dlp
import json

ydl_opts = {
    'extract_flat': True,
    'quiet': True,
    'no_warnings': True,
    'nocheckcertificate': True,
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    try:
        url = "https://www.youtube.com/feed/trending"
        res = ydl.extract_info(url, download=False)
        entries = res.get('entries', [])
        print(f"Total entries: {len(entries)}")
        if entries:
            print("First entry sample:")
            print(json.dumps(entries[0], indent=2))
    except Exception as e:
        print(f"Error: {e}")
