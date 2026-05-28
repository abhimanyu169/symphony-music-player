import os
import re
import sys
import json
import time
import base64
import queue
import threading
import requests
from flask import Flask, request, jsonify, render_template, send_from_directory
from pyDes import des, ECB, PAD_PKCS5
from ytmusicapi import YTMusic
import yt_dlp
import mutagen
from mutagen.mp4 import MP4, MP4Cover
from mutagen.easyid3 import EasyID3
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC

# Helper to get paths when bundled by PyInstaller
def get_resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)

# Initialize Flask
app = Flask(__name__, static_folder=get_resource_path('static'), template_folder=get_resource_path('templates'))

# Save configuration files to user home directory (writeable)
HOME_DIR = os.path.expanduser("~")
BEATDROP_DIR = os.path.join(HOME_DIR, ".beatdrop")
os.makedirs(BEATDROP_DIR, exist_ok=True)
CONFIG_PATH = os.path.join(BEATDROP_DIR, "config.json")

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print("Error loading config:", e)
    
    # Default config: Save in the user's standard Downloads/BeatDrop folder
    default_dir = os.path.join(HOME_DIR, "Downloads", "BeatDrop")
    return {
        "download_dir": default_dir,
        "max_workers": 3,
        "provider": "jiosaavn"
    }

def save_config(config_data):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=4)
        return True
    except Exception as e:
        print("Error saving config:", e)
        return False

# Ensure default download folder exists
initial_config = load_config()
os.makedirs(initial_config["download_dir"], exist_ok=True)

# Helper function to decrypt JioSaavn media URLs
def decrypt_url(url):
    try:
        des_key = des(b"38346591", ECB, padmode=PAD_PKCS5)
        decrypted = des_key.decrypt(base64.b64decode(url))
        return decrypted.decode('utf-8')
    except Exception as e:
        print("Decryption error:", e)
        return None

# Helper to build 320kbps URL from JioSaavn CDN URL
def get_high_quality_url(decrypted_url):
    for suffix in ["_96.mp4", "_160.mp4", "_320.mp4", "_96.mp3", "_160.mp3", "_320.mp3"]:
        if suffix in decrypted_url:
            return decrypted_url.replace(suffix, "_320.mp4")
    if "_96" in decrypted_url:
        return decrypted_url.replace("_96", "_320")
    if "_160" in decrypted_url:
        return decrypted_url.replace("_160", "_320")
    return decrypted_url

# Helper to format speed display
def format_speed(speed):
    if speed is None:
        return "0 KB/s"
    if speed > 1024 * 1024:
        return f"{speed / (1024*1024):.2f} MB/s"
    elif speed > 1024:
        return f"{speed / 1024:.2f} KB/s"
    return f"{speed} B/s"

# Chunk-based download for JioSaavn files to track progress
def download_jiosaavn_file(url, dest_path, update_progress_callback):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    res = requests.get(url, headers=headers, stream=True, timeout=30)
    if res.status_code != 200:
        raise Exception(f"Failed to fetch audio stream. Status: {res.status_code}")
        
    total_length = res.headers.get('content-length')
    if total_length is None:
        with open(dest_path, 'wb') as f:
            f.write(res.content)
    else:
        total_length = int(total_length)
        downloaded = 0
        start_time = time.time()
        with open(dest_path, 'wb') as f:
            for chunk in res.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    percent = (downloaded / total_length) * 100
                    elapsed = time.time() - start_time
                    speed = downloaded / elapsed if elapsed > 0 else 0
                    update_progress_callback(percent, format_speed(speed))

# Tagging function to embed song details and cover art
def tag_file(file_path, title, artist, album, cover_url=None):
    ext = os.path.splitext(file_path)[1].lower()
    
    # 1. Tag M4A/MP4 audio
    if ext in ['.m4a', '.mp4']:
        try:
            audio = MP4(file_path)
            audio['\xa9nam'] = title
            audio['\xa9ART'] = artist
            audio['\xa9alb'] = album
            
            if cover_url:
                try:
                    res = requests.get(cover_url, timeout=10)
                    if res.status_code == 200:
                        img_format = MP4Cover.FORMAT_JPEG
                        if cover_url.endswith('.png'):
                            img_format = MP4Cover.FORMAT_PNG
                        audio['covr'] = [MP4Cover(res.content, imageformat=img_format)]
                except Exception as cover_err:
                    print("Error adding M4A cover:", cover_err)
            audio.save()
            return True
        except Exception as e:
            print("Error tagging M4A:", e)
            return False
            
    # 2. Tag MP3 audio
    elif ext == '.mp3':
        try:
            try:
                audio = EasyID3(file_path)
            except Exception:
                audio = mutagen.File(file_path, easy=True)
                audio.add_tags()
            audio['title'] = title
            audio['artist'] = artist
            audio['album'] = album
            audio.save()
            
            if cover_url:
                try:
                    res = requests.get(cover_url, timeout=10)
                    if res.status_code == 200:
                        audio_tags = ID3(file_path)
                        audio_tags['APIC'] = APIC(
                            encoding=3,
                            mime='image/jpeg',
                            type=3,
                            desc='Cover',
                            data=res.content
                        )
                        audio_tags.save()
                except Exception as cover_err:
                    print("Error adding MP3 cover:", cover_err)
            return True
        except Exception as e:
            print("Error tagging MP3:", e)
            return False
            
    # 3. Tag WebM/Opus or other formats
    else:
        try:
            audio = mutagen.File(file_path)
            if audio is not None:
                audio['title'] = title
                audio['artist'] = artist
                audio['album'] = album
                audio.save()
            return True
        except Exception as e:
            print("Error tagging generic format:", e)
            return False

# Thread-safe Downloader Queue Manager
class DownloadQueueManager:
    def __init__(self):
        self.queue = queue.Queue()
        self.items = {}
        self.items_order = []
        self.lock = threading.Lock()
        
        # Load max workers config
        config = load_config()
        self.max_workers = config.get("max_workers", 3)
        self.workers = []
        self._start_workers()
        
    def _start_workers(self):
        for _ in range(self.max_workers):
            t = threading.Thread(target=self._worker_loop, daemon=True)
            t.start()
            self.workers.append(t)
            
    def add_to_queue(self, song_id, title, artist, album, cover_url, provider, download_info=None, resolution=None):
        with self.lock:
            if song_id in self.items:
                # If already failed, allow re-download
                if self.items[song_id]["status"] == "Failed":
                    self.items[song_id]["status"] = "Pending"
                    self.items[song_id]["progress"] = 0
                    self.items[song_id]["speed"] = "0 KB/s"
                    self.items[song_id]["error"] = None
                    self.items[song_id]["resolution"] = resolution
                    self.queue.put(song_id)
                    return True
                return False
                
            self.items[song_id] = {
                "id": song_id,
                "title": title,
                "artist": artist,
                "album": album,
                "cover_url": cover_url,
                "provider": provider,
                "status": "Pending",
                "progress": 0,
                "speed": "0 KB/s",
                "error": None,
                "filename": None,
                "download_info": download_info,
                "resolution": resolution
            }
            self.items_order.append(song_id)
            
        self.queue.put(song_id)
        return True
        
    def get_status_list(self):
        with self.lock:
            return [self.items[sid] for sid in self.items_order]
            
    def clear_completed(self):
        with self.lock:
            completed_ids = [sid for sid, item in self.items.items() if item["status"] == "Completed"]
            for sid in completed_ids:
                del self.items[sid]
                self.items_order.remove(sid)
                
    def clear_all(self):
        with self.lock:
            # We can only safely clear what is not actively downloading
            to_remove = [sid for sid, item in self.items.items() if item["status"] not in ["Downloading", "Tagging"]]
            for sid in to_remove:
                del self.items[sid]
                self.items_order.remove(sid)

    def _worker_loop(self):
        while True:
            song_id = self.queue.get()
            try:
                self._process_download(song_id)
            except Exception as e:
                print(f"Queue execution error on {song_id}: {e}")
            finally:
                self.queue.task_done()
                
    def _process_download(self, song_id):
        with self.lock:
            item = self.items[song_id]
            item["status"] = "Downloading"
            
        provider = item["provider"]
        title = item["title"]
        artist = item["artist"]
        album = item["album"]
        cover_url = item["cover_url"]
        
        config = load_config()
        download_dir = config.get("download_dir")
        
        if not download_dir or not os.path.exists(download_dir):
            with self.lock:
                item["status"] = "Failed"
                item["error"] = "Download directory not configured or does not exist."
                item["speed"] = "Failed"
            return
            
        def clean_filename(name):
            return re.sub(r'[\\/*?:"<>|]', "", name).strip()
            
        filename = f"{clean_filename(artist)} - {clean_filename(title)}"
        
        try:
            # --- JioSaavn Download logic ---
            if provider == "jiosaavn":
                enc_url = item["download_info"]
                if not enc_url:
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                    res_details = requests.get(f"https://www.jiosaavn.com/api.php?__call=song.getDetails&_format=json&pids={song_id}", headers=headers, timeout=15)
                    details = res_details.json()
                    enc_url = details.get(song_id, {}).get("encrypted_media_url")
                    
                if not enc_url:
                    raise Exception("Audio stream URL not found in JioSaavn details.")
                    
                dec_url = decrypt_url(enc_url)
                if not dec_url:
                    raise Exception("Failed to decrypt JioSaavn stream URL.")
                    
                hq_url = get_high_quality_url(dec_url)
                
                # Determine extension
                ext = ".m4a"
                if hq_url.endswith(".mp3") or hq_url.endswith(".mp3?"):
                    ext = ".mp3"
                    
                temp_file = os.path.join(download_dir, f"{filename}.temp{ext}")
                final_file = os.path.join(download_dir, f"{filename}{ext}")
                
                # Skip download if already exists
                if os.path.exists(final_file):
                    with self.lock:
                        item["status"] = "Completed"
                        item["progress"] = 100
                        item["speed"] = "Finished"
                    return
                    
                def update_progress(percent, speed_str):
                    with self.lock:
                        item["progress"] = int(percent)
                        item["speed"] = speed_str
                        
                download_jiosaavn_file(hq_url, temp_file, update_progress)
                
                with self.lock:
                    item["status"] = "Tagging"
                    item["speed"] = "Writing metadata..."
                    
                tag_file(temp_file, title, artist, album, cover_url)
                
                if os.path.exists(final_file):
                    os.remove(final_file)
                os.rename(temp_file, final_file)
                
                with self.lock:
                    item["status"] = "Completed"
                    item["progress"] = 100
                    item["speed"] = "Finished"
                    item["filename"] = os.path.basename(final_file)
                    
            # --- YouTube Music Download logic ---
            elif provider == "ytmusic":
                video_id = song_id
                url = f"https://music.youtube.com/watch?v={video_id}"
                
                temp_template = os.path.join(download_dir, f"{filename}.temp.%(ext)s")
                
                # Skip download if standard formats already exist
                # (Checking common extensions .m4a, .webm, .mp3)
                for possible_ext in ['.m4a', '.webm', '.mp3']:
                    if os.path.exists(os.path.join(download_dir, f"{filename}{possible_ext}")):
                        with self.lock:
                            item["status"] = "Completed"
                            item["progress"] = 100
                            item["speed"] = "Finished"
                        return
                
                def progress_hook(d):
                    if d['status'] == 'downloading':
                        total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                        downloaded = d.get('downloaded_bytes') or 0
                        percent = (downloaded / total) * 100 if total > 0 else 0
                        speed = d.get('speed')
                        with self.lock:
                            item["progress"] = int(percent)
                            item["speed"] = format_speed(speed)
                            
                ydl_opts = {
                    'format': 'bestaudio[ext=m4a]/bestaudio',
                    'outtmpl': temp_template,
                    'quiet': True,
                    'no_warnings': True,
                    'progress_hooks': [progress_hook],
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    downloaded_ext = info.get('ext', 'm4a')
                    
                temp_file = os.path.join(download_dir, f"{filename}.temp.{downloaded_ext}")
                final_file = os.path.join(download_dir, f"{filename}.{downloaded_ext}")
                
                with self.lock:
                    item["status"] = "Tagging"
                    item["speed"] = "Writing metadata..."
                    
                tag_file(temp_file, title, artist, album, cover_url)
                
                if os.path.exists(final_file):
                    os.remove(final_file)
                os.rename(temp_file, final_file)
                
                with self.lock:
                    item["status"] = "Completed"
                    item["progress"] = 100
                    item["speed"] = "Finished"
                    item["filename"] = os.path.basename(final_file)
                    
            # --- YouTube Video Download logic ---
            elif provider == "youtube_video":
                video_id = song_id
                url = f"https://www.youtube.com/watch?v={video_id}"
                
                # Fetch selected resolution from item
                res_val = item.get("resolution") or "720p"
                # Map to height value
                height_limit = 720
                if "4k" in res_val.lower() or "2160" in res_val:
                    height_limit = 2160
                elif "1080" in res_val:
                    height_limit = 1080
                elif "720" in res_val:
                    height_limit = 720
                elif "480" in res_val:
                    height_limit = 480
                elif "360" in res_val:
                    height_limit = 360
                
                temp_template = os.path.join(download_dir, f"{filename}.temp.%(ext)s")
                
                # Skip download if video file already exists
                already_exists = False
                for possible_ext in ['.mp4', '.mkv', '.webm']:
                    if os.path.exists(os.path.join(download_dir, f"{filename}{possible_ext}")):
                        already_exists = True
                        with self.lock:
                            item["status"] = "Completed"
                            item["progress"] = 100
                            item["speed"] = "Finished"
                            item["filename"] = f"{filename}{possible_ext}"
                        break
                
                if not already_exists:
                    def progress_hook(d):
                        if d['status'] == 'downloading':
                            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                            downloaded = d.get('downloaded_bytes') or 0
                            percent = (downloaded / total) * 100 if total > 0 else 0
                            speed = d.get('speed')
                            with self.lock:
                                item["progress"] = int(percent)
                                item["speed"] = format_speed(speed)
                                
                    import shutil
                    ffmpeg_available = shutil.which("ffmpeg") is not None or os.path.exists("ffmpeg") or os.path.exists("ffmpeg.exe")
                    if ffmpeg_available:
                        format_str = f"bestvideo[height<={height_limit}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height_limit}][ext=mp4]/best"
                    else:
                        format_str = f"best[height<={height_limit}][ext=mp4]/best"
                    
                    ydl_opts = {
                        'format': format_str,
                        'outtmpl': temp_template,
                        'quiet': True,
                        'no_warnings': True,
                        'progress_hooks': [progress_hook],
                    }
                    
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(url, download=True)
                        downloaded_ext = info.get('ext', 'mp4')
                        
                    temp_file = os.path.join(download_dir, f"{filename}.temp.{downloaded_ext}")
                    final_file = os.path.join(download_dir, f"{filename}.{downloaded_ext}")
                    
                    if downloaded_ext == 'mp4':
                        with self.lock:
                            item["status"] = "Tagging"
                            item["speed"] = "Writing metadata..."
                        try:
                            tag_file(temp_file, title, artist, album, cover_url)
                        except Exception as tag_err:
                            print("Error tagging video file:", tag_err)
                    
                    if os.path.exists(final_file):
                        os.remove(final_file)
                    os.rename(temp_file, final_file)
                    
                    with self.lock:
                        item["status"] = "Completed"
                        item["progress"] = 100
                        item["speed"] = "Finished"
                        item["filename"] = os.path.basename(final_file)
                        
            # --- Facebook Video/Reel Download logic ---
            elif provider == "facebook":
                video_url = song_id
                
                # Fetch selected resolution from item
                res_val = item.get("resolution") or "720p"
                # Map to height value
                height_limit = 720
                if "4k" in res_val.lower() or "2160" in res_val:
                    height_limit = 2160
                elif "1080" in res_val:
                    height_limit = 1080
                elif "720" in res_val:
                    height_limit = 720
                elif "480" in res_val:
                    height_limit = 480
                elif "360" in res_val:
                    height_limit = 360
                
                temp_template = os.path.join(download_dir, f"{filename}.temp.%(ext)s")
                
                # Skip download if video file already exists
                already_exists = False
                for possible_ext in ['.mp4', '.mkv', '.webm']:
                    if os.path.exists(os.path.join(download_dir, f"{filename}{possible_ext}")):
                        already_exists = True
                        with self.lock:
                            item["status"] = "Completed"
                            item["progress"] = 100
                            item["speed"] = "Finished"
                            item["filename"] = f"{filename}{possible_ext}"
                        break
                
                if not already_exists:
                    def progress_hook(d):
                        if d['status'] == 'downloading':
                            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                            downloaded = d.get('downloaded_bytes') or 0
                            percent = (downloaded / total) * 100 if total > 0 else 0
                            speed = d.get('speed')
                            with self.lock:
                                item["progress"] = int(percent)
                                item["speed"] = format_speed(speed)
                                
                    import shutil
                    ffmpeg_available = shutil.which("ffmpeg") is not None or os.path.exists("ffmpeg") or os.path.exists("ffmpeg.exe")
                    if ffmpeg_available:
                        format_str = f"bestvideo[height<={height_limit}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height_limit}][ext=mp4]/best"
                    else:
                        format_str = f"best[height<={height_limit}][ext=mp4]/best"
                    
                    ydl_opts = {
                        'format': format_str,
                        'outtmpl': temp_template,
                        'quiet': True,
                        'no_warnings': True,
                        'progress_hooks': [progress_hook],
                    }
                    
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(video_url, download=True)
                        downloaded_ext = info.get('ext', 'mp4')
                        
                    temp_file = os.path.join(download_dir, f"{filename}.temp.{downloaded_ext}")
                    final_file = os.path.join(download_dir, f"{filename}.{downloaded_ext}")
                    
                    if downloaded_ext == 'mp4':
                        with self.lock:
                            item["status"] = "Tagging"
                            item["speed"] = "Writing metadata..."
                        try:
                            tag_file(temp_file, title, artist, album, cover_url)
                        except Exception as tag_err:
                            print("Error tagging video file:", tag_err)
                    
                    if os.path.exists(final_file):
                        os.remove(final_file)
                    os.rename(temp_file, final_file)
                    
                    with self.lock:
                        item["status"] = "Completed"
                        item["progress"] = 100
                        item["speed"] = "Finished"
                        item["filename"] = os.path.basename(final_file)

            # --- Instagram Video/Reel Download logic ---
            elif provider == "instagram":
                video_url = song_id
                
                # Fetch selected resolution from item
                res_val = item.get("resolution") or "720p"
                # Map to height value
                height_limit = 720
                if "4k" in res_val.lower() or "2160" in res_val:
                    height_limit = 2160
                elif "1080" in res_val:
                    height_limit = 1080
                elif "720" in res_val:
                    height_limit = 720
                elif "480" in res_val:
                    height_limit = 480
                elif "360" in res_val:
                    height_limit = 360
                
                temp_template = os.path.join(download_dir, f"{filename}.temp.%(ext)s")
                
                # Skip download if video file already exists
                already_exists = False
                for possible_ext in ['.mp4', '.mkv', '.webm']:
                    if os.path.exists(os.path.join(download_dir, f"{filename}{possible_ext}")):
                        already_exists = True
                        with self.lock:
                            item["status"] = "Completed"
                            item["progress"] = 100
                            item["speed"] = "Finished"
                            item["filename"] = f"{filename}{possible_ext}"
                        break
                
                if not already_exists:
                    def progress_hook(d):
                        if d['status'] == 'downloading':
                            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                            downloaded = d.get('downloaded_bytes') or 0
                            percent = (downloaded / total) * 100 if total > 0 else 0
                            speed = d.get('speed')
                            with self.lock:
                                item["progress"] = int(percent)
                                item["speed"] = format_speed(speed)
                                
                    import shutil
                    ffmpeg_available = shutil.which("ffmpeg") is not None or os.path.exists("ffmpeg") or os.path.exists("ffmpeg.exe")
                    if ffmpeg_available:
                        format_str = f"bestvideo[height<={height_limit}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height_limit}][ext=mp4]/best"
                    else:
                        format_str = f"best[height<={height_limit}][ext=mp4]/best"
                    
                    ydl_opts = {
                        'format': format_str,
                        'outtmpl': temp_template,
                        'quiet': True,
                        'no_warnings': True,
                        'progress_hooks': [progress_hook],
                    }
                    
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(video_url, download=True)
                        downloaded_ext = info.get('ext', 'mp4')
                        
                    temp_file = os.path.join(download_dir, f"{filename}.temp.{downloaded_ext}")
                    final_file = os.path.join(download_dir, f"{filename}.{downloaded_ext}")
                    
                    if downloaded_ext == 'mp4':
                        with self.lock:
                            item["status"] = "Tagging"
                            item["speed"] = "Writing metadata..."
                        try:
                            tag_file(temp_file, title, artist, album, cover_url)
                        except Exception as tag_err:
                            print("Error tagging video file:", tag_err)
                    
                    if os.path.exists(final_file):
                        os.remove(final_file)
                    os.rename(temp_file, final_file)
                    
                    with self.lock:
                        item["status"] = "Completed"
                        item["progress"] = 100
                        item["speed"] = "Finished"
                        item["filename"] = os.path.basename(final_file)
                        
        except Exception as e:
            print("Download process error:", e)
            # Try cleaning up temp files
            try:
                for f in os.listdir(download_dir):
                    if f.startswith(f"{filename}.temp"):
                        os.remove(os.path.join(download_dir, f))
            except Exception:
                pass
                
            with self.lock:
                item["status"] = "Failed"
                item["error"] = str(e)
                item["speed"] = "Failed"

# Global Queue Manager Instance
queue_manager = DownloadQueueManager()

# --- Flask Routes ---

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/config', methods=['GET', 'POST'])
def handle_config():
    if request.method == 'POST':
        data = request.json
        current = load_config()
        if 'download_dir' in data:
            current['download_dir'] = data['download_dir']
        save_config(current)
        return jsonify({"status": "success", "config": current})
    else:
        return jsonify(load_config())

@app.route('/api/select-folder', methods=['POST'])
def select_folder():
    folder_selected = [None]
    
    # We must run tkinter on a separate thread to not lock Flask,
    # but Windows handles it fine if we run it in a daemon thread.
    def show_dialog():
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            folder = filedialog.askdirectory(parent=root, title="Select Song Download Directory")
            root.destroy()
            if folder:
                folder_selected[0] = os.path.abspath(folder)
        except Exception as ex:
            print("Tkinter dialog error:", ex)
            
    dialog_thread = threading.Thread(target=show_dialog)
    dialog_thread.start()
    dialog_thread.join()
    
    if folder_selected[0]:
        config = load_config()
        config['download_dir'] = folder_selected[0]
        save_config(config)
        return jsonify({"status": "success", "download_dir": folder_selected[0]})
    else:
        return jsonify({"status": "cancelled"})

# ── Search Helpers ───────────────────────────────────────────────────────────
from urllib.parse import quote_plus

def fetch_jiosaavn_search(query, page=1, per_page=50, total_pages=1):
    """Fetches multiple JioSaavn pages concurrently. total_pages=15 → ~700 results."""
    import html
    from concurrent.futures import ThreadPoolExecutor, as_completed
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
    }

    def _fetch_page(p):
        encoded = quote_plus(query)
        url = (f"https://www.jiosaavn.com/api.php?__call=search.getResults"
               f"&_format=json&_marker=0&api_version=4&ctx=web6dot0"
               f"&q={encoded}&query={encoded}&n={per_page}&p={p}")
        try:
            res = requests.get(url, headers=headers, timeout=12)
            data = res.json()
            page_results = []
            for s in data.get('results', []):
                image_url = s.get('image', '').replace('150x150', '500x500').replace('50x50', '500x500')
                title  = html.unescape(s.get('song')  or s.get('title') or '')
                artist = html.unescape(s.get('singers') or s.get('primary_artists') or s.get('music') or '')
                album  = html.unescape(s.get('album') or '')
                if not title:
                    continue
                page_results.append({
                    "id":            s.get('id'),
                    "title":         title,
                    "artist":        artist,
                    "album":         album,
                    "cover":         image_url,
                    "provider":      "jiosaavn",
                    "download_info": s.get('encrypted_media_url')
                })
            return page_results
        except Exception as e:
            print(f"JioSaavn page {p} error:", e)
            return []

    pages_to_fetch = list(range(page, page + total_pages))
    all_results = []
    seen_ids = set()

    with ThreadPoolExecutor(max_workers=min(total_pages, 15)) as executor:
        futures = {executor.submit(_fetch_page, p): p for p in pages_to_fetch}
        for future in as_completed(futures):
            for item in future.result():
                if item['id'] and item['id'] not in seen_ids:
                    seen_ids.add(item['id'])
                    all_results.append(item)

    return all_results

def fetch_ytmusic_search(query, limit=50):
    """Searches YouTube Music — ytmusicapi first, yt-dlp fallback."""
    songs_list = []
    # 1. Try ytmusicapi
    try:
        yt = YTMusic()
        results = yt.search(query, filter="songs", limit=limit)
        for r in results:
            artists_str = ", ".join([a['name'] for a in r.get('artists', [])])
            thumbnails = r.get('thumbnails', [])
            cover = thumbnails[-1]['url'] if thumbnails else ""
            songs_list.append({
                "id": r.get('videoId'),
                "title": r.get('title'),
                "artist": artists_str,
                "album": r.get('album', {}).get('name') if r.get('album') else 'Single',
                "cover": cover,
                "provider": "ytmusic"
            })
        if songs_list:
            return songs_list
    except Exception as e:
        print("ytmusicapi failed, using yt-dlp fallback. Error:", e)

    # 2. yt-dlp fallback with higher limit
    try:
        ydl_opts = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
            for entry in (result.get('entries') or []):
                if entry and entry.get('id'):
                    songs_list.append({
                        "id": entry['id'],
                        "title": entry.get('title',''),
                        "artist": entry.get('uploader') or 'YouTube Music',
                        "album": 'YouTube',
                        "cover": entry.get('thumbnail') or '',
                        "provider": "ytmusic"
                    })
    except Exception as dlp_err:
        print("yt-dlp search failed. Error:", dlp_err)
    return songs_list

def fetch_youtube_video_search(query, limit=50):
    """Searches YouTube for videos using yt-dlp."""
    videos_list = []
    try:
        ydl_opts = {'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
            for entry in (result.get('entries') or []):
                if entry and entry.get('id'):
                    duration = entry.get('duration')
                    videos_list.append({
                        "id": entry['id'],
                        "title": entry.get('title',''),
                        "artist": entry.get('uploader') or 'YouTube Video',
                        "album": 'YouTube Video',
                        "cover": entry.get('thumbnail') or f"https://img.youtube.com/vi/{entry['id']}/mqdefault.jpg",
                        "duration": duration,
                        "provider": "youtube_video"
                    })
    except Exception as dlp_err:
        print("yt-dlp video search failed. Error:", dlp_err)
    return videos_list

@app.route('/api/search', methods=['GET'])
def search_songs():
    query   = request.args.get('query', '').strip()
    provider = request.args.get('provider', 'combined')
    page    = int(request.args.get('page', 1))
    limit   = int(request.args.get('limit', 50))

    if not query:
        return jsonify({"error": "Empty search query"}), 400

    if provider == 'jiosaavn':
        # Single-provider: fetch 5 pages concurrently → ~200 results
        results = fetch_jiosaavn_search(query, page=page, per_page=50, total_pages=5)
        return jsonify({"results": results, "page": page, "total": len(results)})

    elif provider == 'ytmusic':
        results = fetch_ytmusic_search(query, limit=250)
        return jsonify({"results": results, "page": page, "total": len(results)})

    elif provider == 'youtube_video':
        results = fetch_youtube_video_search(query, limit=limit)
        return jsonify({"results": results, "page": page, "total": len(results)})

    elif provider == 'combined':
        saavn_results, yt_results = [], []
        # JioSaavn: 15 pages × ~50 = ~750 results (all fetched in parallel)
        t1 = threading.Thread(target=lambda: saavn_results.extend(
            fetch_jiosaavn_search(query, page=1, per_page=50, total_pages=15)))
        # YouTube: 250 results via yt-dlp
        t2 = threading.Thread(target=lambda: yt_results.extend(
            fetch_ytmusic_search(query, limit=250)))
        t1.start(); t2.start()
        t1.join(timeout=30); t2.join(timeout=30)

        # Interleave: 3 JioSaavn : 1 YT for good variety
        combined_results = []
        yt_idx = 0
        saavn_idx = 0
        while saavn_idx < len(saavn_results) or yt_idx < len(yt_results):
            for _ in range(3):
                if saavn_idx < len(saavn_results):
                    combined_results.append(saavn_results[saavn_idx])
                    saavn_idx += 1
            if yt_idx < len(yt_results):
                combined_results.append(yt_results[yt_idx])
                yt_idx += 1

        return jsonify({"results": combined_results, "page": page, "total": len(combined_results)})

    return jsonify({"error": "Invalid provider"}), 400

# ── Preview: get a streamable URL for a song without downloading ──────────────
@app.route('/api/preview', methods=['GET'])
def preview_song():
    """Returns a direct audio stream URL for in-browser preview playback."""
    provider = request.args.get('provider', '')
    song_id  = request.args.get('id', '')
    enc_url  = request.args.get('enc', '')  # JioSaavn encrypted_media_url

    if not song_id:
        return jsonify({"error": "No song ID"}), 400

    if provider == 'jiosaavn':
        try:
            # If we already have the encrypted URL from search results, use it
            if enc_url:
                dec = decrypt_url(enc_url)
            else:
                # Fetch song details to get the encrypted URL
                headers = {"User-Agent": "Mozilla/5.0"}
                r = requests.get(
                    f"https://www.jiosaavn.com/api.php?__call=song.getDetails&_format=json&pids={song_id}",
                    headers=headers, timeout=10)
                details = r.json()
                enc = details.get(song_id, {}).get('encrypted_media_url')
                if not enc:
                    return jsonify({"error": "No stream URL found"}), 404
                dec = decrypt_url(enc)

            if not dec:
                return jsonify({"error": "Decryption failed"}), 500

            stream_url = get_high_quality_url(dec)
            return jsonify({"url": stream_url})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif provider == 'ytmusic':
        try:
            ydl_opts = {
                'quiet': True, 'no_warnings': True,
                'format': 'bestaudio[ext=m4a]/bestaudio',
                'skip_download': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://music.youtube.com/watch?v={song_id}", download=False)
                audio_url = info.get('url')
                if not audio_url:
                    # fallback: pick from requested_formats or formats
                    for fmt in (info.get('requested_formats') or info.get('formats') or []):
                        if fmt.get('acodec') != 'none':
                            audio_url = fmt.get('url')
                            break
                if audio_url:
                    return jsonify({"url": audio_url})
                return jsonify({"error": "Could not extract audio URL"}), 500
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif provider == 'youtube_video':
        try:
            ydl_opts = {
                'quiet': True, 'no_warnings': True,
                'format': 'best[ext=mp4]/best',
                'skip_download': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={song_id}", download=False)
                video_url = info.get('url')
                if not video_url:
                    for fmt in (info.get('requested_formats') or info.get('formats') or []):
                        if fmt.get('vcodec') != 'none' and fmt.get('acodec') != 'none':
                            video_url = fmt.get('url')
                            break
                if not video_url:
                    video_url = info.get('url')
                if video_url:
                    return jsonify({"url": video_url})
                return jsonify({"error": "Could not extract video stream URL"}), 500
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif provider == 'facebook':
        try:
            ydl_opts = {
                'quiet': True, 'no_warnings': True,
                'format': 'best[ext=mp4]/best',
                'skip_download': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(song_id, download=False)
                video_url = info.get('url')
                if not video_url:
                    for fmt in (info.get('requested_formats') or info.get('formats') or []):
                        if fmt.get('vcodec') != 'none' and fmt.get('acodec') != 'none':
                            video_url = fmt.get('url')
                            break
                if not video_url:
                    video_url = info.get('url')
                if video_url:
                    return jsonify({"url": video_url})
                return jsonify({"error": "Could not extract Facebook video stream URL"}), 500
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif provider == 'instagram':
        try:
            ydl_opts = {
                'quiet': True, 'no_warnings': True,
                'format': 'best[ext=mp4]/best',
                'skip_download': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(song_id, download=False)
                video_url = info.get('url')
                if not video_url:
                    for fmt in (info.get('requested_formats') or info.get('formats') or []):
                        if fmt.get('vcodec') != 'none' and fmt.get('acodec') != 'none':
                            video_url = fmt.get('url')
                            break
                if not video_url:
                    video_url = info.get('url')
                if video_url:
                    return jsonify({"url": video_url})
                return jsonify({"error": "Could not extract Instagram video stream URL"}), 500
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Invalid provider"}), 400

# ── Serve downloaded file for in-app playback ─────────────────────────────────
@app.route('/api/play')
def play_file():
    """Stream a downloaded audio file to the browser."""
    filename = request.args.get('file')
    if not filename:
        return jsonify({"error": "No file specified"}), 400
    config = load_config()
    dl_dir = config.get('download_dir', '')
    # Security: only serve files inside the configured download directory
    safe_path = os.path.realpath(os.path.join(dl_dir, filename))
    if not safe_path.startswith(os.path.realpath(dl_dir)):
        return jsonify({"error": "Access denied"}), 403
    if not os.path.exists(safe_path):
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(dl_dir, filename, as_attachment=False)

# ── Library: list all downloaded audio files ─────────────────────────────────
@app.route('/api/library', methods=['GET'])
def get_library():
    """Return metadata for all audio files in the download directory."""
    config = load_config()
    dl_dir = config.get('download_dir', '')
    if not dl_dir or not os.path.exists(dl_dir):
        return jsonify({"files": [], "total": 0})

    MEDIA_EXTS = {'.m4a', '.mp3', '.webm', '.opus', '.flac', '.ogg', '.mp4', '.mkv'}
    files_data = []

    try:
        for fname in sorted(os.listdir(dl_dir)):
            fpath = os.path.join(dl_dir, fname)
            if not os.path.isfile(fpath):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext not in MEDIA_EXTS:
                continue

            # Try to read tags via mutagen
            title, artist, album, cover_url = fname, 'Unknown Artist', 'Unknown Album', ''
            try:
                audio = mutagen.File(fpath)
                if audio:
                    tags = audio.tags or {}
                    # M4A / MP4
                    if ext in ['.m4a', '.mp4']:
                        title  = str(tags.get('\xa9nam', [fname])[0])
                        artist = str(tags.get('\xa9ART', ['Unknown Artist'])[0])
                        album  = str(tags.get('\xa9alb', ['Unknown Album'])[0])
                    # MP3 ID3
                    elif ext == '.mp3':
                        title  = str(tags.get('TIT2', fname))
                        artist = str(tags.get('TPE1', 'Unknown Artist'))
                        album  = str(tags.get('TALB', 'Unknown Album'))
                    # WebM / Vorbis
                    else:
                        title  = str(tags.get('title',  [fname])[0]) if isinstance(tags.get('title'), list) else str(tags.get('title', fname))
                        artist = str(tags.get('artist', ['Unknown'])[0]) if isinstance(tags.get('artist'), list) else str(tags.get('artist', 'Unknown'))
                        album  = str(tags.get('album',  [''])[0]) if isinstance(tags.get('album'), list) else str(tags.get('album', ''))
            except Exception:
                pass

            is_video_file = ext in ['.mp4', '.mkv']
            size_mb = round(os.path.getsize(fpath) / (1024 * 1024), 2)
            files_data.append({
                "filename": fname,
                "title":    title,
                "artist":   artist,
                "album":    album,
                "cover":    cover_url,
                "size_mb":  size_mb,
                "ext":      ext,
                "is_video": is_video_file
            })
    except Exception as e:
        print("Library scan error:", e)

    return jsonify({"files": files_data, "total": len(files_data)})


@app.route('/api/resolve', methods=['POST'])
def resolve_link():
    data = request.json
    url = data.get('url')
    is_video = data.get('is_video', False)
    if not url:
        return jsonify({"error": "URL parameter missing"}), 400
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    url = url.strip()
    
    # 1. Check if JioSaavn URL
    if "jiosaavn.com" in url:
        # Regex parsing
        song_match = re.search(r'/song/[^/]+/([^/]+)', url)
        album_match = re.search(r'/album/[^/]+/([^/]+)', url)
        playlist_match = re.search(r'/(featured|playlist)/[^/]+/([^/]+)', url)
        
        try:
            if song_match:
                token = song_match.group(1)
                res = requests.get(f"https://www.jiosaavn.com/api.php?__call=song.getDetails&_format=json&pids={token}", headers=headers, timeout=15)
                song_details = res.json()
                # Parse single song details
                if token in song_details:
                    s = song_details[token]
                    image_url = s.get('image', '').replace('150x150', '500x500')
                    return jsonify({
                        "type": "song",
                        "songs": [{
                            "id": s.get('id'),
                            "title": s.get('song'),
                            "artist": s.get('singers', ''),
                            "album": s.get('album', ''),
                            "cover": image_url,
                            "provider": "jiosaavn",
                            "download_info": s.get('encrypted_media_url')
                        }]
                    })
                return jsonify({"error": "Song not found on JioSaavn"}), 404
                
            elif album_match:
                token = album_match.group(1)
                # Resolve token to get album details
                res = requests.get(f"https://www.jiosaavn.com/api.php?__call=webapi.get&token={token}&type=album&_format=json", headers=headers, timeout=15)
                album_info = res.json()
                songs_list = []
                songs = album_info.get('list', []) or album_info.get('songs', [])
                for s in songs:
                    image_url = s.get('image', '').replace('150x150', '500x500')
                    songs_list.append({
                        "id": s.get('id'),
                        "title": s.get('song') or s.get('title'),
                        "artist": s.get('singers') or s.get('primary_artists', ''),
                        "album": album_info.get('title') or album_info.get('name', 'Album'),
                        "cover": image_url,
                        "provider": "jiosaavn",
                        "download_info": s.get('encrypted_media_url')
                    })
                return jsonify({
                    "type": "album",
                    "title": album_info.get('title') or album_info.get('name'),
                    "songs": songs_list
                })
                
            elif playlist_match:
                token = playlist_match.group(2)
                # Resolve token first to get listid
                res_tok = requests.get(f"https://www.jiosaavn.com/api.php?__call=webapi.get&token={token}&type=playlist&_format=json", headers=headers, timeout=15)
                playlist_basic = res_tok.json()
                listid = playlist_basic.get('listid')
                
                if not listid:
                    return jsonify({"error": "Failed to resolve JioSaavn playlist token"}), 400
                    
                # Fetch detailed playlist songs (up to 200)
                res_det = requests.get(f"https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&listid={listid}&n=250", headers=headers, timeout=15)
                playlist_info = res_det.json()
                
                songs_list = []
                songs = playlist_info.get('list', []) or playlist_info.get('songs', [])
                for s in songs:
                    image_url = s.get('image', '').replace('150x150', '500x500')
                    songs_list.append({
                        "id": s.get('id'),
                        "title": s.get('song') or s.get('title'),
                        "artist": s.get('singers') or s.get('primary_artists', ''),
                        "album": s.get('album', 'Playlist'),
                        "cover": image_url,
                        "provider": "jiosaavn",
                        "download_info": s.get('encrypted_media_url')
                    })
                return jsonify({
                    "type": "playlist",
                    "title": playlist_info.get('listname') or playlist_info.get('name'),
                    "songs": songs_list
                })
                
            else:
                return jsonify({"error": "Could not identify JioSaavn URL format. Make sure it is a song, album, or playlist URL."}), 400
        except Exception as e:
            return jsonify({"error": f"JioSaavn resolve error: {str(e)}"}), 500
            
    # 2. Check if YouTube Music URL
    elif "youtube.com" in url or "youtu.be" in url or "music.youtube" in url:
        try:
            yt = YTMusic()
            # Check if it is a playlist URL
            playlist_match = re.search(r'[&?]list=([^&]+)', url)
            video_match = re.search(r'(?:watch\?v=|/shorts/|/embed/|youtu\.be/)([^&?/]+)', url)
            
            if playlist_match:
                playlist_id = playlist_match.group(1)
                # YouTube Music playlistId might need VL prefix stripped if we query, but YTMusic API handles VL prefix fine.
                p_details = yt.get_playlist(playlist_id, limit=250)
                songs_list = []
                for r in p_details.get('tracks', []):
                    artists_str = ", ".join([a['name'] for a in r.get('artists', [])])
                    cover = ""
                    thumbnails = r.get('thumbnails', [])
                    if thumbnails:
                        cover = thumbnails[-1]['url']
                        
                    songs_list.append({
                        "id": r.get('videoId'),
                        "title": r.get('title'),
                        "artist": artists_str,
                        "album": r.get('album', {}).get('name') if r.get('album') else 'N/A',
                        "cover": cover,
                        "provider": "youtube_video" if is_video else "ytmusic"
                    })
                return jsonify({
                    "type": "playlist",
                    "title": p_details.get('title'),
                    "songs": songs_list
                })
                
            elif video_match:
                video_id = video_match.group(1)
                # We can't fetch single details easily via public ytmusic without a search or direct scraping,
                # but we can call yt_dlp to get details or search by ID
                ydl_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'extract_flat': True,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    cover = ""
                    thumbnails = info.get('thumbnails', [])
                    if thumbnails:
                        cover = thumbnails[-1]['url']
                        
                    return jsonify({
                        "type": "song",
                        "songs": [{
                            "id": video_id,
                            "title": info.get('title'),
                            "artist": info.get('uploader') or info.get('artist', 'Unknown Artist'),
                            "album": "Single",
                            "cover": cover,
                            "provider": "youtube_video" if is_video else "ytmusic"
                        }]
                    })
            else:
                return jsonify({"error": "Could not identify YouTube Video ID or Playlist ID from URL."}), 400
        except Exception as e:
            return jsonify({"error": f"YouTube resolve error: {str(e)}"}), 500

    # 3. Check if Facebook URL
    elif "facebook.com" in url or "fb.watch" in url or "fb.gg" in url or "fb.com" in url:
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                cover = ""
                thumbnails = info.get('thumbnails', [])
                if thumbnails:
                    cover = thumbnails[-1]['url']
                
                title = info.get('title') or "Facebook Video"
                uploader = info.get('uploader') or info.get('uploader_id') or "Unknown Uploader"
                duration = info.get('duration')
                
                return jsonify({
                    "type": "song",
                    "songs": [{
                        "id": url,
                        "title": title,
                        "artist": uploader,
                        "album": "Facebook",
                        "cover": cover,
                        "duration": duration,
                        "provider": "facebook"
                    }]
                })
        except Exception as e:
            return jsonify({"error": f"Facebook resolve error: {str(e)}"}), 500

    # 4. Check if Instagram URL
    elif "instagram.com" in url or "instagr.am" in url:
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                cover = ""
                thumbnails = info.get('thumbnails', [])
                if thumbnails:
                    cover = thumbnails[-1]['url']
                
                title = info.get('title') or "Instagram Video"
                uploader = info.get('uploader') or info.get('uploader_id') or "Unknown User"
                duration = info.get('duration')
                
                if title and len(title) > 80:
                    title = title[:77] + "..."
                
                return jsonify({
                    "type": "song",
                    "songs": [{
                        "id": url,
                        "title": title,
                        "artist": uploader,
                        "album": "Instagram",
                        "cover": cover,
                        "duration": duration,
                        "provider": "instagram"
                    }]
                })
        except Exception as e:
            return jsonify({"error": f"Instagram resolve error: {str(e)}"}), 500
            
    return jsonify({"error": "Unsupported URL host. Please paste a JioSaavn, YouTube, Facebook, or Instagram link."}), 400

@app.route('/api/download', methods=['POST'])
def add_download():
    data = request.json
    songs = data.get('songs', [])
    
    if not songs:
        return jsonify({"error": "No songs specified"}), 400
        
    count = 0
    for s in songs:
        success = queue_manager.add_to_queue(
            song_id=s.get('id'),
            title=s.get('title'),
            artist=s.get('artist'),
            album=s.get('album'),
            cover_url=s.get('cover'),
            provider=s.get('provider'),
            download_info=s.get('download_info'),
            resolution=s.get('resolution')
        )
        if success:
            count += 1
            
    return jsonify({"status": "success", "added": count})

@app.route('/api/queue-status', methods=['GET'])
def get_queue_status():
    return jsonify({"queue": queue_manager.get_status_list()})

@app.route('/api/queue-clear', methods=['POST'])
def clear_queue():
    action = request.json.get('action', 'completed')
    if action == 'completed':
        queue_manager.clear_completed()
    else:
        queue_manager.clear_all()
    return jsonify({"status": "success", "queue": queue_manager.get_status_list()})

# Run the app
if __name__ == '__main__':
    # Try port 5000, fallback to 5001 if occupied
    try:
        app.run(host='127.0.0.1', port=5000, debug=True)
    except SystemExit:
        app.run(host='127.0.0.1', port=5001, debug=True)
