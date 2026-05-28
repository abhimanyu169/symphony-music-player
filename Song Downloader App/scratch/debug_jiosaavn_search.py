import os, sys, json
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests
from urllib.parse import quote_plus

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
query = "hindi songs"
encoded = quote_plus(query)

# Try 1: search.getResults
print("=== Trying search.getResults ===")
url1 = f"https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&query={encoded}&n=10&p=1"
r1 = requests.get(url1, headers=headers, timeout=10)
print("Status:", r1.status_code)
try:
    d1 = r1.json()
    print("Top-level keys:", list(d1.keys())[:10])
    # Check for results
    if 'results' in d1:
        print(f"'results' count: {len(d1['results'])}")
        if d1['results']:
            print("First item keys:", list(d1['results'][0].keys()))
    elif 'songs' in d1:
        print(f"'songs.data' count: {len(d1.get('songs',{}).get('data',[]))}")
    else:
        print("Full response:", json.dumps(d1, indent=2)[:500])
except Exception as e:
    print("JSON error:", e)
    print("Raw:", r1.text[:300])

# Try 2: search.getResults with different param  
print("\n=== Trying autocomplete.get ===")
url2 = f"https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&query={encoded}"
r2 = requests.get(url2, headers=headers, timeout=10)
d2 = r2.json()
print("Top-level keys:", list(d2.keys()))
songs = d2.get('songs', {}).get('data', [])
print(f"Songs count: {len(songs)}")
if songs:
    print("First song keys:", list(songs[0].keys()))
    print("First song:", songs[0].get('title'), '-', songs[0].get('more_info', {}).get('singers'))

# Try 3: search.getResults v2
print("\n=== Trying search.getResults v3 ===")
url3 = f"https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&query={encoded}&n=20&p=1&_marker=0"
r3 = requests.get(url3, headers=headers, timeout=10)
d3 = r3.json()
print("Status:", r3.status_code)
print("Top-level keys:", list(d3.keys())[:10])
# Look deeper
for k in list(d3.keys())[:5]:
    v = d3[k]
    if isinstance(v, list):
        print(f"  {k}: list of {len(v)}")
    elif isinstance(v, dict):
        print(f"  {k}: dict keys = {list(v.keys())[:5]}")
    else:
        print(f"  {k}: {str(v)[:60]}")

# Try 4: Using the app's jiosaavn API 
print("\n=== Trying jiosaavn-api.vercel.app ===")
url4 = f"https://jiosaavn-api.vercel.app/search/songs?query={encoded}&limit=20"
try:
    r4 = requests.get(url4, headers=headers, timeout=10)
    d4 = r4.json()
    print("Status:", r4.status_code)
    print("Keys:", list(d4.keys())[:10])
    results4 = d4.get('data', {}).get('results', d4.get('results', []))
    print(f"Results count: {len(results4)}")
    if results4:
        print("First result keys:", list(results4[0].keys())[:8])
        print("First result:", results4[0].get('name') or results4[0].get('title'))
except Exception as e:
    print("Error:", e)

# Try 5: Different jiosaavn search endpoint
print("\n=== Trying search.getSongs endpoint ===")
url5 = f"https://www.jiosaavn.com/api.php?__call=search.getSongs&_format=json&query={encoded}&n=20&p=1"
r5 = requests.get(url5, headers=headers, timeout=10)
print("Status:", r5.status_code)
try:
    d5 = r5.json()
    print("Keys:", list(d5.keys())[:10])
    songs5 = d5.get('results', d5.get('songs', {}).get('data', []))
    print(f"Count: {len(songs5) if isinstance(songs5, list) else 'N/A'}")
    if isinstance(songs5, list) and songs5:
        print("First:", songs5[0].get('title', songs5[0].get('song', 'N/A')))
except Exception as e:
    print("Error:", e)
    print("Raw:", r5.text[:200])
