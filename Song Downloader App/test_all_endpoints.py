"""
BeatDrop - Full End-to-End API Test Suite
Tests all Flask routes in sequence.
"""
import os, sys, json, time, threading
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, queue_manager

client = app.test_client()
PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
INFO = "\033[94m[INFO]\033[0m"

errors = []

def check(label, condition, detail=""):
    if condition:
        print(f"  {PASS} {label}")
    else:
        print(f"  {FAIL} {label}  {detail}")
        errors.append(label)

# ─── 1. Config API ────────────────────────────────────────────────────────────
print("\n=== TEST 1: Config API ===")
r = client.get('/api/config')
check("GET /api/config returns 200", r.status_code == 200)
cfg = r.get_json()
check("Config has download_dir key", "download_dir" in cfg)
check("Config has max_workers key", "max_workers" in cfg)
print(f"  {INFO} Download dir: {cfg.get('download_dir')}")

r = client.post('/api/config',
    data=json.dumps({"max_workers": 3}),
    content_type='application/json')
check("POST /api/config returns success", r.get_json().get("status") == "success")

# ─── 2. Search API ────────────────────────────────────────────────────────────
print("\n=== TEST 2: Search API ===")

# JioSaavn only
r = client.get('/api/search?query=Kesariya&provider=jiosaavn')
check("JioSaavn search returns 200", r.status_code == 200)
results = r.get_json().get("results", [])
check("JioSaavn search returns results", len(results) > 0, f"got {len(results)}")
check("JioSaavn results have correct provider", all(s["provider"] == "jiosaavn" for s in results[:3]))
print(f"  {INFO} JioSaavn: {len(results)} tracks. Top: {results[0]['title'] if results else 'N/A'}")

# YouTube Music only (uses yt-dlp fallback)
r = client.get('/api/search?query=Kesariya&provider=ytmusic')
check("YouTube search returns 200", r.status_code == 200)
results_yt = r.get_json().get("results", [])
check("YouTube search returns results", len(results_yt) > 0, f"got {len(results_yt)}")
check("YouTube results have correct provider", all(s["provider"] == "ytmusic" for s in results_yt[:3]))
print(f"  {INFO} YTMusic: {len(results_yt)} tracks. Top: {results_yt[0]['title'] if results_yt else 'N/A'}")

# Combined
r = client.get('/api/search?query=Kesariya&provider=combined')
check("Combined search returns 200", r.status_code == 200)
results_c = r.get_json().get("results", [])
check("Combined search returns results from both", len(results_c) > 0, f"got {len(results_c)}")
providers_found = {s["provider"] for s in results_c}
check("Combined results include BOTH jiosaavn and ytmusic", "jiosaavn" in providers_found and "ytmusic" in providers_found,
      f"providers present: {providers_found}")
print(f"  {INFO} Combined: {len(results_c)} merged tracks, providers: {providers_found}")

# ─── 3. Resolve API ───────────────────────────────────────────────────────────
print("\n=== TEST 3: URL Resolve API ===")

# JioSaavn Album URL
r = client.post('/api/resolve',
    data=json.dumps({"url": "https://www.jiosaavn.com/album/brahmastra/xq4v9ZFC9iA_"}),
    content_type='application/json')
check("JioSaavn album resolve returns 200", r.status_code == 200)
data = r.get_json()
check("Album resolve returns 'album' type", data.get("type") == "album", f"got: {data.get('type')}")
check("Album resolve has songs", len(data.get("songs", [])) > 0, f"songs: {len(data.get('songs', []))}")
print(f"  {INFO} Album: '{data.get('title')}' with {len(data.get('songs',[]))} songs")
saavn_song_from_album = data["songs"][0] if data.get("songs") else None

# YouTube single URL
r = client.post('/api/resolve',
    data=json.dumps({"url": "https://music.youtube.com/watch?v=NJAv_7lHUIU"}),
    content_type='application/json')
check("YouTube single song resolve returns 200", r.status_code == 200)
yt_data = r.get_json()
check("YT song resolve has songs", len(yt_data.get("songs", [])) > 0)
print(f"  {INFO} YT Song: '{yt_data.get('songs', [{}])[0].get('title')}'")
yt_song = yt_data["songs"][0] if yt_data.get("songs") else None

# ─── 4. Download Queue API ────────────────────────────────────────────────────
print("\n=== TEST 4: Download Queue API ===")

# Clear any prior queue state
client.post('/api/queue-clear', data=json.dumps({"action": "all"}), content_type='application/json')

# Add JioSaavn song from resolved album
songs_to_queue = []
if saavn_song_from_album:
    songs_to_queue.append(saavn_song_from_album)
if yt_song:
    songs_to_queue.append(yt_song)

r = client.post('/api/download',
    data=json.dumps({"songs": songs_to_queue}),
    content_type='application/json')
check("POST /api/download returns success", r.get_json().get("status") == "success")
check("Correct count added to queue", r.get_json().get("added") == len(songs_to_queue),
      f"added: {r.get_json().get('added')}, expected: {len(songs_to_queue)}")

# Poll queue until complete
print(f"  {INFO} Waiting for downloads to complete (max 3 min)...")
start = time.time()
timeout = 180
all_done = False

while time.time() - start < timeout:
    r = client.get('/api/queue-status')
    q = r.get_json().get("queue", [])
    statuses = [item["status"] for item in q]
    
    active = [s for s in statuses if s not in ("Completed", "Failed")]
    if not active:
        all_done = True
        break
    
    completed = statuses.count("Completed")
    downloading = statuses.count("Downloading")
    print(f"  {INFO} Queue: {completed}/{len(q)} completed, {downloading} downloading...")
    time.sleep(5)

check("All downloads completed within timeout", all_done)

r = client.get('/api/queue-status')
q_final = r.get_json().get("queue", [])
completed_count = sum(1 for item in q_final if item["status"] == "Completed")
failed_count = sum(1 for item in q_final if item["status"] == "Failed")
check("No failed downloads", failed_count == 0, f"failed: {[i['error'] for i in q_final if i['status']=='Failed']}")
check(f"All {len(songs_to_queue)} downloads completed", completed_count == len(songs_to_queue), f"completed: {completed_count}")

# ─── 5. Queue Clear API ───────────────────────────────────────────────────────
print("\n=== TEST 5: Queue Clear API ===")
r = client.post('/api/queue-clear', data=json.dumps({"action": "completed"}), content_type='application/json')
check("Clear completed returns success", r.get_json().get("status") == "success")
remaining = r.get_json().get("queue", [])
check("Queue empty after clear all completed", all(i["status"] not in ("Completed",) for i in remaining))

# ─── 6. Download dir verification ─────────────────────────────────────────────
print("\n=== TEST 6: File Verification ===")
cfg = client.get('/api/config').get_json()
dl_dir = cfg.get("download_dir", "")
files = os.listdir(dl_dir) if os.path.exists(dl_dir) else []
audio_files = [f for f in files if f.endswith(('.m4a', '.mp3', '.webm', '.opus'))]
print(f"  {INFO} Files in download dir: {audio_files}")
check("At least 2 audio files present in download directory", len(audio_files) >= 2, f"found: {audio_files}")

# Verify metadata using mutagen
import mutagen
meta_ok = True
for fname in audio_files[:2]:
    fpath = os.path.join(dl_dir, fname)
    audio = mutagen.File(fpath)
    if audio is None:
        print(f"  {FAIL} mutagen could not read: {fname}")
        meta_ok = False
    else:
        print(f"  {INFO} Tags OK: {fname}")
check("All files have readable metadata", meta_ok)

# ─── FINAL SUMMARY ────────────────────────────────────────────────────────────
print(f"\n{'='*55}")
if not errors:
    print(f"\033[92m ALL {6} TEST GROUPS PASSED SUCCESSFULLY! \033[0m")
else:
    print(f"\033[91m {len(errors)} ASSERTION(S) FAILED:\033[0m")
    for e in errors:
        print(f"   - {e}")
print('='*55)
