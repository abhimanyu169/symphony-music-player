import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app

client = app.test_client()

print("=== TEST: Combined 1000+ search (may take ~15s) ===")
r = client.get('/api/search?query=hindi+songs&provider=combined')
data = r.get_json()
results = data.get('results', [])
providers = {s['provider'] for s in results}
total = data.get('total', len(results))
print(f"  Results returned : {len(results)}")
print(f"  Providers found  : {providers}")
print(f"  Total reported   : {total}")
print("  PASS" if len(results) >= 200 else f"  WARN: only {len(results)} results")

print("\n=== TEST: /api/library ===")
r2 = client.get('/api/library')
data2 = r2.get_json()
lib_total = data2.get('total', 0)
print(f"  Library files    : {lib_total}")
print(f"  Status           : {r2.status_code}")
if data2.get('files'):
    f = data2['files'][0]
    print(f"  First file       : {f['title']} — {f['artist']} ({f['size_mb']} MB)")
print("  PASS" if r2.status_code == 200 else "  FAIL")

print("\n=== TEST: /api/play path traversal security ===")
r3 = client.get('/api/play?file=../../../etc/passwd')
print(f"  Status code      : {r3.status_code}")
print("  PASS (blocked)" if r3.status_code in [403, 404] else "  FAIL")

print("\n=== ALL DONE ===")
