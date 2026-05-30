/**
 * Symphony Python Auth & Sync Manager (Formerly Firebase Config)
 * Handles user Authentication (Login/Signup) and Library Syncing
 * via Python FastAPI Backend and Local SQLite Database.
 *
 * Backend URL Strategy:
 *   - Local dev (127.0.0.1 / localhost): uses local backend http://127.0.0.1:5000
 *   - Firebase Hosting / any remote origin: uses deployed Railway backend
 */

// ── Backend URL (mirrors api.js logic) ────────────────────────────────────
const _DEPLOYED_BACKEND = 'https://symphony-music-player.onrender.com';
const _LOCAL_BACKEND    = 'http://127.0.0.1:5000';
const _FM_IS_REMOTE     = !['localhost', '127.0.0.1'].includes(window.location.hostname);
const BACKEND_URL       = _FM_IS_REMOTE ? _DEPLOYED_BACKEND : _LOCAL_BACKEND;

const firebaseManager = (() => {
    let currentUser = null;
    let isInitialized = false;

    // Helper functions for configuration (dummy wrappers to keep backward compatibility)
    function getSavedConfig() { return {}; }
    function saveConfig(config) { return; }
    function clearConfig() { return; }

    async function initialize() {
        isInitialized = true;
        console.log(`Symphony Auth Manager initialized. Backend: ${BACKEND_URL}`);
        
        // Restore session on startup if JWT token is stored
        const token = localStorage.getItem('symphonyJwtToken');
        if (token) {
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 4000);
                const res = await fetch(`${BACKEND_URL}/api/auth/verify`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: controller.signal
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.authenticated) {
                        currentUser = data.user;
                        console.log('Session restored for user:', currentUser.email);
                        window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: currentUser } }));
                        await syncLibraryFromCloud();
                    } else {
                        console.log('Session token expired. Cleared.');
                        localStorage.removeItem('symphonyJwtToken');
                        currentUser = null;
                        window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: null } }));
                    }
                } else {
                    localStorage.removeItem('symphonyJwtToken');
                    currentUser = null;
                    window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: null } }));
                }
            } catch (err) {
                // Backend unreachable (e.g. running from Firebase Hosting) — run in local-only mode
                console.warn('[Symphony] Auth backend not reachable. Running in local-only mode.');
                currentUser = null;
                window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: null } }));
            }
        } else {
            // No saved session
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: null } }));
            }, 100);
        }
        return true;
    }

    // Sign Up action
    async function signUp(email, password, displayName) {
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 8000);
            const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: displayName, email: email, password: password }),
                signal: controller.signal
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || 'Signup failed.');
            }
            localStorage.setItem('symphonyJwtToken', data.token);
            currentUser = data.user;
            window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: currentUser } }));
            return currentUser;
        } catch (err) {
            if (err.name === 'AbortError' || err.message === 'Failed to fetch') {
                throw new Error('Server is not reachable. Please run the local backend to use account features.');
            }
            console.error('Signup error:', err);
            throw err;
        }
    }

    // Login action
    async function logIn(email, password) {
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 8000);
            const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, password: password }),
                signal: controller.signal
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.detail || 'Invalid email or password.');
            }
            localStorage.setItem('symphonyJwtToken', data.token);
            currentUser = data.user;
            window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: currentUser } }));
            return currentUser;
        } catch (err) {
            if (err.name === 'AbortError' || err.message === 'Failed to fetch') {
                throw new Error('Server is not reachable. Please run the local backend to use account features.');
            }
            console.error('Login error:', err);
            throw err;
        }
    }

    async function signInWithGoogle() {
        throw new Error('Google Sign-In is only supported in Firebase cloud mode. Please use Email & Password.');
    }

    async function sendOtp(phoneNumber, recaptchaVerifier) {
        throw new Error('OTP Verification is only supported in Firebase cloud mode. Please use Email & Password.');
    }

    // Sign Out action
    async function logOut() {
        localStorage.removeItem('symphonyJwtToken');
        currentUser = null;
        window.dispatchEvent(new CustomEvent('firebaseAuthStateChanged', { detail: { user: null } }));
    }

    // Library Firestore Syncing (Proxied to SQLite Database)
    async function syncLibraryToCloud(likedSongs) {
        const token = localStorage.getItem('symphonyJwtToken');
        if (!token || !currentUser) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/library/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ songs: likedSongs })
            });
            const data = await res.json();
            if (data && data.success) {
                console.log('Liked songs successfully backed up to SQLite database.');
            }
        } catch (err) {
            console.error('Failed to sync library to SQLite database:', err);
        }
    }

    async function syncLibraryFromCloud() {
        const token = localStorage.getItem('symphonyJwtToken');
        if (!token || !currentUser) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/library/sync`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    const cloudLikes = data.likedSongs || [];
                    const localLikes = JSON.parse(localStorage.getItem('likedSongs') || '[]');
                    
                    // Merge local and cloud likes, avoiding duplicates using api.getSongVersionKey
                    const merged = [...localLikes];
                    cloudLikes.forEach(cSong => {
                        const cKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(cSong) : cSong.id;
                        if (!merged.some(lSong => {
                            const lKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(lSong) : lSong.id;
                            return lKey === cKey;
                        })) {
                            merged.push(cSong);
                        }
                    });
                    
                    const deduplicated = (window.api && api.deduplicateSongs) ? api.deduplicateSongs(merged) : merged;
                    localStorage.setItem('likedSongs', JSON.stringify(deduplicated));
                    window.dispatchEvent(new CustomEvent('likedSongsUpdated'));
                    
                    // Save the merged list back to cloud if it has new local likes
                    if (deduplicated.length > cloudLikes.length) {
                        await syncLibraryToCloud(deduplicated);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to sync library from SQLite database:', err);
        }
    }

    async function generateShareLink(playlistTitle, songsList) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/playlist/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: playlistTitle, songs: songsList })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Failed to generate share link.');
            }
            return data; // returns { share_id, share_url }
        } catch (err) {
            console.error('Error generating share link:', err);
            throw err;
        }
    }

    async function fetchSharedPlaylist(shareId) {
        try {
            const res = await fetch(`${BACKEND_URL}/api/playlist/share/${shareId}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Failed to fetch shared playlist.');
            }
            return data; // returns { title, songs }
        } catch (err) {
            console.error('Error fetching shared playlist:', err);
            throw err;
        }
    }

    return {
        getSavedConfig,
        saveConfig,
        clearConfig,
        initialize,
        signUp,
        logIn,
        signInWithGoogle,
        sendOtp,
        logOut,
        syncLibraryToCloud,
        syncLibraryFromCloud,
        isConfigured: () => isInitialized,
        getCurrentUser: () => currentUser,
        generateShareLink,
        fetchSharedPlaylist
    };
})();

// Automatically initialize authentication on script load
document.addEventListener('DOMContentLoaded', () => {
    firebaseManager.initialize();
});
