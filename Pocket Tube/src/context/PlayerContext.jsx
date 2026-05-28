import React, { createContext, useState, useEffect, useRef } from 'react';

export const PlayerContext = createContext();

export const PlayerProvider = ({ children }) => {
  const [activeTab, setActiveTab] = useState('youtube');
  const [currentMedia, setCurrentMedia] = useState(null); // { id, title, uploader, thumbnail, isAudioOnly, duration }
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => {
    const saved = localStorage.getItem('pt_search_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [downloadHistory, setDownloadHistory] = useState(() => {
    const saved = localStorage.getItem('pt_download_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [ytApiKey, setYtApiKey] = useState(() => {
    return localStorage.getItem('pt_yt_api_key') || '';
  });
  const [themeGlow, setThemeGlow] = useState('all');
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('pt_theme_mode') || 'ambient';
  });
  const [fontFamily, setFontFamily] = useState(() => {
    return localStorage.getItem('pt_font_family') || 'sans';
  });
  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('pt_font_size') || 'normal';
  });

  const audioRef = useRef(null);

  // Apply theme class to documentElement
  useEffect(() => {
    localStorage.setItem('pt_theme_mode', themeMode);
    document.documentElement.classList.remove('theme-ambient', 'theme-amoled', 'theme-cyberpunk', 'theme-light');
    document.documentElement.classList.add(`theme-${themeMode}`);
  }, [themeMode]);

  // Apply font family class to documentElement
  useEffect(() => {
    localStorage.setItem('pt_font_family', fontFamily);
    document.documentElement.classList.remove('font-sans-mode', 'font-outfit-mode', 'font-serif-mode', 'font-mono-mode');
    document.documentElement.classList.add(`font-${fontFamily}-mode`);
  }, [fontFamily]);

  // Apply font size style to HTML root
  useEffect(() => {
    localStorage.setItem('pt_font_size', fontSize);
    const sizeMap = {
      compact: '14px',
      normal: '16px',
      large: '18px',
      xl: '20px'
    };
    document.documentElement.style.fontSize = sizeMap[fontSize] || '16px';
  }, [fontSize]);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('pt_search_history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    localStorage.setItem('pt_download_history', JSON.stringify(downloadHistory));
  }, [downloadHistory]);

  useEffect(() => {
    if (ytApiKey) {
      localStorage.setItem('pt_yt_api_key', ytApiKey);
    } else {
      localStorage.removeItem('pt_yt_api_key');
    }
  }, [ytApiKey]);

  // Sync tab with base theme glow
  useEffect(() => {
    if (activeTab === 'youtube') {
      setThemeGlow('all');
    } else {
      setThemeGlow(activeTab);
    }
  }, [activeTab]);

  // Audio setup and Media Session API Integration
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Update audio volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Handle media session metadata update
  useEffect(() => {
    if (currentMedia && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentMedia.title,
        artist: currentMedia.uploader || 'Pocket Tube',
        album: 'Pocket Tube Downloader',
        artwork: [
          { src: currentMedia.thumbnail, sizes: '512x512', type: 'image/png' }
        ]
      });

      // Media Session Action Handlers for Background Controls
      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const offset = details.seekOffset || 10;
        seek(Math.max(audioRef.current.currentTime - offset, 0));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const offset = details.seekOffset || 10;
        seek(Math.min(audioRef.current.currentTime + offset, audioRef.current.duration));
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          seek(details.seekTime);
        }
      });
    }
  }, [currentMedia]);

  // Play audio
  const play = async () => {
    if (audioRef.current && audioRef.current.src) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Audio play failed:', err);
      }
    }
  };

  // Pause audio
  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Seek audio
  const seek = (time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Load track and start background play
  const loadBackgroundAudio = async (mediaItem) => {
    setIsLoadingAudio(true);
    setCurrentMedia(mediaItem);
    setIsPlaying(false);

    try {
      // Fetch the direct, seekable Google Video audio stream URL from our backend
      const response = await fetch(`http://localhost:5000/api/youtube/audio-url?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${mediaItem.id}`)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch audio stream URL from backend');
      }
      const data = await response.json();
      if (!data.audioUrl) {
        throw new Error('No audio stream URL returned');
      }
      
      if (audioRef.current) {
        audioRef.current.src = data.audioUrl;
        audioRef.current.load();
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Failed to load background audio stream:', error);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const addToSearchHistory = (query) => {
    if (!query.trim()) return;
    setSearchHistory(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered].slice(0, 20); // Keep last 20
    });
  };

  const addToDownloadHistory = (item) => {
    setDownloadHistory(prev => {
      const filtered = prev.filter(x => x.url !== item.url);
      return [{ ...item, timestamp: new Date().toISOString() }, ...filtered].slice(0, 30);
    });
  };

  return (
    <PlayerContext.Provider value={{
      activeTab,
      setActiveTab,
      currentMedia,
      setCurrentMedia,
      isPlaying,
      setIsPlaying,
      volume,
      setVolume,
      currentTime,
      duration,
      play,
      pause,
      seek,
      loadBackgroundAudio,
      isLoadingAudio,
      searchHistory,
      addToSearchHistory,
      downloadHistory,
      addToDownloadHistory,
      ytApiKey,
      setYtApiKey,
      themeGlow,
      setThemeGlow,
      themeMode,
      setThemeMode,
      fontFamily,
      setFontFamily,
      fontSize,
      setFontSize
    }}>
      {children}
    </PlayerContext.Provider>
  );
};
