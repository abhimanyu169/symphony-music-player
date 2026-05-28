import os
import sys
import time
import threading
import requests

# Reconfigure stdout to support utf-8 print names
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

sys.path.insert(0, "c:/Users/abhim/Antigravity/Song Downloader App")
from app import app, load_config

def run_flask():
    app.run(host='127.0.0.1', port=6666, debug=False, use_reloader=False)

def test_social_endpoints():
    print("=== Starting Facebook & Instagram API Integration Tests ===")
    
    # 1. Start Flask in background thread
    t = threading.Thread(target=run_flask, daemon=True)
    t.start()
    
    # Give the server a moment to start
    time.sleep(2)
    
    base_url = "http://127.0.0.1:6666"
    
    # Test 1: Resolve Facebook Video
    try:
        fb_url = "https://www.facebook.com/watch/?v=10158402488188188"
        print(f"\nTest 1 (Resolve FB URL: {fb_url})...")
        payload = {"url": fb_url}
        res = requests.post(f"{base_url}/api/resolve", json=payload)
        print(f"Test 1 Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            assert data["type"] == "song", "Expected song type for Facebook resolve"
            songs = data.get('songs', [])
            assert len(songs) == 1, "Expected exactly 1 song in results list"
            print(f"  Resolved FB video: {songs[0]['title']} (Provider: {songs[0]['provider']})")
            assert songs[0]['provider'] == 'facebook', "Provider mismatch"
        else:
            print(f"  Warning: Facebook resolve returned status {res.status_code}. Response: {res.text}")
    except Exception as e:
        print("  Test 1 Exception (FB Resolve):", e)

    # Test 2: Resolve Instagram Reel
    try:
        ig_url = "https://www.instagram.com/reel/C7D_U-Nuh1Y/"
        print(f"\nTest 2 (Resolve IG URL: {ig_url})...")
        payload = {"url": ig_url}
        res = requests.post(f"{base_url}/api/resolve", json=payload)
        print(f"Test 2 Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            assert data["type"] == "song", "Expected song type for Instagram resolve"
            songs = data.get('songs', [])
            assert len(songs) == 1, "Expected exactly 1 song in results list"
            print(f"  Resolved IG reel: {songs[0]['title']} (Provider: {songs[0]['provider']})")
            assert songs[0]['provider'] == 'instagram', "Provider mismatch"
        else:
            print(f"  Warning: Instagram resolve returned status {res.status_code}. Response: {res.text}")
    except Exception as e:
        print("  Test 2 Exception (IG Resolve):", e)

    # Test 3: Preview Facebook Video
    try:
        fb_url = "https://www.facebook.com/watch/?v=10158402488188188"
        print(f"\nTest 3 (Preview FB Video URL: {fb_url})...")
        res = requests.get(f"{base_url}/api/preview?provider=facebook&id={requests.utils.quote(fb_url)}")
        print(f"Test 3 Status: {res.status_code}")
        if res.status_code == 200:
            data = res.json()
            assert "url" in data, "Preview URL missing"
            print(f"  FB Preview stream URL: {data['url'][:85]}...")
        else:
            print(f"  Warning: FB Preview returned status {res.status_code}. Response: {res.text}")
    except Exception as e:
        print("  Test 3 Exception (FB Preview):", e)

    print("\n=== Facebook & Instagram Integration Tests Finished ===")
    return True

if __name__ == "__main__":
    test_social_endpoints()
    sys.exit(0)
