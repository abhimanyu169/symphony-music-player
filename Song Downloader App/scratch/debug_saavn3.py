import sys, json, requests
sys.stdout.reconfigure(encoding='utf-8')
from urllib.parse import quote_plus

headers = {"User-Agent": "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36"}
q = quote_plus("arijit singh")

# Format A: q only (40 results)
url_a = f"https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q={q}&n=10&p=1"
ra = requests.get(url_a, headers=headers, timeout=10).json()
print("=== Format A (q only) - first item ===")
if ra.get('results'):
    item = ra['results'][0]
    print(json.dumps(item, indent=2, ensure_ascii=False)[:1000])

# Format B: q + query (song-specific, 20 results)
url_b = f"https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q={q}&query={q}&n=20&p=1"
rb = requests.get(url_b, headers=headers, timeout=10).json()
print("\n=== Format B (q + query) - first item full ===")
if rb.get('results'):
    item = rb['results'][0]
    print(json.dumps(item, indent=2, ensure_ascii=False)[:2000])
    print(f"\nTotal results available: {rb.get('total')}")
