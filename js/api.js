/**
 * api.js - API Integration
 * Supports both public JioSaavn API and Python YT Music API (local or deployed).
 * - Local dev (127.0.0.1): tries local backend first, falls back to deployed.
 * - Firebase Hosting: uses deployed Railway backend directly.
 * - If all backends fail: falls back to JioSaavn-only mode.
 */

const JIOSAAVN_API_BASE = 'https://saavn.sumit.co/api';

// ── Backend URL Configuration ──────────────────────────────────────────────
// Deployed Railway backend — works from Firebase Hosting + any device.
// Will be updated automatically after Railway deployment.
const DEPLOYED_BACKEND = 'https://symphony-backend-production.up.railway.app';

// Local dev backend (only reachable from localhost)
const LOCAL_BACKEND = 'http://127.0.0.1:5000';

// Detect if running from a remote origin (Firebase Hosting, Android app, etc.)
const _IS_REMOTE_ORIGIN = !['localhost', '127.0.0.1'].includes(window.location.hostname);

// When on remote origin, always use deployed backend.
// When local, prefer local backend (faster), fall back to deployed.
const YTMUSIC_API_BASE = _IS_REMOTE_ORIGIN
    ? `${DEPLOYED_BACKEND}/api/yt`
    : `${LOCAL_BACKEND}/api/yt`;

// ── Fetch Helper ──────────────────────────────────────────────────────────
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// ── Backend Availability Check ────────────────────────────────────────────
// Cache backend availability for 30 seconds to avoid repeated probes.
let _backendAvailable = null;
let _backendCheckTime = 0;
const BACKEND_CHECK_TTL = 30000; // 30 seconds

// Flag: set to true once the Railway backend is actually deployed
// Until then, remote origin always uses JioSaavn directly (no probe delay)
const _RAILWAY_DEPLOYED = false; // ← Set to true after Railway deploy

async function checkBackendAvailable() {
    // On remote origin: only probe if Railway is actually deployed
    if (_IS_REMOTE_ORIGIN && !_RAILWAY_DEPLOYED) {
        _backendAvailable = false;
        return false;
    }

    const now = Date.now();
    if (_backendAvailable !== null && (now - _backendCheckTime) < BACKEND_CHECK_TTL) {
        return _backendAvailable;
    }

    // On remote origin with Railway deployed: probe Railway backend
    // On local: probe local backend first
    const probeUrl = _IS_REMOTE_ORIGIN
        ? `${DEPLOYED_BACKEND}/api/yt/search?query=test&limit=1`
        : `${LOCAL_BACKEND}/api/yt/search?query=test&limit=1`;

    try {
        const res = await fetchWithTimeout(probeUrl, { timeout: 2000 });
        _backendAvailable = res.ok;
    } catch (e) {
        // Local failed — try deployed backend as fallback (only in local dev)
        if (!_IS_REMOTE_ORIGIN && _RAILWAY_DEPLOYED) {
            try {
                const res = await fetchWithTimeout(`${DEPLOYED_BACKEND}/api/yt/search?query=test&limit=1`, { timeout: 3000 });
                _backendAvailable = res.ok;
                if (_backendAvailable) {
                    console.log('[Symphony] Local backend offline — using deployed Railway backend.');
                }
            } catch {
                _backendAvailable = false;
            }
        } else {
            _backendAvailable = false;
        }
    }

    _backendCheckTime = Date.now();
    console.log(`[Symphony] Backend: ${_backendAvailable ? (_IS_REMOTE_ORIGIN ? 'Railway deployed' : 'local') : 'unavailable — JioSaavn only'}`);
    return _backendAvailable;
}

const api = {
    // 'jiosaavn' or 'ytmusic'
    currentSource: 'jiosaavn',

    /**
     * Generates a unique key for a song version to prevent duplicate versions of the same song.
     * Different versions (e.g. original, lofi, remix, dj, mashup, etc.) can coexist.
     */
    getSongVersionKey(song) {
        if (!song) return '';
        
        // 1. Get and normalize title
        let title = (song.name || song.title || '').toLowerCase().trim();
        
        // 2. Identify the version category by checking for common markers in the title
        let version = 'original';
        const markers = [
            { key: 'lofi', patterns: ['lo-fi', 'lofi', 'chillout', 'ambient'] },
            { key: 'remix', patterns: ['remix', 'mix', 're-mix', 'club mix', 'house mix'] },
            { key: 'dj', patterns: ['dj', 'd.j.'] },
            { key: 'mashup', patterns: ['mashup', 'mash-up', 'medley'] },
            { key: 'slowed', patterns: ['slowed', 'reverb', 'slowed+reverb', 'slowed & reverb'] },
            { key: 'acoustic', patterns: ['acoustic', 'unplugged', 'piano version'] },
            { key: 'cover', patterns: ['cover', 'tribute'] },
            { key: 'instrumental', patterns: ['instrumental'] },
            { key: 'sad', patterns: ['sad version', 'sad song'] },
            { key: 'female', patterns: ['female version', 'female cover', 'female voice'] },
            { key: 'male', patterns: ['male version', 'male cover'] },
            { key: 'live', patterns: ['live performance', 'live version', 'live in'] }
        ];
        
        for (const marker of markers) {
            for (const pattern of marker.patterns) {
                if (title.includes(pattern)) {
                    version = marker.key;
                    break;
                }
            }
            if (version !== 'original') break;
        }
        
        // 3. Clean the title to get the "base title"
        let baseTitle = title;
        
        // Remove brackets/parentheses and their contents if they match version/video/audio info
        baseTitle = baseTitle.replace(/[\(\[\{][^\)\]\}]*(lo-fi|lofi|remix|dj|mashup|slowed|reverb|acoustic|unplugged|cover|instrumental|version|lyrics|video|audio|hq|hd|official|from)[^\)\]\}]*[\)\]\}]/g, '');
        
        // Remove specific version patterns
        for (const marker of markers) {
            for (const pattern of marker.patterns) {
                baseTitle = baseTitle.split(pattern).join('');
            }
        }
        
        // Remove generic keywords
        const wordsToRemove = ['original', 'lyrics', 'video', 'audio', 'official', 'version', 'full song', 'full video', 'hd', 'hq', 'lq', 'song'];
        for (const word of wordsToRemove) {
            baseTitle = baseTitle.replace(new RegExp('\\b' + word + '\\b', 'g'), '');
        }
        
        // Keep only alphanumeric characters
        baseTitle = baseTitle.replace(/[^a-z0-9]/g, '').trim();
        if (!baseTitle) {
            baseTitle = title.replace(/[^a-z0-9]/g, '');
        }
        
        // 4. Normalize artist
        let artistName = '';
        if (song.artists && song.artists.primary && Array.isArray(song.artists.primary)) {
            artistName = song.artists.primary.map(a => a.name).join(' ');
        } else if (song.artist) {
            artistName = song.artist;
        }
        let normArtist = artistName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!normArtist && song.album && song.album.name) {
            normArtist = song.album.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        }
        
        return `${baseTitle}|${version}|${normArtist}`;
    },

    /**
     * Filters list of songs to keep only unique versions (first occurrence).
     */
    deduplicateSongs(songs) {
        if (!songs || !Array.isArray(songs)) return [];
        const seen = new Set();
        return songs.filter(song => {
            if (!song) return false;
            const key = this.getSongVersionKey(song);
            if (!key) return false;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    /**
     * Search for songs by query.
     * Primary: Python FastAPI backend (combines JioSaavn + YouTube Music, deduplicates, caches).
     * Fallback: Direct JioSaavn public API (when local backend is unreachable, e.g. Firebase Hosting).
     */
    async searchSongs(query, page = 0, limit = 20, sourceOverride = null) {
        // Enforce user language preferences on searches
        let userLangs = [];
        try {
            userLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
        } catch (e) {
            console.error('Error reading preferences languages for search:', e);
        }

        let refinedQuery = query;
        if (userLangs && userLangs.length > 0) {
            const primaryLang = userLangs[0].toLowerCase();
            const queryLower = query.toLowerCase();
            if (!queryLower.includes(primaryLang)) {
                refinedQuery = `${query} ${primaryLang}`;
            }
        }

        const applyLanguageFilter = (results) => {
            if (!userLangs || userLangs.length === 0) return results;
            const lowerLangs = userLangs.map(l => l.toLowerCase());
            const primaryLang = userLangs[0].toLowerCase();
            results.forEach(song => { if (!song.language) song.language = primaryLang; });
            return results.filter(song => lowerLangs.includes((song.language || '').toLowerCase()));
        };

        // 1. Try backend (local in dev, Railway-deployed on Firebase Hosting)
        const backendOnline = await checkBackendAvailable();
        if (backendOnline) {
            try {
                const res = await fetchWithTimeout(`${YTMUSIC_API_BASE}/search?query=${encodeURIComponent(refinedQuery)}&page=${page}&limit=${limit}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        let results = data.data.results || [];
                        return applyLanguageFilter(results);
                    }
                }
            } catch (err) {
                console.warn('[Symphony] Backend search failed, falling back to JioSaavn direct:', err.message);
                _backendAvailable = false; // Mark unavailable until next TTL check
            }
        }

        // 2. Fallback: Direct JioSaavn public API (always accessible from Firebase Hosting)
        try {
            const offset = page * limit;
            const res = await fetchWithTimeout(`${JIOSAAVN_API_BASE}/search/songs?query=${encodeURIComponent(refinedQuery)}&page=${page}&limit=${limit}`);
            if (!res.ok) return [];
            const data = await res.json();
            if (!data.success) return [];
            let results = data.data.results || [];
            // Tag source
            results.forEach(s => { s.source = 'jiosaavn'; });
            results = applyLanguageFilter(results);
            return results;
        } catch (err) {
            console.error('[Symphony] JioSaavn fallback search also failed:', err);
            return [];
        }
    },

    /**
     * Search for playlists
     */
    async searchPlaylists(query, limit = 10) {
        try {
            const res = await fetchWithTimeout(`${JIOSAAVN_API_BASE}/search/playlists?query=${encodeURIComponent(query)}&limit=${limit}`);
            const data = await res.json();
            if (data.success) return data.data.results || [];
            return [];
        } catch (err) {
            console.error('Playlist search failed:', err);
            return [];
        }
    },

    /**
     * Search for albums
     */
    async searchAlbums(query, limit = 10) {
        if (this.currentSource === 'ytmusic') return []; // Not implemented for YT backend yet
        try {
            const res = await fetchWithTimeout(`${JIOSAAVN_API_BASE}/search/albums?query=${encodeURIComponent(query)}&limit=${limit}`);
            const data = await res.json();
            if (data.success) return data.data.results;
            return [];
        } catch (err) {
            console.error('Album search failed:', err);
            return [];
        }
    },

    /**
     * Get songs by album ID
     */
    async getAlbumById(id) {
        try {
            const res = await fetchWithTimeout(`${JIOSAAVN_API_BASE}/albums?id=${id}`);
            const data = await res.json();
            if (data.success) return data.data;
            return null;
        } catch (err) {
            console.error('Fetch album failed:', err);
            return null;
        }
    },

    /**
     * Get songs from a playlist
     */
    async getPlaylistById(id) {
        try {
            const res = await fetchWithTimeout(`${JIOSAAVN_API_BASE}/playlists?id=${id}`);
            const data = await res.json();
            if (data.success) return data.data;
            return null;
        } catch (err) {
            console.error('Fetch playlist failed:', err);
            return null;
        }
    },

    /**
     * Get song details by ID
     */
    async getSongById(id) {
        try {
            const res = await fetchWithTimeout(`${JIOSAAVN_API_BASE}/songs/${id}`);
            const data = await res.json();
            if (data.success) return data.data[0];
            return null;
        } catch (err) {
            console.error('Fetch song failed:', err);
            return null;
        }
    },

    /**
     * Returns the best quality download URL from a song object
     */
    getBestDownloadUrl(song) {
        if (!song || !song.downloadUrl || song.downloadUrl.length === 0) return null;
        
        // Retrieve preferred quality from localStorage
        const savedQuality = localStorage.getItem('symphonyAudioQuality') || '320kbps';
        
        // Try to match the exact quality chosen by user
        const exactMatch = song.downloadUrl.find(u => u.quality === savedQuality);
        if (exactMatch && exactMatch.url) return exactMatch.url;
        
        // Fallback order starting from user preference downward
        const preferred = [savedQuality, '320kbps', '160kbps', '96kbps', '48kbps'];
        for (const quality of preferred) {
            const match = song.downloadUrl.find(u => u.quality === quality);
            if (match && match.url) return match.url;
        }
        return song.downloadUrl[song.downloadUrl.length - 1].url;
    },

    /**
     * Returns the best quality image URL from a song object
     */
    getBestImageUrl(song) {
        if (!song || !song.image || song.image.length === 0) return null;
        const preferred = ['500x500', '150x150', '50x50'];
        for (const quality of preferred) {
            const match = song.image.find(u => u.quality === quality);
            if (match && match.url) return match.url;
        }
        return song.image[song.image.length - 1].url;
    },

    /**
     * Get song recommendations / suggestions based on song ID.
     * Caches failed IDs for the session to avoid repeated 500 errors.
     */
    _failedSuggestionIds: new Set(),

    async getSongSuggestions(songId, limit = 15) {
        // Skip IDs that have already failed this session (avoid repeated 500 browser errors)
        const saavnSugPromise = (async () => {
            if (this._failedSuggestionIds.has(songId)) return [];
            try {
                const res = await fetchWithTimeout(`${JIOSAAVN_API_BASE}/songs/${songId}/suggestions?limit=${limit}`);
                if (!res.ok) {
                    // Cache this failure so we don't retry it
                    this._failedSuggestionIds.add(songId);
                    return [];
                }
                const data = await res.json();
                if (data.success) return (data.data || []).map(s => ({ ...s, source: 'jiosaavn' }));
                return [];
            } catch (err) {
                this._failedSuggestionIds.add(songId);
                return [];
            }
        })();

        // Only attempt YT backend if it is known to be reachable
        const ytSugPromise = (async () => {
            try {
                const backendOnline = await checkBackendAvailable();
                if (!backendOnline) return [];
                let query = '';
                if (typeof player !== 'undefined') {
                    const current = player.getCurrentSong();
                    if (current) {
                        query = current.artists?.primary?.[0]?.name || current.artist || current.name;
                    }
                }
                if (!query) return [];
                const res = await fetchWithTimeout(`${YTMUSIC_API_BASE}/search?query=${encodeURIComponent(query)}&limit=${limit}`);
                const data = await res.json();
                if (data.success) return (data.data.results || []).map(s => ({ ...s, source: 'ytmusic' }));
                return [];
            } catch (err) {
                console.warn('YT suggestions search failed:', err.message);
                _backendAvailable = false;
                return [];
            }
        })();

        try {
            const [saavnSugs, ytSugs] = await Promise.all([saavnSugPromise, ytSugPromise]);
            const mixed = [];
            const maxLen = Math.max(saavnSugs.length, ytSugs.length);
            for (let i = 0; i < maxLen; i++) {
                if (i < saavnSugs.length) mixed.push(saavnSugs[i]);
                if (i < ytSugs.length) mixed.push(ytSugs[i]);
            }
            
            // Filter by user's chosen languages
            let userLangs = [];
            try {
                userLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
            } catch (e) {}
            let filtered = mixed;
            if (userLangs && userLangs.length > 0) {
                const lowerLangs = userLangs.map(l => l.toLowerCase());
                const primaryLang = userLangs[0].toLowerCase();
                filtered.forEach(song => { if (!song.language) song.language = primaryLang; });
                filtered = filtered.filter(song => lowerLangs.includes((song.language || '').toLowerCase()));
            }
            
            return this.deduplicateSongs(filtered);
        } catch (err) {
            console.error('Get mixed suggestions failed:', err);
            return [];
        }
    },

    /**
     * Preference Configurations
     */
    LANGUAGES_CONFIG: [
        { id: 'hindi', name: 'Hindi', emoji: '🇮🇳' },
        { id: 'english', name: 'English', emoji: '🇬🇧' },
        { id: 'punjabi', name: 'Punjabi', emoji: '🌾' },
        { id: 'bhojpuri', name: 'Bhojpuri', emoji: '🦁' },
        { id: 'bengali', name: 'Bengali', emoji: '🎨' },
        { id: 'haryanvi', name: 'Haryanvi', emoji: '🚜' },
        { id: 'tamil', name: 'Tamil', emoji: '🛕' },
        { id: 'telugu', name: 'Telugu', emoji: '🌊' },
        { id: 'kannada', name: 'Kannada', emoji: '🪕' },
        { id: 'malayalam', name: 'Malayalam', emoji: '🌴' },
        { id: 'marathi', name: 'Marathi', emoji: '🏰' },
        { id: 'gujarati', name: 'Gujarati', emoji: '🪁' },
        { id: 'rajasthani', name: 'Rajasthani', emoji: '🐪' }
    ],

    ARTISTS_CONFIG: SYMPHONY_SINGERS,

    LANGUAGE_SHELVES: {
        hindi: [
            { title: 'Trending Bollywood 🔥', query: 'New Hindi Songs 2026' },
            { title: 'Hindi Lo-Fi & Chill ☕', query: 'Lofi Hindi Chill' },
            { title: 'Retro Melodies 📻', query: 'Kishore Kumar Lata Mangeshkar Hits' },
            { title: 'Romantic Bollywood 💖', query: 'Love Mashups Hindi' },
            { title: 'Bollywood Party 🪩', query: 'Bollywood Dance Hits' },
            { title: 'Indie India 🎸', query: 'Indian Indie Hits' },
            { title: 'Devotional Peace 🙏', query: 'Bhajan Aarti Songs' }
        ],
        english: [
            { title: 'Global Top Hits 🌍', query: 'Billboard Top Hits' },
            { title: 'English Pop & Dance 💃', query: 'English Pop Hits' },
            { title: 'Acoustic Chill ☕', query: 'Lofi Study Chill English' },
            { title: 'Hip Hop & Rap 🎧', query: 'Global Hip Hop Hits' },
            { title: 'Rock Anthems 🎸', query: 'Classic Rock Hits' }
        ],
        punjabi: [
            { title: 'Punjabi Power ⚡', query: 'New Punjabi Hits' },
            { title: 'Punjabi Pop & Dance 🌾', query: 'Punjabi Pop Dance' },
            { title: 'Punjabi Lofi ☕', query: 'Punjabi Lofi Chill' }
        ],
        bhojpuri: [
            { title: 'Bhojpuri Dhamaal 🦁', query: 'Bhojpuri Super Hits' },
            { title: 'Bhojpuri Dance Hits 🪩', query: 'Bhojpuri DJ Songs' }
        ],
        bengali: [
            { title: 'Bengali Melodies 🎨', query: 'Bengali Romantic Hits' },
            { title: 'Bengali Retro 📻', query: 'Bengali Old Hits' }
        ],
        haryanvi: [
            { title: 'Haryanvi Hits 🚜', query: 'New Haryanvi Songs' }
        ],
        tamil: [
            { title: 'Kollywood Hits 🛕', query: 'New Tamil Hits' }
        ],
        telugu: [
            { title: 'Tollywood Hits 🌊', query: 'New Telugu Hits' }
        ],
        kannada: [
            { title: 'Sandalwood Hits 🪕', query: 'New Kannada Songs' }
        ],
        malayalam: [
            { title: 'Mollywood Hits 🌴', query: 'New Malayalam Songs' }
        ],
        marathi: [
            { title: 'Marathi Dhamaal 🏰', query: 'New Marathi Songs' }
        ],
        gujarati: [
            { title: 'Gujarati Garba & Hits 🪁', query: 'New Gujarati Songs' }
        ],
        rajasthani: [
            { title: 'Rajasthani Folk & Pop 🐪', query: 'New Rajasthani Songs' }
        ]
    },

    PODCAST_SHELVES: {
        general: [
            { title: 'The Ranveer Show 🎙️', query: 'The Ranveer Show Podcast' },
            { title: 'Self-Help & Motivation 💪', query: 'Self Improvement Podcast' },
            { title: 'Science & Space Mysteries 🚀', query: 'Space Podcast' }
        ],
        hindi: [
            { title: 'Horror & Paranormal 👻', query: 'Hindi Horror Podcast' },
            { title: 'Desi Stories & Audiobooks 📖', query: 'Hindi Kahani Stories Podcast' },
            { title: 'Gita & Spiritual Wisdom 🕉️', query: 'Bhagavad Gita Podcast' },
            { title: 'Crime & Suspense 🔍', query: 'Hindi Crime Podcast' },
            { title: 'Comedy & Chit-Chat 🎭', query: 'Funny Podcast Hindi' }
        ],
        english: [
            { title: 'True Crime English 🕵️', query: 'True Crime Podcast' },
            { title: 'TED Talks Daily 💡', query: 'TED Talks Daily' }
        ]
    },

    /**
     * Fallback shelves for guests/general loads
     */
    HOME_SHELVES: [
        { title: 'Trending Bollywood 🔥', query: 'New Hindi Songs 2026' },
        { title: 'Global Top Hits 🌍', query: 'Billboard Top Hits' },
        { title: 'Punjabi Power ⚡', query: 'New Punjabi Hits' },
        { title: 'Lo-Fi & Chill ☕', query: 'Lofi Hindi Chill' },
        { title: 'Retro Melodies 📻', query: 'Kishore Kumar Lata Mangeshkar Hits' },
        { title: 'Workout Beats 🏃‍♂️', query: 'Gym Workout Music' }
    ]
};

