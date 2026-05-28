import os
import sys
import time
import shutil
import mutagen
from mutagen.mp4 import MP4
from mutagen.mp3 import MP3
from app import queue_manager, load_config, save_config

def test_downloader():
    print("=== Starting Downloader & Tagging Integration Tests ===")
    
    # 1. Prepare clean test download directory
    test_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_downloads")
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    os.makedirs(test_dir, exist_ok=True)
    
    # Temporarily set config download directory to test folder
    original_config = load_config()
    test_config = original_config.copy()
    test_config["download_dir"] = test_dir
    save_config(test_config)
    print(f"Set download directory to temporary test folder: {test_dir}")
    
    try:
        # 2. Add a JioSaavn song to queue
        # Kesariya (From "Brahmastra") - ID: "xq4v9ZFC9iA_" (or get details pid)
        # We will use PID "K9vP5QZ9" which is a known JioSaavn PID for Kesariya, or similar.
        # Let's get details for Kesariya to get actual PID and details
        import requests
        headers = {"User-Agent": "Mozilla/5.0"}
        res = requests.get("https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&query=Kesariya", headers=headers, timeout=10)
        search_data = res.json()
        
        saavn_song = None
        if 'songs' in search_data and 'data' in search_data['songs'] and len(search_data['songs']['data']) > 0:
            song_info = search_data['songs']['data'][0]
            # Fetch full details to get encrypted_media_url
            pid = song_info.get('id')
            res_details = requests.get(f"https://www.jiosaavn.com/api.php?__call=song.getDetails&_format=json&pids={pid}", headers=headers, timeout=10)
            details_data = res_details.json()
            if pid in details_data:
                s = details_data[pid]
                saavn_song = {
                    "id": pid,
                    "title": s.get("song"),
                    "artist": s.get("singers"),
                    "album": s.get("album"),
                    "cover": s.get("image", "").replace("150x150", "500x500"),
                    "download_info": s.get("encrypted_media_url")
                }
                
        if not saavn_song:
            print("Failed to resolve JioSaavn song details for testing.")
            return False
            
        print(f"\nResolving JioSaavn Test Song: {saavn_song['title']} (Artist: {saavn_song['artist']})")
        queue_manager.add_to_queue(
            song_id=saavn_song["id"],
            title=saavn_song["title"],
            artist=saavn_song["artist"],
            album=saavn_song["album"],
            cover_url=saavn_song["cover"],
            provider="jiosaavn",
            download_info=saavn_song["download_info"]
        )
        
        # 3. Add a YouTube Music song to queue
        # Video ID: "NJAv_7lHUIU" (Kesariya - YT Music)
        yt_song = {
            "id": "NJAv_7lHUIU",
            "title": "Kesariya (From \"Brahmastra\")",
            "artist": "Arijit Singh, Pritam",
            "album": "Brahmastra",
            "cover": "https://lh3.googleusercontent.com/a4g5sE2R1KvZ_bA7wF5bA7wF5bA7wF5bA7wF5bA7wF"  # Mock cover url or simple link
        }
        print(f"Resolving YouTube Music Test Song: {yt_song['title']}")
        queue_manager.add_to_queue(
            song_id=yt_song["id"],
            title=yt_song["title"],
            artist=yt_song["artist"],
            album=yt_song["album"],
            cover_url=yt_song["cover"],
            provider="ytmusic"
        )
        
        # 4. Poll queue status until both are completed or one fails
        print("Polling active downloads...")
        start_poll = time.time()
        timeout = 180  # 3 minutes max
        
        completed_saavn = False
        completed_yt = False
        failed = False
        
        while time.time() - start_poll < timeout:
            status_list = queue_manager.get_status_list()
            all_done = True
            
            for item in status_list:
                sid = item["id"]
                status = item["status"]
                progress = item["progress"]
                speed = item["speed"]
                error = item["error"]
                
                print(f"  Song {sid[:8]} status: {status} ({progress}%, Speed: {speed})")
                if error:
                    print(f"    Error: {error}")
                    failed = True
                
                if sid == saavn_song["id"] and status == "Completed":
                    completed_saavn = True
                if sid == yt_song["id"] and status == "Completed":
                    completed_yt = True
                    
                if status not in ["Completed", "Failed"]:
                    all_done = False
                    
            if all_done:
                break
                
            time.sleep(4)
            
        # 5. Check results
        if not (completed_saavn and completed_yt) or failed:
            print("\nDownload test failed! Not all songs completed successfully.")
            return False
            
        print("\nAll downloads reported completed by the manager. Verifying local files...")
        
        # 6. Verify files in test_dir
        files = os.listdir(test_dir)
        print("Downloaded files:", files)
        
        saavn_file_found = False
        yt_file_found = False
        
        for f in files:
            file_path = os.path.join(test_dir, f)
            # Verify file size > 0
            if os.path.getsize(file_path) == 0:
                print(f"File {f} is empty!")
                return False
                
            # Check tagging
            try:
                audio = mutagen.File(file_path)
                print(f"Tags of {f}:")
                if audio is not None:
                    # Depending on container format, keys might differ
                    if f.endswith('.m4a'):
                        # M4A tags
                        title = audio.get('\xa9nam')
                        artist = audio.get('\xa9ART')
                        album = audio.get('\xa9alb')
                        cover = audio.get('covr')
                        print(f"  Title: {title}, Artist: {artist}, Album: {album}, Cover Art present: {bool(cover)}")
                        assert title is not None, "Missing title tag"
                        assert artist is not None, "Missing artist tag"
                    else:
                        print("  Tags dictionary keys:", audio.keys())
                else:
                    print("  No tags resolved by Mutagen")
            except Exception as tag_err:
                print(f"  Failed to read tags for {f}: {tag_err}")
                return False
                
            if "From" in f:
                yt_file_found = True
            else:
                saavn_file_found = True
                
        assert saavn_file_found, "JioSaavn downloaded file not found"
        assert yt_file_found, "YouTube Music downloaded file not found"
        
        print("\n=== All Downloader and Tagging Tests Passed Successfully! ===")
        return True
        
    finally:
        # Restore original config
        save_config(original_config)
        print("Restored original user configuration.")
        # Cleanup test directory
        try:
            shutil.rmtree(test_dir)
        except Exception:
            pass

if __name__ == "__main__":
    success = test_downloader()
    if not success:
        sys.exit(1)
    sys.exit(0)
