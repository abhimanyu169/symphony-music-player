/**
 * app.js - Main Application Logic
 * Handles UI rendering, search, and connecting everything together.
 */

/**
 * Global Unsplash URL interceptor — runs immediately on script load.
 * Chrome's ERR_BLOCKED_BY_ORB blocks Unsplash images from Firebase Hosting.
 * Uses both property setter override AND MutationObserver to cover:
 *   - img.src = url          (property setter)
 *   - innerHTML '<img src>'  (MutationObserver)
 *   - setAttribute('src')    (attribute override)
 */
(function() {
    const _PALETTE = [
        ['#7c3aed','#4c1d95'],['#db2777','#9d174d'],['#0891b2','#164e63'],
        ['#d97706','#92400e'],['#059669','#064e3b'],['#2563eb','#1e3a8a'],
        ['#9333ea','#581c87'],['#dc2626','#7f1d1d'],['#0d9488','#134e4a'],
        ['#c026d3','#701a75']
    ];
    function _hashCode(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }
    function _toSvg(url) {
        const id = (url && url.match(/photo-([^?&/]+)/))?.[1] || 'x';
        const [c1, c2] = _PALETTE[_hashCode(id) % _PALETTE.length];
        const s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='300' height='300' fill='url(%23g)'/><text x='150' y='185' font-size='110' text-anchor='middle' fill='rgba(255,255,255,0.2)'>&#9836;</text></svg>`;
        return `data:image/svg+xml;charset=utf-8,${s}`;
    }
    function _isUnsplash(url) {
        return typeof url === 'string' && url.includes('images.unsplash.com');
    }
    function _patchImg(img) {
        try {
            const src = img.getAttribute('src');
            if (_isUnsplash(src)) img.setAttribute('src', _toSvg(src));
        } catch(e) {}
    }

    // Override property setter (img.src = url)
    const _desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set(url) {
            _desc.set.call(this, _isUnsplash(url) ? _toSvg(url) : url);
        },
        get() { return _desc.get.call(this); },
        configurable: true
    });

    // Override setAttribute (img.setAttribute('src', url))
    const _origSetAttr = HTMLImageElement.prototype.setAttribute;
    HTMLImageElement.prototype.setAttribute = function(name, value) {
        if (name === 'src' && _isUnsplash(value)) {
            _origSetAttr.call(this, name, _toSvg(value));
        } else {
            _origSetAttr.call(this, name, value);
        }
    };

    // MutationObserver: catches innerHTML-based img insertions
    // (e.g. element.innerHTML = '<img src="https://images.unsplash.com/...">')
    const _observer = new MutationObserver(mutations => {
        for (const mut of mutations) {
            for (const node of mut.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === 'IMG') {
                    _patchImg(node);
                } else {
                    node.querySelectorAll('img').forEach(_patchImg);
                }
            }
            // Also check attribute mutations on existing img elements
            if (mut.type === 'attributes' && mut.target.tagName === 'IMG' && mut.attributeName === 'src') {
                _patchImg(mut.target);
            }
        }
    });
    // Start observing as soon as DOM is available
    if (document.documentElement) {
        _observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            _observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        }, { once: true });
    }
})();


document.addEventListener('DOMContentLoaded', async () => {

    const mainLoader = document.getElementById('mainLoader');
    const trendingGrid = document.getElementById('trendingGrid');
    const homeSection = document.getElementById('homeSection');
    const heroBanner = document.getElementById('heroBanner');
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const searchResultsSection = document.getElementById('searchResultsSection');
    const searchResultsGrid = document.getElementById('searchResultsGrid');
    const loadMoreSearchBtn = document.getElementById('loadMoreSearchBtn');
    
    let currentArtistPage = 0;
    let currentArtistObject = null;
    let currentViewedPlaylist = { title: '', tracks: [] };

    let allRadioStations = [];
    let currentRadioPage = 0;
    const radioPageSize = 24;
    let currentActiveRadioTitle = '';
    let playingSourceSection = 'home';
    let playingSourceData = null;

    // Seeded pseudo-random number generator for hourly variety
    function getSeededRandom(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        }
        return function() {
            const x = Math.sin(hash++) * 10000;
            return x - Math.floor(x);
        };
    }

    // Get current hourly seed string (e.g. "2026-05-25-08")
    function getHourlySeedKey() {
        const now = new Date();
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}`;
    }

    // Seeded shuffle helper
    function seededShuffle(array, randomFunc) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(randomFunc() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Generates a local SVG data URI for playlist cards (no network, no CORS issues)
    const _svg = (c1, c2, icon) => {
        const s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='300' height='300' fill='url(%23g)'/><text x='150' y='185' font-size='110' text-anchor='middle' fill='rgba(255,255,255,0.22)'>${icon}</text></svg>`;
        return `data:image/svg+xml;charset=utf-8,${s}`;
    };

    // Playlist theme images (SVG data URIs — zero CORS risk, zero network requests)
    const CHART_PLAYLIST_IMAGES = {
        romance:   [_svg('#ff6b9d','#c44d88','&#9829;'), _svg('#ff8fab','#e05c8e','&#9829;'), _svg('#ff4d8a','#b03a7a','&#9829;')],
        party:     [_svg('#8b5cf6','#3b82f6','&#9835;'), _svg('#7c3aed','#2563eb','&#9835;'), _svg('#9d4edd','#4287f5','&#9835;')],
        lofi:      [_svg('#1e3a5f','#0ea5e9','&#9833;'), _svg('#1a3352','#0891b2','&#9833;'), _svg('#162c47','#06b6d4','&#9833;')],
        devotional:[_svg('#f59e0b','#dc2626','&#2384;'), _svg('#d97706','#b91c1c','&#2384;'), _svg('#fbbf24','#ef4444','&#2384;')],
        workout:   [_svg('#10b981','#065f46','&#9889;'), _svg('#34d399','#047857','&#9889;'), _svg('#6ee7b7','#064e3b','&#9889;')],
        sad:       [_svg('#475569','#1e293b','&#9474;'), _svg('#64748b','#0f172a','&#9474;'), _svg('#334155','#020617','&#9474;')],
        retro:     [_svg('#c2410c','#92400e','&#9733;'), _svg('#ea580c','#78350f','&#9733;'), _svg('#9a3412','#451a03','&#9733;')],
        general:   [_svg('#7c3aed','#4c1d95','&#9836;'), _svg('#6d28d9','#3b0764','&#9836;'), _svg('#8b5cf6','#5b21b6','&#9836;'), _svg('#a855f7','#6d28d9','&#9836;'), _svg('#c084fc','#7e22ce','&#9836;'), _svg('#9333ea','#4a1272','&#9836;')]
    };

    let allDevotionalPlaylists = [];
    let currentDevotionalPage = 0;
    const devotionalPageSize = 24;

    let allFilteredArtists = [];
    let currentArtistsPage = 0;
    const artistsPageSize = 18;

    let currentNewReleasesPage = 0;
    const newReleasesPageSize = 24;
    let loadedNewReleasesSongs = [];

    let allTopCharts = [];
    let currentTopChartsPage = 0;
    const topChartsPageSize = 6;

    let allTopPlaylists = [];
    let currentTopPlaylistsPage = 0;
    const topPlaylistsPageSize = 24;

    function updateRadioCardsActiveState(title) {
        currentActiveRadioTitle = title;
        document.querySelectorAll('.radio-card').forEach(card => {
            const titleEl = card.querySelector('.card-title');
            if (titleEl && titleEl.textContent.trim() === title.trim()) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }

    // ---- Page Navigation History (Back/Forward) ----
    const viewHistory = {
        stack: [{ section: 'home', data: null }],
        currentIndex: 0,
        isNavigating: false,
        
        push(sectionName, artistData = null) {
            if (this.isNavigating) return;
            
            // Slice the stack to remove forward history if we are in the middle and push a new view
            this.stack = this.stack.slice(0, this.currentIndex + 1);
            
            // Don't push duplicate views consecutively
            const current = this.stack[this.currentIndex];
            if (current && current.section === sectionName && JSON.stringify(current.data) === JSON.stringify(artistData)) {
                return;
            }
            
            this.stack.push({ section: sectionName, data: artistData });
            this.currentIndex = this.stack.length - 1;
            this.updateButtons();
        },
        
        back() {
            if (this.currentIndex > 0) {
                this.isNavigating = true;
                this.currentIndex--;
                this.navigate();
                this.updateButtons();
                this.isNavigating = false;
            }
        },
        
        forward() {
            if (this.currentIndex < this.stack.length - 1) {
                this.isNavigating = true;
                this.currentIndex++;
                this.navigate();
                this.updateButtons();
                this.isNavigating = false;
            }
        },
        
        navigate() {
            const item = this.stack[this.currentIndex];
            if (!item) return;
            
            // Revert sidebar active highlight
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            
            let navId = '';
            if (item.section === 'home') navId = 'navHome';
            else if (item.section === 'liked') navId = 'navLiked';
            else if (item.section === 'played') navId = 'navPlayedSongs';
            else if (item.section === 'artists') navId = 'navArtists';
            else if (item.section === 'new-releases') navId = 'navNewReleases';
            else if (item.section === 'top-charts') navId = 'navTopCharts';
            else if (item.section === 'top-playlists') navId = 'navTopPlaylists';
            else if (item.section === 'devotional') navId = 'navDevotional';
            else if (item.section === 'radio') navId = 'navRadio';
            else if (item.section === 'albums') navId = 'navAlbums';
            
            if (navId) {
                const navEl = document.getElementById(navId);
                if (navEl) navEl.classList.add('active');
            }
            
            // Show section
            if (item.section === 'artist-detail') {
                showSectionDirectly('artist-detail');
                showArtistDetailsDirectly(item.data);
            } else if (item.section === 'album-detail') {
                showSectionDirectly('album-detail');
                if (item.data) {
                    showCollectionDetailDirectly(item.data.title, item.data.subtitle, item.data.imageUrl, item.data.tracks);
                }
            } else {
                showSectionDirectly(item.section);
            }
        },
        
        updateButtons() {
            const backBtn = document.getElementById('navBackBtn');
            const forwardBtn = document.getElementById('navForwardBtn');
            if (backBtn) {
                backBtn.disabled = this.currentIndex === 0;
                backBtn.style.opacity = this.currentIndex === 0 ? '0.3' : '1';
                backBtn.style.cursor = this.currentIndex === 0 ? 'not-allowed' : 'pointer';

                // Responsive dynamic display for back button on mobile
                if (window.innerWidth <= 768) {
                    if (this.currentIndex === 0) {
                        backBtn.style.setProperty('display', 'none', 'important');
                    } else {
                        backBtn.style.setProperty('display', 'flex', 'important');
                    }
                } else {
                    backBtn.style.display = 'flex';
                }
            }
            if (forwardBtn) {
                forwardBtn.disabled = this.currentIndex === this.stack.length - 1;
                forwardBtn.style.opacity = this.currentIndex === this.stack.length - 1 ? '0.3' : '1';
                forwardBtn.style.cursor = this.currentIndex === this.stack.length - 1 ? 'not-allowed' : 'pointer';
            }
        }
    };

    // Setup history buttons event listeners
    const backBtnEl = document.getElementById('navBackBtn');
    const forwardBtnEl = document.getElementById('navForwardBtn');
    if (backBtnEl) {
        backBtnEl.addEventListener('click', () => viewHistory.back());
    }
    if (forwardBtnEl) {
        forwardBtnEl.addEventListener('click', () => viewHistory.forward());
    }
    viewHistory.updateButtons(); // Initial state setup

    // ---- Mobile Sidebar toggle logic ----
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const navItems = document.querySelectorAll('.nav-item');

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
        const toggleSidebar = () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        };

        const closeSidebar = () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        };

        mobileMenuBtn.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);

        // Close sidebar when clicking any navigation link on mobile
        navItems.forEach(item => {
            item.addEventListener('click', closeSidebar);
        });
    }

    // ---- Desktop Sidebar toggle logic ----
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const icon = sidebarToggleBtn.querySelector('i');
            if (icon) {
                if (sidebar.classList.contains('collapsed')) {
                    icon.className = 'bx bx-menu-alt-left';
                } else {
                    icon.className = 'bx bx-menu';
                }
            }
        });
    }

    let currentSearchQuery = '';
    let currentSearchPage = 0;
    let currentSearchResults = [];

    // ---- Real-time greeting & clock ----
    const heroGreeting = document.getElementById('heroGreeting');
    const heroClock = document.getElementById('heroClock');
    const heroDate = document.getElementById('heroDate');

    function updateGreetingAndClock() {
        const now = new Date();
        const h = now.getHours();
        
        // 1. Time-based greeting
        let greeting = 'Good morning';
        let emoji = '☀️';
        if (h >= 12 && h < 17) { greeting = 'Good afternoon'; emoji = '👋'; }
        else if (h >= 17 && h < 21) { greeting = 'Good evening'; emoji = '🌆'; }
        else if (h >= 21 || h < 5) { greeting = 'Good night'; emoji = '🌙'; }
        
        if (heroGreeting) {
            heroGreeting.textContent = `${greeting} ${emoji}`;
        }
        
        // 2. Real-time Clock
        if (heroClock) {
            let hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            heroClock.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
        }
        
        // 3. Real-time Date
        if (heroDate) {
            const options = { weekday: 'long', month: 'short', day: 'numeric' };
            heroDate.textContent = now.toLocaleDateString('en-US', options);
        }
    }
    updateGreetingAndClock();
    setInterval(updateGreetingAndClock, 1000);

    // ---- Equalizer Animation (now-playing indicator) ----
    function showEqualizerInPlayer() {
        const trackInfo = document.querySelector('.track-info');
        let anim = document.querySelector('.now-playing-anim');
        if (!anim) {
            anim = document.createElement('div');
            anim.className = 'now-playing-anim';
            anim.innerHTML = '<span></span><span></span><span></span><span></span>';
            const details = document.querySelector('.track-details');
            if (details) {
                details.after(anim);
            } else if (trackInfo) {
                trackInfo.appendChild(anim);
            }
        }
        if (anim) anim.style.display = 'flex';
    }

    // Patch player.setQueue to trigger equalizer and track playback source
    const _origSetQueue = player.setQueue.bind(player);
    player.setQueue = function(songs, index) {
        // Record current navigation view as the source of playback
        if (typeof viewHistory !== 'undefined' && viewHistory.stack && viewHistory.currentIndex !== undefined) {
            const currentView = viewHistory.stack[viewHistory.currentIndex];
            if (currentView) {
                playingSourceSection = currentView.section || 'home';
                playingSourceData = currentView.data || null;

                // Show the "From Playing" button now that we have a playing source
                const fromPlayingBtn = document.getElementById('fromPlayingBtn');
                if (fromPlayingBtn) {
                    fromPlayingBtn.style.display = 'inline-flex';
                }
            }
        }
        _origSetQueue(songs, index);
        showEqualizerInPlayer();
    };

    // ---- Render Helpers ----

    function createSongCard(song, songList, index) {
        const imgUrl = api.getBestImageUrl(song) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22180%22 height=%22180%22 viewBox=%220 0 180 180%22%3E%3Crect fill=%22%231a1a2e%22 width=%22180%22 height=%22180%22/%3E%3Ctext y=%22.9em%22 x=%2250%25%22 text-anchor=%22middle%22 font-size=%2272%22 dominant-baseline=%22top%22 dy=%2240%22%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E';
        const rawName = decodeHtml(song.name);
        const artistName = song.artists?.primary?.map(a => decodeHtml(a.name)).join(', ') || 'Unknown Artist';

        const currentSong = player.getCurrentSong();
        const isCurrent = currentSong && currentSong.id === song.id;
        const isPlayingState = isCurrent && player.getPlayingState();

        const card = document.createElement('div');
        card.className = `music-card${isCurrent ? ' active' : ''}`;
        card.dataset.id = song.id;
        card.innerHTML = `
            <div class="card-image-container skeleton">
                <img src="${imgUrl}" alt="${escapeHtml(rawName)}" style="opacity:0; transition: opacity 0.3s ease;" onload="this.style.opacity=1; this.parentElement.classList.remove('skeleton');" onerror="this.style.opacity=1; this.parentElement.classList.remove('skeleton');" loading="lazy">
                <button class="card-play-btn">
                    <i class='bx ${isPlayingState ? 'bx-pause' : 'bx-play'}'></i>
                </button>
            </div>
            <div class="card-title">${escapeHtml(rawName)}</div>
            <div class="card-subtitle">${escapeHtml(artistName)}</div>
        `;

        const handleCardPlay = () => {
            const current = player.getCurrentSong();
            if (current && current.id === song.id) {
                player.togglePlayPause();
            } else {
                player.setQueue(songList, index);
            }
        };

        card.querySelector('.card-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleCardPlay();
        });

        card.addEventListener('click', () => {
            handleCardPlay();
        });

        return card;
    }

    function renderSongCards(songs, gridEl) {
        gridEl.innerHTML = '';
        if (!songs || songs.length === 0) {
            gridEl.innerHTML = '<p style="color: var(--text-secondary); padding: 16px 0;">No results found.</p>';
            return;
        }
        
        // Deduplicate songs by version key to ensure unique version copies are shown
        const uniqueSongs = api.deduplicateSongs(songs);

        uniqueSongs.forEach((song, idx) => {
            gridEl.appendChild(createSongCard(song, uniqueSongs, idx));
        });

        // Trigger silent data-saver aware background pre-fetching of first 2 songs
        if (typeof player !== 'undefined' && player.prefetchSongs) {
            player.prefetchSongs(uniqueSongs);
        }
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Decode HTML entities from API responses (e.g. &quot; -> ")
    function decodeHtml(str) {
        if (!str) return '';
        const txt = document.createElement('textarea');
        txt.innerHTML = str;
        return txt.value;
    }

    // ---- Home Screen ----

    async function loadHomeSections() {
        mainLoader.classList.remove('hidden');
        homeSection.classList.add('hidden');
        heroBanner.classList.add('hidden');

        // Helper to shuffle array
        function shuffle(array) {
            const arr = [...array];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        // Get saved preferences
        let userLangs = [];
        let userArtists = [];
        try {
            userLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
            userArtists = JSON.parse(localStorage.getItem('symphonyUserArtists') || '[]');
        } catch (e) {
            console.error('Failed to parse preferences', e);
        }

        let musicPool = [];

        if (userLangs && userLangs.length > 0) {
            // Add music shelves matching selected languages
            userLangs.forEach(lang => {
                const langShelves = api.LANGUAGE_SHELVES[lang.toLowerCase()];
                if (langShelves) {
                    const shelvesWithLang = langShelves.map(s => ({ ...s, targetLang: lang }));
                    musicPool = musicPool.concat(shelvesWithLang);
                }
            });

            // Add artist special shelves for selected artists
            if (userArtists && userArtists.length > 0) {
                userArtists.forEach(artist => {
                    musicPool.push({
                        title: `${artist} Special 🎤`,
                        query: `${artist} Hits`
                    });
                });
            }
        } else {
            // Fallback for guest user or no selection - pool everything
            Object.entries(api.LANGUAGE_SHELVES).forEach(([langKey, shelves]) => {
                const shelvesWithLang = shelves.map(s => ({ ...s, targetLang: langKey }));
                musicPool = musicPool.concat(shelvesWithLang);
            });
            // Also add standard fallback shelves
            musicPool = musicPool.concat(api.HOME_SHELVES);
        }

        // De-duplicate pools to prevent duplicate queries/shelves
        const uniqueMusicPool = [];
        const seenMusicQueries = new Set();
        musicPool.forEach(s => {
            if (!seenMusicQueries.has(s.query)) {
                seenMusicQueries.add(s.query);
                uniqueMusicPool.push(s);
            }
        });

        // Select 6 random music shelves
        const shelves = shuffle(uniqueMusicPool).slice(0, 6);

        // Fetch all shelves in parallel (more songs fetched to allow language filtering)
        let results = await Promise.all(
            shelves.map(shelf => api.searchSongs(shelf.query, 0, 24))
        );

        // Apply language filtering to results
        results = results.map((songs, i) => {
            const targetLang = shelves[i].targetLang;
            if (targetLang && songs) {
                return songs.filter(song => {
                    if (song.language) {
                        return song.language.toLowerCase() === targetLang.toLowerCase();
                    }
                    return true;
                }).slice(0, 16);
            }
            return songs ? songs.slice(0, 16) : [];
        });

        // Fetch suggestions based on the first song of the top shelf
        let recommendations = [];
        if (api.currentSource !== 'ytmusic' && results[0] && results[0][0]) {
            try {
                recommendations = await api.getSongSuggestions(results[0][0].id, 16);
            } catch (err) {
                console.error('Failed to load recommendation shelf:', err);
            }
        }

        mainLoader.classList.add('hidden');
        homeSection.classList.remove('hidden');
        heroBanner.classList.remove('hidden');

        // Clear existing dynamic sections
        document.querySelectorAll('.music-section.dynamic').forEach(el => el.remove());

        const contentScroll = document.querySelector('.content-scroll');

        // 0. Render Recently Played Shelf if available
        const recentSongs = player.getRecentlyPlayed();
        if (recentSongs && recentSongs.length > 0) {
            const section = document.createElement('section');
            section.className = 'music-section dynamic';
            section.innerHTML = `<h2>Recently Played 🕒</h2>`;

            const shelf = document.createElement('div');
            shelf.className = 'card-shelf';
            renderSongCards(recentSongs, shelf);
            section.appendChild(shelf);
            contentScroll.appendChild(section);
        }

        // 1. Render Recommendation Shelf first if available
        if (recommendations && recommendations.length > 0) {
            const section = document.createElement('section');
            section.className = 'music-section dynamic';
            section.innerHTML = `<h2>Recommended For You ✨</h2>`;

            const shelf = document.createElement('div');
            shelf.className = 'card-shelf';
            renderSongCards(recommendations, shelf);
            section.appendChild(shelf);
            contentScroll.appendChild(section);
        }

        // 2. Render each category shelf dynamically
        results.forEach((songs, i) => {
            if (!songs || songs.length === 0) return;

            const section = document.createElement('section');
            section.className = 'music-section dynamic';
            section.innerHTML = `<h2>${escapeHtml(decodeHtml(shelves[i].title))}</h2>`;

            const shelf = document.createElement('div');
            shelf.className = 'card-shelf';
            renderSongCards(songs, shelf);
            section.appendChild(shelf);

            contentScroll.appendChild(section);
        });

        // Use top picks for the main dashboard "Trending Now" grid
        if (results[0] && results[0].length > 0) {
            // Limit dashboard Top Picks grid to 6 items to keep it clean, remaining items scroll in shelf
            renderSongCards(results[0].slice(0, 6), trendingGrid);
            homeSection.querySelector('h2').textContent = 'Top Picks';
        }
    }

    // ---- Navigation & Views ----
    const navHome = document.getElementById('navHome');
    const navLiked = document.getElementById('navLiked');
    const navArtists = document.getElementById('navArtists');
    const navPlayedSongs = document.getElementById('navPlayedSongs');
    
    const likedSongsSection = document.getElementById('likedSongsSection');
    const likedSongsGrid = document.getElementById('likedSongsGrid');
    const playedSongsSection = document.getElementById('playedSongsSection');
    const playedSongsGrid = document.getElementById('playedSongsGrid');
    
    const artistsSection = document.getElementById('artistsSection');
    const artistsGrid = document.getElementById('artistsGrid');
    const artistDetailSection = document.getElementById('artistDetailSection');
    const artistDetailImg = document.getElementById('artistDetailImg');
    const artistDetailName = document.getElementById('artistDetailName');
    const artistDetailGrid = document.getElementById('artistDetailGrid');
    const playArtistRadioBtn = document.getElementById('playArtistRadioBtn');
    const loadMoreArtistBtn = document.getElementById('loadMoreArtistBtn');

    // New Sections & Grids (Terminated / Mocked to prevent JS crashes)
    const newReleasesSection = document.getElementById('newReleasesSection') || document.createElement('div');
    const newReleasesGrid = document.getElementById('newReleasesGrid') || document.createElement('div');
    const topChartsSection = document.getElementById('topChartsSection') || document.createElement('div');
    const topChartsGrid = document.getElementById('topChartsGrid') || document.createElement('div');
    const topPlaylistsSection = document.getElementById('topPlaylistsSection');
    const topPlaylistsGrid = document.getElementById('topPlaylistsGrid');
    const devotionalSection = document.getElementById('devotionalSection');
    const devotionalGrid = document.getElementById('devotionalGrid');
    const radioSection = document.getElementById('radioSection');
    const radioGrid = document.getElementById('radioGrid');
    const albumsSection = document.getElementById('albumsSection');
    const albumsGrid = document.getElementById('albumsGrid');
    const albumDetailSection = document.getElementById('albumDetailSection');
    const albumDetailImg = document.getElementById('albumDetailImg');
    const albumDetailName = document.getElementById('albumDetailName');
    const albumDetailSub = document.getElementById('albumDetailSub');
    const albumDetailGrid = document.getElementById('albumDetailGrid');
    const playAlbumBtn = document.getElementById('playAlbumBtn');

    const relatedSearchResultsContainer = document.getElementById('relatedSearchResultsContainer');
    const relatedSearchResultsGrid = document.getElementById('relatedSearchResultsGrid');
    
    const relatedSearchPlaylistsContainer = document.getElementById('relatedSearchPlaylistsContainer');
    const relatedSearchPlaylistsGrid = document.getElementById('relatedSearchPlaylistsGrid');
    const relatedSearchRadiosContainer = document.getElementById('relatedSearchRadiosContainer');
    const relatedSearchRadiosGrid = document.getElementById('relatedSearchRadiosGrid');
    const loadMoreRadioBtn = document.getElementById('loadMoreRadioBtn');
    const loadMoreDevotionalBtn = document.getElementById('loadMoreDevotionalBtn');
    const loadMoreArtistsBtn = document.getElementById('loadMoreArtistsBtn');
    const loadMoreNewReleasesBtn = document.getElementById('loadMoreNewReleasesBtn');
    const loadMoreTopChartsBtn = document.getElementById('loadMoreTopChartsBtn');
    const loadMoreTopPlaylistsBtn = document.getElementById('loadMoreTopPlaylistsBtn');

    // Local SVG fallback for artist images (avoids CORS/ORB issues with external default images)
    const ARTIST_FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 150'><defs><linearGradient id='ag' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%236d28d9'/><stop offset='100%25' stop-color='%23a855f7'/></linearGradient></defs><rect width='150' height='150' fill='url(%23ag)'/><circle cx='75' cy='58' r='28' fill='rgba(255,255,255,0.25)'/><ellipse cx='75' cy='115' rx='42' ry='28' fill='rgba(255,255,255,0.15)'/></svg>`;

    async function fetchActualArtistImage(artistName, fallbackImg) {
        if (!artistName) return fallbackImg || ARTIST_FALLBACK_SVG;
        const cacheKey = `symphonyArtistImage_${artistName.toLowerCase().trim()}`;
        const cached = localStorage.getItem(cacheKey);
        // Return cached value only if it's a valid saavncdn URL (not the old broken jiosaavn CDN)
        if (cached && !cached.includes('jiosaavn.com/_i/')) return cached;
        
        try {
            const res = await fetch(`https://saavn.sumit.co/api/search/artists?query=${encodeURIComponent(artistName)}`);
            if (!res.ok) return fallbackImg || ARTIST_FALLBACK_SVG;
            const data = await res.json();
            if (data.success && data.data && data.data.results && data.data.results.length > 0) {
                const imgObj = data.data.results[0].image;
                if (imgObj && imgObj.length > 0) {
                    const match = imgObj.find(img => img.quality === '150x150') || imgObj[imgObj.length - 1];
                    // Only use saavncdn.com URLs — they support CORS. Skip jiosaavn.com/_i/ (old CDN, ERR_BLOCKED_BY_ORB)
                    if (match && match.url && match.url.includes('saavncdn.com')) {
                        localStorage.setItem(cacheKey, match.url);
                        return match.url;
                    }
                }
            }
        } catch (e) {
            console.warn(`[Symphony] Artist image fetch failed for: ${artistName}`);
        }
        return fallbackImg || ARTIST_FALLBACK_SVG;
    }

    let currentArtistTracks = [];

    const POPULAR_ARTISTS = api.ARTISTS_CONFIG;

    let currentArtistLanguageFilter = 'all';

    function showSectionDirectly(sectionToShow) {
        searchResultsSection.classList.add('hidden');
        homeSection.classList.add('hidden');
        heroBanner.classList.add('hidden');
        likedSongsSection.classList.add('hidden');
        playedSongsSection.classList.add('hidden');
        artistsSection.classList.add('hidden');
        artistDetailSection.classList.add('hidden');
        newReleasesSection.classList.add('hidden');
        topChartsSection.classList.add('hidden');
        topPlaylistsSection.classList.add('hidden');
        devotionalSection.classList.add('hidden');
        radioSection.classList.add('hidden');
        albumsSection.classList.add('hidden');
        albumDetailSection.classList.add('hidden');
        document.querySelectorAll('.music-section.dynamic').forEach(el => el.classList.add('hidden'));

        if (sectionToShow === 'home') {
            homeSection.classList.remove('hidden');
            heroBanner.classList.remove('hidden');
            document.querySelectorAll('.music-section.dynamic').forEach(el => el.classList.remove('hidden'));
        } else if (sectionToShow === 'search') {
            searchResultsSection.classList.remove('hidden');
        } else if (sectionToShow === 'liked') {
            likedSongsSection.classList.remove('hidden');
            renderLikedSongs();
        } else if (sectionToShow === 'played') {
            playedSongsSection.classList.remove('hidden');
            renderPlayedSongs();
        } else if (sectionToShow === 'artists') {
            artistsSection.classList.remove('hidden');
            renderArtistsGrid();
        } else if (sectionToShow === 'artist-detail') {
            artistDetailSection.classList.remove('hidden');
        } else if (sectionToShow === 'new-releases') {
            newReleasesSection.classList.remove('hidden');
            loadNewReleases();
        } else if (sectionToShow === 'top-charts') {
            topChartsSection.classList.remove('hidden');
            loadTopCharts();
        } else if (sectionToShow === 'top-playlists') {
            topPlaylistsSection.classList.remove('hidden');
            loadTopPlaylists();
        } else if (sectionToShow === 'devotional') {
            devotionalSection.classList.remove('hidden');
            loadDevotional();
        } else if (sectionToShow === 'radio') {
            radioSection.classList.remove('hidden');
            loadRadio();
        } else if (sectionToShow === 'albums') {
            albumsSection.classList.remove('hidden');
            loadAlbums();
        } else if (sectionToShow === 'album-detail') {
            albumDetailSection.classList.remove('hidden');
        }
    }

    function showSection(sectionToShow, data = null) {
        showSectionDirectly(sectionToShow);
        viewHistory.push(sectionToShow, data);
    }

    function renderLikedSongs() {
        const songs = player.getLikedSongs();
        renderSongCards(songs, likedSongsGrid);
    }

    function renderPlayedSongs() {
        const songs = player.getRecentlyPlayed();
        renderSongCards(songs, playedSongsGrid);
    }

    function renderArtistsGrid() {
        if (!artistsGrid) return;
        
        // Render Filters once if not already rendered
        const filtersEl = document.getElementById('artistFilters');
        if (filtersEl && filtersEl.children.length === 0) {
            const languages = [
                { id: 'all', name: 'All 🌟' },
                { id: 'hindi', name: 'Hindi 🇮🇳' },
                { id: 'english', name: 'English 🇬🇧' },
                { id: 'punjabi', name: 'Punjabi 🌾' },
                { id: 'bhojpuri', name: 'Bhojpuri 🦁' },
                { id: 'bengali', name: 'Bengali 🎨' },
                { id: 'haryanvi', name: 'Haryanvi 🚜' },
                { id: 'tamil', name: 'Tamil 🛕' },
                { id: 'telugu', name: 'Telugu 🌊' },
                { id: 'kannada', name: 'Kannada 🪕' },
                { id: 'malayalam', name: 'Malayalam 🌴' },
                { id: 'marathi', name: 'Marathi 🏰' },
                { id: 'gujarati', name: 'Gujarati 🪁' },
                { id: 'rajasthani', name: 'Rajasthani 🐪' }
            ];

            languages.forEach(lang => {
                const btn = document.createElement('button');
                btn.className = 'filter-btn';
                if (lang.id === currentArtistLanguageFilter) btn.classList.add('active');
                btn.textContent = lang.name;
                btn.addEventListener('click', () => {
                    filtersEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentArtistLanguageFilter = lang.id;
                    displayFilteredArtists();
                });
                filtersEl.appendChild(btn);
            });
        }

        displayFilteredArtists();
    }

    function renderArtistsChunk(chunk) {
        if (!artistsGrid) return;
        chunk.forEach(artist => {
            const card = document.createElement('div');
            card.className = 'artist-card';
            const imgId = `art-grid-img-${artist.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
            card.innerHTML = `
                <img id="${imgId}" class="artist-card-image" src="${escapeHtml(artist.img)}" alt="${escapeHtml(artist.name)}" loading="lazy">
                <div class="artist-card-name">${escapeHtml(artist.name)}</div>
            `;
            card.addEventListener('click', () => {
                showArtistDetails(artist);
            });
            artistsGrid.appendChild(card);

            // Fetch actual singer photo in the background
            fetchActualArtistImage(artist.name, artist.img).then(url => {
                const imgEl = document.getElementById(imgId);
                if (imgEl) imgEl.src = url;
                artist.actualImg = url; // Save fetched image ref
            });
        });
    }

    function displayFilteredArtists() {
        if (!artistsGrid) return;
        artistsGrid.innerHTML = '';

        const filtered = POPULAR_ARTISTS.filter(artist => {
            if (currentArtistLanguageFilter === 'all') return true;
            return artist.lang === currentArtistLanguageFilter;
        });

        if (filtered.length === 0) {
            artistsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 24px;">No artists found for this language selection.</p>`;
            if (loadMoreArtistsBtn) loadMoreArtistsBtn.classList.add('hidden');
            return;
        }

        allFilteredArtists = filtered;
        currentArtistsPage = 0;

        renderArtistsChunk(allFilteredArtists.slice(0, artistsPageSize));

        if (loadMoreArtistsBtn) {
            if (allFilteredArtists.length > artistsPageSize) {
                loadMoreArtistsBtn.classList.remove('hidden');
            } else {
                loadMoreArtistsBtn.classList.add('hidden');
            }
        }
    }

    async function showArtistDetailsDirectly(artist) {
        if (!artistDetailSection) return;
        
        currentArtistObject = artist;
        currentArtistPage = 0;
        if (loadMoreArtistBtn) {
            loadMoreArtistBtn.classList.add('hidden');
        }

        artistDetailName.textContent = artist.name;
        artistDetailImg.src = artist.actualImg || artist.img;
        
        if (!artist.actualImg) {
            fetchActualArtistImage(artist.name, artist.img).then(url => {
                artistDetailImg.src = url;
                artist.actualImg = url;
            });
        }

        artistDetailGrid.innerHTML = `<div class="loader-container" style="grid-column:1/-1"><div class="spinner"></div></div>`;
        showSectionDirectly('artist-detail');
        
        try {
            const artistConfigObj = api.ARTISTS_CONFIG.find(a => a.name.toLowerCase() === artist.name.toLowerCase());
            const artistLang = artistConfigObj ? artistConfigObj.lang : null;

            const songs = await api.searchSongs(artist.name, 0, 40);
            
            let filteredSongs = songs;
            if (artistLang) {
                filteredSongs = songs.filter(song => {
                    if (song.language) {
                        return song.language.toLowerCase() === artistLang.toLowerCase();
                    }
                    return true;
                });
            }
            
            currentArtistTracks = filteredSongs;
            renderSongCards(filteredSongs, artistDetailGrid);
            
            if (!filteredSongs || filteredSongs.length === 0) {
                artistDetailGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No songs found for this artist.</p>`;
            }

            if (songs.length >= 40 && loadMoreArtistBtn) {
                loadMoreArtistBtn.classList.remove('hidden');
            } else if (loadMoreArtistBtn) {
                loadMoreArtistBtn.classList.add('hidden');
            }
        } catch (err) {
            console.error('Failed to load artist tracks:', err);
            artistDetailGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #ff5555;">Error loading tracks for this artist.</p>`;
        }
    }

    async function showArtistDetails(artist) {
        await showArtistDetailsDirectly(artist);
        viewHistory.push('artist-detail', artist);
    }

    if (playArtistRadioBtn) {
        playArtistRadioBtn.addEventListener('click', () => {
            if (currentArtistTracks && currentArtistTracks.length > 0) {
                showToast(`🎙️ Playing top tracks of <strong>${escapeHtml(artistDetailName.textContent)}</strong>`);
                player.setQueue(currentArtistTracks, 0);
            } else {
                showToast('⚠️ No songs loaded to play.');
            }
        });
    }

    if (loadMoreArtistBtn) {
        loadMoreArtistBtn.addEventListener('click', async () => {
            if (!currentArtistObject) return;
            currentArtistPage++;
            loadMoreArtistBtn.disabled = true;
            loadMoreArtistBtn.textContent = 'Loading...';
            try {
                const artistConfigObj = api.ARTISTS_CONFIG.find(a => a.name.toLowerCase() === currentArtistObject.name.toLowerCase());
                const artistLang = artistConfigObj ? artistConfigObj.lang : null;
                
                const nextSongs = await api.searchSongs(currentArtistObject.name, currentArtistPage, 40);
                
                let filtered = nextSongs;
                if (artistLang) {
                    filtered = nextSongs.filter(song => {
                        if (song.language) {
                            return song.language.toLowerCase() === artistLang.toLowerCase();
                        }
                        return true;
                    });
                }
                
                if (filtered.length > 0) {
                    currentArtistTracks = currentArtistTracks.concat(filtered);
                    renderSongCards(currentArtistTracks, artistDetailGrid);
                }
                
                if (nextSongs.length < 40) {
                    loadMoreArtistBtn.classList.add('hidden');
                }
            } catch (err) {
                console.error('Failed to load more artist tracks:', err);
                showToast('❌ Error loading more tracks.');
            } finally {
                loadMoreArtistBtn.disabled = false;
                loadMoreArtistBtn.textContent = 'Load More Songs';
            }
        });
    }

    if (loadMoreRadioBtn) {
        loadMoreRadioBtn.addEventListener('click', () => {
            currentRadioPage++;
            const start = currentRadioPage * radioPageSize;
            const end = (currentRadioPage + 1) * radioPageSize;
            const nextStations = allRadioStations.slice(start, end);
            renderRadioChunk(nextStations);
            
            if (end >= allRadioStations.length) {
                loadMoreRadioBtn.classList.add('hidden');
            }
        });
    }

    if (loadMoreDevotionalBtn) {
        loadMoreDevotionalBtn.addEventListener('click', () => {
            currentDevotionalPage++;
            const start = currentDevotionalPage * devotionalPageSize;
            const end = (currentDevotionalPage + 1) * devotionalPageSize;
            const nextPlaylists = allDevotionalPlaylists.slice(start, end);
            renderDevotionalChunk(nextPlaylists);
            
            if (end >= allDevotionalPlaylists.length) {
                loadMoreDevotionalBtn.classList.add('hidden');
            }
        });
    }

    if (loadMoreArtistsBtn) {
        loadMoreArtistsBtn.addEventListener('click', () => {
            currentArtistsPage++;
            const start = currentArtistsPage * artistsPageSize;
            const end = (currentArtistsPage + 1) * artistsPageSize;
            const nextArtists = allFilteredArtists.slice(start, end);
            renderArtistsChunk(nextArtists);
            
            if (end >= allFilteredArtists.length) {
                loadMoreArtistsBtn.classList.add('hidden');
            }
        });
    }

    // Infinite Scroll Helper using IntersectionObserver
    const setupInfiniteScroll = (btn) => {
        if (!btn) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !btn.classList.contains('hidden') && btn.style.display !== 'none' && !btn.disabled && btn.textContent !== 'Loading...') {
                console.log('Infinite scroll: auto-loading more items...');
                btn.click();
            }
        }, {
            root: null,
            rootMargin: '120px',
            threshold: 0.1
        });
        observer.observe(btn);
    };

    // Initialize Infinite Scroll
    setTimeout(() => {
        setupInfiniteScroll(loadMoreSearchBtn);
        setupInfiniteScroll(loadMoreDevotionalBtn);
        setupInfiniteScroll(loadMoreArtistsBtn);
        setupInfiniteScroll(loadMoreTopPlaylistsBtn);
    }, 1000);

    if (loadMoreNewReleasesBtn) {
        loadMoreNewReleasesBtn.addEventListener('click', async () => {
            currentNewReleasesPage++;
            loadMoreNewReleasesBtn.disabled = true;
            loadMoreNewReleasesBtn.textContent = 'Loading...';
            try {
                const langs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '["hindi", "english"]');
                const promises = [];
                
                langs.forEach(lang => {
                    promises.push(api.searchSongs(`latest ${lang} songs 2026`, currentNewReleasesPage, 15));
                    promises.push(api.searchSongs(`new release ${lang} songs`, currentNewReleasesPage, 15));
                });
                
                const results = await Promise.all(promises);
                let combined = [];
                results.forEach((res, index) => {
                    if (res && res.length > 0) {
                        const langIndex = Math.floor(index / 2);
                        const targetLang = langs[langIndex];
                        const filtered = res.filter(song => {
                            if (song.language) {
                                return song.language.toLowerCase() === targetLang.toLowerCase();
                            }
                            return true;
                        });
                        combined = combined.concat(filtered);
                    }
                });
                
                // Deduplicate against existing songs in loadedNewReleasesSongs
                const seenIds = new Set(loadedNewReleasesSongs.map(s => s.id));
                combined = combined.filter(song => {
                    if (!song || !song.id) return false;
                    if (seenIds.has(song.id)) return false;
                    seenIds.add(song.id);
                    return true;
                });
                
                // Shuffle
                combined = combined.sort(() => 0.5 - Math.random()).slice(0, 24);
                
                if (combined.length > 0) {
                    loadedNewReleasesSongs = loadedNewReleasesSongs.concat(combined);
                    renderSongCards(loadedNewReleasesSongs, newReleasesGrid);
                } else {
                    showToast('ℹ️ No more new releases found.');
                    loadMoreNewReleasesBtn.classList.add('hidden');
                }
            } catch (err) {
                console.error('Failed to load more new releases:', err);
                showToast('❌ Error loading more new releases.');
            } finally {
                loadMoreNewReleasesBtn.disabled = false;
                loadMoreNewReleasesBtn.textContent = 'Load More New Releases';
            }
        });
    }

    if (loadMoreTopChartsBtn) {
        loadMoreTopChartsBtn.addEventListener('click', () => {
            currentTopChartsPage++;
            const start = currentTopChartsPage * topChartsPageSize;
            const end = (currentTopChartsPage + 1) * topChartsPageSize;
            const nextCharts = allTopCharts.slice(start, end);
            renderTopChartsChunk(nextCharts);
            
            if (end >= allTopCharts.length) {
                loadMoreTopChartsBtn.classList.add('hidden');
            }
        });
    }

    if (loadMoreTopPlaylistsBtn) {
        loadMoreTopPlaylistsBtn.addEventListener('click', () => {
            currentTopPlaylistsPage++;
            const start = currentTopPlaylistsPage * topPlaylistsPageSize;
            const end = (currentTopPlaylistsPage + 1) * topPlaylistsPageSize;
            const nextPlaylists = allTopPlaylists.slice(start, end);
            renderTopPlaylistsChunk(nextPlaylists);
            
            if (end >= allTopPlaylists.length) {
                loadMoreTopPlaylistsBtn.classList.add('hidden');
            }
        });
    }

    // Handle navigation clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Always close preferences modal first (it blocks pointer events if left open)
            const _prefModal = document.getElementById('preferencesModal');
            if (_prefModal && !_prefModal.classList.contains('hidden')) {
                _prefModal.classList.add('hidden');
            }

            if (item.id === 'navPreferences') {
                openPreferencesModal(false);
                return;
            }

            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            if (item.id === 'navHome') {
                searchInput.value = '';
                showSection('home');
                loadHomeSections();
            } else if (item.id === 'navLiked') {
                showSection('liked');
            } else if (item.id === 'navPlayedSongs') {
                showSection('played');
            } else if (item.id === 'navArtists') {
                showSection('artists');
            } else if (item.id === 'navTopPlaylists') {
                showSection('top-playlists');
            } else if (item.id === 'navDevotional') {
                showSection('devotional');
            } else if (item.id === 'navRadio') {
                showSection('radio');
            } else if (item.id === 'navAlbums') {
                showSection('albums');
            }
        });
    });

    // Listen to updates from player bar like clicks
    window.addEventListener('likedSongsUpdated', () => {
        if (!likedSongsSection.classList.contains('hidden')) {
            renderLikedSongs();
        }
    });

    window.addEventListener('recentlyPlayedUpdated', () => {
        if (!playedSongsSection.classList.contains('hidden')) {
            renderPlayedSongs();
        }
    });

    window.addEventListener('playbackStateChanged', (e) => {
        const { songId, isPlaying } = e.detail;
        document.querySelectorAll('.music-card').forEach(card => {
            const cardId = card.dataset.id;
            const playBtnIcon = card.querySelector('.card-play-btn i');
            if (cardId === songId) {
                card.classList.add('active');
                if (playBtnIcon) {
                    playBtnIcon.className = isPlaying ? 'bx bx-pause' : 'bx bx-play';
                }
            } else {
                card.classList.remove('active');
                if (playBtnIcon) {
                    playBtnIcon.className = 'bx bx-play';
                }
            }
        });
    });

    // ---- Search ----

    let searchDebounceTimer = null;

    const performSearchDirectly = async (query) => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        showSection('search');
        loadMoreSearchBtn.classList.add('hidden');
        
        if (relatedSearchResultsContainer) {
            relatedSearchResultsContainer.classList.add('hidden');
            relatedSearchResultsGrid.innerHTML = '';
        }
        if (relatedSearchPlaylistsContainer) {
            relatedSearchPlaylistsContainer.classList.add('hidden');
            relatedSearchPlaylistsGrid.innerHTML = '';
        }
        if (relatedSearchRadiosContainer) {
            relatedSearchRadiosContainer.classList.add('hidden');
            relatedSearchRadiosGrid.innerHTML = '';
        }

        searchResultsGrid.innerHTML = `<div class="loader-container" style="grid-column:1/-1"><div class="spinner"></div></div>`;
        
        currentSearchQuery = query;
        currentSearchPage = 0;
        
        try {
            const songs = await api.searchSongs(query, 0, 24);
            currentSearchResults = songs;
            renderSongCards(songs, searchResultsGrid);

            if (songs && songs.length >= 24) {
                loadMoreSearchBtn.classList.remove('hidden');
            } else {
                loadMoreSearchBtn.classList.add('hidden');
            }

            // Fetch and render related songs asynchronously
            if (songs && songs.length > 0) {
                getRelatedSongsForQuery(query, songs).then(relatedSongs => {
                    if (relatedSongs && relatedSongs.length > 0 && relatedSearchResultsContainer) {
                        renderSongCards(relatedSongs, relatedSearchResultsGrid);
                        relatedSearchResultsContainer.classList.remove('hidden');
                    }
                }).catch(err => console.error('Failed to load related songs:', err));
            }

            // Fetch and render related playlists
            api.searchPlaylists(query, 8).then(playlists => {
                if (playlists && playlists.length > 0 && relatedSearchPlaylistsContainer) {
                    renderPlaylistCards(playlists, relatedSearchPlaylistsGrid);
                    relatedSearchPlaylistsContainer.classList.remove('hidden');
                }
            }).catch(err => console.error('Failed to load related playlists:', err));

            // Fetch and render related radios
            if (songs && songs.length > 0) {
                const radioStations = getRelatedRadiosForQuery(query, songs);
                if (radioStations && radioStations.length > 0 && relatedSearchRadiosContainer) {
                    renderRelatedRadioCards(radioStations, relatedSearchRadiosGrid);
                    relatedSearchRadiosContainer.classList.remove('hidden');
                }
            }
        } catch (err) {
            console.error('Failed search execution:', err);
            searchResultsGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color: #ff5555;">Failed to load search results.</p>`;
        }
    };

    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        const query = searchInput.value.trim();

        if (clearSearchBtn) {
            if (query) {
                clearSearchBtn.classList.remove('hidden');
            } else {
                clearSearchBtn.classList.add('hidden');
            }
        }

        if (!query) {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navHome.classList.add('active');
            showSection('home');
            loadMoreSearchBtn.classList.add('hidden');
            if (relatedSearchResultsContainer) relatedSearchResultsContainer.classList.add('hidden');
            if (relatedSearchPlaylistsContainer) relatedSearchPlaylistsContainer.classList.add('hidden');
            if (relatedSearchRadiosContainer) relatedSearchRadiosContainer.classList.add('hidden');
            return;
        }

        searchDebounceTimer = setTimeout(() => {
            performSearchDirectly(query);
        }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchDebounceTimer);
            const query = searchInput.value.trim();
            if (query) {
                performSearchDirectly(query);
            }
            searchInput.blur(); // Dismiss mobile keyboard
        }
    });

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            clearTimeout(searchDebounceTimer);
            
            // Reset to Home
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            if (window.navHome) window.navHome.classList.add('active');
            showSection('home');
            loadMoreSearchBtn.classList.add('hidden');
            if (relatedSearchResultsContainer) relatedSearchResultsContainer.classList.add('hidden');
            if (relatedSearchPlaylistsContainer) relatedSearchPlaylistsContainer.classList.add('hidden');
            if (relatedSearchRadiosContainer) relatedSearchRadiosContainer.classList.add('hidden');
            searchInput.focus();
        });
    }

    const searchIcon = document.querySelector('.search-icon');
    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.addEventListener('click', () => {
            searchInput.focus();
            const query = searchInput.value.trim();
            if (query) {
                performSearchDirectly(query);
            }
        });
    }

    if (loadMoreSearchBtn) {
        loadMoreSearchBtn.addEventListener('click', async () => {
            loadMoreSearchBtn.textContent = 'Loading...';
            loadMoreSearchBtn.disabled = true;
            
            currentSearchPage++;
            try {
                const songs = await api.searchSongs(currentSearchQuery, currentSearchPage, 24);
                if (songs && songs.length > 0) {
                    currentSearchResults = currentSearchResults.concat(songs);
                    renderSongCards(currentSearchResults, searchResultsGrid);
                    
                    if (songs.length >= 24) {
                        loadMoreSearchBtn.classList.remove('hidden');
                    } else {
                        loadMoreSearchBtn.classList.add('hidden');
                    }
                } else {
                    loadMoreSearchBtn.classList.add('hidden');
                    showToast('ℹ️ No more results to load.');
                }
            } catch (err) {
                console.error('Failed to load more songs:', err);
                showToast('❌ Error loading more songs.');
            } finally {
                loadMoreSearchBtn.textContent = 'Load More Results';
                loadMoreSearchBtn.disabled = false;
            }
        });
    }


    // ---- API Source Toggle ----

    const apiToggle = document.getElementById('apiSourceToggle');
    if (apiToggle) {
        apiToggle.addEventListener('change', async () => {
            const selected = apiToggle.value;
            api.currentSource = selected;

            // Clear existing dynamic sections and reset to home
            document.querySelectorAll('.music-section.dynamic').forEach(el => el.remove());
            trendingGrid.innerHTML = '';
            searchInput.value = '';
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            navHome.classList.add('active');
            showSection('home');


            // Update hero badge
            const badge = heroBanner.querySelector('.hero-badge');
            if (badge) {
                badge.textContent = selected === 'ytmusic' ? '🎵 YouTube Music' : '🎵 Now Streaming';
            }

            if (selected === 'ytmusic') {
                // Show a notice if local server might not be running
                const notice = document.createElement('div');
                notice.id = 'ytNotice';
                notice.style.cssText = 'background:rgba(255,50,50,0.1);border:1px solid rgba(255,100,100,0.4);border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#ff9999;';
                notice.innerHTML = `⚠️ <strong>YouTube Music mode</strong> requires the local Python server to be running.<br>
                    <span style="color:#a7a7a7">Open a terminal in <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;">c:\\Users\\abhim\\Antigravity\\server</code> and run:<br>
                    <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;">py -m pip install -r requirements.txt && py app.py</code></span>`;
                const contentScroll = document.querySelector('.content-scroll');
                const existingNotice = document.getElementById('ytNotice');
                if (existingNotice) existingNotice.remove();
                heroBanner.after(notice);
            } else {
                const existingNotice = document.getElementById('ytNotice');
                if (existingNotice) existingNotice.remove();
            }

            await loadHomeSections();
        });
    }

    // ---- Firebase UI Handlers ----

    const firebaseConfigModal = document.getElementById('firebaseConfigModal');
    const authModal = document.getElementById('authModal');
    
    const closeConfigModal = document.getElementById('closeConfigModal');
    const closeAuthModal = document.getElementById('closeAuthModal');
    
    const firebaseConfigInput = document.getElementById('firebaseConfigInput');
    const saveConfigBtn = document.getElementById('saveConfigBtn');
    const clearConfigBtn = document.getElementById('clearConfigBtn');
    const configStatus = document.getElementById('configStatus');

    const authBtn = document.getElementById('authBtn');
    const userProfile = document.getElementById('userProfile');
    const userDisplayName = document.getElementById('userDisplayName');
    const logoutBtn = document.getElementById('logoutBtn');
    
    const loginTabBtn = document.getElementById('loginTabBtn');
    const signupTabBtn = document.getElementById('signupTabBtn');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const authStatus = document.getElementById('authStatus');

    const phoneTabBtn = document.getElementById('phoneTabBtn');
    const phoneForm = document.getElementById('phoneForm');
    const phoneNumberInput = document.getElementById('phoneNumberInput');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const otpCodeInput = document.getElementById('otpCodeInput');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const phoneInputSection = document.getElementById('phoneInputSection');
    const otpInputSection = document.getElementById('otpInputSection');

    // New profile dropdown selectors
    const btnDropdownCloud = document.getElementById('btnDropdownCloud');
    const btnMyProfile = document.getElementById('btnMyProfile');
    const btnDropdownLikes = document.getElementById('btnDropdownLikes');
    const dropdownLikesCount = document.getElementById('dropdownLikesCount');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileDropdownName = document.getElementById('profileDropdownName');
    const profileDropdownAvatar = document.getElementById('profileDropdownAvatar');

    // Modals
    const profileDetailsModal = document.getElementById('profileDetailsModal');
    const closeProfileDetailsModal = document.getElementById('closeProfileDetailsModal');
    const closeProfileOkBtn = document.getElementById('closeProfileOkBtn');
    const profileModalAvatar = document.getElementById('profileModalAvatar');
    const profileModalName = document.getElementById('profileModalName');
    const profileModalEmail = document.getElementById('profileModalEmail');
    const profileModalLikesCount = document.getElementById('profileModalLikesCount');
    const profileModalPlayedCount = document.getElementById('profileModalPlayedCount');

    // Preferences Modal Elements
    const preferencesModal = document.getElementById('preferencesModal');
    const closePreferencesModal = document.getElementById('closePreferencesModal');
    const prefStep1 = document.getElementById('prefStep1');
    const prefStep2 = document.getElementById('prefStep2');
    const prefDot1 = document.getElementById('prefDot1');
    const prefDot2 = document.getElementById('prefDot2');
    const prefLanguageGrid = document.getElementById('prefLanguageGrid');
    const prefArtistGrid = document.getElementById('prefArtistGrid');
    const prefNextBtn = document.getElementById('prefNextBtn');
    const prefBackBtn = document.getElementById('prefBackBtn');
    const prefSaveBtn = document.getElementById('prefSaveBtn');
    const navPreferences = document.getElementById('navPreferences');

    // Queue Panel
    const queueBtn = document.getElementById('queueBtn');
    const queuePanel = document.getElementById('queuePanel');
    const closeQueueBtn = document.getElementById('closeQueueBtn');
    const clearQueueBtn = document.getElementById('clearQueueBtn');
    const queueNowPlayingTrack = document.getElementById('queueNowPlayingTrack');
    const queueNextList = document.getElementById('queueNextList');

    // Devices Popup
    const devicesBtn = document.getElementById('devicesBtn');
    const devicesPopup = document.getElementById('devicesPopup');
    const qualityOptions = document.querySelectorAll('.quality-option');

    // 1. Config Modal Open/Close
    if (btnDropdownCloud) {
        btnDropdownCloud.addEventListener('click', (e) => {
            e.preventDefault();
            const config = firebaseManager.getSavedConfig();
            if (config) {
                firebaseConfigInput.value = JSON.stringify(config, null, 2);
            } else {
                firebaseConfigInput.value = '';
            }
            configStatus.textContent = '';
            firebaseConfigModal.classList.remove('hidden');
        });
    }

    if (closeConfigModal) {
        closeConfigModal.addEventListener('click', () => {
            firebaseConfigModal.classList.add('hidden');
        });
    }

    // Save Firebase Config
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', () => {
            const rawVal = firebaseConfigInput.value.trim();
            if (!rawVal) {
                configStatus.className = 'status-msg error';
                configStatus.textContent = '❌ Configuration cannot be empty.';
                return;
            }
            try {
                const configObj = JSON.parse(rawVal);
                if (!configObj.apiKey || !configObj.projectId) {
                    throw new Error('Missing apiKey or projectId parameters.');
                }
                firebaseManager.saveConfig(configObj);
                configStatus.className = 'status-msg success';
                configStatus.textContent = '⚡ Saved! Connecting...';
                
                // Initialize Firebase
                const success = firebaseManager.initialize();
                if (success) {
                    setTimeout(() => {
                        firebaseConfigModal.classList.add('hidden');
                    }, 1500);
                } else {
                    configStatus.className = 'status-msg error';
                    configStatus.textContent = '❌ Failed to initialize Firebase. Check config keys.';
                }
            } catch (err) {
                configStatus.className = 'status-msg error';
                configStatus.textContent = '❌ Invalid JSON: ' + err.message;
            }
        });
    }

    // Clear Firebase Config
    if (clearConfigBtn) {
        clearConfigBtn.addEventListener('click', () => {
            firebaseManager.clearConfig();
            firebaseConfigInput.value = '';
            configStatus.className = 'status-msg success';
            configStatus.textContent = '🗑️ Connection cleared. Reloading page...';
            setTimeout(() => {
                location.reload();
            }, 1000);
        });
    }

    // 2. Auth Modal Open/Close
    if (authBtn) {
        authBtn.addEventListener('click', () => {
            if (!firebaseManager.isConfigured()) {
                alert('⚠️ Please configure Firebase Cloud Sync in the profile settings first to enable accounts.');
                if (btnDropdownCloud) btnDropdownCloud.click();
                return;
            }
            authStatus.textContent = '';
            authModal.classList.remove('hidden');
            
            // Reset Phone Authentication state on modal open
            if (phoneInputSection && otpInputSection) {
                phoneInputSection.classList.remove('hidden');
                otpInputSection.classList.add('hidden');
                phoneNumberInput.value = '';
                otpCodeInput.value = '';
            }
        });
    }

    if (closeAuthModal) {
        closeAuthModal.addEventListener('click', () => {
            authModal.classList.add('hidden');
        });
    }

    // Initialize recaptcha verifier when Phone tab is clicked
    function initRecaptcha() {
        if (!firebaseManager.isConfigured()) return;
        if (!window.recaptchaVerifier) {
            try {
                window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                    'size': 'invisible'
                });
            } catch (err) {
                console.error("Failed to init RecaptchaVerifier:", err);
            }
        }
    }

    // Tab switching (Login vs Signup vs Phone)
    if (loginTabBtn && signupTabBtn && phoneTabBtn) {
        loginTabBtn.addEventListener('click', () => {
            loginTabBtn.classList.add('active');
            signupTabBtn.classList.remove('active');
            phoneTabBtn.classList.remove('active');
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
            phoneForm.classList.add('hidden');
        });

        signupTabBtn.addEventListener('click', () => {
            signupTabBtn.classList.add('active');
            loginTabBtn.classList.remove('active');
            phoneTabBtn.classList.remove('active');
            signupForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
            phoneForm.classList.add('hidden');
        });

        phoneTabBtn.addEventListener('click', () => {
            phoneTabBtn.classList.add('active');
            loginTabBtn.classList.remove('active');
            signupTabBtn.classList.remove('active');
            phoneForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
            signupForm.classList.add('hidden');
            initRecaptcha();
        });
    }

    // Phone OTP Sending & Verifying
    let phoneConfirmationResult = null;

    if (sendOtpBtn) {
        sendOtpBtn.addEventListener('click', async () => {
            authStatus.className = 'status-msg';
            authStatus.textContent = '⌛ Sending OTP...';
            const phone = phoneNumberInput.value.trim();
            if (!phone) {
                authStatus.className = 'status-msg error error-msg';
                authStatus.textContent = '❌ Please enter a phone number.';
                return;
            }
            try {
                initRecaptcha();
                phoneConfirmationResult = await firebaseManager.sendOtp(phone, window.recaptchaVerifier);
                authStatus.className = 'status-msg success';
                authStatus.textContent = '📨 OTP sent successfully! Enter code below.';
                phoneInputSection.classList.add('hidden');
                otpInputSection.classList.remove('hidden');
            } catch (err) {
                console.error("Failed to send OTP:", err);
                authStatus.className = 'status-msg error error-msg';
                let msg = err.message;
                if (err.code === 'auth/operation-not-allowed') {
                    msg = 'Phone authentication is disabled in your Firebase console. Please go to Firebase Console > Authentication > Sign-in method, and enable Phone provider.';
                }
                authStatus.textContent = '❌ Error: ' + msg;
                if (window.recaptchaVerifier && window.recaptchaVerifier.clear) {
                    try { window.recaptchaVerifier.clear(); } catch(e) {}
                    window.recaptchaVerifier = null;
                }
            }
        });
    }

    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener('click', async () => {
            authStatus.className = 'status-msg';
            authStatus.textContent = '⌛ Verifying code...';
            const code = otpCodeInput.value.trim();
            if (!code || code.length !== 6) {
                authStatus.className = 'status-msg error error-msg';
                authStatus.textContent = '❌ Please enter the 6-digit OTP code.';
                return;
            }
            if (!phoneConfirmationResult) {
                authStatus.className = 'status-msg error error-msg';
                authStatus.textContent = '❌ OTP not sent or expired. Please try again.';
                return;
            }
            try {
                await phoneConfirmationResult.confirm(code);
                authStatus.className = 'status-msg success';
                authStatus.textContent = '✅ Signed in successfully!';
                setTimeout(() => {
                    authModal.classList.add('hidden');
                    phoneInputSection.classList.remove('hidden');
                    otpInputSection.classList.add('hidden');
                    phoneNumberInput.value = '';
                    otpCodeInput.value = '';
                    openPreferencesModal(true);
                }, 1200);
            } catch (err) {
                console.error("OTP Verification failed:", err);
                authStatus.className = 'status-msg error error-msg';
                authStatus.textContent = '❌ Verification Failed: ' + err.message;
            }
        });
    }

    // Login Submission
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authStatus.className = 'status-msg';
            authStatus.textContent = '⌛ Logging in...';
            const email = document.getElementById('loginEmail').value.trim();
            const pass = document.getElementById('loginPassword').value;
            try {
                await firebaseManager.logIn(email, pass);
                authStatus.className = 'status-msg success';
                authStatus.textContent = '✅ Logged in successfully!';
                setTimeout(() => {
                    authModal.classList.add('hidden');
                    openPreferencesModal(true);
                }, 1200);
            } catch (err) {
                console.error("Login error details:", err);
                authStatus.className = 'status-msg error error-msg';
                let msg = err.message;
                if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                    msg = 'Invalid email or password.';
                } else if (err.code === 'auth/invalid-credential') {
                    msg = 'Invalid email or password credentials.';
                } else if (err.code === 'auth/invalid-email') {
                    msg = 'The email address is badly formatted.';
                }
                authStatus.textContent = '❌ Error: ' + msg;
            }
        });
    }

    // Signup Submission
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authStatus.className = 'status-msg';
            authStatus.textContent = '⌛ Registering account...';
            const name = document.getElementById('signupName').value.trim();
            const email = document.getElementById('signupEmail').value.trim();
            const pass = document.getElementById('signupPassword').value;
            try {
                await firebaseManager.signUp(email, pass, name);
                authStatus.className = 'status-msg success';
                authStatus.textContent = '🎉 Account created and logged in!';
                setTimeout(() => {
                    authModal.classList.add('hidden');
                    openPreferencesModal(true);
                }, 1200);
            } catch (err) {
                console.error("Signup error details:", err);
                authStatus.className = 'status-msg error error-msg';
                let msg = err.message;
                if (err.code === 'auth/operation-not-allowed') {
                    msg = 'Email/Password sign-in is disabled in your Firebase console. Please go to Firebase Console > Authentication > Sign-in method, and enable Email/Password.';
                } else if (err.code === 'auth/email-already-in-use') {
                    msg = 'This email address is already in use by another account.';
                } else if (err.code === 'auth/weak-password') {
                    msg = 'The password must be 6 characters long or more.';
                } else if (err.code === 'auth/invalid-email') {
                    msg = 'The email address is badly formatted.';
                }
                authStatus.textContent = '❌ Error: ' + msg;
            }
        });
    }

    // Google Sign-In
    const googleAuthBtn = document.getElementById('googleAuthBtn');
    if (googleAuthBtn) {
        googleAuthBtn.addEventListener('click', async () => {
            authStatus.className = 'status-msg';
            authStatus.textContent = '⌛ Connecting to Google...';
            try {
                await firebaseManager.signInWithGoogle();
                authStatus.className = 'status-msg success';
                authStatus.textContent = '✅ Signed in with Google!';
                setTimeout(() => {
                    authModal.classList.add('hidden');
                    openPreferencesModal(true);
                }, 1200);
            } catch (err) {
                console.error("Google Auth error details:", err);
                authStatus.className = 'status-msg error error-msg';
                let msg = err.message;
                if (err.code === 'auth/operation-not-allowed') {
                    msg = 'Google sign-in is disabled in your Firebase console. Please go to Firebase Console > Authentication > Sign-in method, and enable Google provider.';
                } else if (err.code === 'auth/unauthorized-domain') {
                    msg = 'This domain is not authorized by Firebase. Please open the app using http://localhost:5500 instead of http://127.0.0.1:5500, or add 127.0.0.1 to Authorized Domains in the Firebase Console.';
                } else if (err.code === 'auth/popup-blocked') {
                    msg = 'Login popup was blocked by your browser. Please allow popups for this site and try again.';
                } else if (err.code === 'auth/popup-closed-by-user') {
                    msg = 'The login window was closed before completion. Please try again.';
                }
                authStatus.textContent = '❌ Error: ' + msg;
            }
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await firebaseManager.logOut();
        });
    }

    // Listen for Firebase Auth changes
    window.addEventListener('firebaseAuthStateChanged', (e) => {
        const user = e.detail.user;
        if (user) {
            authBtn.classList.add('hidden');
            userProfile.classList.remove('hidden');
            const name = user.displayName || user.phoneNumber || (user.email ? user.email.split('@')[0] : 'User');
            userDisplayName.textContent = name;
            
            if (profileDropdownName) profileDropdownName.textContent = name;
            if (profileDropdownAvatar) profileDropdownAvatar.textContent = name.charAt(0).toUpperCase();
            
            const badge = document.querySelector('.profile-dropdown-badge');
            if (badge) badge.textContent = 'Premium Member';
        } else {
            authBtn.classList.remove('hidden');
            userProfile.classList.add('hidden');
            userDisplayName.textContent = '';
            
            if (profileDropdownName) profileDropdownName.textContent = 'Guest User';
            if (profileDropdownAvatar) profileDropdownAvatar.textContent = 'G';
            
            const badge = document.querySelector('.profile-dropdown-badge');
            if (badge) badge.textContent = 'Free Account';
        }
        updateLikesCountDisplay();
    });

    // Close Modals when clicking outside content
    window.addEventListener('click', (e) => {
        if (e.target === firebaseConfigModal) {
            firebaseConfigModal.classList.add('hidden');
        }
        if (e.target === authModal) {
            authModal.classList.add('hidden');
        }
        if (e.target === profileDetailsModal) {
            profileDetailsModal.classList.add('hidden');
        }
        if (e.target === preferencesModal) {
            preferencesModal.classList.add('hidden');
        }
        
        // Hide popup panels if clicking outside
        if (queuePanel && !queuePanel.contains(e.target) && e.target !== queueBtn && !queueBtn.contains(e.target)) {
            queuePanel.classList.add('hidden');
        }
        if (devicesPopup && !devicesPopup.contains(e.target) && e.target !== devicesBtn && !devicesBtn.contains(e.target)) {
            devicesPopup.classList.add('hidden');
        }
    });

    // ---- Toast Notification Utility ----
    function showToast(message) {
        const existing = document.getElementById('toastNotification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.style.cssText = `
            position: fixed;
            bottom: calc(var(--player-height) + 24px);
            right: 24px;
            background: rgba(24, 24, 24, 0.85);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: var(--text-primary);
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 8px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;
        toast.innerHTML = message;
        document.body.appendChild(toast);

        toast.offsetHeight; // Force reflow

        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ---- Artist Radio Handler ----
    const playerRadioBtn = document.getElementById('playerRadioBtn');
    if (playerRadioBtn) {
        playerRadioBtn.addEventListener('click', async () => {
            const currentSong = player.getCurrentSong();
            if (!currentSong) {
                showToast('⚠️ Play a song first to start Artist Radio!');
                return;
            }

            const artistName = currentSong.artists?.primary?.[0]?.name || 'Unknown Artist';
            const cleanArtist = decodeHtml(artistName);
            showToast(`🎙️ Starting Radio for <strong>${escapeHtml(cleanArtist)}</strong>...`);

            try {
                const songs = await api.searchSongs(cleanArtist, 0, 30);
                if (songs && songs.length > 0) {
                    player.setQueue(songs, 0);
                } else {
                    showToast('❌ Could not find related tracks for this artist.');
                }
            } catch (err) {
                console.error('Failed to start radio:', err);
                showToast('❌ Error starting Artist Radio.');
            }
        });
    }

    // ---- From Playing Handler ----
    const fromPlayingBtn = document.getElementById('fromPlayingBtn');
    if (fromPlayingBtn) {
        fromPlayingBtn.addEventListener('click', () => {
            if (!playingSourceSection) return;

            if (playingSourceSection === 'artist-detail') {
                if (playingSourceData) {
                    showArtistDetails(playingSourceData);
                } else {
                    showSection('artists');
                }
            } else if (playingSourceSection === 'album-detail') {
                if (playingSourceData) {
                    showCollectionDetail(
                        playingSourceData.title,
                        playingSourceData.subtitle,
                        playingSourceData.imageUrl,
                        playingSourceData.tracks
                    );
                } else {
                    showSection('home');
                }
            } else {
                showSection(playingSourceSection);
            }
        });
    }

    // ---- Spacebar Shortcut ----
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            if (document.activeElement && 
                (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }
            e.preventDefault();
            player.togglePlayPause();
        }
    });

    // Update Liked Songs count in dropdown and modal
    function updateLikesCountDisplay() {
        const likedSongs = player.getLikedSongs();
        const count = likedSongs.length;
        if (dropdownLikesCount) {
            dropdownLikesCount.textContent = count;
        }
        return count;
    }

    // Trigger update on liked songs changes
    window.addEventListener('likedSongsUpdated', updateLikesCountDisplay);
    updateLikesCountDisplay(); // Initial call

    // Dropdown Liked Songs click
    if (btnDropdownLikes) {
        btnDropdownLikes.addEventListener('click', (e) => {
            e.preventDefault();
            const navLiked = document.getElementById('navLiked');
            if (navLiked) navLiked.click();
            if (profileDropdown) profileDropdown.style.display = 'none'; // Close dropdown
        });
    }

    // Open Profile Details Modal
    if (btnMyProfile) {
        btnMyProfile.addEventListener('click', (e) => {
            e.preventDefault();
            const user = firebaseManager.getCurrentUser();
            const likedCount = player.getLikedSongs().length;
            const playedCount = player.getRecentlyPlayed().length;
            
            let name = 'Guest User';
            let email = 'Sign in to back up your library to the cloud.';
            let avatarChar = 'G';
            
            if (user) {
                name = user.displayName || user.phoneNumber || (user.email ? user.email.split('@')[0] : 'User');
                email = user.email || user.phoneNumber || 'Authenticated User';
                avatarChar = name.charAt(0).toUpperCase();
            }
            
            if (profileModalAvatar) profileModalAvatar.textContent = avatarChar;
            if (profileModalName) profileModalName.textContent = name;
            if (profileModalEmail) profileModalEmail.textContent = email;
            if (profileModalLikesCount) profileModalLikesCount.textContent = `${likedCount} songs`;
            if (profileModalPlayedCount) profileModalPlayedCount.textContent = `${playedCount} songs`;
            
            if (profileDetailsModal) profileDetailsModal.classList.remove('hidden');
            if (profileDropdown) profileDropdown.style.display = 'none'; // Close dropdown
        });
    }

    // Close Profile Modal
    if (closeProfileDetailsModal) {
        closeProfileDetailsModal.addEventListener('click', () => {
            profileDetailsModal.classList.add('hidden');
        });
    }
    if (closeProfileOkBtn) {
        closeProfileOkBtn.addEventListener('click', () => {
            profileDetailsModal.classList.add('hidden');
        });
    }

    // Play Queue Drawer Rendering
    function renderQueue() {
        if (!queueNowPlayingTrack || !queueNextList) return;
        
        const currentSong = player.getCurrentSong();
        const fullQueue = player.getQueue();
        
        // 1. Now Playing Section
        if (currentSong) {
            const imgUrl = api.getBestImageUrl(currentSong) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect fill=%22%231a1a2e%22 width=%2250%22 height=%2250%22/%3E%3Ctext y=%2235%22 x=%2225%22 text-anchor=%22middle%22 font-size=%2228%22%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E';
            queueNowPlayingTrack.innerHTML = `
                <div class="queue-track-item active">
                    <img class="queue-track-img" src="${imgUrl}" alt="${escapeHtml(currentSong.name)}">
                    <div class="queue-track-details">
                        <div class="queue-track-title">${escapeHtml(decodeHtml(currentSong.name))}</div>
                        <div class="queue-track-artist">${escapeHtml(currentSong.artists?.primary?.map(a => decodeHtml(a.name)).join(', ') || 'Unknown Artist')}</div>
                    </div>
                </div>
            `;
        } else {
            queueNowPlayingTrack.innerHTML = `<p style="font-size: 13px; color: var(--text-secondary); padding: 8px;">No track playing.</p>`;
        }
        
        // 2. Next Up Section
        queueNextList.innerHTML = '';
        if (fullQueue.length > 0) {
            const currentIdx = currentSong ? fullQueue.findIndex(s => s.id === currentSong.id) : -1;
            const nextSongs = currentIdx !== -1 ? fullQueue.slice(currentIdx + 1) : fullQueue;
            
            if (nextSongs.length === 0) {
                queueNextList.innerHTML = `<p style="font-size: 13px; color: var(--text-secondary); padding: 8px;">Queue is empty. Auto-play is enabled.</p>`;
            } else {
                nextSongs.forEach((song, idx) => {
                    const absIndex = currentIdx !== -1 ? currentIdx + 1 + idx : idx;
                    const imgUrl = api.getBestImageUrl(song) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect fill=%22%231a1a2e%22 width=%2250%22 height=%2250%22/%3E%3Ctext y=%2235%22 x=%2225%22 text-anchor=%22middle%22 font-size=%2228%22%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E';
                    const item = document.createElement('div');
                    item.className = 'queue-track-item';
                    item.innerHTML = `
                        <img class="queue-track-img" src="${imgUrl}" alt="${escapeHtml(song.name)}">
                        <div class="queue-track-details">
                            <div class="queue-track-title">${escapeHtml(decodeHtml(song.name))}</div>
                            <div class="queue-track-artist">${escapeHtml(song.artists?.primary?.map(a => decodeHtml(a.name)).join(', ') || 'Unknown Artist')}</div>
                        </div>
                    `;
                    item.addEventListener('click', () => {
                        player.setCurrentIndex(absIndex);
                    });
                    queueNextList.appendChild(item);
                });
            }
        } else {
            queueNextList.innerHTML = `<p style="font-size: 13px; color: var(--text-secondary); padding: 8px;">Queue is empty.</p>`;
        }
    }

    // Bind event triggers
    window.addEventListener('recentlyPlayedUpdated', renderQueue);
    window.addEventListener('queueReplenished', renderQueue);
    window.addEventListener('queueCleared', renderQueue);
    
    // Patch player.playSong to re-render the queue dynamically
    const _origPlaySong = player.playSong.bind(player);
    player.playSong = async function(song) {
        await _origPlaySong(song);
        renderQueue();
    };

    // Toggle Queue Drawer
    if (queueBtn) {
        queueBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            queuePanel.classList.toggle('hidden');
            if (!queuePanel.classList.contains('hidden')) {
                renderQueue();
            }
        });
    }

    if (closeQueueBtn) {
        closeQueueBtn.addEventListener('click', () => {
            queuePanel.classList.add('hidden');
        });
    }

    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', () => {
            player.clearQueue();
            showToast('🗑️ Play queue cleared.');
        });
    }

    // Toggle Devices settings
    if (devicesBtn) {
        devicesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            devicesPopup.classList.toggle('hidden');
        });
    }

    // Quality toggling logic
    qualityOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            qualityOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const quality = opt.dataset.quality;
            localStorage.setItem('symphonyAudioQuality', quality);
            showToast(`⚡ Audio Quality set to: <strong>${quality.toUpperCase()}</strong>`);
            
            // Re-stream current playing song if active to apply quality changes
            const currentSong = player.getCurrentSong();
            if (currentSong) {
                player.playSong(currentSong);
            }
        });
    });

    // Quality options load preference
    const savedQuality = localStorage.getItem('symphonyAudioQuality') || '320kbps';
    qualityOptions.forEach(opt => {
        if (opt.dataset.quality === savedQuality) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });

    // Close dropdown on mouseleave
    if (userProfile && profileDropdown) {
        userProfile.addEventListener('mouseleave', () => {
            profileDropdown.style.display = 'none';
        });
        userProfile.addEventListener('mouseenter', () => {
            profileDropdown.style.display = 'block';
        });
    }

    // ---- Preferences Modal Logic ----
    let selectedPrefLanguages = new Set();
    let selectedPrefArtists = new Set();

    // Load saved preferences if any
    try {
        const savedLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
        const savedArtists = JSON.parse(localStorage.getItem('symphonyUserArtists') || '[]');
        selectedPrefLanguages = new Set(savedLangs);
        selectedPrefArtists = new Set(savedArtists);
    } catch (e) {
        console.error('Error loading saved preferences', e);
    }

    // Function to render language selection chips
    function renderLanguagePreferences() {
        if (!prefLanguageGrid) return;
        prefLanguageGrid.innerHTML = '';
        
        api.LANGUAGES_CONFIG.forEach(lang => {
            const chip = document.createElement('div');
            chip.className = 'pref-chip';
            if (selectedPrefLanguages.has(lang.id)) {
                chip.classList.add('active');
            }
            chip.innerHTML = `
                <span class="emoji">${lang.emoji}</span>
                <span>${lang.name}</span>
            `;
            chip.addEventListener('click', () => {
                if (selectedPrefLanguages.has(lang.id)) {
                    selectedPrefLanguages.delete(lang.id);
                    chip.classList.remove('active');
                } else {
                    selectedPrefLanguages.add(lang.id);
                    chip.classList.add('active');
                }
            });
            prefLanguageGrid.appendChild(chip);
        });
    }

    // Function to render artist selection cards
    function renderArtistPreferences() {
        if (!prefArtistGrid) return;
        prefArtistGrid.innerHTML = '';
        
        // Filter artists by selected languages. If none selected, show all artists
        const filteredArtists = api.ARTISTS_CONFIG.filter(artist => {
            if (selectedPrefLanguages.size === 0) return true;
            return selectedPrefLanguages.has(artist.lang);
        });

        if (filteredArtists.length === 0) {
            prefArtistGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 24px;">Please select languages first to see matching artists.</p>`;
            return;
        }

        filteredArtists.forEach(artist => {
            const card = document.createElement('div');
            card.className = 'pref-artist-card';
            if (selectedPrefArtists.has(artist.name)) {
                card.classList.add('active');
            }
            
            const imgId = `pref-art-img-${artist.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
            card.innerHTML = `
                <img id="${imgId}" src="${escapeHtml(artist.actualImg || artist.img)}" alt="${escapeHtml(artist.name)}" loading="lazy">
                <span class="name">${escapeHtml(artist.name)}</span>
            `;
            
            card.addEventListener('click', () => {
                if (selectedPrefArtists.has(artist.name)) {
                    selectedPrefArtists.delete(artist.name);
                    card.classList.remove('active');
                } else {
                    selectedPrefArtists.add(artist.name);
                    card.classList.add('active');
                }
            });
            prefArtistGrid.appendChild(card);
            
            // Load actual singer image in the background
            if (!artist.actualImg) {
                fetchActualArtistImage(artist.name, artist.img).then(url => {
                    const imgEl = document.getElementById(imgId);
                    if (imgEl) imgEl.src = url;
                    artist.actualImg = url;
                });
            }
        });
    }

    // Step 1 to Step 2 transition
    if (prefNextBtn) {
        prefNextBtn.addEventListener('click', () => {
            if (selectedPrefLanguages.size === 0) {
                alert('Please select at least one language to proceed.');
                return;
            }
            // Go to Step 2
            prefStep1.classList.add('hidden');
            prefStep2.classList.remove('hidden');
            prefDot1.classList.remove('active');
            prefDot2.classList.add('active');
            renderArtistPreferences();
        });
    }

    // Step 2 to Step 1 transition
    if (prefBackBtn) {
        prefBackBtn.addEventListener('click', () => {
            prefStep2.classList.add('hidden');
            prefStep1.classList.remove('hidden');
            prefDot2.classList.remove('active');
            prefDot1.classList.add('active');
        });
    }

    // Save preferences
    if (prefSaveBtn) {
        prefSaveBtn.addEventListener('click', async () => {
            // Save to localStorage
            const langsArr = Array.from(selectedPrefLanguages);
            const artistsArr = Array.from(selectedPrefArtists);
            localStorage.setItem('symphonyUserLanguages', JSON.stringify(langsArr));
            localStorage.setItem('symphonyUserArtists', JSON.stringify(artistsArr));
            
            // Close modal
            if (preferencesModal) {
                preferencesModal.classList.add('hidden');
            }
            
            showToast('✨ Preferences saved successfully! Personalizing feed...');
            
            // Redirect to Home and reload
            const navHome = document.getElementById('navHome');
            if (navHome) {
                navHome.click();
            } else {
                await loadHomeSections();
            }
        });
    }

    // Close Preferences modal
    if (closePreferencesModal) {
        closePreferencesModal.addEventListener('click', () => {
            if (preferencesModal) preferencesModal.classList.add('hidden');
        });
    }

    // Modal Login Button inside Preferences Modal
    const modalLoginBtn = document.getElementById('loginBtn');
    if (modalLoginBtn) {
        modalLoginBtn.addEventListener('click', () => {
            if (preferencesModal) preferencesModal.classList.add('hidden');
            if (authBtn) authBtn.click();
        });
    }

    // Show preferences modal function
    function openPreferencesModal(isFirstTime = false) {
        if (!preferencesModal) return;
        
        // Reset steps
        prefStep2.classList.add('hidden');
        prefStep1.classList.remove('hidden');
        prefDot2.classList.remove('active');
        prefDot1.classList.add('active');
        
        // Reload saved preferences from localStorage to discard any unsaved modifications
        try {
            const savedLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
            const savedArtists = JSON.parse(localStorage.getItem('symphonyUserArtists') || '[]');
            selectedPrefLanguages = new Set(savedLangs);
            selectedPrefArtists = new Set(savedArtists);
        } catch (e) {
            console.error('Error reloading saved preferences', e);
        }
        
        // Customize text for first-time login
        const step1Title = prefStep1.querySelector('h3');
        const step1Sub = prefStep1.querySelector('.modal-subtitle');
        if (isFirstTime) {
            if (step1Title) step1Title.textContent = "Welcome! Let's Personalize Symphony 🎉";
            if (step1Sub) step1Sub.textContent = "Select your preferred languages to customize your dynamic home feed.";
        } else {
            if (step1Title) step1Title.textContent = "Choose Languages 🌍";
            if (step1Sub) step1Sub.textContent = "Select one or more languages for your personalized music feed.";
        }
        
        renderLanguagePreferences();

        // Toggle visibility of the sign in button inside preferences modal based on login state
        if (modalLoginBtn) {
            const loggedIn = !authBtn || authBtn.classList.contains('hidden');
            if (loggedIn) {
                modalLoginBtn.style.display = 'none';
            } else {
                modalLoginBtn.style.display = 'inline-flex';
            }
        }
        
        preferencesModal.classList.remove('hidden');
    }

    // Export function to window to trigger globally
    window.openPreferencesModal = openPreferencesModal;

    // ---- New Navigation Sections Implementations ----

    async function loadNewReleases() {
        if (!newReleasesGrid) return;
        newReleasesGrid.innerHTML = `<div class="loader-container" style="grid-column: 1/-1;"><div class="spinner"></div></div>`;
        if (loadMoreNewReleasesBtn) loadMoreNewReleasesBtn.classList.add('hidden');
        
        currentNewReleasesPage = 0;
        try {
            const langs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '["hindi", "english"]');
            const promises = [];
            
            langs.forEach(lang => {
                promises.push(api.searchSongs(`latest ${lang} songs 2026`, 0, 15));
                promises.push(api.searchSongs(`new release ${lang} songs`, 0, 15));
            });
            
            const results = await Promise.all(promises);
            let combined = [];
            results.forEach((res, index) => {
                if (res && res.length > 0) {
                    const langIndex = Math.floor(index / 2);
                    const targetLang = langs[langIndex];
                    const filtered = res.filter(song => {
                        if (song.language) {
                            return song.language.toLowerCase() === targetLang.toLowerCase();
                        }
                        return true;
                    });
                    combined = combined.concat(filtered);
                }
            });
            
            // Deduplicate
            const seenIds = new Set();
            combined = combined.filter(song => {
                if (!song || !song.id) return false;
                if (seenIds.has(song.id)) return false;
                seenIds.add(song.id);
                return true;
            });
            
            // Shuffle
            combined = combined.sort(() => 0.5 - Math.random()).slice(0, 24);
            
            loadedNewReleasesSongs = combined;
            
            if (loadedNewReleasesSongs.length > 0) {
                renderSongCards(loadedNewReleasesSongs, newReleasesGrid);
                if (loadMoreNewReleasesBtn) {
                    loadMoreNewReleasesBtn.classList.remove('hidden');
                }
            } else {
                newReleasesGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No new releases found at the moment.</p>`;
            }
        } catch (err) {
            console.error('Failed to load new releases:', err);
            newReleasesGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #ff5555;">Error loading new releases.</p>`;
        }
    }

    function renderTopChartsChunk(chunk) {
        if (!topChartsGrid) return;
        chunk.forEach(chart => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${chart.img}" alt="${escapeHtml(chart.title)}" loading="lazy">
                    <div class="card-play-btn">
                        <i class='bx bx-play'></i>
                    </div>
                </div>
                <div class="card-title">${escapeHtml(chart.title)}</div>
                <div class="card-subtitle">${escapeHtml(chart.subtitle)}</div>
            `;
            
            card.addEventListener('click', async () => {
                showToast(`⏳ Loading Chart: ${chart.title}...`);
                try {
                    let tracks = await api.searchSongs(chart.query, chart.pageOffset || 0, 40);
                    if (chart.targetLang) {
                        const target = chart.targetLang.toLowerCase();
                        tracks = tracks.filter(song => {
                            if (song.language) {
                                return song.language.toLowerCase() === target;
                            }
                            return true;
                        });
                    }
                    showCollectionDetail(chart.title, chart.subtitle, chart.img, tracks, false, chart.query);
                } catch (e) {
                    console.error('Failed to load chart tracks', e);
                    showToast('❌ Error loading chart tracks.');
                }
            });
            
            topChartsGrid.appendChild(card);
        });
    }

    async function loadTopCharts() {
        if (!topChartsGrid) return;
        topChartsGrid.innerHTML = '';
        
        const seedKey = getHourlySeedKey();
        const rand = getSeededRandom(seedKey);
        
        let charts = [];
        let langs = [];
        try {
            langs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
        } catch (e) {
            console.error('Failed to load user languages for charts:', e);
        }
        if (!langs || langs.length === 0) {
            langs = ['hindi', 'english', 'punjabi', 'tamil', 'telugu'];
        }

        const modifiers = ["weekly hits", "top trending", "charts blockbusters", "essential songs", "latest popular", "heavy rotation"];

        // 1. Regional Charts based on user languages
        langs.forEach(lang => {
            const langObj = api.LANGUAGES_CONFIG.find(l => l.id === lang.toLowerCase());
            const langName = langObj ? langObj.name : lang;
            const langEmoji = langObj ? langObj.emoji : '🏆';

            const modifierIndex = Math.floor(rand() * modifiers.length);
            const pageOffset = Math.floor(rand() * 3); // page 0, 1, or 2

            // Top 50
            const t50Titles = [`${langName} Top 50 ${langEmoji}`, `${langName} Mega Hits 🏆`, `${langName} Chartbuster 50 ⚡`];
            const t50Queries = [`weekly top songs ${langName} 2026`, `${langName} popular chartbusters`, `trending songs ${langName} hits`];
            const t50Title = t50Titles[Math.floor(rand() * t50Titles.length)];
            const t50Query = t50Queries[Math.floor(rand() * t50Queries.length)] + ` ${modifiers[modifierIndex]}`;
            const t50Img = CHART_PLAYLIST_IMAGES.general[Math.floor(rand() * CHART_PLAYLIST_IMAGES.general.length)];

            charts.push({
                id: `chart-${lang}-top-50-${seedKey}`,
                title: t50Title,
                subtitle: `Trending hourly hits in ${langName}`,
                query: t50Query,
                img: t50Img,
                targetLang: lang,
                pageOffset: pageOffset
            });

            // Hot New
            const newTitles = [`${langName} Hot 20 🔥`, `${langName} Fresh Releases 🆕`, `Brand New ${langName} Hits 🌟`];
            const newQueries = [`latest new release ${langName} songs`, `new releases ${langName} this week`, `fresh release ${langName} hits`];
            const newTitle = newTitles[Math.floor(rand() * newTitles.length)];
            const newQuery = newQueries[Math.floor(rand() * newQueries.length)] + ` ${modifiers[(modifierIndex + 1) % modifiers.length]}`;
            const newImg = CHART_PLAYLIST_IMAGES.party[Math.floor(rand() * CHART_PLAYLIST_IMAGES.party.length)];

            charts.push({
                id: `chart-${lang}-new-${seedKey}`,
                title: newTitle,
                subtitle: `Fresh new hourly releases`,
                query: newQuery,
                img: newImg,
                targetLang: lang,
                pageOffset: pageOffset
            });

            // Classics / Retro
            const retroTitles = [`${langName} Classics 🎬`, `${langName} Old is Gold 📻`, `${langName} Retro Evergreens 📼`];
            const retroQueries = [`best old golden retro classics ${langName} songs`, `old classics ${langName} evergreen hits`, `vintage nostalgia old ${langName} tracks`];
            const retroTitle = retroTitles[Math.floor(rand() * retroTitles.length)];
            const retroQuery = retroQueries[Math.floor(rand() * retroQueries.length)];
            const retroImg = CHART_PLAYLIST_IMAGES.retro[Math.floor(rand() * CHART_PLAYLIST_IMAGES.retro.length)];

            charts.push({
                id: `chart-${lang}-retro-${seedKey}`,
                title: retroTitle,
                subtitle: `Evergreen legendaries in ${langName}`,
                query: retroQuery,
                img: retroImg,
                targetLang: lang,
                pageOffset: 0
            });
        });

        // 2. Global Charts
        const globalChartsTemplates = [
            { title: 'Billboard Hot 100 🇺🇸', query: 'billboard hot 100 singles', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop', subtitle: 'Global Billboard chart-toppers' },
            { title: 'Viral 50 Global 🌍', query: 'viral 50 global spotify tiktok', img: 'https://images.unsplash.com/photo-1516280440614-37939bbacd6a?w=300&h=300&fit=crop', subtitle: 'Most shared and viral songs' },
            { title: 'Lo-Fi Chill Top 50 ☕', query: 'lofi study chill relaxation beats', img: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop', subtitle: 'Study and relaxation beats' },
            { title: 'UK Singles Chart 🇬🇧', query: 'official uk singles chart top', img: 'https://images.unsplash.com/photo-1513829096990-4b3f403b93f0?w=300&h=300&fit=crop', subtitle: 'Top UK hits of this week' },
            { title: 'Global Hip Hop Top 50 🎤', query: 'hip hop rap trap top charts hits', img: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop', subtitle: 'Top hip hop and rap anthems' },
            { title: 'Global Dance Hits 💃', query: 'global dance house edm club clubbing hits', img: 'https://images.unsplash.com/photo-1482440308425-276ad0f28b19?w=300&h=300&fit=crop', subtitle: 'Top club and dancefloor anthems' },
            { title: 'TikTok Trending Reels 📱', query: 'tiktok viral trending reels hits songs', img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&h=300&fit=crop', subtitle: 'Most popular social media tracks' }
        ];

        const shuffledGlobals = seededShuffle(globalChartsTemplates, rand);
        shuffledGlobals.forEach((gc, idx) => {
            const pageOffset = Math.floor(rand() * 2);
            charts.push({
                id: `chart-global-${idx}-${seedKey}`,
                title: gc.title,
                subtitle: gc.subtitle,
                query: gc.query + ` ${modifiers[Math.floor(rand() * modifiers.length)]}`,
                img: gc.img,
                pageOffset: pageOffset
            });
        });

        allTopCharts = seededShuffle(charts, rand);
        currentTopChartsPage = 0;
        
        renderTopChartsChunk(allTopCharts.slice(0, topChartsPageSize));

        if (loadMoreTopChartsBtn) {
            if (allTopCharts.length > topChartsPageSize) {
                loadMoreTopChartsBtn.classList.remove('hidden');
            } else {
                loadMoreTopChartsBtn.classList.add('hidden');
            }
        }
    }

    function renderTopPlaylistsChunk(chunk) {
        if (!topPlaylistsGrid) return;
        chunk.forEach(play => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${play.img}" alt="${escapeHtml(play.title)}" loading="lazy">
                    <div class="card-play-btn">
                        <i class='bx bx-play'></i>
                    </div>
                </div>
                <div class="card-title">${escapeHtml(play.title)}</div>
                <div class="card-subtitle">${escapeHtml(play.subtitle)}</div>
            `;
            
            card.addEventListener('click', async () => {
                showToast(`⏳ Loading Playlist: ${play.title}...`);
                try {
                    let tracks = await api.searchSongs(play.query, play.pageOffset || 0, 40);
                    if (play.targetLang) {
                        const target = play.targetLang.toLowerCase();
                        tracks = tracks.filter(song => {
                            if (song.language) {
                                return song.language.toLowerCase() === target;
                            }
                            return true;
                        });
                    }
                    showCollectionDetail(play.title, play.subtitle, play.img, tracks, false, play.query);
                } catch (e) {
                    console.error('Failed to load playlist tracks', e);
                    showToast('❌ Error loading playlist tracks.');
                }
            });
            
            topPlaylistsGrid.appendChild(card);
        });
    }

    async function loadTopPlaylists() {
        if (!topPlaylistsGrid) return;
        topPlaylistsGrid.innerHTML = '';
        
        const seedKey = getHourlySeedKey();
        const rand = getSeededRandom(seedKey);
        
        let playlists = [];
        let langs = [];
        try {
            langs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
        } catch (e) {
            console.error('Failed to load user languages for playlists:', e);
        }
        if (!langs || langs.length === 0) {
            langs = ['hindi', 'english', 'punjabi', 'tamil', 'telugu'];
        }

        const modifiers = ["vibes", "hits collection", "mellow playlist", "essentials", "favorites", "soundtrack"];

        // 1. Regional Playlists based on user languages
        langs.forEach(lang => {
            const langObj = api.LANGUAGES_CONFIG.find(l => l.id === lang.toLowerCase());
            const langName = langObj ? langObj.name : lang;
            const langEmoji = langObj ? langObj.emoji : '🎵';

            const modifierIndex = Math.floor(rand() * modifiers.length);
            const pageOffset = Math.floor(rand() * 3); // page 0, 1, or 2

            // Romance
            const romTitles = [`${langName} Romance 💖`, `${langName} Love Melodies 💕`, `${langName} Heartbeats 💘`];
            const romTitle = romTitles[Math.floor(rand() * romTitles.length)];
            const romImg = CHART_PLAYLIST_IMAGES.romance[Math.floor(rand() * CHART_PLAYLIST_IMAGES.romance.length)];
            playlists.push({
                id: `play-${lang}-romance-${seedKey}`,
                title: romTitle,
                subtitle: `Beautiful love ballads and romantic songs in ${langName}`,
                query: `${langName} romantic love songs hits ${modifiers[modifierIndex]}`,
                img: romImg,
                targetLang: lang,
                pageOffset: pageOffset
            });

            // Party
            const partyTitles = [`${langName} Party Mashup 🪩`, `${langName} Club Dance 🕺`, `${langName} Hype Beats ⚡`];
            const partyTitle = partyTitles[Math.floor(rand() * partyTitles.length)];
            const partyImg = CHART_PLAYLIST_IMAGES.party[Math.floor(rand() * CHART_PLAYLIST_IMAGES.party.length)];
            playlists.push({
                id: `play-${lang}-party-${seedKey}`,
                title: partyTitle,
                subtitle: `High energy dance hits and party remixes in ${langName}`,
                query: `dance party remix ${langName} songs ${modifiers[(modifierIndex + 1) % modifiers.length]}`,
                img: partyImg,
                targetLang: lang,
                pageOffset: pageOffset
            });

            // Lo-fi
            const lofiTitles = [`${langName} Lo-Fi & Chill ☕`, `${langName} Acoustic Chill 🎸`, `${langName} Lazy Sunday 🍃`];
            const lofiTitle = lofiTitles[Math.floor(rand() * lofiTitles.length)];
            const lofiImg = CHART_PLAYLIST_IMAGES.lofi[Math.floor(rand() * CHART_PLAYLIST_IMAGES.lofi.length)];
            playlists.push({
                id: `play-${lang}-lofi-${seedKey}`,
                title: lofiTitle,
                subtitle: `Relaxing lofi and acoustic vibes in ${langName}`,
                query: `lofi study chill acoustic ${langName} songs`,
                img: lofiImg,
                targetLang: lang,
                pageOffset: pageOffset
            });

            // Devotional
            const devTitles = [`${langName} Devotional Peace 🙏`, `${langName} Sufi Soul ✨`, `${langName} Morning Aarti 🌅`];
            const devTitle = devTitles[Math.floor(rand() * devTitles.length)];
            const devImg = CHART_PLAYLIST_IMAGES.devotional[Math.floor(rand() * CHART_PLAYLIST_IMAGES.devotional.length)];
            playlists.push({
                id: `play-${lang}-devotional-${seedKey}`,
                title: devTitle,
                subtitle: `Soothing spiritual and devotional melodies in ${langName}`,
                query: `devotional bhajan peaceful prayer ${langName} songs`,
                img: devImg,
                targetLang: lang,
                pageOffset: 0
            });
        });

        // 2. Global / General Playlists pool
        const globalPlaylistsTemplates = [
            { title: 'Coding Session 💻', query: 'synthwave retrowave dark synth coding cyber focus', img: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=300&h=300&fit=crop', subtitle: 'Synthwave & retrowave for developer focus', theme: 'general' },
            { title: 'Midnight Jazz 🎷', query: 'slow midnight jazz instrumental saxophone trumpet', img: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=300&h=300&fit=crop', subtitle: 'Slow and smoky jazz instrumentals', theme: 'general' },
            { title: 'Sleep & Soothe 🌙', query: 'ambient sleep sounds deep relaxation sleep music zen sleep', img: 'https://images.unsplash.com/photo-1511295742364-92767fa62d9f?w=300&h=300&fit=crop', subtitle: 'Ambient soundscapes for deep sleep', theme: 'general' },
            { title: 'Workout Hype ⚡', query: 'edm gym running workout tracks high bpm house', img: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&h=300&fit=crop', subtitle: 'High energy tracks to power your workout', theme: 'workout' },
            { title: 'Acoustic Covers 🎸', query: 'acoustic cover songs indie chill guitar unplugged sessions', img: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop', subtitle: 'Indie acoustic covers and guitar chill', theme: 'lofi' },
            { title: 'Rainy Day Melodies 🌧️', query: 'rainy day songs slow melancholic pop sad piano', img: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=300&h=300&fit=crop', subtitle: 'Melancholic pop for rainy afternoons', theme: 'sad' },
            { title: 'Rock Classics 🎸', query: 'classic rock hits queen led zeppelin AC DC pink floyd', img: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&h=300&fit=crop', subtitle: 'Timeless rock and metal anthems', theme: 'retro' },
            { title: 'Gaming Beast Mode 🎮', query: 'epic orchestral gaming battle combat dubstep edm electro', img: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=300&h=300&fit=crop', subtitle: 'Intense background beats for competitive gaming', theme: 'workout' },
            { title: 'Nature Escape 🍃', query: 'forest rain bird sounds flute nature peaceful sounds zen meditation', img: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=300&h=300&fit=crop', subtitle: 'Healing nature sounds and soft ambient flutes', theme: 'devotional' },
            { title: 'Lofi Study Beats 📖', query: 'lofi hip hop study beats homework study focus instrumental', img: 'https://images.unsplash.com/photo-1516981879613-9f5da904015f?w=300&h=300&fit=crop', subtitle: 'Relaxing chillhop beats to keep you focused', theme: 'lofi' },
            { title: 'Coffee Shop Vibe ☕', query: 'acoustic pop coffee shop background guitar cafe sessions', img: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&h=300&fit=crop', subtitle: 'Warm acoustic sessions for relaxed afternoons', theme: 'lofi' },
            { title: 'Summer Beach Party 🏖️', query: 'summer pop dance house hits tropical deep house', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=300&fit=crop', subtitle: 'Tropical house and pop for sunny days', theme: 'party' },
            { title: 'Retro Pop Rewind 🪩', query: '80s 90s classic pop anthems disco pop old school hits', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop', subtitle: 'Timeless pop hits from the 80s and 90s', theme: 'retro' },
            { title: 'Heavy Metal Fury ⚡', query: 'heavy metal thrash metal hard rock slayer metallica megadeth', img: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=300&h=300&fit=crop', subtitle: 'High voltage metal tracks for headbanging', theme: 'workout' },
            { title: 'Epic Cinematic 🎬', query: 'epic orchestral cinematic movie theme soundtrack orchestra', img: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&h=300&fit=crop', subtitle: 'Inspiring orchestral movie themes and scores', theme: 'general' },
            { title: 'Country Roads 🌾', query: 'classic country songs folk guitar bluegrass roots', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop', subtitle: 'Soulful country melodies and acoustic stories', theme: 'general' },
            { title: 'Hip Hop Essentials 🎤', query: '90s hip hop boom bap rap classics gold school rap', img: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&h=300&fit=crop', subtitle: 'Boom bap beats and legendary hip hop verses', theme: 'general' },
            { title: 'Piano Masterpieces 🎹', query: 'classical piano solo chopin mozart beethoven calm piano', img: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=300&h=300&fit=crop', subtitle: 'Serene classical piano compositions', theme: 'general' },
            { title: 'Chillhop Sunset 🌅', query: 'chillhop boom bap beats sunset background relax instrumental', img: 'https://images.unsplash.com/photo-1472289065668-ce650ac443d2?w=300&h=300&fit=crop', subtitle: 'Mellow boom bap beats for late evenings', theme: 'lofi' },
            { title: 'Sanskrit Chants & Zen 🕉️', query: 'sanskrit mantra chants meditation yoga chants peaceful', img: 'https://images.unsplash.com/photo-1609137144813-2ef0e741525a?w=300&h=300&fit=crop', subtitle: 'Ancient Sanskrit chants for spiritual peace', theme: 'devotional' },
            { title: 'Blues Night 🌃', query: 'classic blues guitar soul BB King Muddy Waters Buddy Guy', img: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=300&h=300&fit=crop', subtitle: 'Authentic blues solos and soulful stories', theme: 'general' },
            { title: 'Deep Focus Ambient 🌌', query: 'deep space ambient focus drone synthesizers calming soundscapes', img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=300&fit=crop', subtitle: 'Immersive electronic textures for focus', theme: 'general' },
            { title: 'Latin Fiesta 💃', query: 'reggaeton hits salsa bachata latin pop dance fiesta', img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&h=300&fit=crop', subtitle: 'Hot reggaeton, salsa, and latin pop beats', theme: 'party' },
            { title: 'Disco Fever 🕺', query: '70s disco funk grooves dance classics earth wind fire', img: 'https://images.unsplash.com/photo-1482440308425-276ad0f28b19?w=300&h=300&fit=crop', subtitle: 'Dancefloor funk and classic 70s disco grooves', theme: 'party' },
            { title: 'Reggae Vibe 🇯🇲', query: 'roots reggae dub chill bob marley style ska classic', img: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=300&fit=crop', subtitle: 'Roots reggae and positive vibrations', theme: 'lofi' },
            { title: 'Sufi Whirling 💫', query: 'mystic sufi music nusrat fateh ali khan qawwali soul', img: 'https://images.unsplash.com/photo-1499244015905-ac73dfd74772?w=300&h=300&fit=crop', subtitle: 'Trance-inducing spiritual sufi qawwalis', theme: 'devotional' }
        ];

        const shuffledGlobals = seededShuffle(globalPlaylistsTemplates, rand);
        shuffledGlobals.forEach((gp, idx) => {
            const pageOffset = Math.floor(rand() * 2);
            playlists.push({
                id: `play-global-${idx}-${seedKey}`,
                title: gp.title,
                subtitle: gp.subtitle,
                query: gp.query + ` ${modifiers[Math.floor(rand() * modifiers.length)]}`,
                img: gp.img,
                pageOffset: pageOffset
            });
        });

        allTopPlaylists = seededShuffle(playlists, rand);
        currentTopPlaylistsPage = 0;
        
        renderTopPlaylistsChunk(allTopPlaylists.slice(0, topPlaylistsPageSize));

        if (loadMoreTopPlaylistsBtn) {
            if (allTopPlaylists.length > topPlaylistsPageSize) {
                loadMoreTopPlaylistsBtn.classList.remove('hidden');
            } else {
                loadMoreTopPlaylistsBtn.classList.add('hidden');
            }
        }
    }

    function getActiveLanguage() {
        let userLangs = [];
        try {
            userLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
        } catch (e) {}
        return (userLangs && userLangs.length > 0) ? userLangs[0].toLowerCase() : 'hindi';
    }

    function renderDevotionalChunk(chunk) {
        if (!devotionalGrid) return;
        const firstLang = getActiveLanguage();
        chunk.forEach(play => {
            const card = document.createElement('div');
            card.className = 'music-card';
            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${play.img}" alt="${escapeHtml(play.title)}" loading="lazy">
                    <div class="card-play-btn">
                        <i class='bx bx-play'></i>
                    </div>
                </div>
                <div class="card-title">${escapeHtml(play.title)}</div>
                <div class="card-subtitle">${escapeHtml(play.subtitle)}</div>
            `;
            
            card.addEventListener('click', async () => {
                showToast(`⏳ Loading Playlist: ${play.title}...`);
                try {
                    let tracks = await api.searchSongs(play.query, 0, play.limit);
                    showCollectionDetail(play.title, play.subtitle, play.img, tracks, false, play.query);
                } catch (e) {
                    console.error('Failed to load devotional playlist tracks', e);
                    showToast('❌ Error loading devotional tracks.');
                }
            });
            
            devotionalGrid.appendChild(card);
        });
    }

    async function loadDevotional() {
        if (!devotionalGrid) return;
        devotionalGrid.innerHTML = '';
        
        const firstLang = getActiveLanguage();
        const langObj = api.LANGUAGES_CONFIG.find(l => l.id === firstLang) || { name: 'Hindi', emoji: '🇮🇳' };
        const langName = langObj.name;
        const langEmoji = langObj.emoji;

        const dayOfWeek = new Date().getDay();
        const config = getDailyDevotionalConfig(firstLang, dayOfWeek);
        
        // Setup localized labels
        let morningTitle = config.morningTitle;
        let morningQuery = config.morningQuery;
        let eveningTitle = config.eveningTitle;
        let eveningQuery = config.eveningQuery;
        let mixTitle = config.mixTitle;
        let mixQuery = config.mixQuery;
        let dailySpecialTitle = config.dailySpecialTitle;
        let dailySpecialQuery = config.dailySpecialQuery;

        // Additional playlists
        let meditationTitle = "Meditation & Yoga 🧘";
        let meditationQuery = `meditation music`;
        
        let sanskritTitle = "Sanskrit Slokas & Chants 🪔";
        let sanskritQuery = `sanskrit stotram`;
        
        let templeTitle = "Temple Bell & Flute 🔔";
        let templeQuery = `temple flute`;

        let sufiTitle = "Sufi & Qawwali Mystic 🌟";
        let sufiQuery = `sufi qawwali`;

        let modernBhaktiTitle = "Modern Bhakti & Youth Mix ⚡";
        let modernBhaktiQuery = `${firstLang} bhakti`;

        let folkBhaktiTitle = "Folk & Traditional Bhakti 🌾";
        let folkBhaktiQuery = `${firstLang} folk`;

        let krishnaTitle = "Krishna & ISKCON Kirtan 🌸";
        let krishnaQuery = `${firstLang} krishna`;

        let healingTitle = "Universal Healing Chants 🕊️";
        let healingQuery = `healing sound solfeggio`;

        let legendsTitle = "Classic Devotional Legends 🎙️";
        let legendsQuery = `${firstLang} old bhajan`;

        // Localized language overrides
        if (firstLang === 'hindi') {
            meditationTitle = "ध्यान और योग संगीत 🧘";
            sanskritTitle = "संस्कृत श्लोक और स्तोत्र 🪔";
            templeTitle = "मंदिर की घंटी और बांसुरी 🔔";
            sufiTitle = "सूफ़ी और कव्वाली भक्ति 🌟";
            modernBhaktiTitle = "युवा भक्ति और मॉडर्न मिक्स ⚡";
            folkBhaktiTitle = "पारंपरिक लोक भक्ति 🌾";
            krishnaTitle = "कृष्ण और इस्कॉन कीर्तन 🌸";
            healingTitle = "आध्यात्मिक हीलिंग मंत्र 🕊️";
            legendsTitle = "सदाबहार भक्ति संगीत 🎙️";
        } else if (firstLang === 'punjabi') {
            meditationTitle = "Peaceful Chants & Yoga 🧘";
            sanskritTitle = "Ancient Sacred Chants 🪔";
            templeTitle = "Flute & Rabaab Spiritual 🔔";
            sufiTitle = "Punjabi Sufi Mystic Shabads 🌟";
            modernBhaktiTitle = "Modern Punjabi Devotional ⚡";
            folkBhaktiTitle = "Traditional Punjabi Folk Bhakti 🌾";
            krishnaTitle = "Hari Simran & Shabad 🌸";
            healingTitle = "Spiritual Healing Sounds 🕊️";
            legendsTitle = "Classic Punjabi Shabad Legends 🎙️";
        } else if (firstLang === 'bhojpuri') {
            meditationTitle = "ध्यान और योग 🧘";
            sanskritTitle = "संस्कृत श्लोक व स्तोत्र 🪔";
            templeTitle = "बांसुरी और शहनाई मंगल संगीत 🔔";
            sufiTitle = "भोजपुरी निर्गुण व सूफ़ी संगीत 🌟";
            modernBhaktiTitle = "भोजपुरी नया भक्ति गीत ⚡";
            folkBhaktiTitle = "पारंपरिक भोजपुरी लोक भक्ति 🌾";
            krishnaTitle = "कृष्ण कन्हैया भजन 🌸";
            healingTitle = "शांत हीलिंग मंत्र 🕊️";
            legendsTitle = "भोजपुरी भक्ति के सदाबहार गीत 🎙️";
        } else if (firstLang === 'tamil') {
            meditationTitle = "தியானம் மற்றும் யோகா 🧘";
            sanskritTitle = "சமஸ்கிருத ஸ்லோகங்கள் 🪔";
            templeTitle = "கோவில் நாதஸ்வரம் & புல்லாங்குழல் 🔔";
            sufiTitle = "ஆன்மீக சூஃபி இசை 🌟";
            modernBhaktiTitle = "நவீன தமிழ் பக்தி பாடல்கள் ⚡";
            folkBhaktiTitle = "பாரம்பரிம கிராமிய பக்தி 🌾";
            krishnaTitle = "கிருஷ்ண பக்தி பாடல்கள் 🌸";
            healingTitle = "ஆன்மீக சிகிச்சை மந்திரங்கள் 🕊️";
            legendsTitle = "பழம்பெரும் தமிழ் பக்தி பாடல்கள் 🎙️";
        } else if (firstLang === 'telugu') {
            meditationTitle = "ధ్యానం మరియు యోగా 🧘";
            sanskritTitle = "సంస్కృత శ్లోకాలు 🪔";
            templeTitle = "ఆలయ సన్నాయి & పిల్లనగ్రోవి 🔔";
            sufiTitle = "ఆధ్యాత్మిక సూఫీ కీర్తనలు 🌟";
            modernBhaktiTitle = "ఆధునిక భక్తి గీతాలు ⚡";
            folkBhaktiTitle = "జానపద భక్తి గీతాలు 🌾";
            krishnaTitle = "కృష్ణ భజనలు & కీర్తనలు 🌸";
            healingTitle = "ఆధ్యాత్మిక హీలింగ్ మంత్రాలు 🕊️";
            legendsTitle = "సతతహరిత భక్తి గీతాలు 🎙️";
        } else if (firstLang === 'english') {
            modernBhaktiTitle = "Contemporary Christian Mix ⚡";
            folkBhaktiTitle = "Acoustic & Folk Worship 🌾";
            krishnaTitle = "Hare Krishna & Kirtan 🌸";
            legendsTitle = "Classic Gospel & Hymns 🎙️";

            modernBhaktiQuery = "christian rock";
            folkBhaktiQuery = "acoustic worship";
            krishnaQuery = "hare krishna";
            legendsQuery = "gospel hymns";
        }

        // Setup localized daily mix queries to avoid empty results on non-Hindi languages
        let mix50Query = `${firstLang} temple mantras`;

        if (firstLang === 'english') {
            mix50Query = "sacred church hymns";
        }

        // Build 40 playlists categorized by Hindu deities & spiritual formats
        const playlists = [
            // Daily Dynamic (1-4)
            {
                title: morningTitle,
                subtitle: `Start your day with peaceful prayers and chants`,
                query: morningQuery,
                img: config.morningImg,
                limit: 30
            },
            {
                title: eveningTitle,
                subtitle: `Unwind with soothing evening prayers and aarti`,
                query: eveningQuery,
                img: config.eveningImg,
                limit: 30
            },
            {
                title: mixTitle,
                subtitle: `An uplifting mix of devotional and sufi tracks`,
                query: mixQuery,
                img: config.mixImg,
                limit: 40
            },
            {
                title: dailySpecialTitle,
                subtitle: `${langName} daily devotional special`,
                query: dailySpecialQuery,
                img: config.specialImg,
                limit: 30
            },
            // Shiva / Mahadev (5-8)
            {
                title: "Shiva Tandava & Stotrams 🔱",
                subtitle: "Powerful and meditative chants dedicated to Lord Shiva",
                query: `${firstLang} shiva tandav stotram`,
                img: 'https://images.unsplash.com/photo-1609137144813-2ef0e741525a?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Mahadev Bhajans & Aarti 🏔️",
                subtitle: "Devotional songs singing praises of Lord Shiva",
                query: `${firstLang} shiv bhajan aarti`,
                img: 'https://images.unsplash.com/photo-1590076214227-c1d42858b907?w=300&h=300&fit=crop',
                limit: 40
            },
            {
                title: "Shiva Chalisa & Mantras 📿",
                subtitle: "Chanting of Shiva Chalisa and peace-giving mantras",
                query: `${firstLang} shiv chalisa mantra`,
                img: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Maha Mrityunjaya Jaap 🕉️",
                subtitle: "Continuous loop of the healing Mahamrityunjaya Mantra",
                query: `maha mrityunjaya mantra loop`,
                img: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=300&h=300&fit=crop',
                limit: 15
            },
            // Krishna / Rama (9-13)
            {
                title: krishnaTitle,
                subtitle: `Enchanting chants and hymns for Lord Krishna`,
                query: krishnaQuery,
                img: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=300&h=300&fit=crop',
                limit: 35
            },
            {
                title: "Ram Siya Ram Bhajans 🏹",
                subtitle: "Melodious bhajans and kirtans dedicated to Lord Rama",
                query: `${firstLang} ram bhajan`,
                img: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop',
                limit: 35
            },
            {
                title: "Radha Krishna Love Bhajans 💕",
                subtitle: "Soul-stirring divine love songs of Radha Krishna",
                query: `${firstLang} radha krishna bhajan`,
                img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
                limit: 35
            },
            {
                title: "Ram Chalisa & Sundarkand 📖",
                subtitle: "Recitations of Sundarkand and Shri Ram Chalisa",
                query: `${firstLang} sundarkand ram chalisa`,
                img: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=300&h=300&fit=crop',
                limit: 25
            },
            {
                title: "Krishna Aarti & Madhurashtakam 🍯",
                subtitle: "Sweet praises and night-time kirtan of Shri Krishna",
                query: `${firstLang} krishna aarti madhurashtakam`,
                img: 'https://images.unsplash.com/photo-1499244015905-ac73dfd74772?w=300&h=300&fit=crop',
                limit: 30
            },
            // Ganesha / Hanuman (14-17)
            {
                title: "Ganesha Bhajans & Aarti 🌸",
                subtitle: "Start your work with prayers of Lord Ganesha",
                query: `${firstLang} ganesh bhajan aarti`,
                img: 'https://images.unsplash.com/photo-1568252542512-9fe8fe9c87bb?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Hanuman Chalisa & Bajrang Baan 💪",
                subtitle: "Uplifting and powerful prayers to Lord Hanuman",
                query: `${firstLang} hanuman chalisa bajrang baan`,
                img: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Ganesh Chalisa & Mantras 🔔",
                subtitle: "Continuous mantras and stutis of Vignaharta",
                query: `${firstLang} ganesh chalisa mantra`,
                img: 'https://images.unsplash.com/photo-1609137144813-2ef0e741525a?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Hanuman Bhajans & Aarti 🕯️",
                subtitle: "Devotional songs singing praises of Bajrangbali",
                query: `${firstLang} hanuman bhajan aarti`,
                img: 'https://images.unsplash.com/photo-1590076214227-c1d42858b907?w=300&h=300&fit=crop',
                limit: 40
            },
            // Durga / Kali / Lakshmi / Saraswati (18-22)
            {
                title: "Durga Maa Navratri Special 🪔",
                subtitle: "Devoted stutis, bhajans and fasting songs of Maa Sherawali",
                query: `${firstLang} durga bhajan navratri`,
                img: 'https://images.unsplash.com/photo-1590076214227-c1d42858b907?w=300&h=300&fit=crop',
                limit: 40
            },
            {
                title: "Lakshmi Maa Aarti & Mantra 💰",
                subtitle: "Devotional songs for wealth and prosperity",
                query: `${firstLang} lakshmi aarti mantra`,
                img: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Saraswati Chants & Vandana 📚",
                subtitle: "Prayers for intelligence, knowledge and arts",
                query: `${firstLang} saraswati vandana chants`,
                img: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=300&h=300&fit=crop',
                limit: 25
            },
            {
                title: "Durga Chalisa & Durga Stuti 🛕",
                subtitle: "Powerful recitations of Durga Chalisa",
                query: `${firstLang} durga chalisa stuti`,
                img: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Maa Kali Chants & Stotrams 🛡️",
                subtitle: "Protective and fierce chants of Goddess Kali",
                query: `${firstLang} kali mantra stotram`,
                img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=300&h=300&fit=crop',
                limit: 30
            },
            // Sai Baba / Vishnu / Shani (23-26)
            {
                title: "Sai Baba Bhakti Aradhana ✨",
                subtitle: "Soothing Sai Baba prayers, Kakad Aarti & Bhajans",
                query: `${firstLang} sai baba bhajan aarti`,
                img: 'https://images.unsplash.com/photo-1499244015905-ac73dfd74772?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Vishnu Sahasranamam & Bhajans 🌊",
                subtitle: "1000 names of Lord Vishnu and Hari Kirtan",
                query: `${firstLang} vishnu sahasranamam bhajan`,
                img: 'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=300&h=300&fit=crop',
                limit: 20
            },
            {
                title: "Shani Dev Aarti & Mantras 🪐",
                subtitle: "Devotional prayers for Lord Shani",
                query: `${firstLang} shani dev aarti mantra`,
                img: 'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=300&h=300&fit=crop',
                limit: 25
            },
            {
                title: "Lord Venkateswara Suprabhatam ☀️",
                subtitle: "Sacred morning chanting of Lord Balaji",
                query: `venkateswara suprabhatam`,
                img: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=300&h=300&fit=crop',
                limit: 15
            },
            // Formats: Chants, Slokas, Sufi (27-31)
            {
                title: sanskritTitle,
                subtitle: `Ancient divine stotrams and sanskrit chanting`,
                query: sanskritQuery,
                img: 'https://images.unsplash.com/photo-1609137144813-2ef0e741525a?w=300&h=300&fit=crop',
                limit: 35
            },
            {
                title: "Gayatri Mantra & Chants 🕊️",
                subtitle: "Looping of the sacred Gayatri Mantra for positive energy",
                query: `gayatri mantra loop`,
                img: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300&h=300&fit=crop',
                limit: 15
            },
            {
                title: sufiTitle,
                subtitle: `Soulful sufi devotionals and spiritual qawwalis`,
                query: sufiQuery,
                img: 'https://images.unsplash.com/photo-1499244015905-ac73dfd74772?w=300&h=300&fit=crop',
                limit: 35
            },
            {
                title: "Sanskrit Mantras for Positivity ✨",
                subtitle: "Sacred sanskrit mantras that clear negative energy",
                query: `sanskrit positive mantras`,
                img: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Bhagavad Gita Slokas & Chants 📖",
                subtitle: "Enchanting Gita recitations with translation/background score",
                query: `bhagavad gita slokas audio`,
                img: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=300&h=300&fit=crop',
                limit: 30
            },
            // Ambient / Instruments (32-35)
            {
                title: templeTitle,
                subtitle: `Traditional instrumentals with pure temple vibe`,
                query: templeQuery,
                img: 'https://images.unsplash.com/photo-1590076214227-c1d42858b907?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: meditationTitle,
                subtitle: `Relaxing soundscapes for meditation and inner peace`,
                query: meditationQuery,
                img: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: healingTitle,
                subtitle: `Positive energy, solfeggio healing frequencies`,
                query: healingQuery,
                img: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Spiritual Flute & Sitar 🪕",
                subtitle: "Divine classical flute and sitar instrumentals",
                query: `spiritual classical flute sitar`,
                img: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=300&h=300&fit=crop',
                limit: 30
            },
            // Modern / Folk (36-40)
            {
                title: legendsTitle,
                subtitle: `Timeless devotional masterpieces from legends`,
                query: legendsQuery,
                img: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=300&h=300&fit=crop',
                limit: 40
            },
            {
                title: modernBhaktiTitle,
                subtitle: `Modern pop fusion and acoustic devotional tunes`,
                query: modernBhaktiQuery,
                img: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: folkBhaktiTitle,
                subtitle: `Folk devotionals, traditional regional bhajans`,
                query: folkBhaktiQuery,
                img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: "Modern Pop Bhakti Remix ⚡",
                subtitle: "Fast-paced modern bhakti tracks and remixes",
                query: `${firstLang} bhakti remix electronic`,
                img: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop',
                limit: 30
            },
            {
                title: `Celestial Mix 50 ✨`,
                subtitle: `50 celestial soundscapes and divine hymns`,
                query: mix50Query,
                img: 'https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=300&h=300&fit=crop',
                limit: 50
            }
        ];

        allDevotionalPlaylists = playlists;
        currentDevotionalPage = 0;
        
        renderDevotionalChunk(allDevotionalPlaylists.slice(0, devotionalPageSize));

        if (loadMoreDevotionalBtn) {
            if (allDevotionalPlaylists.length > devotionalPageSize) {
                loadMoreDevotionalBtn.classList.remove('hidden');
            } else {
                loadMoreDevotionalBtn.classList.add('hidden');
            }
        }
    }

    function getDailyDevotionalConfig(langId, dayIndex) {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = days[dayIndex];
        
        let config = {
            morningTitle: "Morning Prayers & Mantras 🙏",
            morningQuery: "morning prayer mantras",
            eveningTitle: "Evening Aarti & Peace 🕯️",
            eveningQuery: "evening bhajan",
            mixTitle: "Divine Meditation Mix 🧘",
            mixQuery: "meditation yoga music",
            dailySpecialTitle: `${dayName} Spiritual Special 🌸`,
            dailySpecialQuery: "devotional bhajan",
            morningImg: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=300&h=300&fit=crop",
            eveningImg: "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=300&h=300&fit=crop",
            mixImg: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=300&h=300&fit=crop",
            specialImg: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=300&h=300&fit=crop"
        };

        if (langId === 'hindi') {
            const hindiDaily = [
                { title: "रविवार सूर्य देव भक्ति ☀️", query: "surya dev aarti" },
                { title: "सोमवार शिव आराधना 🔱", query: "shiv bhajan" },
                { title: "मंगलवार हनुमान जी भक्ति 🐒", query: "hanuman chalisa" },
                { title: "बुधवार गणेश वंदना 🐘", query: "ganesh aarti" },
                { title: "गुरुवार साईं बाबा व हरी भक्ति 🌸", query: "sai baba bhajan" },
                { title: "शुक्रवार दुर्गा माँ लक्ष्मी आरती 🔱", query: "durga aarti" },
                { title: "शनिवार शनि देव व हनुमान भक्ति 🪐", query: "shani dev aarti" }
            ];
            config.morningTitle = "प्रभात काल भजन व मंत्र 🌅";
            config.morningQuery = "morning bhajan";
            config.eveningTitle = "संध्या काल आरती व शांति 🕯️";
            config.eveningQuery = "evening bhajan";
            config.mixTitle = "भक्ति व सूफ़ी संगम 🌟";
            config.mixQuery = "sufi bhajan";
            config.dailySpecialTitle = hindiDaily[dayIndex].title;
            config.dailySpecialQuery = hindiDaily[dayIndex].query;
        } else if (langId === 'punjabi') {
            const punjabiDaily = [
                { title: "Sunday Gurbani Kirtan 🌾", query: "gurbani kirtan" },
                { title: "Monday Nitnem & Peace ☬", query: "nitnem" },
                { title: "Tuesday Sukhmani Sahib Path 🙏", query: "sukhmani sahib" },
                { title: "Wednesday Waheguru Simran ✨", query: "waheguru simran" },
                { title: "Thursday Asa Di Var Kirtan 🕯️", query: "asa di var" },
                { title: "Friday Soulful Shabads 🌺", query: "shabad kirtan" },
                { title: "Saturday Amrit Vela Path 🌅", query: "gurbani kirtan" }
            ];
            config.morningTitle = "Punjabi Morning Nitnem ☬";
            config.morningQuery = "nitnem";
            config.eveningTitle = "Rehras Sahib & Kirtan 🕯️";
            config.eveningQuery = "rehras sahib";
            config.mixTitle = "Punjabi Devotional Sufi Mix 🌾";
            config.mixQuery = "punjabi sufi";
            config.dailySpecialTitle = punjabiDaily[dayIndex].title;
            config.dailySpecialQuery = punjabiDaily[dayIndex].query;
        } else if (langId === 'bhojpuri') {
            const bhojpuriDaily = [
                { title: "रविवार सूर्य देव पूजा ☀️", query: "chath geet" },
                { title: "सोमवार शिव जी भजन 🔱", query: "bhojpuri shiv bhajan" },
                { title: "मंगलवार संकटमोचन भक्ति 🐒", query: "bhojpuri hanuman bhajan" },
                { title: "बुधवार गजानन वंदना 🐘", query: "bhojpuri ganesh" },
                { title: "गुरुवार साईं राम भजन 🌸", query: "bhojpuri sai bhajan" },
                { title: "शुक्रवार माई के भजन 🔱", query: "bhojpuri devi geet" },
                { title: "शनिवार बजरंगबली आराधना 🪐", query: "bhojpuri bajrangbali" }
            ];
            config.morningTitle = "भोजपुरी सुबह के भजन 🌅";
            config.morningQuery = "bhojpuri bhajan";
            config.eveningTitle = "भोजपुरी संध्या आरती 🕯️";
            config.eveningQuery = "bhojpuri aarti";
            config.mixTitle = "भोजपुरी भक्ति संगम 🌟";
            config.mixQuery = "bhojpuri bhakti";
            config.dailySpecialTitle = bhojpuriDaily[dayIndex].title;
            config.dailySpecialQuery = bhojpuriDaily[dayIndex].query;
        } else if (langId === 'tamil') {
            const tamilDaily = [
                { title: "Sunday Vinayagar Songs 🐘", query: "tamil vinayagar" },
                { title: "Monday Sivan Lord Chants 🔱", query: "tamil sivan" },
                { title: "Tuesday Murugan Special Suprabhatam 🛕", query: "kanda sashti kavacham" },
                { title: "Wednesday Amman Bakthi Songs 🔱", query: "tamil amman" },
                { title: "Thursday Guru & Perumal Chants 🌸", query: "tamil perumal" },
                { title: "Friday Goddess Durga Lakshmi Chants ✨", query: "tamil lakshmi" },
                { title: "Saturday Venkateswara Suprabhatam 🌅", query: "tamil suprabhatam" }
            ];
            config.morningTitle = "Tamil Morning Bakthi Songs 🌅";
            config.morningQuery = "tamil suprabhatam";
            config.eveningTitle = "Tamil Evening Prayers & Mangalam 🕯️";
            config.eveningQuery = "tamil prayers";
            config.mixTitle = "Tamil Devotional Divine Mix 🙏";
            config.mixQuery = "tamil devotional";
            config.dailySpecialTitle = tamilDaily[dayIndex].title;
            config.dailySpecialQuery = tamilDaily[dayIndex].query;
        } else if (langId === 'telugu') {
            const teluguDaily = [
                { title: "Sunday Venkateswara Chants 🌅", query: "telugu venkateswara" },
                { title: "Monday Shiva Stotrams 🔱", query: "telugu siva bhajan" },
                { title: "Tuesday Hanuman Chalisa Telugu 🐒", query: "telugu hanuman" },
                { title: "Wednesday Ganesh Bhakthi Songs 🐘", query: "telugu ganesh" },
                { title: "Thursday Sai Baba Devotional 🌸", query: "telugu sai baba" },
                { title: "Friday Lakshmi & Durga Devi 🛕", query: "telugu durga" },
                { title: "Saturday Rama Bhakthi & Suprabhatam 🪐", query: "telugu rama" }
            ];
            config.morningTitle = "Telugu Morning Devotional 🌅";
            config.morningQuery = "telugu suprabhatam";
            config.eveningTitle = "Telugu Evening Mangalam & Prayers 🕯️";
            config.eveningQuery = "telugu stotram";
            config.mixTitle = "Telugu Divine Melody Mix 🙏";
            config.mixQuery = "telugu bhakthi";
            config.dailySpecialTitle = teluguDaily[dayIndex].title;
            config.dailySpecialQuery = teluguDaily[dayIndex].query;
        } else if (langId === 'english') {
            const englishDaily = [
                { title: "Sunday Morning Worship ⛪", query: "worship songs" },
                { title: "Monday Healing Chants 🧘", query: "gregorian chants" },
                { title: "Tuesday Spiritual Awakening 🕊️", query: "spiritual ambient" },
                { title: "Wednesday Guided Meditations 🕯️", query: "meditation music" },
                { title: "Thursday Devotional Gospel 📖", query: "gospel hymns" },
                { title: "Friday Evening Gratitude 🙏", query: "soft prayers" },
                { title: "Saturday Sunset Instrumentals 🌅", query: "christian instrumental" }
            ];
            config.morningTitle = "English Morning Devotions 🌅";
            config.morningQuery = "worship songs";
            config.eveningTitle = "Evening Prayers & Rest 🕯️";
            config.eveningQuery = "christian meditation";
            config.mixTitle = "Gospel & Spiritual Chants 🌟";
            config.mixQuery = "gospel hymns";
            config.dailySpecialTitle = englishDaily[dayIndex].title;
            config.dailySpecialQuery = englishDaily[dayIndex].query;
        }
        return config;
    }

    function renderRadioChunk(chunk) {
        if (!radioGrid) return;
        chunk.forEach(station => {
            const card = document.createElement('div');
            card.className = 'music-card radio-card';
            if (currentActiveRadioTitle && station.title === currentActiveRadioTitle) {
                card.classList.add('active');
            }
            const imgId = `radio-station-img-${Math.random().toString(36).substr(2, 9)}`;
            card.innerHTML = `
                <div class="card-image-container">
                    <img id="${imgId}" src="${station.img}" alt="${escapeHtml(station.title)}" loading="lazy">
                    <div class="card-play-btn">
                        <i class='bx bx-broadcast'></i>
                    </div>
                </div>
                <div class="card-title">${escapeHtml(station.title)}</div>
                <div class="card-subtitle">${escapeHtml(station.subtitle)}</div>
            `;
            
            card.addEventListener('click', async () => {
                updateRadioCardsActiveState(station.title);
                showToast(`📻 Starting Station: ${station.title}...`);
                try {
                    let tracks = await api.searchSongs(station.query, 0, 40);
                    if (station.targetLang) {
                        const target = station.targetLang.toLowerCase();
                        tracks = tracks.filter(song => {
                            if (song.language) {
                                return song.language.toLowerCase() === target;
                            }
                            return true;
                        });
                    }
                    if (tracks && tracks.length > 0) {
                        player.setQueue(tracks, 0);
                    } else {
                        showToast('❌ No tracks found for this radio station.');
                    }
                } catch (e) {
                    console.error('Failed to start radio station', e);
                    showToast('❌ Error starting radio station.');
                }
            });
            
            radioGrid.appendChild(card);

            if (station.isArtist && typeof fetchActualArtistImage === 'function') {
                fetchActualArtistImage(station.artistName, station.img).then(url => {
                    const imgEl = card.querySelector(`#${imgId}`);
                    if (imgEl) imgEl.src = url;
                });
            }
        });
    }

    async function loadRadio() {
        if (!radioGrid) return;
        radioGrid.innerHTML = '';
        
        let stations = [];
        let langs = [];
        try {
            langs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
        } catch (e) {
            console.error('Failed to load user languages for radio:', e);
        }

        if (langs && langs.length > 0) {
            langs.forEach(lang => {
                const langObj = api.LANGUAGES_CONFIG.find(l => l.id === lang.toLowerCase());
                const langName = langObj ? langObj.name : lang;
                const langEmoji = langObj ? langObj.emoji : '📻';

                // Add language FM & Retro stations
                stations.push({
                    title: `${langName} Hits FM ${langEmoji}`,
                    subtitle: `Best trending hits in ${langName}`,
                    query: `top hits ${langName}`,
                    img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
                    isArtist: false,
                    targetLang: lang
                });
                stations.push({
                    title: `${langName} Retro Radio 📻`,
                    subtitle: `Golden classics of ${langName}`,
                    query: `old classic ${langName}`,
                    img: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=300&h=300&fit=crop',
                    isArtist: false,
                    targetLang: lang
                });

                // Get artists in this language
                const langSingers = api.ARTISTS_CONFIG.filter(a => a.lang === lang.toLowerCase());
                const selectedSingers = langSingers.slice(0, 48);
                selectedSingers.forEach(singer => {
                    stations.push({
                        title: `${singer.name} Radio 📻`,
                        subtitle: `Smooth ${langName} mix featuring ${singer.name}`,
                        query: singer.name,
                        img: singer.img || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
                        isArtist: true,
                        artistName: singer.name,
                        targetLang: lang
                    });
                });
            });
        } else {
            stations = [
                { title: 'Lo-Fi Chill FM ☕', subtitle: '24/7 relaxed lofi study beats', query: 'lofi study', img: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop', isArtist: false },
                { title: 'EDM Party Mix 🪩', subtitle: 'Non-stop club and dance hits', query: 'edm hits', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop', isArtist: false }
            ];
            // Add 24 popular singers from config
            const fallbackSingers = api.ARTISTS_CONFIG.slice(0, 24);
            fallbackSingers.forEach(singer => {
                const langObj = api.LANGUAGES_CONFIG.find(l => l.id === singer.lang.toLowerCase());
                const langName = langObj ? langObj.name : singer.lang;
                stations.push({
                    title: `${singer.name} Radio 📻`,
                    subtitle: `Smooth ${langName} mix featuring ${singer.name}`,
                    query: singer.name,
                    img: singer.img || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
                    isArtist: true,
                    artistName: singer.name,
                    targetLang: singer.lang
                });
            });
        }
        
        allRadioStations = stations;
        currentRadioPage = 0;
        
        const initialStations = allRadioStations.slice(0, radioPageSize);
        renderRadioChunk(initialStations);
        
        if (allRadioStations.length > radioPageSize && loadMoreRadioBtn) {
            loadMoreRadioBtn.classList.remove('hidden');
        } else if (loadMoreRadioBtn) {
            loadMoreRadioBtn.classList.add('hidden');
        }
    }

    async function loadAlbums() {
        if (!albumsGrid) return;
        albumsGrid.innerHTML = `<div class="loader-container" style="grid-column: 1/-1;"><div class="spinner"></div></div>`;
        try {
            const langs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '["hindi", "english"]');
            const promises = langs.map(async (lang) => {
                return api.searchAlbums(`latest ${lang} albums`, 8);
            });
            
            const results = await Promise.all(promises);
            let combined = [];
            results.forEach(res => {
                if (res && res.length > 0) {
                    combined = combined.concat(res);
                }
            });
            
            // Deduplicate
            const seenIds = new Set();
            combined = combined.filter(album => {
                if (!album || !album.id) return false;
                if (seenIds.has(album.id)) return false;
                seenIds.add(album.id);
                return true;
            });
            
            // Shuffle
            combined = combined.sort(() => 0.5 - Math.random()).slice(0, 18);
            
            albumsGrid.innerHTML = '';
            if (combined.length > 0) {
                combined.forEach(album => {
                    const imgUrl = album.image?.[2]?.url || album.image?.[1]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&h=150&fit=crop';
                    const title = decodeHtml(album.name);
                    const artist = decodeHtml(album.artists?.primary?.[0]?.name || album.artist || 'Unknown Artist');
                    
                    const card = document.createElement('div');
                    card.className = 'music-card';
                    card.innerHTML = `
                        <div class="card-image-container">
                            <img src="${imgUrl}" alt="${escapeHtml(title)}" loading="lazy">
                            <div class="card-play-btn">
                                <i class='bx bx-play'></i>
                            </div>
                        </div>
                        <div class="card-title">${escapeHtml(title)}</div>
                        <div class="card-subtitle">${escapeHtml(artist)}</div>
                    `;
                    
                    card.addEventListener('click', async () => {
                        showToast(`⏳ Loading Album: ${title}...`);
                        try {
                            const albumDetails = await api.getAlbumById(album.id);
                            if (albumDetails && albumDetails.songs) {
                                showCollectionDetail(title, `Album by ${artist}`, imgUrl, albumDetails.songs, true, album.id);
                            } else {
                                const fallbackSongs = await api.searchSongs(title, 0, 15);
                                showCollectionDetail(title, `Album by ${artist} (Search Match)`, imgUrl, fallbackSongs, true, title);
                            }
                        } catch (e) {
                            console.error('Failed to load album', e);
                            showToast('❌ Error loading album details.');
                        }
                    });
                    
                    albumsGrid.appendChild(card);
                });
            } else {
                albumsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No featured albums found.</p>`;
            }
        } catch (err) {
            console.error('Failed to load albums:', err);
            albumsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #ff5555;">Error loading albums.</p>`;
        }
    }

    function showCollectionDetailDirectly(title, subtitle, imageUrl, tracks) {
        tracks = tracks || [];
        currentViewedPlaylist = { title: title, tracks: tracks };
        if (albumDetailImg) albumDetailImg.src = imageUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&h=150&fit=crop';
        if (albumDetailName) albumDetailName.textContent = title;
        if (albumDetailSub) albumDetailSub.textContent = `${subtitle} • ${tracks.length} tracks`;
        
        // Render tracks
        if (albumDetailGrid) renderSongCards(tracks, albumDetailGrid);
        
        // Setup play button
        if (playAlbumBtn) {
            playAlbumBtn.onclick = () => {
                if (tracks.length > 0) {
                    player.setQueue(tracks, 0);
                    showToast(`▶️ Playing collection: ${title}`);
                } else {
                    showToast('⚠️ No songs in this collection.');
                }
            };
        }
    }

    function showCollectionDetail(title, subtitle, imageUrl, tracks, isAlbum = false, sourceQuery = '') {
        showSection('album-detail', { title, subtitle, imageUrl, tracks });
        showCollectionDetailDirectly(title, subtitle, imageUrl, tracks);
    }

    async function getRelatedSongsForQuery(query, topSongs) {
        let related = [];
        const seen = new Set();
        if (topSongs && topSongs.length > 0) {
            topSongs.forEach(s => { if (s && s.id) seen.add(s.id); });
        }
        
        const queryLower = query.toLowerCase().trim();
        const matchedArtist = api.ARTISTS_CONFIG.find(artist => 
            artist.name.toLowerCase().includes(queryLower) || 
            queryLower.includes(artist.name.toLowerCase())
        );
        
        if (matchedArtist) {
            try {
                const artistSongs = await api.searchSongs(matchedArtist.name, 0, 10);
                artistSongs.forEach(s => {
                    if (s && s.id && !seen.has(s.id)) {
                        seen.add(s.id);
                        related.push(s);
                    }
                });
            } catch (e) { console.error(e); }
            
            const sameLangArtists = api.ARTISTS_CONFIG.filter(a => a.lang === matchedArtist.lang && a.name !== matchedArtist.name);
            if (sameLangArtists.length > 0) {
                const shuffled = sameLangArtists.sort(() => 0.5 - Math.random()).slice(0, 2);
                for (const otherArtist of shuffled) {
                    try {
                        const otherArtistSongs = await api.searchSongs(otherArtist.name, 0, 5);
                        otherArtistSongs.forEach(s => {
                            if (s && s.id && !seen.has(s.id)) {
                                seen.add(s.id);
                                related.push(s);
                            }
                        });
                    } catch (e) { console.error(e); }
                }
            }
        }
        
        if (topSongs && topSongs.length > 0) {
            try {
                const suggestions1 = await api.getSongSuggestions(topSongs[0].id, 10);
                suggestions1.forEach(s => {
                    if (s && s.id && !seen.has(s.id)) {
                        seen.add(s.id);
                        related.push(s);
                    }
                });
            } catch (e) {
                console.error('Failed to fetch search suggestions:', e);
            }
        }
        
        if (related.length === 0) {
            const terms = query.split(' ');
            if (terms.length > 1) {
                try {
                    const fallbackSongs = await api.searchSongs(terms[0], 0, 10);
                    fallbackSongs.forEach(s => {
                        if (s && s.id && !seen.has(s.id)) {
                            seen.add(s.id);
                            related.push(s);
                        }
                    });
                } catch (e) { console.error(e); }
            }
        }
        
        return related.slice(0, 12);
    }

    function getRelatedRadiosForQuery(query, songs) {
        const stations = [];
        const seenNames = new Set();
        const queryLower = query.toLowerCase().trim();
        
        // 1. Check artist config database
        const matchedSingers = api.ARTISTS_CONFIG.filter(singer => 
            singer.name.toLowerCase().includes(queryLower) || 
            queryLower.includes(singer.name.toLowerCase())
        );
        
        matchedSingers.forEach(singer => {
            if (!seenNames.has(singer.name.toLowerCase())) {
                seenNames.add(singer.name.toLowerCase());
                stations.push({
                    title: `${singer.name} Radio 📻`,
                    subtitle: `Endless hits of ${singer.name}`,
                    query: singer.name,
                    img: singer.actualImg || singer.img || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
                    isArtist: true,
                    artistName: singer.name,
                    targetLang: singer.lang
                });
            }
        });
        
        // 2. Check song results primary artists
        if (songs && songs.length > 0) {
            songs.slice(0, 4).forEach(song => {
                let primaryArtist = '';
                if (song.artists && song.artists.primary && song.artists.primary.length > 0) {
                    primaryArtist = song.artists.primary[0].name;
                } else if (song.artist) {
                    primaryArtist = song.artist;
                }
                
                if (primaryArtist && !seenNames.has(primaryArtist.toLowerCase())) {
                    seenNames.add(primaryArtist.toLowerCase());
                    
                    const singer = api.ARTISTS_CONFIG.find(s => s.name.toLowerCase() === primaryArtist.toLowerCase());
                    const img = singer ? (singer.actualImg || singer.img) : (song.image ? api.getBestImageUrl(song) : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop');
                    
                    stations.push({
                        title: `${primaryArtist} Radio 📻`,
                        subtitle: `Custom station featuring ${primaryArtist}`,
                        query: primaryArtist,
                        img: img,
                        isArtist: true,
                        artistName: primaryArtist,
                        targetLang: song.language || 'hindi'
                    });
                }
            });
        }

        // 3. Add query-based station
        if (stations.length < 4 && query.length > 2) {
            stations.push({
                title: `${query} Mix Radio 🌀`,
                subtitle: `Endless mix related to your search`,
                query: query,
                img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop',
                isArtist: false
            });
        }

        return stations.slice(0, 8);
    }

    function renderPlaylistCards(playlists, gridEl) {
        if (!gridEl) return;
        gridEl.innerHTML = '';
        playlists.forEach(playlist => {
            const card = document.createElement('div');
            card.className = 'music-card';
            const playlistImg = api.getBestImageUrl(playlist) || playlist.image?.[2]?.url || 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=300&fit=crop';
            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${playlistImg}" alt="${escapeHtml(playlist.name)}" loading="lazy">
                    <div class="card-play-btn">
                        <i class='bx bx-play'></i>
                    </div>
                </div>
                <div class="card-title">${escapeHtml(playlist.name)}</div>
                <div class="card-subtitle">${escapeHtml(String(playlist.songCount || 0))} tracks</div>
            `;
            
            card.addEventListener('click', async () => {
                showToast(`⏳ Loading Playlist: ${playlist.name}...`);
                try {
                    const fullPlaylist = await api.getPlaylistById(playlist.id);
                    const tracks = fullPlaylist.songs || [];
                    showCollectionDetail(fullPlaylist.name, `${fullPlaylist.songCount} tracks`, playlistImg, tracks, false);
                } catch (e) {
                    console.error('Failed to load playlist tracks', e);
                    showToast('❌ Error loading playlist tracks.');
                }
            });
            gridEl.appendChild(card);
        });
    }

    function renderRelatedRadioCards(stations, gridEl) {
        if (!gridEl) return;
        gridEl.innerHTML = '';
        stations.forEach(station => {
            const card = document.createElement('div');
            card.className = 'music-card radio-card';
            if (currentActiveRadioTitle && station.title === currentActiveRadioTitle) {
                card.classList.add('active');
            }
            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${station.img}" alt="${escapeHtml(station.title)}" loading="lazy">
                    <div class="card-play-btn">
                        <i class='bx bx-broadcast'></i>
                    </div>
                </div>
                <div class="card-title">${escapeHtml(station.title)}</div>
                <div class="card-subtitle">${escapeHtml(station.subtitle)}</div>
            `;
            
            card.addEventListener('click', async () => {
                updateRadioCardsActiveState(station.title);
                showToast(`📻 Starting Station: ${station.title}...`);
                try {
                    let tracks = await api.searchSongs(station.query, 0, 40);
                    if (station.targetLang) {
                        const target = station.targetLang.toLowerCase();
                        tracks = tracks.filter(song => {
                            if (song.language) {
                                return song.language.toLowerCase() === target;
                            }
                            return true;
                        });
                    }
                    if (tracks && tracks.length > 0) {
                        player.setQueue(tracks, 0);
                    } else {
                        showToast('❌ No tracks found for this radio station.');
                    }
                } catch (e) {
                    console.error('Failed to start radio station', e);
                    showToast('❌ Error starting radio station.');
                }
            });
            gridEl.appendChild(card);
        });
    }

    // ---- Topbar Language Selector Logic ----
    const topbarLangSelect = document.getElementById('topbarLangSelect');
    if (topbarLangSelect) {
        topbarLangSelect.innerHTML = '';
        api.LANGUAGES_CONFIG.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.id;
            opt.textContent = `${lang.emoji} ${lang.name}`;
            topbarLangSelect.appendChild(opt);
        });

        let initialLang = 'hindi';
        try {
            const savedLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
            if (savedLangs && savedLangs.length > 0) {
                initialLang = savedLangs[0];
            } else {
                localStorage.setItem('symphonyUserLanguages', JSON.stringify([initialLang]));
            }
        } catch (e) {
            console.error('Error reading initial language', e);
        }
        topbarLangSelect.value = initialLang.toLowerCase();

        topbarLangSelect.addEventListener('change', async () => {
            const selectedVal = topbarLangSelect.value;
            try {
                localStorage.setItem('symphonyUserLanguages', JSON.stringify([selectedVal]));
                showToast(`🌍 Language changed to: <strong>${selectedVal.toUpperCase()}</strong>`);
                
                loadHomeSections();

                const activeSection = viewHistory.stack[viewHistory.currentIndex]?.section || 'home';
                if (activeSection === 'new-releases') {
                    loadNewReleases();
                } else if (activeSection === 'top-charts') {
                    loadTopCharts();
                } else if (activeSection === 'top-playlists') {
                    loadTopPlaylists();
                } else if (activeSection === 'radio') {
                    loadRadio();
                } else if (activeSection === 'devotional') {
                    loadDevotional();
                } else if (activeSection === 'artists') {
                    renderArtistsGrid();
                }
            } catch (err) {
                console.error('Error changing topbar language', err);
            }
        });
    }

    // ---- Init ----
    firebaseManager.initialize();
    
    // Sync the topbar language dropdown if user changes preference in the modal
    const originalPrefSaveBtn = document.getElementById('prefSaveBtn');
    if (originalPrefSaveBtn) {
        originalPrefSaveBtn.addEventListener('click', () => {
            try {
                const savedLangs = JSON.parse(localStorage.getItem('symphonyUserLanguages') || '[]');
                if (savedLangs && savedLangs.length > 0 && topbarLangSelect) {
                    topbarLangSelect.value = savedLangs[0].toLowerCase();
                }
            } catch (e) {
                console.error('Error syncing topbar lang from modal', e);
            }
        });
    }

    // ---- Hourly top chart and top playlist auto update ----
    let lastHourlySeed = getHourlySeedKey();
    setInterval(async () => {
        const currentHourlySeed = getHourlySeedKey();
        if (currentHourlySeed !== lastHourlySeed) {
            lastHourlySeed = currentHourlySeed;
            console.log(`[Hourly Update] Refreshing Top Charts and Top Playlists for seed: ${currentHourlySeed}`);
            
            const activeSection = viewHistory.stack[viewHistory.currentIndex]?.section || 'home';
            if (activeSection === 'top-charts') {
                await loadTopCharts();
            } else if (activeSection === 'top-playlists') {
                await loadTopPlaylists();
            }
            
            showToast("🎵 Top Charts and Top Playlists updated for this hour!");
        }
    }, 10000); // Check every 10 seconds

    // ---- Playlist Sharing Feature Logic ----
    const shareToast = document.getElementById('share-toast');

    function showShareToast(message) {
        if (!shareToast) return;
        shareToast.textContent = message || '📋 Link copied to clipboard!';
        shareToast.classList.remove('toast-hidden');
        shareToast.classList.add('toast-visible');
        setTimeout(() => {
            shareToast.classList.remove('toast-visible');
            shareToast.classList.add('toast-hidden');
        }, 3000);
    }

    async function handleSharePlaylist(title, songs) {
        if (!songs || songs.length === 0) {
            showShareToast('⚠️ Cannot share an empty playlist!');
            return;
        }
        showShareToast('⏳ Generating share link...');
        try {
            const result = await firebaseManager.generateShareLink(title, songs);
            if (result && result.share_url) {
                await navigator.clipboard.writeText(result.share_url);
                showShareToast('📋 Link copied to clipboard!');
            } else {
                showShareToast('❌ Failed to get share link.');
            }
        } catch (err) {
            console.error('Share playlist failed:', err);
            showShareToast('❌ Server error or offline.');
        }
    }

    // Export to window to allow external call
    window.handleSharePlaylist = handleSharePlaylist;

    // Attach click listeners to share buttons
    const sharePlaylistBtn = document.getElementById('sharePlaylistBtn');
    if (sharePlaylistBtn) {
        sharePlaylistBtn.addEventListener('click', () => {
            const title = currentViewedPlaylist.title || 'Shared Playlist';
            const songs = currentViewedPlaylist.tracks || [];
            handleSharePlaylist(title, songs);
        });
    }

    const shareLikedBtn = document.getElementById('shareLikedBtn');
    if (shareLikedBtn) {
        shareLikedBtn.addEventListener('click', () => {
            const title = 'My Liked Songs';
            const songs = player.getLikedSongs() || [];
            handleSharePlaylist(title, songs);
        });
    }

    async function checkForSharedPlaylist() {
        const urlParams = new URLSearchParams(window.location.search);
        const sharedId = urlParams.get('shared_id');
        if (sharedId) {
            console.log('Detected shared_id in URL:', sharedId);
            mainLoader.classList.remove('hidden');
            homeSection.classList.add('hidden');
            heroBanner.classList.add('hidden');
            try {
                const playlist = await firebaseManager.fetchSharedPlaylist(sharedId);
                mainLoader.classList.add('hidden');
                if (playlist && playlist.songs && playlist.songs.length > 0) {
                    // Play the songs
                    player.setQueue(playlist.songs, 0);
                    showToast(`▶️ Playing shared playlist: <strong>${escapeHtml(decodeHtml(playlist.title))}</strong>`);
                    // Display the shared collection
                    showCollectionDetail(playlist.title, 'Shared Playlist', '', playlist.songs);
                } else {
                    showToast('⚠️ Shared playlist is empty or invalid.');
                    await loadHomeSections();
                }
            } catch (err) {
                console.error('Error loading shared playlist:', err);
                mainLoader.classList.add('hidden');
                showToast('❌ Shared playlist not found or backend offline.');
                await loadHomeSections();
            }
        } else {
            // Normal startup flow
            await loadHomeSections();
        }
    }

    // Run startup share check
    await checkForSharedPlaylist();
});

/* ═══════════════════════════════════════════════════════════════════════
   EXPANDED PLAYER — Mini → Full Screen Transition (Spotify Style)
   ═══════════════════════════════════════════════════════════════════════ */
(function initExpandedPlayer() {
    // ── Element refs ──────────────────────────────────────────────────────
    const expandedEl       = document.getElementById('expandedPlayer');
    const closeBtn         = document.getElementById('expandedCloseBtn');
    const bgBlur           = document.getElementById('expandedBgBlur');
    const artEl            = document.getElementById('expandedArt');
    const artGlow          = document.getElementById('expandedArtGlow');
    const titleEl          = document.getElementById('expandedTitle');
    const artistEl         = document.getElementById('expandedArtist');
    const likeBtn          = document.getElementById('expandedLikeBtn');
    const progressFill     = document.getElementById('expandedProgressFill');
    const seekSlider       = document.getElementById('expandedSeekSlider');
    const currentTimeEl    = document.getElementById('expandedCurrentTime');
    const totalTimeEl      = document.getElementById('expandedTotalTime');
    const playPauseBtn     = document.getElementById('expPlayPauseBtn');
    const prevBtn          = document.getElementById('expPrevBtn');
    const nextBtn          = document.getElementById('expNextBtn');
    const shuffleBtn       = document.getElementById('expShuffleBtn');
    const repeatBtn        = document.getElementById('expRepeatBtn');
    const volumeSlider     = document.getElementById('expandedVolumeSlider');
    const queueBtnExp      = document.getElementById('expQueueBtnExp');
    const devicesBtnExp    = document.getElementById('expDevicesBtnExp');
    const shareBtnExp      = document.getElementById('expShareBtnExp');

    // Mini player elements (to mirror state from)
    const miniTrackInfo    = document.querySelector('.player-bar .track-info');
    const miniImg          = document.getElementById('playerImage');
    const miniPlayPause    = document.getElementById('playPauseBtn');
    const miniSeek         = document.getElementById('seekSlider');
    const miniProgress     = document.getElementById('progressBar');
    const miniVolume       = document.getElementById('volumeSlider');
    const miniLike         = document.querySelector('.player-bar .like-btn');
    const miniShuffle      = document.getElementById('shuffleBtn');
    const miniRepeat       = document.getElementById('repeatBtn');
    const miniQueue        = document.getElementById('queueBtn');
    const miniDevices      = document.getElementById('devicesBtn');

    let isOpen = false;

    // ── Open / Close ──────────────────────────────────────────────────────
    function openExpanded() {
        syncState();
        expandedEl.classList.add('open');
        expandedEl.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        isOpen = true;
    }

    function closeExpanded() {
        expandedEl.classList.remove('open');
        expandedEl.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        isOpen = false;
    }

    // ── Sync all state from mini player ───────────────────────────────────
    function syncState() {
        // Song info
        titleEl.textContent  = document.getElementById('playerTitle')?.textContent  || 'No track selected';
        artistEl.textContent = document.getElementById('playerArtist')?.textContent || '—';

        // Album art
        const imgSrc = miniImg?.src || '';
        if (imgSrc && !miniImg?.classList.contains('hidden')) {
            artEl.src = imgSrc;
            artEl.style.display = 'block';
            updateBgColor(imgSrc);
        } else {
            artEl.style.display = 'none';
            resetBgColor();
        }

        // Play/Pause icon
        const miniIcon = miniPlayPause?.querySelector('i');
        const expIcon  = playPauseBtn?.querySelector('i');
        if (miniIcon && expIcon) {
            expIcon.className = miniIcon.className;
        }

        // Progress
        const pct = miniProgress ? miniProgress.style.width : '0%';
        progressFill.style.width = pct;
        seekSlider.value = parseFloat(pct) || 0;

        // Time
        currentTimeEl.textContent = document.getElementById('currentTimeDisplay')?.textContent || '0:00';
        totalTimeEl.textContent   = document.getElementById('totalTimeDisplay')?.textContent   || '0:00';

        // Volume
        if (miniVolume) volumeSlider.value = miniVolume.value;

        // Like state
        const miniLikeIcon = miniLike?.querySelector('i');
        const expLikeIcon  = likeBtn?.querySelector('i');
        if (miniLikeIcon && expLikeIcon) {
            expLikeIcon.className = miniLikeIcon.className;
            likeBtn.classList.toggle('liked', miniLike?.classList.contains('liked'));
        }

        // Shuffle / Repeat active state
        shuffleBtn?.classList.toggle('active', miniShuffle?.classList.contains('active'));
        repeatBtn?.classList.toggle('active',  miniRepeat?.classList.contains('active'));
    }

    // ── Dynamic background color from album art ───────────────────────────
    function updateBgColor(imgSrc) {
        // Use a hidden canvas to sample the dominant color
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 8;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 8, 8);
                const d = ctx.getImageData(0, 0, 8, 8).data;
                let r = 0, g = 0, b = 0;
                for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
                const n = d.length / 4;
                r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
                bgBlur.style.backgroundImage = `
                    radial-gradient(circle at 30% 25%, rgba(${r},${g},${b},0.55) 0%, transparent 60%),
                    radial-gradient(circle at 70% 75%, rgba(${Math.round(r*0.6)},${Math.round(g*0.6)},${Math.round(b*1.2)},0.35) 0%, transparent 55%)`;
                artGlow.style.background = `radial-gradient(circle, rgba(${r},${g},${b},0.6) 0%, transparent 70%)`;
            } catch(e) {
                resetBgColor();
            }
        };
        img.onerror = resetBgColor;
        img.src = imgSrc;
    }

    function resetBgColor() {
        bgBlur.style.backgroundImage = '';
        artGlow.style.background = 'radial-gradient(circle, rgba(209,54,246,0.4) 0%, transparent 70%)';
    }

    // ── Live progress sync (runs while open) ──────────────────────────────
    let syncInterval = null;

    function startLiveSync() {
        if (syncInterval) return;
        syncInterval = setInterval(() => {
            if (!isOpen) return;
            // Time
            currentTimeEl.textContent = document.getElementById('currentTimeDisplay')?.textContent || '0:00';
            totalTimeEl.textContent   = document.getElementById('totalTimeDisplay')?.textContent   || '0:00';
            // Progress bar
            const pct = miniProgress ? miniProgress.style.width : '0%';
            progressFill.style.width = pct;
            if (!_isSeeking) seekSlider.value = parseFloat(pct) || 0;
            // Play/Pause icon
            const miniIcon = miniPlayPause?.querySelector('i');
            const expIcon  = playPauseBtn?.querySelector('i');
            if (miniIcon && expIcon && miniIcon.className !== expIcon.className) {
                expIcon.className = miniIcon.className;
            }
            // Like
            const miniLikeIcon = miniLike?.querySelector('i');
            const expLikeIcon  = likeBtn?.querySelector('i');
            if (miniLikeIcon && expLikeIcon) {
                expLikeIcon.className = miniLikeIcon.className;
                likeBtn.classList.toggle('liked', miniLike?.classList.contains('liked'));
            }
        }, 500);
    }

    function stopLiveSync() {
        clearInterval(syncInterval);
        syncInterval = null;
    }

    // ── Seek slider (expanded) ────────────────────────────────────────────
    let _isSeeking = false;
    seekSlider.addEventListener('input', () => {
        _isSeeking = true;
        progressFill.style.width = seekSlider.value + '%';
    });
    seekSlider.addEventListener('change', () => {
        // Mirror seek to mini player
        if (miniSeek) {
            miniSeek.value = seekSlider.value;
            miniSeek.dispatchEvent(new Event('change', { bubbles: true }));
        }
        _isSeeking = false;
    });

    // ── Volume (expanded) → mirror to mini ───────────────────────────────
    volumeSlider.addEventListener('input', () => {
        if (miniVolume) {
            miniVolume.value = volumeSlider.value;
            miniVolume.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // ── Control buttons — delegate to mini player buttons ─────────────────
    playPauseBtn?.addEventListener('click', () => miniPlayPause?.click());
    prevBtn?.addEventListener('click',      () => document.getElementById('prevBtn')?.click());
    nextBtn?.addEventListener('click',      () => document.getElementById('nextBtn')?.click());
    shuffleBtn?.addEventListener('click',   () => {
        miniShuffle?.click();
        setTimeout(() => shuffleBtn.classList.toggle('active', miniShuffle?.classList.contains('active')), 50);
    });
    repeatBtn?.addEventListener('click',    () => {
        miniRepeat?.click();
        setTimeout(() => repeatBtn.classList.toggle('active', miniRepeat?.classList.contains('active')), 50);
    });
    likeBtn?.addEventListener('click',      () => miniLike?.click());
    queueBtnExp?.addEventListener('click',  () => { closeExpanded(); setTimeout(() => miniQueue?.click(), 300); });
    devicesBtnExp?.addEventListener('click',() => { closeExpanded(); setTimeout(() => miniDevices?.click(), 300); });
    shareBtnExp?.addEventListener('click',  () => {
        closeExpanded();
        setTimeout(() => {
            const shareBtn = document.getElementById('sharePlaylistBtn') || document.getElementById('shareLikedBtn');
            shareBtn?.click();
        }, 300);
    });

    // ── Open on mini player track-info click ──────────────────────────────
    miniTrackInfo?.addEventListener('click', (e) => {
        // Don't open if clicking like/radio buttons inside track-info
        if (e.target.closest('.like-btn, .radio-btn')) return;
        // Only open if a song is actually loaded
        if (miniImg?.classList.contains('hidden')) return;
        openExpanded();
        startLiveSync();
    });

    // ── Close button ──────────────────────────────────────────────────────
    closeBtn?.addEventListener('click', () => {
        closeExpanded();
        stopLiveSync();
    });

    // ── Keyboard: Escape to close ─────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeExpanded();
            stopLiveSync();
        }
    });

    // ── Touch swipe-down to close ─────────────────────────────────────────
    let touchStartY = 0;
    let touchCurrentY = 0;

    expandedEl.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    expandedEl.addEventListener('touchmove', (e) => {
        touchCurrentY = e.touches[0].clientY;
        const delta = touchCurrentY - touchStartY;
        if (delta > 0) {
            expandedEl.classList.add('swiping');
            expandedEl.style.transform = `translateY(${delta}px)`;
        }
    }, { passive: true });

    expandedEl.addEventListener('touchend', () => {
        const delta = touchCurrentY - touchStartY;
        expandedEl.classList.remove('swiping');
        expandedEl.style.transform = '';
        if (delta > 120) {
            // Swiped down enough — close
            closeExpanded();
            stopLiveSync();
        }
        touchStartY = 0;
        touchCurrentY = 0;
    });

    // ── Sync when song changes (player fires custom event) ────────────────
    window.addEventListener('playerSongChanged', () => {
        if (isOpen) {
            setTimeout(syncState, 100); // small delay so DOM updates first
        }
    });

    // Also watch for playerImage src changes
    const imgObserver = new MutationObserver(() => {
        if (isOpen && miniImg?.src) {
            artEl.src = miniImg.src;
            updateBgColor(miniImg.src);
        }
    });
    if (miniImg) {
        imgObserver.observe(miniImg, { attributes: true, attributeFilter: ['src', 'class'] });
    }

    // ── Watch for song title/artist changes ───────────────────────────────
    const titleObserver = new MutationObserver(() => {
        if (isOpen) {
            titleEl.textContent  = document.getElementById('playerTitle')?.textContent  || '';
            artistEl.textContent = document.getElementById('playerArtist')?.textContent || '';
        }
    });
    const playerTitleEl = document.getElementById('playerTitle');
    if (playerTitleEl) titleObserver.observe(playerTitleEl, { childList: true, characterData: true, subtree: true });

})();

