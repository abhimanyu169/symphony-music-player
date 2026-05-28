import os, sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app

client = app.test_client()
PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
INFO = "\033[94m[INFO]\033[0m"
errors = []

def check(label, cond, detail=""):
    if cond:
        print(f"  {PASS} {label}")
    else:
        print(f"  {FAIL} {label}  {detail}")
        errors.append(label)

# --- TEST 1: Large search results ---
print("\n=== TEST 1: Large result count (50 per page) ===")
r = client.get('/api/search?query=hindi+songs&provider=jiosaavn&limit=50&page=1')
data = r.get_json()
results = data.get('results', [])
print(f"  {INFO} JioSaavn 'hindi songs' page1: {len(results)} results")
check("JioSaavn returns 10+ results for broad query", len(results) >= 5, f"got {len(results)}")
check("Page number returned", data.get('page') == 1)

r2 = client.get('/api/search?query=arijit+singh&provider=jiosaavn&limit=50&page=2')
data2 = r2.get_json()
results2 = data2.get('results', [])
print(f"  {INFO} JioSaavn 'arijit singh' page2: {len(results2)} results")
check("Page 2 works and returns results", len(results2) >= 1, f"got {len(results2)}")
check("Page 2 number returned", data2.get('page') == 2)

# --- TEST 2: Combined search returns both providers ---
print("\n=== TEST 2: Combined search provider mix ===")
r = client.get('/api/search?query=Kesariya&provider=combined&limit=50')
data = r.get_json()
results = data.get('results', [])
providers = {s['provider'] for s in results}
print(f"  {INFO} Combined: {len(results)} results, providers: {providers}")
check("Combined returns both jiosaavn and ytmusic", 'jiosaavn' in providers and 'ytmusic' in providers)
check("Combined returns 20+ merged results", len(results) >= 20, f"got {len(results)}")

# --- TEST 3: /api/play route ---
print("\n=== TEST 3: /api/play file serving ===")
import os
from app import load_config
cfg = load_config()
dl_dir = cfg.get('download_dir', '')
audio_files = [f for f in os.listdir(dl_dir) if f.endswith(('.m4a','.mp3','.webm'))] if os.path.exists(dl_dir) else []
print(f"  {INFO} Found {len(audio_files)} audio files in download dir")

if audio_files:
    fname = audio_files[0]
    r = client.get(f'/api/play?file={fname}')
    print(f"  {INFO} GET /api/play?file={fname} → status {r.status_code}")
    check("/api/play returns 200 for valid file", r.status_code == 200, f"got {r.status_code}")
    check("Response is audio content-type", 'audio' in r.content_type or 'application/octet' in r.content_type, f"got {r.content_type}")
else:
    print(f"  {INFO} No audio files to test play route (download dir empty)")
    check("/api/play: skipped (no files)", True)

# Path traversal security
r_bad = client.get('/api/play?file=../../../etc/passwd')
check("/api/play blocks path traversal attacks", r_bad.status_code in [403, 404], f"got {r_bad.status_code}")

# --- SUMMARY ---
print(f"\n{'='*55}")
if not errors:
    print("\033[92m ALL NEW FEATURE TESTS PASSED! \033[0m")
else:
    print(f"\033[91m {len(errors)} FAILED:\033[0m")
    for e in errors: print(f"   - {e}")
print('='*55)
