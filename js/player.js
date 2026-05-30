/**
 * player.js - HTML5 Audio Player Logic
 */

// Decode HTML entities (e.g. &quot; -> ") from API data
function decodeHtml(str) {
    if (!str) return '';
    const t = document.createElement('textarea');
    t.innerHTML = str;
    return t.value;
}

const player = (() => {
    // DOM Elements
    const audioEl = document.getElementById('audioPlayer');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseIcon = playPauseBtn.querySelector('i');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const progressBar = document.getElementById('progressBar');
    const seekSlider = document.getElementById('seekSlider');
    const currentTimeDisplay = document.getElementById('currentTimeDisplay');
    const totalTimeDisplay = document.getElementById('totalTimeDisplay');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    const playerTitle = document.getElementById('playerTitle');
    const playerArtist = document.getElementById('playerArtist');
    const playerImage = document.getElementById('playerImage');
    const likeBtn = document.querySelector('.like-btn');
    const likeIcon = likeBtn ? likeBtn.querySelector('i') : null;

    // State
    let queue = [];
    let currentIndex = -1;
    let isPlaying = false;
    let isShuffle = false;
    let repeatState = 'none'; // 'none' | 'queue' | 'track'

    // ---- Private Helpers ----

    function deduplicateSongs(songs) {
        if (window.api && api.deduplicateSongs) {
            return api.deduplicateSongs(songs);
        }
        if (!songs) return [];
        const seen = new Set();
        return songs.filter(song => {
            if (!song || !song.id) return false;
            if (seen.has(song.id)) return false;
            seen.add(song.id);
            return true;
        });
    }

    function getRecentlyPlayed() {
        try {
            return JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveRecentlyPlayed(songs) {
        localStorage.setItem('recentlyPlayed', JSON.stringify(deduplicateSongs(songs)));
    }

    function addToHistory(song) {
        if (!song) return;
        let history = getRecentlyPlayed();
        const songKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(song) : song.id;
        history = history.filter(s => {
            const sKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(s) : s.id;
            return sKey !== songKey;
        });
        history.unshift(song);
        if (history.length > 100) {
            history = history.slice(0, 100);
        }
        saveRecentlyPlayed(history);
        window.dispatchEvent(new CustomEvent('recentlyPlayedUpdated'));
    }


    function formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function updateUI() {
        if (isPlaying) {
            playPauseIcon.className = 'bx bx-pause';
            playerImage.classList.add('playing');
        } else {
            playPauseIcon.className = 'bx bx-play';
            playerImage.classList.remove('playing');
        }

        const currentSong = (currentIndex !== -1 && queue.length > 0) ? queue[currentIndex] : null;
        window.dispatchEvent(new CustomEvent('playbackStateChanged', {
            detail: {
                songId: currentSong ? currentSong.id : null,
                isPlaying: isPlaying
            }
        }));
    }

    function setNowPlayingInfo(song) {
        const imgUrl = api.getBestImageUrl(song);
        const cleanName = decodeHtml(song.name || 'Unknown Title');
        const cleanArtist = song.artists?.primary?.map(a => decodeHtml(a.name)).join(', ') || 'Unknown Artist';
        playerTitle.textContent = cleanName;
        playerArtist.textContent = cleanArtist;
        if (imgUrl) {
            playerImage.src = imgUrl;
            playerImage.classList.remove('hidden');
        }
        document.title = `${cleanName} - Symphony`;
        // Highlight active card
        document.querySelectorAll('.music-card').forEach(card => card.classList.remove('active'));
        const activeCard = document.querySelector(`.music-card[data-id="${song.id}"]`);
        if (activeCard) activeCard.classList.add('active');
        
        updateLikeButtonState(song);

        // Notify expanded player that song has changed
        window.dispatchEvent(new CustomEvent('playerSongChanged', {
            detail: { song, imgUrl, title: cleanName, artist: cleanArtist }
        }));
    }

    function getLikedSongs() {
        const stored = localStorage.getItem('likedSongs');
        return stored ? JSON.parse(stored) : [];
    }

    function saveLikedSongs(songs) {
        localStorage.setItem('likedSongs', JSON.stringify(deduplicateSongs(songs)));
    }

    function isSongLiked(songOrId) {
        if (!songOrId) return false;
        let songId = typeof songOrId === 'object' ? songOrId.id : songOrId;
        let songKey = '';
        if (typeof songOrId === 'object') {
            songKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(songOrId) : songOrId.id;
        } else {
            const songObj = queue.find(s => s && s.id === songId);
            if (songObj && window.api && api.getSongVersionKey) {
                songKey = api.getSongVersionKey(songObj);
            }
        }
        return getLikedSongs().some(s => {
            if (s.id === songId) return true;
            if (songKey && window.api && api.getSongVersionKey) {
                const sKey = api.getSongVersionKey(s);
                return sKey === songKey;
            }
            return false;
        });
    }

    function updateLikeButtonState(songOrId) {
        if (!likeIcon) return;
        if (!songOrId) {
            likeIcon.className = 'bx bx-heart';
            likeIcon.style.color = '';
            likeBtn.classList.remove('liked');
            return;
        }
        if (isSongLiked(songOrId)) {
            likeIcon.className = 'bx bxs-heart';
            likeIcon.style.color = 'var(--accent-color)';
            likeBtn.classList.add('liked');
        } else {
            likeIcon.className = 'bx bx-heart';
            likeIcon.style.color = '';
            likeBtn.classList.remove('liked');
        }
    }


    // ---- Public API ----

    async function checkAndReplenishQueue() {
        if (queue.length === 0 || currentIndex === -1) return;
        
        const remaining = queue.length - (currentIndex + 1);
        if (remaining < 5) {
            const currentSong = queue[currentIndex];
            
            try {
                let suggestions = [];
                if (typeof api !== 'undefined') {
                    if (api.currentSource !== 'ytmusic' && typeof api.getSongSuggestions === 'function') {
                        suggestions = await api.getSongSuggestions(currentSong.id, 15);
                    }
                    
                    // Fallback for YouTube Music or empty suggestions: search artist tracks to match genre/vibe
                    if (!suggestions || suggestions.length === 0) {
                        const artistName = currentSong.artists?.primary?.[0]?.name || currentSong.artist || '';
                        if (artistName) {
                            suggestions = await api.searchSongs(artistName, 0, 15);
                        }
                    }
                }
                
                if (suggestions && suggestions.length > 0) {
                    const deduplicated = deduplicateSongs(suggestions);
                    const newSongs = deduplicated.filter(s => {
                        const sKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(s) : s.id;
                        return !queue.some(q => {
                            const qKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(q) : q.id;
                            return qKey === sKey;
                        });
                    });
                    if (newSongs.length > 0) {
                        queue = queue.concat(newSongs);
                        window.dispatchEvent(new CustomEvent('queueReplenished'));
                    }
                }
            } catch (err) {
                console.error('Queue auto-replenishment error:', err);
            }
        }
    }

    async function playSong(song) {
        if (!song) return;
        const url = api.getBestDownloadUrl(song);
        if (!url) {
            console.warn('No download URL for song:', song.name);
            return;
        }
        audioEl.src = url;
        await audioEl.play().catch(e => console.error('Playback error:', e));
        isPlaying = true;
        updateUI();
        setNowPlayingInfo(song);
        addToHistory(song);
        
        // Check and replenish the queue proactively when remaining songs run low
        await checkAndReplenishQueue();
    }

    function setQueue(songs, startIndex = 0) {
        if (!songs || songs.length === 0) return;
        const clickedSong = songs[startIndex];
        queue = deduplicateSongs(songs);
        let foundIndex = queue.findIndex(s => s.id === clickedSong.id);
        if (foundIndex === -1 && clickedSong) {
            const clickedKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(clickedSong) : clickedSong.id;
            foundIndex = queue.findIndex(s => {
                const sKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(s) : s.id;
                return sKey === clickedKey;
            });
        }
        currentIndex = foundIndex !== -1 ? foundIndex : 0;
        playSong(queue[currentIndex]);
    }


    function togglePlayPause() {
        if (audioEl.src === '' || audioEl.src === window.location.href) return;
        if (isPlaying) {
            audioEl.pause();
            isPlaying = false;
        } else {
            audioEl.play();
            isPlaying = true;
        }
        updateUI();
    }

    function toggleShuffle() {
        isShuffle = !isShuffle;
        const shuffleBtn = document.getElementById('shuffleBtn');
        if (shuffleBtn) {
            if (isShuffle) {
                shuffleBtn.classList.add('active');
            } else {
                shuffleBtn.classList.remove('active');
            }
        }
        window.dispatchEvent(new CustomEvent('shuffleStateChanged', { detail: { isShuffle } }));
    }

    function toggleRepeat() {
        const repeatBtn = document.getElementById('repeatBtn');
        const repeatIcon = repeatBtn ? repeatBtn.querySelector('i') : null;
        
        if (repeatState === 'none') {
            repeatState = 'queue';
            if (repeatBtn) repeatBtn.classList.add('active');
            if (repeatIcon) repeatIcon.className = 'bx bx-repeat';
        } else if (repeatState === 'queue') {
            repeatState = 'track';
            if (repeatBtn) repeatBtn.classList.add('active');
            if (repeatIcon) repeatIcon.className = 'bx bx-redo';
        } else {
            repeatState = 'none';
            if (repeatBtn) repeatBtn.classList.remove('active');
            if (repeatIcon) repeatIcon.className = 'bx bx-repeat';
        }
        window.dispatchEvent(new CustomEvent('repeatStateChanged', { detail: { repeatState } }));
    }

    async function playNext() {
        if (queue.length === 0) return;

        if (repeatState === 'track') {
            playSong(queue[currentIndex]);
            return;
        }

        if (isShuffle) {
            if (queue.length > 1) {
                let nextIdx = currentIndex;
                while (nextIdx === currentIndex) {
                    nextIdx = Math.floor(Math.random() * queue.length);
                }
                currentIndex = nextIdx;
            } else {
                currentIndex = 0;
            }
            playSong(queue[currentIndex]);
        } else {
            if (currentIndex < queue.length - 1) {
                currentIndex++;
                playSong(queue[currentIndex]);
            } else {
                if (repeatState === 'queue') {
                    currentIndex = 0;
                    playSong(queue[currentIndex]);
                } else {
                    const lastSong = queue[currentIndex];
                    if (lastSong && typeof api !== 'undefined' && typeof api.getSongSuggestions === 'function') {
                        try {
                            const suggestions = await api.getSongSuggestions(lastSong.id, 15);
                            if (suggestions && suggestions.length > 0) {
                                const deduplicated = deduplicateSongs(suggestions);
                                const newSongs = deduplicated.filter(s => {
                                    const sKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(s) : s.id;
                                    return !queue.some(q => {
                                        const qKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(q) : q.id;
                                        return qKey === sKey;
                                    });
                                });
                                if (newSongs.length > 0) {
                                    queue = queue.concat(newSongs);
                                    currentIndex++;
                                    playSong(queue[currentIndex]);
                                    window.dispatchEvent(new CustomEvent('queueReplenished'));
                                    return;
                                }
                            }
                        } catch (e) {
                            console.error('Queue replenishment error:', e);
                        }
                    }
                    // Loop back to start as fallback
                    currentIndex = 0;
                    playSong(queue[currentIndex]);
                }
            }
        }
    }

    function playPrev() {
        if (queue.length === 0) return;
        if (audioEl.currentTime > 3) {
            audioEl.currentTime = 0;
            return;
        }
        currentIndex = (currentIndex - 1 + queue.length) % queue.length;
        playSong(queue[currentIndex]);
    }

    // ---- Event Listeners ----

    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);

    const shuffleBtnEl = document.getElementById('shuffleBtn');
    if (shuffleBtnEl) {
        shuffleBtnEl.addEventListener('click', toggleShuffle);
    }

    const repeatBtnEl = document.getElementById('repeatBtn');
    if (repeatBtnEl) {
        repeatBtnEl.addEventListener('click', toggleRepeat);
    }

    let isSeeking = false;

    audioEl.addEventListener('timeupdate', () => {
        if (!audioEl.duration || isSeeking) return;
        const pct = (audioEl.currentTime / audioEl.duration) * 100;
        progressBar.style.width = `${pct}%`;
        seekSlider.value = pct;
        currentTimeDisplay.textContent = formatTime(audioEl.currentTime);
        totalTimeDisplay.textContent = formatTime(audioEl.duration);
    });

    audioEl.addEventListener('loadedmetadata', () => {
        if (audioEl.duration) {
            totalTimeDisplay.textContent = formatTime(audioEl.duration);
        }
    });

    seekSlider.addEventListener('mousedown', () => { isSeeking = true; });
    seekSlider.addEventListener('touchstart', () => { isSeeking = true; });

    seekSlider.addEventListener('input', () => {
        if (audioEl.duration) {
            const tempTime = (seekSlider.value / 100) * audioEl.duration;
            currentTimeDisplay.textContent = formatTime(tempTime);
            progressBar.style.width = `${seekSlider.value}%`;
        }
    });

    seekSlider.addEventListener('change', () => {
        if (audioEl.duration) {
            const seekTo = (seekSlider.value / 100) * audioEl.duration;
            audioEl.currentTime = seekTo;
        }
        isSeeking = false;
    });

    volumeSlider.addEventListener('input', () => {
        const vol = volumeSlider.value / 100;
        audioEl.volume = vol;
        if (vol === 0) {
            volumeIcon.className = 'bx bx-volume-mute';
        } else if (vol < 0.5) {
            volumeIcon.className = 'bx bx-volume-low';
        } else {
            volumeIcon.className = 'bx bx-volume-full';
        }
    });

    volumeIcon.addEventListener('click', () => {
        if (audioEl.volume > 0) {
            audioEl.volume = 0;
            volumeSlider.value = 0;
            volumeIcon.className = 'bx bx-volume-mute';
        } else {
            audioEl.volume = 1;
            volumeSlider.value = 100;
            volumeIcon.className = 'bx bx-volume-full';
        }
    });

    audioEl.addEventListener('ended', playNext);

    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            if (currentIndex === -1 || queue.length === 0) return;
            const currentSong = queue[currentIndex];
            let liked = getLikedSongs();
            if (isSongLiked(currentSong)) {
                const currentKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(currentSong) : currentSong.id;
                liked = liked.filter(s => {
                    const sKey = (window.api && api.getSongVersionKey) ? api.getSongVersionKey(s) : s.id;
                    return sKey !== currentKey;
                });
            } else {
                liked.push(currentSong);
            }
            saveLikedSongs(liked);
            if (typeof firebaseManager !== 'undefined' && firebaseManager.isConfigured() && firebaseManager.getCurrentUser()) {
                firebaseManager.syncLibraryToCloud(liked);
            }
            updateLikeButtonState(currentSong);
            window.dispatchEvent(new CustomEvent('likedSongsUpdated'));
        });
    }

    // Prefetched audios cache to keep audio elements from being garbage collected
    const prefetchedAudioElements = [];

    function prefetchSongs(songs) {
        if (!songs || !Array.isArray(songs) || songs.length === 0) return;

        // Check if Data Saver is enabled (in LocalStorage or Navigator connection)
        const isDataSaverEnabled = localStorage.getItem('symphonyDataSaver') === 'true';
        const isMeteredConnection = navigator.connection && (
            navigator.connection.saveData ||
            ['slow-2g', '2g', '3g'].includes(navigator.connection.effectiveType)
        );

        if (isDataSaverEnabled || isMeteredConnection) {
            return;
        }

        // Prefetch only the first 2 songs in the list
        const toPrefetch = songs.slice(0, 2);
        toPrefetch.forEach(song => {
            if (!song) return;
            const url = api.getBestDownloadUrl(song);
            if (!url) return;

            // Check if we already prefetched this song
            if (prefetchedAudioElements.some(el => el.src === url)) {
                return;
            }

            const audio = new Audio();
            audio.src = url;
            audio.preload = 'auto';
            
            // Limit prefetch to first 5 seconds to conserve data
            const onProgress = () => {
                if (audio.buffered.length > 0) {
                    const bufferedDuration = audio.buffered.end(0) - audio.buffered.start(0);
                    if (bufferedDuration >= 5) {
                        audio.removeEventListener('progress', onProgress);
                    }
                }
            };
            audio.addEventListener('progress', onProgress);
            audio.load();

            prefetchedAudioElements.push(audio);
            // Limit cache to last 6 prefetched tracks
            if (prefetchedAudioElements.length > 6) {
                prefetchedAudioElements.shift();
            }
        });
    }

    return { 
        playSong, 
        setQueue, 
        prefetchSongs, 
        togglePlayPause, 
        playNext, 
        playPrev, 
        getLikedSongs, 
        isSongLiked, 
        updateLikeButtonState, 
        getRecentlyPlayed, 
        getCurrentSong: () => (currentIndex !== -1 && queue.length > 0) ? queue[currentIndex] : null,
        getQueue: () => queue,
        clearQueue: () => {
            queue = [];
            currentIndex = -1;
            audioEl.src = '';
            isPlaying = false;
            updateUI();
            playerTitle.textContent = 'No track selected';
            playerArtist.textContent = '-';
            playerImage.src = '';
            playerImage.classList.add('hidden');
            document.title = 'Symphony - Music Player';
            window.dispatchEvent(new CustomEvent('queueCleared'));
        },
        toggleShuffle,
        toggleRepeat,
        getShuffleState: () => isShuffle,
        getRepeatState: () => repeatState,
        getPlayingState: () => isPlaying,
        setCurrentIndex: (idx) => {
            if (idx >= 0 && idx < queue.length) {
                currentIndex = idx;
                playSong(queue[currentIndex]);
            }
        }
    };
})();

