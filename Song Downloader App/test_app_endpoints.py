import time
import threading
import requests
import json
from app import app

def run_flask():
    # Run the flask app on a separate test port
    app.run(host='127.0.0.1', port=5555, debug=False, use_reloader=False)

def test_endpoints():
    print("=== Starting API Integration Tests ===")
    
    # 1. Start Flask in background thread
    t = threading.Thread(target=run_flask, daemon=True)
    t.start()
    
    # Give the server a moment to start
    time.sleep(2)
    
    base_url = "http://127.0.0.1:5555"
    
    # Test 1: Get Config
    try:
        res = requests.get(f"{base_url}/api/config")
        print(f"Test 1 (Get Config) Status: {res.status_code}")
        assert res.status_code == 200, "Get config failed"
        data = res.json()
        print("  Config keys:", data.keys())
        assert "download_dir" in data, "Config missing download_dir"
    except Exception as e:
        print("Test 1 Failed:", e)
        return False

    # Test 2: Search JioSaavn
    try:
        res = requests.get(f"{base_url}/api/search?query=Kesariya&provider=jiosaavn")
        print(f"\nTest 2 (Search JioSaavn) Status: {res.status_code}")
        assert res.status_code == 200, "JioSaavn search failed"
        data = res.json()
        assert "results" in data, "Search missing results"
        print(f"  Found {len(data['results'])} results on JioSaavn")
        if data['results']:
            print("  First item:", data['results'][0]['title'], "by", data['results'][0]['artist'])
            assert "id" in data['results'][0], "Result missing id"
    except Exception as e:
        print("Test 2 Failed:", e)
        return False

    # Test 3: Search YouTube Music
    try:
        res = requests.get(f"{base_url}/api/search?query=Kesariya&provider=ytmusic")
        print(f"\nTest 3 (Search YouTube Music) Status: {res.status_code}")
        assert res.status_code == 200, "YouTube Music search failed"
        data = res.json()
        assert "results" in data, "Search missing results"
        print(f"  Found {len(data['results'])} results on YouTube Music")
        if data['results']:
            print("  First item:", data['results'][0]['title'], "by", data['results'][0]['artist'])
            assert "id" in data['results'][0], "Result missing id"
    except Exception as e:
        print("Test 3 Failed:", e)
        return False

    # Test 4: Resolve JioSaavn URL
    try:
        payload = {"url": "https://www.jiosaavn.com/album/brahmastra/xq4v9ZFC9iA_"}
        res = requests.post(f"{base_url}/api/resolve", json=payload)
        print(f"\nTest 4 (Resolve JioSaavn Album URL) Status: {res.status_code}")
        assert res.status_code == 200, "Resolve JioSaavn failed"
        data = res.json()
        assert data["type"] == "album", "Expected type 'album'"
        print(f"  Album Title: {data.get('title')}")
        print(f"  Tracks count: {len(data.get('songs', []))}")
        assert len(data.get('songs', [])) > 0, "No tracks returned"
    except Exception as e:
        print("Test 4 Failed:", e)
        return False

    print("\n=== All Integration Tests Completed Successfully! ===")
    return True

if __name__ == "__main__":
    success = test_endpoints()
    if not success:
        print("Some tests failed.")
        exit(1)
    else:
        print("Success.")
        exit(0)
