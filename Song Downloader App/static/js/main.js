// State variables
let activeTab = 'search-tab';
let searchResults = [];
let selectedSongs = new Set();
let activeProvider = 'combined';
let queuePollInterval = null;
let currentConfig = {};
let isResolving = false;
let resolvedBannerData = null;
let currentPage = 1;
let currentQuery = '';
let isLoadingMore = false;
let audioPlayer = null;
let libraryFiles = [];      // All library files from /api/library
let libraryFilterText = ''; // Active filter string

// Video Downloader State
let videoSearchResults = [];

// Facebook & Instagram Downloader State
let fbSearchResults = [];
let igSearchResults = [];

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchBtnText = document.getElementById('search-btn-text');
const providerBtns = document.querySelectorAll('.provider-btn');
const tracksList = document.getElementById('tracks-list');
const bulkHeader = document.getElementById('bulk-header');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const selectionCountText = document.getElementById('selection-count-text');
const downloadSelectedBtn = document.getElementById('download-selected-btn');
const importedBanner = document.getElementById('imported-banner');
const bannerCoverImg = document.getElementById('banner-cover-img');
const bannerTypeBadge = document.getElementById('banner-type-badge');
const bannerTitle = document.getElementById('banner-title');
const bannerCount = document.getElementById('banner-count');
const closeBannerBtn = document.getElementById('close-banner-btn');

// Video Tab Elements
const videoSearchInput = document.getElementById('video-search-input');
const videoSearchBtn = document.getElementById('video-search-btn');
const videoSearchBtnText = document.getElementById('video-search-btn-text');
const videoResultsList = document.getElementById('video-results-list');
const videoImportedBanner = document.getElementById('video-imported-banner');
const videoBannerCoverImg = document.getElementById('video-banner-cover-img');
const videoBannerTitle = document.getElementById('video-banner-title');
const videoBannerChannel = document.getElementById('video-banner-channel');
const videoCloseBannerBtn = document.getElementById('video-close-banner-btn');

// Facebook Tab Elements
const fbSearchInput = document.getElementById('fb-search-input');
const fbSearchBtn = document.getElementById('fb-search-btn');
const fbSearchBtnText = document.getElementById('fb-search-btn-text');
const fbResultsList = document.getElementById('fb-results-list');
const fbImportedBanner = document.getElementById('fb-imported-banner');
const fbBannerCoverImg = document.getElementById('fb-banner-cover-img');
const fbBannerTitle = document.getElementById('fb-banner-title');
const fbBannerUploader = document.getElementById('fb-banner-uploader');
const fbCloseBannerBtn = document.getElementById('fb-close-banner-btn');

// Instagram Tab Elements
const igSearchInput = document.getElementById('ig-search-input');
const igSearchBtn = document.getElementById('ig-search-btn');
const igSearchBtnText = document.getElementById('ig-search-btn-text');
const igResultsList = document.getElementById('ig-results-list');
const igImportedBanner = document.getElementById('ig-imported-banner');
const igBannerCoverImg = document.getElementById('ig-banner-cover-img');
const igBannerTitle = document.getElementById('ig-banner-title');
const igBannerUploader = document.getElementById('ig-banner-uploader');
const igCloseBannerBtn = document.getElementById('ig-close-banner-btn');

// Video Player Modal Elements
const videoPlayerModal = document.getElementById('video-player-modal');
const appVideoPlayer = document.getElementById('app-video-player');
const videoModalTitle = document.getElementById('video-modal-title');
const videoModalCloseBtn = document.getElementById('video-modal-close-btn');

// Queue Elements
const queueList = document.getElementById('queue-list');
const statTotal = document.getElementById('stat-total');
const statDownloading = document.getElementById('stat-downloading');
const statCompleted = document.getElementById('stat-completed');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const queueBadge = document.getElementById('queue-badge');

// Settings Elements
const folderPathInput = document.getElementById('setting-folder-path');
const changeFolderBtn = document.getElementById('change-folder-btn');
const miniDirVal = document.getElementById('mini-dir-val');
const concurrencySelect = document.getElementById('setting-concurrency');

// Library Elements
const libraryGrid   = document.getElementById('library-grid');
const libraryStats  = document.getElementById('library-stats');
const libraryFilter = document.getElementById('library-filter');
const libraryBadge  = document.getElementById('library-badge');

// Toast notifications helper
function showToast(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `notification ${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'danger') iconClass = 'fa-triangle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} notification-icon"></i>
        <div class="notification-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove toast after 4s
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

// Tab switcher logic
document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.getAttribute('data-tab');
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById(targetTab).classList.add('active');
        activeTab = targetTab;
        // Auto-load library when switching to it
        if (targetTab === 'library-tab') loadLibrary();
        
        // Auto-load trending music feed if switching to video downloader tab
        if (targetTab === 'video-tab' && videoSearchResults.length === 0) {
            const activeChip = document.querySelector('.video-tag-chip.active');
            if (activeChip) {
                videoSearchInput.value = activeChip.getAttribute('data-tag');
                handleVideoSearch();
            }
        }
    });
});

// Load config from Flask API on startup
async function loadAppConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        currentConfig = data;
        
        // Update UI
        folderPathInput.value = data.download_dir || 'Not configured';
        miniDirVal.textContent = data.download_dir ? getBasename(data.download_dir) : 'Not Selected';
        concurrencySelect.value = data.max_workers || 3;
        
        if (data.provider) {
            activeProvider = data.provider;
            updateProviderUI();
        }
    } catch (error) {
        showToast('Failed to load configuration.', 'danger');
    }
}

// Helper to get directory basename for sidebar preview
function getBasename(pathStr) {
    // Handles both Windows and Unix paths
    const parts = pathStr.split(/[\\/]/);
    return parts.filter(p => p).pop() || pathStr;
}

// Save parameters changes
async function updateConfigParam(params) {
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        const data = await response.json();
        if (data.status === 'success') {
            currentConfig = data.config;
            showToast('Settings saved successfully.', 'success');
        }
    } catch (error) {
        showToast('Failed to save settings.', 'danger');
    }
}

concurrencySelect.addEventListener('change', (e) => {
    updateConfigParam({ max_workers: parseInt(e.target.value) });
});

// Folder selector triggers tkinter dialog in backend
changeFolderBtn.addEventListener('click', async () => {
    showToast('Please look at your host taskbar to select a folder.', 'info');
    try {
        const response = await fetch('/api/select-folder', { method: 'POST' });
        const data = await response.json();
        if (data.status === 'success') {
            folderPathInput.value = data.download_dir;
            miniDirVal.textContent = getBasename(data.download_dir);
            showToast(`Download folder updated: ${getBasename(data.download_dir)}`, 'success');
        } else if (data.status === 'cancelled') {
            showToast('Folder selection cancelled.', 'info');
        }
    } catch (error) {
        showToast('Error changing download folder.', 'danger');
    }
});

// Update selected provider UI
function updateProviderUI() {
    providerBtns.forEach(btn => {
        if (btn.getAttribute('data-provider') === activeProvider) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Click on provider buttons
providerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        activeProvider = btn.getAttribute('data-provider');
        updateProviderUI();
        // Persist provider
        updateConfigParam({ provider: activeProvider });
    });
});

// Main Search & Link resolver router
async function handleSearch(loadMore = false) {
    const rawQuery = searchInput.value.trim();
    if (!rawQuery) {
        showToast('Search query or link cannot be empty.', 'warning');
        return;
    }

    if (!loadMore) {
        // Reset pagination on fresh search
        currentPage = 1;
        currentQuery = rawQuery;
        searchResults = [];
        selectedSongs.clear();
        tracksList.innerHTML = '<div class="spinner"></div>';
        bulkHeader.style.display = 'none';
        importedBanner.style.display = 'none';
    } else {
        currentPage++;
        isLoadingMore = true;
    }

    const isUrl = rawQuery.startsWith('http://') || rawQuery.startsWith('https://');

    isResolving = true;
    searchBtn.disabled = true;
    searchBtnText.textContent = isUrl ? 'Resolving...' : (loadMore ? 'Loading...' : 'Searching...');

    try {
        if (isUrl && !loadMore) {
            const response = await fetch('/api/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: rawQuery })
            });
            const data = await response.json();
            if (response.ok) {
                searchResults = data.songs;
                if (data.type === 'album' || data.type === 'playlist') {
                    bannerTitle.textContent = data.title || 'Imported List';
                    bannerCount.textContent = `${data.songs.length} song(s) resolved`;
                    bannerTypeBadge.textContent = data.type;
                    if (data.songs.length > 0 && data.songs[0].cover) {
                        bannerCoverImg.src = data.songs[0].cover;
                    }
                    importedBanner.style.display = 'flex';
                }
                renderSearchResults();
                showToast(`Resolved ${data.songs.length} songs from link!`, 'success');
            } else {
                throw new Error(data.error || 'Failed to resolve URL');
            }
        } else {
            // Standard keyword search (paginated)
            const url = `/api/search?query=${encodeURIComponent(currentQuery)}&provider=${activeProvider}&page=${currentPage}&limit=50`;
            const response = await fetch(url);
            const data = await response.json();
            if (response.ok) {
                const newResults = data.results || [];
                if (loadMore) {
                    searchResults = [...searchResults, ...newResults];
                } else {
                    searchResults = newResults;
                }
                renderSearchResults(loadMore);
                if (searchResults.length === 0) {
                    showToast('No tracks found matching your query.', 'info');
                } else if (loadMore) {
                    showToast(`Loaded ${newResults.length} more tracks!`, 'success');
                }
            } else {
                throw new Error(data.error || 'Search request failed');
            }
        }
    } catch (error) {
        showToast(error.message, 'danger');
        if (!loadMore) {
            tracksList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-circle-exclamation empty-icon text-danger"></i>
                    <h3>Search Failed</h3>
                    <p>${error.message}</p>
                </div>`;
        }
    } finally {
        isResolving = false;
        isLoadingMore = false;
        searchBtn.disabled = false;
        searchBtnText.textContent = 'Search';
    }
}


searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSearch();
});

// Render Search/Resolved song lists
function renderSearchResults(append = false) {
    if (searchResults.length === 0) {
        tracksList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-compact-disc empty-icon"></i>
                <h3>No Tracks Found</h3>
                <p>Try refining your search terms or double check the link format.</p>
            </div>`;
        bulkHeader.style.display = 'none';
        return;
    }

    if (!append) {
        tracksList.innerHTML = '';
    } else {
        // Remove existing load-more button before appending
        const oldBtn = document.getElementById('load-more-btn');
        if (oldBtn) oldBtn.remove();
    }

    // Show bulk header
    bulkHeader.style.display = 'flex';
    if (!append) {
        selectAllCheckbox.checked = false;
        updateSelectionUI();
    }

    // Determine start index for appended results
    const startIdx = append ? searchResults.length - (searchResults.length % 50 === 0 ? 50 : searchResults.length % 100) : 0;

    searchResults.forEach((song, index) => {
        if (append && index < startIdx) return; // skip already-rendered
        const row = document.createElement('div');
        row.className = 'track-row';
        row.setAttribute('data-id', song.id);
        row.innerHTML = `
            <label class="custom-checkbox">
                <input type="checkbox" class="track-checkbox" data-index="${index}">
                <span class="checkmark"></span>
            </label>
            <div class="track-cover-art">
                <img src="${song.cover || 'https://via.placeholder.com/150'}" alt="Cover" onerror="this.src='https://via.placeholder.com/150'">
            </div>
            <div class="track-details">
                <div class="track-title">${song.title}</div>
                <div class="track-artist">${song.artist}</div>
            </div>
            <div class="track-album">${song.album}</div>
            <span class="track-badge ${song.provider === 'jiosaavn' ? 'saavn' : 'yt'}">
                ${song.provider === 'jiosaavn' ? 'Saavn' : 'YT Music'}
            </span>
            <div class="track-action">
                <button class="preview-single-btn" title="Play preview">
                    <i class="fa-solid fa-circle-play"></i>
                </button>
                <button class="download-single-btn" title="Download song now">
                    <i class="fa-solid fa-download"></i>
                </button>
            </div>`;

        const checkbox = row.querySelector('.track-checkbox');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedSongs.add(song);
                row.classList.add('selected');
            } else {
                selectedSongs.forEach(s => { if (s.id === song.id) selectedSongs.delete(s); });
                row.classList.remove('selected');
            }
            updateSelectionUI();
        });
        row.querySelector('.download-single-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            triggerBatchDownload([song]);
        });
        row.querySelector('.preview-single-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            icon.className = 'fa-solid fa-spinner fa-spin';
            try {
                const encParam = song.download_info ? `&enc=${encodeURIComponent(song.download_info)}` : '';
                const res = await fetch(`/api/preview?provider=${song.provider}&id=${encodeURIComponent(song.id)}${encParam}`);
                const data = await res.json();
                if (data.url) {
                    playAudio(data.url, song.title, song.artist, song.cover);
                } else {
                    showToast(data.error || 'Preview not available', 'warning');
                }
            } catch (err) {
                showToast('Preview failed: ' + err.message, 'danger');
            } finally {
                icon.className = 'fa-solid fa-circle-play';
            }
        });
        tracksList.appendChild(row);
    });

    // Add Load More button (only for keyword searches, not URL resolves)
    const isUrl = searchInput.value.trim().startsWith('http');
    if (!isUrl) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.id = 'load-more-btn';
        loadMoreBtn.className = 'load-more-container';
        loadMoreBtn.innerHTML = `
            <button class="load-more-btn" id="load-more-action-btn">
                <i class="fa-solid fa-angles-down"></i>
                Load More Songs
                <span class="result-count-badge">${searchResults.length} loaded</span>
            </button>`;
        loadMoreBtn.querySelector('#load-more-action-btn').addEventListener('click', () => {
            handleSearch(true);
        });
        tracksList.appendChild(loadMoreBtn);
    }

    updateSelectionUI();
}


// Close Resolved Banner
closeBannerBtn.addEventListener('click', () => {
    importedBanner.style.display = 'none';
});

// Sample URL link solver
document.querySelectorAll('.sample-url-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        searchInput.value = link.textContent;
        handleSearch();
    });
});

// Update bulk selector UI stats
function updateSelectionUI() {
    const totalCount = searchResults.length;
    const selectedCount = selectedSongs.size;
    
    selectionCountText.textContent = `${selectedCount} of ${totalCount} selected`;
    
    // Sync Select All checkbox
    selectAllCheckbox.checked = (selectedCount === totalCount && totalCount > 0);
}

// Select All action
selectAllCheckbox.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll('.track-checkbox');
    const checked = selectAllCheckbox.checked;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
        const index = parseInt(checkbox.getAttribute('data-index'));
        const song = searchResults[index];
        const row = checkbox.closest('.track-row');
        
        if (checked) {
            selectedSongs.add(song);
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    });
    
    if (!checked) {
        selectedSongs.clear();
    }
    
    updateSelectionUI();
});

// Trigger download for arrays
async function triggerBatchDownload(songsList) {
    if (!currentConfig.download_dir) {
        showToast('Please set your download folder in the Settings tab first.', 'danger');
        return;
    }
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songs: songsList })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            showToast(`Added ${data.added} track(s) to download queue!`, 'success');
            
            // Switch tab to queue monitor
            document.getElementById('nav-queue').click();
            pollQueueStatus();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        showToast(`Failed to start download: ${error.message}`, 'danger');
    }
}

downloadSelectedBtn.addEventListener('click', () => {
    if (selectedSongs.size === 0) {
        showToast('Please select at least one song to download.', 'warning');
        return;
    }
    triggerBatchDownload(Array.from(selectedSongs));
});

// --- Queue Monitor Polling ---

async function pollQueueStatus() {
    try {
        const response = await fetch('/api/queue-status');
        const data = await response.json();
        renderQueueList(data.queue);
    } catch (error) {
        console.error('Error polling queue status:', error);
    }
}

function renderQueueList(queueItems) {
    let total = queueItems.length;
    let downloading = 0;
    let completed = 0;
    let pendingOrActiveCount = 0;
    
    if (total === 0) {
        queueList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-list-check empty-icon"></i>
                <h3>Queue is Empty</h3>
                <p>No active or past tasks in history. Search and add some songs!</p>
            </div>`;
        statTotal.textContent = '0';
        statDownloading.textContent = '0';
        statCompleted.textContent = '0';
        queueBadge.style.display = 'none';
        if (queuePollInterval) { clearInterval(queuePollInterval); queuePollInterval = null; }
        return;
    }
    
    statTotal.textContent = total;
    queueList.innerHTML = '';
    
    queueItems.forEach(item => {
        if (item.status === 'Downloading' || item.status === 'Tagging') { downloading++; pendingOrActiveCount++; }
        if (item.status === 'Pending') pendingOrActiveCount++;
        if (item.status === 'Completed') completed++;
        
        const row = document.createElement('div');
        row.className = 'queue-row';
        const progressClass = item.status === 'Completed' ? 'completed' : (item.status === 'Failed' ? 'failed' : '');
        const indicatorClass = item.status.toLowerCase();

        // Play button — only visible when download is done and file is known
        const playBtnHTML = (item.status === 'Completed' && item.filename)
            ? `<button class="queue-play-btn" title="Play in browser" data-file="${item.filename}">
                    <i class="fa-solid fa-circle-play"></i>
               </button>`
            : '';

        row.innerHTML = `
            <div class="queue-row-top">
                <div class="queue-cover">
                    <img src="${item.cover_url || 'https://via.placeholder.com/100'}" alt="Cover" onerror="this.src='https://via.placeholder.com/100'">
                </div>
                <div class="queue-meta">
                    <div class="queue-title">${item.title}</div>
                    <div class="queue-artist">${item.artist} | ${item.album}</div>
                </div>
                <div class="queue-status-block">
                    <span class="queue-speed-text">${item.speed || ''}</span>
                    <span class="queue-status-text">${item.status}</span>
                    <div class="status-indicator ${indicatorClass}"></div>
                </div>
                ${playBtnHTML}
            </div>
            <div class="queue-progress-bar-wrapper">
                <div class="queue-progress-fill ${progressClass}" style="width: ${item.progress}%"></div>
            </div>
            ${item.error ? `<div class="queue-error-message"><i class="fa-solid fa-circle-info"></i> ${item.error}</div>` : ''}`;

        // Attach play listener
        const playBtn = row.querySelector('.queue-play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                const isVideo = (item.filename && (item.filename.endsWith('.mp4') || item.filename.endsWith('.mkv'))) || item.provider === 'youtube_video';
                if (isVideo) {
                    playVideoModal(`/api/play?file=${encodeURIComponent(playBtn.dataset.file)}`, item.title);
                } else {
                    playAudio(`/api/play?file=${encodeURIComponent(playBtn.dataset.file)}`,
                              item.title, item.artist, item.cover_url);
                }
            });
        }

        queueList.appendChild(row);
    });
    
    statDownloading.textContent = downloading;
    statCompleted.textContent = completed;
    
    if (pendingOrActiveCount > 0) {
        queueBadge.textContent = pendingOrActiveCount;
        queueBadge.style.display = 'inline-block';
        if (!queuePollInterval) queuePollInterval = setInterval(pollQueueStatus, 1500);
    } else {
        queueBadge.style.display = 'none';
        if (queuePollInterval) {
            clearInterval(queuePollInterval);
            queuePollInterval = setInterval(pollQueueStatus, 5000);
        }
    }
}

// ── Floating Audio Player ─────────────────────────────────────────────────────
function playAudio(url, title, artist, coverUrl) {
    // Remove any existing player
    const existing = document.getElementById('floating-player');
    if (existing) existing.remove();

    const player = document.createElement('div');
    player.id = 'floating-player';
    player.innerHTML = `
        <div class="fp-cover">
            <img src="${coverUrl || 'https://via.placeholder.com/60'}" alt="cover"
                 onerror="this.src='https://via.placeholder.com/60'">
        </div>
        <div class="fp-meta">
            <div class="fp-title">${title}</div>
            <div class="fp-artist">${artist}</div>
        </div>
        <audio id="fp-audio" src="${url}" autoplay controls></audio>
        <button class="fp-close" id="fp-close-btn"><i class="fa-solid fa-xmark"></i></button>`;
    document.body.appendChild(player);

    document.getElementById('fp-close-btn').addEventListener('click', () => player.remove());

    // Animate in
    requestAnimationFrame(() => player.classList.add('fp-visible'));
}


// Queue Actions
clearCompletedBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/queue-clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'completed' })
        });
        const data = await response.json();
        renderQueueList(data.queue);
        showToast('Cleared completed download tasks from history.', 'success');
    } catch (error) {
        showToast('Failed to clear queue.', 'danger');
    }
});

clearAllBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/queue-clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'all' })
        });
        const data = await response.json();
        renderQueueList(data.queue);
        showToast('Cleared non-active download tasks from history.', 'success');
    } catch (error) {
        showToast('Failed to clear queue.', 'danger');
    }
});

// App initialization
window.addEventListener('DOMContentLoaded', () => {
    loadAppConfig();
    pollQueueStatus();
    queuePollInterval = setInterval(pollQueueStatus, 1500);
});

// ── Library: Load & Render ────────────────────────────────────────────────────
async function loadLibrary() {
    libraryGrid.innerHTML = '<div class="spinner" style="margin:60px auto;"></div>';
    libraryStats.textContent = 'Scanning library...';
    try {
        const res  = await fetch('/api/library');
        const data = await res.json();
        libraryFiles = data.files || [];

        // Update badge
        if (libraryFiles.length > 0) {
            libraryBadge.textContent = libraryFiles.length;
            libraryBadge.style.display = 'inline-block';
        } else {
            libraryBadge.style.display = 'none';
        }

        renderLibrary();
    } catch (err) {
        libraryGrid.innerHTML = `<div class="empty-state">
            <i class="fa-solid fa-circle-exclamation empty-icon text-danger"></i>
            <h3>Failed to load library</h3><p>${err.message}</p></div>`;
        libraryStats.textContent = 'Error';
    }
}

function renderLibrary() {
    const filterText = libraryFilterText.toLowerCase();
    const filtered = filterText
        ? libraryFiles.filter(f =>
            f.title.toLowerCase().includes(filterText) ||
            f.artist.toLowerCase().includes(filterText) ||
            f.album.toLowerCase().includes(filterText))
        : libraryFiles;

    libraryStats.textContent = `${filtered.length} of ${libraryFiles.length} item${libraryFiles.length !== 1 ? 's' : ''} in library`;

    if (filtered.length === 0) {
        libraryGrid.innerHTML = `<div class="empty-state">
            <i class="fa-solid fa-compact-disc empty-icon"></i>
            <h3>${libraryFiles.length === 0 ? 'Library is Empty' : 'No Matches'}</h3>
            <p>${libraryFiles.length === 0
                ? 'Download some songs or videos — they\'ll appear here with play buttons.'
                : 'Try a different search term.'}</p></div>`;
        return;
    }

    libraryGrid.innerHTML = '';
    filtered.forEach(file => {
        const card = document.createElement('div');
        card.className = `lib-card ${file.is_video ? 'video-card' : ''}`;
        
        const artPlaceholderIcon = file.is_video ? 'fa-video' : 'fa-music';
        const coverArtHTML = file.cover
            ? `<img src="${file.cover}" alt="cover" class="lib-cover-img" onerror="this.remove()">`
            : '';

        card.innerHTML = `
            <div class="lib-card-art">
                ${coverArtHTML}
                <div class="lib-art-placeholder"><i class="fa-solid ${artPlaceholderIcon}"></i></div>
                <button class="lib-play-btn" title="Play ${file.title}">
                    <i class="fa-solid fa-play"></i>
                </button>
                ${file.is_video ? `<span class="lib-video-watermark"><i class="fa-solid fa-video"></i></span>` : ''}
            </div>
            <div class="lib-card-info">
                <div class="lib-card-title" title="${file.title}">${file.title}</div>
                <div class="lib-card-artist">${file.artist}</div>
                <div class="lib-card-meta">
                    <span class="lib-ext-badge ${file.is_video ? 'video' : ''}">${file.ext.replace('.','').toUpperCase()}</span>
                    <span class="lib-size">${file.size_mb} MB</span>
                </div>
            </div>`;

        // Helper play logic
        const triggerPlay = () => {
            if (file.is_video) {
                playVideoModal(`/api/play?file=${encodeURIComponent(file.filename)}`, file.title);
            } else {
                playAudio(`/api/play?file=${encodeURIComponent(file.filename)}`,
                          file.title, file.artist, file.cover || '');
            }
        };

        card.querySelector('.lib-play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            triggerPlay();
        });
        
        // Click anywhere on card also plays
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.lib-play-btn')) {
                triggerPlay();
            }
        });

        libraryGrid.appendChild(card);
    });
}

// ── Video Downloader Logic ────────────────────────────────────────────────────
function formatDuration(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const pad = (n) => n.toString().padStart(2, '0');
    if (h > 0) {
        return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${m}:${pad(s)}`;
}

function playVideoModal(url, title) {
    // If audio is playing, pause it
    const fp = document.getElementById('floating-player');
    if (fp) {
        const audio = fp.querySelector('audio');
        if (audio) audio.pause();
    }
    
    videoModalTitle.textContent = title;
    appVideoPlayer.src = url;
    videoPlayerModal.style.display = 'flex';
    appVideoPlayer.play().catch(e => console.log("Video auto-play block:", e));
}

function closeVideoModal() {
    videoPlayerModal.style.display = 'none';
    appVideoPlayer.pause();
    appVideoPlayer.removeAttribute('src');
    appVideoPlayer.load();
}

async function handleVideoSearch() {
    const rawQuery = videoSearchInput.value.trim();
    if (!rawQuery) {
        showToast('Search query or link cannot be empty.', 'warning');
        return;
    }

    videoSearchResults = [];
    videoResultsList.innerHTML = '<div class="spinner" style="margin:40px auto;"></div>';
    videoImportedBanner.style.display = 'none';

    const isUrl = rawQuery.startsWith('http://') || rawQuery.startsWith('https://');
    videoSearchBtn.disabled = true;
    videoSearchBtnText.textContent = isUrl ? 'Resolving...' : 'Searching...';

    try {
        if (isUrl) {
            const response = await fetch('/api/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: rawQuery, is_video: true })
            });
            const data = await response.json();
            if (response.ok) {
                videoSearchResults = data.songs || [];
                if (data.type === 'album' || data.type === 'playlist') {
                    videoBannerTitle.textContent = data.title || 'Imported Playlist';
                    videoBannerChannel.textContent = `${data.songs.length} video(s) resolved`;
                    if (data.songs.length > 0 && data.songs[0].cover) {
                        videoBannerCoverImg.src = data.songs[0].cover;
                    }
                    videoImportedBanner.style.display = 'flex';
                }
                renderVideoSearchResults();
                showToast(`Resolved ${videoSearchResults.length} video(s) from link!`, 'success');
            } else {
                throw new Error(data.error || 'Failed to resolve URL');
            }
        } else {
            const url = `/api/search?provider=youtube_video&query=${encodeURIComponent(rawQuery)}&limit=50`;
            const response = await fetch(url);
            const data = await response.json();
            if (response.ok) {
                videoSearchResults = data.results || [];
                renderVideoSearchResults();
                if (videoSearchResults.length === 0) {
                    showToast('No videos found matching your query.', 'info');
                }
            } else {
                throw new Error(data.error || 'Search request failed');
            }
        }
    } catch (error) {
        showToast(error.message, 'danger');
        videoResultsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-circle-exclamation empty-icon text-danger"></i>
                <h3>Search Failed</h3>
                <p>${error.message}</p>
            </div>`;
    } finally {
        videoSearchBtn.disabled = false;
        videoSearchBtnText.textContent = 'Search';
    }
}

function renderVideoSearchResults() {
    if (videoSearchResults.length === 0) {
        videoResultsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-film empty-icon"></i>
                <h3>No Videos Found</h3>
                <p>Try refining your search terms or check the URL.</p>
            </div>`;
        return;
    }

    videoResultsList.innerHTML = '';

    videoSearchResults.forEach((song) => {
        const row = document.createElement('div');
        row.className = 'track-row video-row';
        row.setAttribute('data-id', song.id);
        row.innerHTML = `
            <div class="track-cover-art video-thumbnail">
                <img src="${song.cover || 'https://via.placeholder.com/150'}" alt="Cover" onerror="this.src='https://via.placeholder.com/150'">
                <span class="video-duration-badge">${formatDuration(song.duration)}</span>
            </div>
            <div class="track-details">
                <div class="track-title" title="${song.title}">${song.title}</div>
                <div class="track-artist">${song.artist}</div>
            </div>
            
            <div class="video-resolution-box">
                <select class="video-res-select">
                    <option value="4k">4K (2160p)</option>
                    <option value="1080p">1080p</option>
                    <option value="720p" selected>720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                </select>
            </div>

            <span class="track-badge yt-video-badge">
                <i class="fa-brands fa-youtube"></i> Video
            </span>

            <div class="track-action">
                <button class="preview-video-btn" title="Play preview">
                    <i class="fa-solid fa-circle-play"></i>
                </button>
                <button class="download-video-btn" title="Download video now">
                    <i class="fa-solid fa-download"></i>
                </button>
            </div>`;

        // Download handler
        row.querySelector('.download-video-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const resSelect = row.querySelector('.video-res-select');
            const selectedRes = resSelect.value;
            const songToDownload = { ...song, resolution: selectedRes };
            triggerBatchDownload([songToDownload]);
        });

        // Preview handler
        row.querySelector('.preview-video-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            icon.className = 'fa-solid fa-spinner fa-spin';
            try {
                const res = await fetch(`/api/preview?provider=youtube_video&id=${encodeURIComponent(song.id)}`);
                const data = await res.json();
                if (data.url) {
                    playVideoModal(data.url, song.title);
                } else {
                    showToast(data.error || 'Preview not available', 'warning');
                }
            } catch (err) {
                showToast('Preview failed: ' + err.message, 'danger');
            } finally {
                icon.className = 'fa-solid fa-circle-play';
            }
        });

        videoResultsList.appendChild(row);
    });
}

// ── Facebook Downloader Logic ──────────────────────────────────────────────────
async function handleFacebookResolve() {
    const rawUrl = fbSearchInput.value.trim();
    if (!rawUrl) {
        showToast('Facebook URL cannot be empty.', 'warning');
        return;
    }
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        showToast('Please enter a valid HTTP/HTTPS URL.', 'warning');
        return;
    }

    fbSearchResults = [];
    fbResultsList.innerHTML = '<div class="spinner" style="margin:40px auto;"></div>';
    fbImportedBanner.style.display = 'none';

    fbSearchBtn.disabled = true;
    fbSearchBtnText.textContent = 'Resolving...';

    try {
        const response = await fetch('/api/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: rawUrl })
        });
        const data = await response.json();
        if (response.ok) {
            fbSearchResults = data.songs || [];
            
            if (fbSearchResults.length > 0) {
                const song = fbSearchResults[0];
                fbBannerTitle.textContent = song.title || 'Facebook Video';
                fbBannerUploader.textContent = `Uploader: ${song.artist || 'Unknown'}`;
                if (song.cover) {
                    fbBannerCoverImg.src = song.cover;
                } else {
                    fbBannerCoverImg.src = 'https://via.placeholder.com/150';
                }
                fbImportedBanner.style.display = 'flex';
            }
            
            renderFacebookResults();
            showToast(`Resolved Facebook video successfully!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to resolve URL');
        }
    } catch (error) {
        showToast(error.message, 'danger');
        fbResultsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-circle-exclamation empty-icon text-danger"></i>
                <h3>Resolution Failed</h3>
                <p>${error.message}</p>
            </div>`;
    } finally {
        fbSearchBtn.disabled = false;
        fbSearchBtnText.textContent = 'Resolve';
    }
}

function renderFacebookResults() {
    if (fbSearchResults.length === 0) {
        fbResultsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-brands fa-facebook empty-icon" style="color: #1877f2;"></i>
                <h3>No Content Found</h3>
                <p>Paste a valid Facebook video/reel URL to resolve.</p>
            </div>`;
        return;
    }

    fbResultsList.innerHTML = '';

    fbSearchResults.forEach((song) => {
        const row = document.createElement('div');
        row.className = 'track-row video-row';
        row.setAttribute('data-id', song.id);
        
        const durationText = song.duration ? formatDuration(song.duration) : 'Video';
        
        row.innerHTML = `
            <div class="track-cover-art video-thumbnail">
                <img src="${song.cover || 'https://via.placeholder.com/150'}" alt="Cover" onerror="this.src='https://via.placeholder.com/150'">
                <span class="video-duration-badge">${durationText}</span>
            </div>
            <div class="track-details">
                <div class="track-title" title="${song.title}">${song.title}</div>
                <div class="track-artist">${song.artist}</div>
            </div>
            
            <div class="video-resolution-box">
                <select class="video-res-select">
                    <option value="4k">4K (2160p)</option>
                    <option value="1080p">1080p</option>
                    <option value="720p" selected>720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                </select>
            </div>

            <span class="track-badge fb-video-badge-tag" style="background-color: rgba(24, 119, 242, 0.15); color: #1877f2; border: 1px solid rgba(24, 119, 242, 0.3); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-brands fa-facebook"></i> Facebook
            </span>

            <div class="track-action">
                <button class="preview-video-btn" title="Play preview">
                    <i class="fa-solid fa-circle-play"></i>
                </button>
                <button class="download-video-btn" title="Download video now">
                    <i class="fa-solid fa-download"></i>
                </button>
            </div>`;

        // Download handler
        row.querySelector('.download-video-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const resSelect = row.querySelector('.video-res-select');
            const selectedRes = resSelect.value;
            const songToDownload = { ...song, resolution: selectedRes };
            triggerBatchDownload([songToDownload]);
        });

        // Preview handler
        row.querySelector('.preview-video-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            icon.className = 'fa-solid fa-spinner fa-spin';
            try {
                const res = await fetch(`/api/preview?provider=facebook&id=${encodeURIComponent(song.id)}`);
                const data = await res.json();
                if (data.url) {
                    playVideoModal(data.url, song.title);
                } else {
                    showToast(data.error || 'Preview not available', 'warning');
                }
            } catch (err) {
                showToast('Preview failed: ' + err.message, 'danger');
            } finally {
                icon.className = 'fa-solid fa-circle-play';
            }
        });

        fbResultsList.appendChild(row);
    });
}

// ── Instagram Downloader Logic ─────────────────────────────────────────────────
async function handleInstagramResolve() {
    const rawUrl = igSearchInput.value.trim();
    if (!rawUrl) {
        showToast('Instagram URL cannot be empty.', 'warning');
        return;
    }
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        showToast('Please enter a valid HTTP/HTTPS URL.', 'warning');
        return;
    }

    igSearchResults = [];
    igResultsList.innerHTML = '<div class="spinner" style="margin:40px auto;"></div>';
    igImportedBanner.style.display = 'none';

    igSearchBtn.disabled = true;
    igSearchBtnText.textContent = 'Resolving...';

    try {
        const response = await fetch('/api/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: rawUrl })
        });
        const data = await response.json();
        if (response.ok) {
            igSearchResults = data.songs || [];
            
            if (igSearchResults.length > 0) {
                const song = igSearchResults[0];
                igBannerTitle.textContent = song.title || 'Instagram Post';
                igBannerUploader.textContent = `Uploader: ${song.artist || 'Unknown'}`;
                if (song.cover) {
                    igBannerCoverImg.src = song.cover;
                } else {
                    igBannerCoverImg.src = 'https://via.placeholder.com/150';
                }
                igImportedBanner.style.display = 'flex';
            }
            
            renderInstagramResults();
            showToast(`Resolved Instagram post successfully!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to resolve URL');
        }
    } catch (error) {
        showToast(error.message, 'danger');
        igResultsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-circle-exclamation empty-icon text-danger"></i>
                <h3>Resolution Failed</h3>
                <p>${error.message}</p>
            </div>`;
    } finally {
        igSearchBtn.disabled = false;
        igSearchBtnText.textContent = 'Resolve';
    }
}

function renderInstagramResults() {
    if (igSearchResults.length === 0) {
        igResultsList.innerHTML = `
            <div class="empty-state">
                <i class="fa-brands fa-instagram empty-icon" style="background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;"></i>
                <h3>No Content Found</h3>
                <p>Paste a valid Instagram reel/post URL to resolve.</p>
            </div>`;
        return;
    }

    igResultsList.innerHTML = '';

    igSearchResults.forEach((song) => {
        const row = document.createElement('div');
        row.className = 'track-row video-row';
        row.setAttribute('data-id', song.id);
        
        const durationText = song.duration ? formatDuration(song.duration) : 'Video';
        
        row.innerHTML = `
            <div class="track-cover-art video-thumbnail">
                <img src="${song.cover || 'https://via.placeholder.com/150'}" alt="Cover" onerror="this.src='https://via.placeholder.com/150'">
                <span class="video-duration-badge">${durationText}</span>
            </div>
            <div class="track-details">
                <div class="track-title" title="${song.title}">${song.title}</div>
                <div class="track-artist">${song.artist}</div>
            </div>
            
            <div class="video-resolution-box">
                <select class="video-res-select">
                    <option value="4k">4K (2160p)</option>
                    <option value="1080p">1080p</option>
                    <option value="720p" selected>720p</option>
                    <option value="480p">480p</option>
                    <option value="360p">360p</option>
                </select>
            </div>

            <span class="track-badge ig-video-badge-tag" style="background: linear-gradient(45deg, rgba(240, 148, 51, 0.15) 0%, rgba(220, 39, 67, 0.15) 50%, rgba(188, 24, 136, 0.15) 100%); color: #e1306c; border: 1px solid rgba(225, 48, 108, 0.3); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-brands fa-instagram"></i> Instagram
            </span>

            <div class="track-action">
                <button class="preview-video-btn" title="Play preview">
                    <i class="fa-solid fa-circle-play"></i>
                </button>
                <button class="download-video-btn" title="Download video now">
                    <i class="fa-solid fa-download"></i>
                </button>
            </div>`;

        // Download handler
        row.querySelector('.download-video-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const resSelect = row.querySelector('.video-res-select');
            const selectedRes = resSelect.value;
            const songToDownload = { ...song, resolution: selectedRes };
            triggerBatchDownload([songToDownload]);
        });

        // Preview handler
        row.querySelector('.preview-video-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const icon = btn.querySelector('i');
            icon.className = 'fa-solid fa-spinner fa-spin';
            try {
                const res = await fetch(`/api/preview?provider=instagram&id=${encodeURIComponent(song.id)}`);
                const data = await res.json();
                if (data.url) {
                    playVideoModal(data.url, song.title);
                } else {
                    showToast(data.error || 'Preview not available', 'warning');
                }
            } catch (err) {
                showToast('Preview failed: ' + err.message, 'danger');
            } finally {
                icon.className = 'fa-solid fa-circle-play';
            }
        });

        igResultsList.appendChild(row);
    });
}

// ── Event Listeners ───────────────────────────────────────────────────────────
if (videoModalCloseBtn) {
    videoModalCloseBtn.addEventListener('click', closeVideoModal);
}
if (videoPlayerModal) {
    videoPlayerModal.addEventListener('click', (e) => {
        if (e.target === videoPlayerModal) {
            closeVideoModal();
        }
    });
}
if (videoSearchBtn) {
    videoSearchBtn.addEventListener('click', handleVideoSearch);
}
if (videoSearchInput) {
    videoSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleVideoSearch();
    });
}
if (videoCloseBannerBtn) {
    videoCloseBannerBtn.addEventListener('click', () => {
        videoImportedBanner.style.display = 'none';
    });
}
document.querySelectorAll('.video-sample-url-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        videoSearchInput.value = link.textContent;
        handleVideoSearch();
    });
});

// Category Chips click handler
document.querySelectorAll('.video-tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.video-tag-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        videoSearchInput.value = chip.getAttribute('data-tag');
        handleVideoSearch();
    });
});

// Live filter for library
if (libraryFilter) {
    libraryFilter.addEventListener('input', () => {
        libraryFilterText = libraryFilter.value;
        renderLibrary();
    });
}

// Refresh button
document.getElementById('refresh-library-btn')?.addEventListener('click', () => {
    libraryFilterText = '';
    if (libraryFilter) libraryFilter.value = '';
    loadLibrary();
    showToast('Library refreshed!', 'success');
});

// Facebook event listeners
if (fbSearchBtn) {
    fbSearchBtn.addEventListener('click', handleFacebookResolve);
}
if (fbSearchInput) {
    fbSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleFacebookResolve();
    });
}
if (fbCloseBannerBtn) {
    fbCloseBannerBtn.addEventListener('click', () => {
        fbImportedBanner.style.display = 'none';
    });
}
document.querySelectorAll('.fb-sample-url-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        fbSearchInput.value = link.textContent;
        handleFacebookResolve();
    });
});

// Instagram event listeners
if (igSearchBtn) {
    igSearchBtn.addEventListener('click', handleInstagramResolve);
}
if (igSearchInput) {
    igSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleInstagramResolve();
    });
}
if (igCloseBannerBtn) {
    igCloseBannerBtn.addEventListener('click', () => {
        igImportedBanner.style.display = 'none';
    });
}
document.querySelectorAll('.ig-sample-url-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        igSearchInput.value = link.textContent;
        handleInstagramResolve();
    });
});
