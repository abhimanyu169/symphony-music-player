import sys
import json
import yt_dlp
import io
import concurrent.futures

# Force UTF-8 encoding for stdout and stderr on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def get_info(url):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'skip_download': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            formats = info.get('formats', [])
            
            formatted_formats = []
            for f in formats:
                quality = f.get('format_note') or (f"{f.get('height')}p" if f.get('height') else 'unknown')
                formatted_formats.append({
                    'format_id': f.get('format_id'),
                    'ext': f.get('ext'),
                    'resolution': f.get('resolution'),
                    'quality': quality,
                    'filesize': f.get('filesize') or f.get('filesize_approx'),
                    'acodec': f.get('acodec'),
                    'vcodec': f.get('vcodec'),
                    'fps': f.get('fps'),
                })
            
            audio_url = None
            m4a_audios = [f for f in formats if f.get('vcodec') == 'none' and f.get('ext') == 'm4a']
            if m4a_audios:
                audio_url = m4a_audios[-1].get('url')
            else:
                all_audios = [f for f in formats if f.get('vcodec') == 'none']
                if all_audios:
                    audio_url = all_audios[-1].get('url')
            
            result = {
                'title': info.get('title'),
                'description': info.get('description'),
                'duration': info.get('duration'),
                'uploader': info.get('uploader'),
                'view_count': info.get('view_count'),
                'thumbnail': info.get('thumbnail') or (info.get('thumbnails')[-1]['url'] if info.get('thumbnails') else None),
                'originalUrl': url,
                'formats': formatted_formats,
                'audioStreamUrl': audio_url
            }
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({'error': str(e)}), file=sys.stderr)
            sys.exit(1)

def run_search(query, limit=24):
    ydl_opts = {
        'extract_flat': True,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            search_query = f"ytsearch{limit}:{query}"
            res = ydl.extract_info(search_query, download=False)
            entries = res.get('entries', [])
            
            mapped = []
            for entry in entries:
                if not entry:
                    continue
                
                thumb_url = ""
                if entry.get('thumbnails'):
                    thumb_url = entry.get('thumbnails')[-1].get('url', '')
                else:
                    thumb_url = f"https://i.ytimg.com/vi/{entry.get('id')}/mqdefault.jpg"
                
                mapped.append({
                    'id': entry.get('id'),
                    'title': entry.get('title'),
                    'uploader': entry.get('uploader') or entry.get('channel') or 'Unknown Creator',
                    'duration': int(entry.get('duration')) if entry.get('duration') else 0,
                    'thumbnail': thumb_url,
                    'views': entry.get('view_count') or 0,
                    'publishedText': 'Uploaded video'
                })
            print(json.dumps(mapped))
        except Exception as e:
            print(json.dumps({'error': str(e)}), file=sys.stderr)
            sys.exit(1)

def fetch_single_query(query, limit=6):
    ydl_opts = {
        'extract_flat': True,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            search_query = f"ytsearch{limit}:{query}"
            res = ydl.extract_info(search_query, download=False)
            entries = res.get('entries', [])
            
            mapped = []
            for entry in entries:
                if not entry:
                    continue
                
                thumb_url = ""
                if entry.get('thumbnails'):
                    thumb_url = entry.get('thumbnails')[-1].get('url', '')
                else:
                    thumb_url = f"https://i.ytimg.com/vi/{entry.get('id')}/mqdefault.jpg"
                
                mapped.append({
                    'id': entry.get('id'),
                    'title': entry.get('title'),
                    'uploader': entry.get('uploader') or entry.get('channel') or 'Unknown Creator',
                    'duration': int(entry.get('duration')) if entry.get('duration') else 0,
                    'thumbnail': thumb_url,
                    'views': entry.get('view_count') or 0,
                    'publishedText': 'Recent video'
                })
            return mapped
        except Exception:
            return []

def run_trending_mix():
    queries = [
        ("trending India", 8),
        ("tech reviews India", 6),
        ("comedy sketches India", 6),
        ("movie trailers India", 6),
        ("latest news India", 6),
        ("gaming gameplay India", 6)
    ]
    
    results = []
    # Fetch in parallel using ThreadPoolExecutor
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(queries)) as executor:
        futures = {executor.submit(fetch_single_query, q, limit): q for q, limit in queries}
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            
    # Combine results in a round-robin style to ensure maximum diversity
    mixed_results = []
    max_len = max(len(r) for r in results) if results else 0
    for i in range(max_len):
        for r in results:
            if i < len(r):
                mixed_results.append(r[i])
                
    # Deduplicate just in case the same video appears in multiple categories
    seen_ids = set()
    deduped_results = []
    for video in mixed_results:
        if video['id'] not in seen_ids:
            seen_ids.add(video['id'])
            deduped_results.append(video)
            
    print(json.dumps(deduped_results[:36]))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Missing arguments'}), file=sys.stderr)
        sys.exit(1)
        
    command = sys.argv[1]
    
    if command == 'trending':
        run_trending_mix()
    elif command == 'search' and len(sys.argv) >= 3:
        run_search(sys.argv[2], 24)
    elif command == 'info' and len(sys.argv) >= 3:
        get_info(sys.argv[2])
    else:
        print(json.dumps({'error': f'Unknown or incomplete command {command}'}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
