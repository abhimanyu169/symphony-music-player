import os
import re
import time
import json
import asyncio
import hashlib
import sqlite3
import uuid
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, HTTPException, status, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from ytmusicapi import YTMusic
import yt_dlp
import redis
import httpx
import jwt
import bcrypt

# FastAPI Lifespan Context Manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB on startup
    await init_db()
    # Initialize Redis connection
    init_redis()
    yield
    # Shutdown logic
    if redis_client:
        try:
            redis_client.close()
        except:
            pass

app = FastAPI(title="Symphony API Backend", version="2.0.0", lifespan=lifespan)

# Private Network Access & CORS Middleware
@app.middleware("http")
async def add_private_network_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        response.headers["Access-Control-Max-Age"] = "86400"
        return response
        
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://sound-wave-92614.web.app",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5000",
        "http://localhost:5000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Constants
DB_PATH = os.path.join(os.path.dirname(__file__), "symphony.db")
JWT_SECRET = os.environ.get("JWT_SECRET", "symphony-super-secret-key-1234567890-xyz")
JWT_ALGORITHM = "HS256"
JIOSAAVN_API_BASE = "https://saavn.sumit.co/api"

# Initialize YTMusic in-thread wrapper
ytmusic = YTMusic()

# Redis Setup & Connection Check
redis_client: Optional[redis.Redis] = None

def init_redis():
    global redis_client
    try:
        redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        redis_client.ping()
        print("Connected to Redis successfully.")
    except Exception as e:
        print(f"Redis is not available ({e}). Using local in-memory fallback cache.")
        redis_client = None

# Local In-Memory Cache Fallback
local_memory_cache = {}

def get_cache(key: str) -> Optional[str]:
    if redis_client:
        try:
            return redis_client.get(key)
        except Exception as e:
            print(f"Redis get failed: {e}")
    # Local fallback
    if key in local_memory_cache:
        val, expiry = local_memory_cache[key]
        if expiry > time.time():
            return val
        else:
            del local_memory_cache[key]
    return None

def set_cache(key: str, val: str, ttl_seconds: int = 7200):
    if redis_client:
        try:
            redis_client.set(key, val, ex=ttl_seconds)
            return
        except Exception as e:
            print(f"Redis set failed: {e}")
    # Local fallback
    local_memory_cache[key] = (val, time.time() + ttl_seconds)

# Asynchronous Database Setup using aiosqlite
import aiosqlite

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        # Create users table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create library table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                song_id TEXT NOT NULL,
                song_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, song_id)
            )
        """)
        
        # Create shared_playlists table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS shared_playlists (
                share_id TEXT PRIMARY KEY,
                playlist_title TEXT,
                song_data TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        
        # Create Indexes to speed up queries
        await db.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_library_user_id ON library(user_id)")
        await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_library_user_song ON library(user_id, song_id)")
        
        await db.commit()
    print("SQLite Database initialized and indexed.")

# Password Hashing & JWT Session Management
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def create_jwt_token(user_id: int, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": int(time.time()) + 2592000  # Token valid for 30 days
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        print("JWT token expired.")
        return None
    except jwt.InvalidTokenError as e:
        print(f"JWT token invalid: {e}")
        return None

# Dependency to check user authentication token
async def get_current_user(request: Request) -> int:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid token scheme. Bearer token required."
        )
    token = auth_header.split(" ")[1]
    payload = decode_jwt_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid token."
        )
    return int(payload["sub"])

# Pydantic Schemas
class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class LibrarySync(BaseModel):
    songs: List[dict]

class PlaylistShare(BaseModel):
    title: str
    songs: List[dict]

# Auth Endpoints
@app.post("/api/auth/signup")
async def signup(user_data: UserSignup):
    email_clean = user_data.email.strip().lower()
    async with aiosqlite.connect(DB_PATH) as db:
        # Check if email exists
        async with db.execute("SELECT id FROM users WHERE email = ?", (email_clean,)) as cursor:
            row = await cursor.fetchone()
            if row:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An account with this email address already exists."
                )
        
        # Save new user
        password_hashed = hash_password(user_data.password)
        await db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (user_data.name.strip(), email_clean, password_hashed)
        )
        await db.commit()
        
        # Retrieve newly inserted ID
        async with db.execute("SELECT id FROM users WHERE email = ?", (email_clean,)) as cursor:
            row = await cursor.fetchone()
            new_id = row[0]
            
    token = create_jwt_token(new_id, email_clean)
    return {
        "success": True,
        "token": token,
        "user": {
            "id": new_id,
            "name": user_data.name.strip(),
            "email": email_clean
        }
    }

@app.post("/api/auth/login")
async def login(user_data: UserLogin):
    email_clean = user_data.email.strip().lower()
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT id, password_hash, name FROM users WHERE email = ?", (email_clean,)) as cursor:
            row = await cursor.fetchone()
            if not row or not verify_password(user_data.password, row[1]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password credentials."
                )
            user_id, _, name = row
            
    token = create_jwt_token(user_id, email_clean)
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user_id,
            "name": name,
            "email": email_clean
        }
    }

@app.get("/api/auth/verify")
async def verify(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return {"success": False, "authenticated": False}
    token = auth_header.split(" ")[1]
    payload = decode_jwt_token(token)
    if not payload:
        return {"success": False, "authenticated": False}
    
    # Get user details from SQLite
    user_id = payload["sub"]
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT name, email FROM users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return {"success": False, "authenticated": False}
            name, email = row
            
    return {
        "success": True,
        "authenticated": True,
        "user": {
            "id": user_id,
            "name": name,
            "email": email
        }
    }

# User Library Sync Endpoints
@app.post("/api/library/sync")
async def sync_library(data: LibrarySync, user_id: int = Depends(get_current_user)):
    songs = data.songs
    async with aiosqlite.connect(DB_PATH) as db:
        # We perform sync using transaction
        # First, clear previous likes (or merge). To match Firestore behavior,
        # we overwrite the user's liked list with the local list sent from client.
        await db.execute("DELETE FROM library WHERE user_id = ?", (user_id,))
        
        # Bulk insert
        for song in songs:
            song_id = song.get("id")
            if not song_id:
                continue
            song_data_json = json.dumps(song)
            await db.execute(
                "INSERT OR REPLACE INTO library (user_id, song_id, song_data) VALUES (?, ?, ?)",
                (user_id, str(song_id), song_data_json)
            )
        await db.commit()
    return {"success": True, "message": f"Successfully backed up {len(songs)} songs to SQLite."}

@app.get("/api/library/sync")
async def get_library(user_id: int = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT song_data FROM library WHERE user_id = ? ORDER BY created_at ASC", (user_id,)) as cursor:
            rows = await cursor.fetchall()
            songs = [json.loads(row[0]) for row in rows]
    return {"success": True, "likedSongs": songs}

@app.post("/api/playlist/share")
async def share_playlist(data: PlaylistShare, request: Request):
    title = data.title
    songs = data.songs
    
    # Generate unique 8-character share ID using uuid.uuid4()
    share_id = str(uuid.uuid4())[:8]
    
    # Determine origin dynamically, fallback to 127.0.0.1:5500 (frontend)
    origin = "http://127.0.0.1:5500"
    referer = request.headers.get("referer")
    if referer:
        from urllib.parse import urlparse
        parsed = urlparse(referer)
        if parsed.netloc:
            origin = f"{parsed.scheme}://{parsed.netloc}"
    else:
        origin_header = request.headers.get("origin")
        if origin_header:
            origin = origin_header
            
    share_url = f"{origin}/?shared_id={share_id}"
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO shared_playlists (share_id, playlist_title, song_data, created_at) VALUES (?, ?, ?, ?)",
            (share_id, title, json.dumps(songs), datetime.utcnow().isoformat())
        )
        await db.commit()
        
    return {"share_id": share_id, "share_url": share_url}

@app.get("/api/playlist/share/{share_id}")
async def get_shared_playlist(share_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT playlist_title, song_data FROM shared_playlists WHERE share_id = ?",
            (share_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Shared playlist not found.")
            title, song_data = row
            songs = json.loads(song_data)
            
    return {"title": title, "songs": songs}

# Deduplication Helpers
def get_song_version_key(song: dict) -> str:
    if not song:
        return ""
    
    # 1. Title normalization
    title = song.get("name", song.get("title", "")).lower().strip()
    
    # 2. Version marker identification
    version = "original"
    markers = [
        {"key": "lofi", "patterns": ["lo-fi", "lofi", "chillout", "ambient"]},
        {"key": "remix", "patterns": ["remix", "mix", "re-mix", "club mix", "house mix"]},
        {"key": "dj", "patterns": ["dj", "d.j."]},
        {"key": "mashup", "patterns": ["mashup", "mash-up", "medley"]},
        {"key": "slowed", "patterns": ["slowed", "reverb", "slowed+reverb", "slowed & reverb"]},
        {"key": "acoustic", "patterns": ["acoustic", "unplugged", "piano version"]},
        {"key": "cover", "patterns": ["cover", "tribute"]},
        {"key": "instrumental", "patterns": ["instrumental"]},
        {"key": "sad", "patterns": ["sad version", "sad song"]},
        {"key": "female", "patterns": ["female version", "female cover", "female voice"]},
        {"key": "male", "patterns": ["male version", "male cover"]},
        {"key": "live", "patterns": ["live performance", "live version", "live in"]}
    ]
    
    for marker in markers:
        for pattern in marker["patterns"]:
            if pattern in title:
                version = marker["key"]
                break
        if version != "original":
            break
            
    # 3. Clean the title to get base title
    base_title = title
    
    # Remove brackets/parentheses and their content if they match version/video/audio info
    base_title = re.sub(r'[\(\[\{][^\)\]\}]*(lo-fi|lofi|remix|dj|mashup|slowed|reverb|acoustic|unplugged|cover|instrumental|version|lyrics|video|audio|hq|hd|official|from)[^\)\]\}]*[\)\]\}]', '', base_title)
    
    # Remove specific version patterns
    for marker in markers:
        for pattern in marker["patterns"]:
            base_title = base_title.replace(pattern, "")
            
    # Remove generic keywords
    words_to_remove = ["original", "lyrics", "video", "audio", "official", "version", "full song", "full video", "hd", "hq", "lq", "song"]
    for word in words_to_remove:
        base_title = re.sub(r'\b' + word + r'\b', '', base_title)
        
    # Keep only letters and numbers
    base_title = re.sub(r'[^a-z0-9]', '', base_title).strip()
    if not base_title:
        base_title = re.sub(r'[^a-z0-9]', '', title)
        
    # 4. Get artist normalization
    artist_name = ""
    artists = song.get("artists", {})
    if isinstance(artists, dict) and "primary" in artists:
        primary = artists["primary"]
        if isinstance(primary, list):
            artist_name = " ".join([a.get("name", "") for a in primary if isinstance(a, dict)])
    elif song.get("artist"):
        artist_name = song.get("artist")
        
    norm_artist = re.sub(r'[^a-z0-9]', '', artist_name.lower())
    if not norm_artist and song.get("album", {}):
        norm_album = song.get("album", {}).get("name", "")
        if norm_album:
            norm_artist = re.sub(r'[^a-z0-9]', '', norm_album.lower())
            
    return f"{base_title}|{version}|{norm_artist}"

def deduplicate_songs(songs: List[dict]) -> List[dict]:
    if not songs:
        return []
    seen = set()
    deduped = []
    for song in songs:
        if not song:
            continue
        key = get_song_version_key(song)
        if not key:
            continue
        if key not in seen:
            seen.add(key)
            deduped.append(song)
    return deduped

# Asynchronous JioSaavn Search Helper
async def fetch_saavn_search(query: str, page: int, limit: int) -> List[dict]:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(
                f"{JIOSAAVN_API_BASE}/search/songs",
                params={"query": query, "page": page, "limit": limit}
            )
            if res.status_code == 200:
                data = res.json()
                if data.get("success"):
                    return data.get("data", {}).get("results", [])
    except Exception as e:
        print(f"JioSaavn fetch failed: {e}")
    return []

# Search Route with concurrent API calls, python deduplication, and Redis caching
@app.get("/api/yt/search")
async def search_songs(query: str, page: int = 0, limit: int = 24):
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query parameter is required."
        )
    
    # 1. Try to read from cache (Redis/Local memory)
    cache_key = f"search:{query}:{page}:{limit}"
    cached_val = get_cache(cache_key)
    if cached_val:
        try:
            return JSONResponse(content=json.loads(cached_val))
        except Exception:
            pass
            
    # 2. Cache miss: Fetch concurrently from YouTube Music and JioSaavn
    
    # 2.1 Fetch YouTube Music (YTMusicapi is blocking, so run in standard threadpool)
    async def fetch_yt_search():
        try:
            # run_in_threadpool / asyncio.to_thread makes it non-blocking
            results = await asyncio.to_thread(ytmusic.search, query, filter="songs", limit=limit)
            formatted = []
            for item in results:
                images = [{"quality": f"{img.get('width', 0)}x{img.get('height', 0)}", "url": img['url']} for img in item.get('thumbnails', [])]
                artists = [{"name": a['name'], "id": a.get('id')} for a in item.get('artists', [])]
                video_id = item.get('videoId')
                if not video_id:
                    continue
                formatted.append({
                    "id": video_id,
                    "name": item.get('title', 'Unknown Title'),
                    "image": images,
                    "artists": {"primary": artists},
                    "album": {"name": item.get('album', {}).get('name') if item.get('album') else None},
                    "duration": item.get('duration_seconds'),
                    "downloadUrl": [{"quality": "320kbps", "url": f"http://127.0.0.1:5000/api/yt/stream?id={video_id}"}],
                    "source": "ytmusic"
                })
            return formatted
        except Exception as e:
            print(f"YT search failed: {e}")
            return []

    # Run tasks concurrently
    yt_task = fetch_yt_search()
    saavn_task = fetch_saavn_search(query, page, limit)
    
    yt_results, saavn_results = await asyncio.gather(yt_task, saavn_task)
    
    # Mix results by interleaving (prioritize YouTube Music search)
    mixed = []
    max_len = max(len(yt_results), len(saavn_results))
    for i in range(max_len):
        if i < len(yt_results):
            mixed.append(yt_results[i])
        if i < len(saavn_results):
            s_song = saavn_results[i]
            s_song["source"] = "jiosaavn"
            mixed.append(s_song)
            
    # Apply strict song version deduplication
    deduplicated = deduplicate_songs(mixed)
    
    # Store results in JSON response structure
    res_data = {
        "success": True,
        "data": {
            "results": deduplicated
        }
    }
    
    # Cache the result for 2 hours (7200 seconds)
    set_cache(cache_key, json.dumps(res_data), ttl_seconds=7200)
    
    return res_data

# Streaming Endpoint (Async extraction)
@app.get("/api/yt/stream")
async def stream_song(id: str):
    if not id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="id parameter is required."
        )
    
    # yt-dlp extraction is blocking, execute in a separate threadpool
    def extract_url(video_id):
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            return info.get('url')
            
    try:
        stream_url = await asyncio.to_thread(extract_url, id)
        if stream_url:
            return RedirectResponse(url=stream_url, status_code=status.HTTP_302_FOUND)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Could not extract stream URL."
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

if __name__ == '__main__':
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=5000, reload=True)
