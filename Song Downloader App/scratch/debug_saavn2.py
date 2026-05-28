import sys, requests
sys.stdout.reconfigure(encoding='utf-8')
from urllib.parse import quote_plus

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}

def try_endpoint(label, url):
    print(f"\n=== {label} ===")
    try:
        r = requests.get(url, headers=headers, timeout=10)
        d = r.json()
        keys = list(d.keys())
        print(f"Status {r.status_code}, top keys: {keys[:8]}")
        # Try to find list of songs
        for k in keys:
            v = d[k]
            if isinstance(v, list) and len(v) > 0:
                print(f"  [{k}]: {len(v)} items, first keys: {list(v[0].keys())[:6]}")
            elif isinstance(v, dict):
                sub = list(v.keys())
                print(f"  [{k}]: dict with keys {sub[:6]}")
                for sk in sub:
                    sv = v[sk]
                    if isinstance(sv, list) and len(sv) > 0:
                        print(f"    [{sk}]: {len(sv)} items")
                        if sv:
                            print(f"      first: {sv[0].get('title','') or sv[0].get('song','') or sv[0].get('name','')}")
    except Exception as e:
        print(f"  Error: {e}")

q = quote_plus("hindi songs")

# search.getResults with 'q' param (not 'query')
try_endpoint("search.getResults q=... n=50 p=1", 
    f"https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q={q}&n=50&p=1")

# search.getResults with both q and query
try_endpoint("search.getResults q= AND query= n=20",
    f"https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q={q}&query={q}&n=20&p=1")

# search.getSongs with q
try_endpoint("search.getSongs q=... n=20",
    f"https://www.jiosaavn.com/api.php?__call=search.getSongs&_format=json&q={q}&n=20&p=1")

# autocomplete with more results
try_endpoint("autocomplete.get n=20",
    f"https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&api_version=4&ctx=web6dot0&query={q}&n=20")

# webapi.search
try_endpoint("webapi.search",
    f"https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&q={q}&n=10")
