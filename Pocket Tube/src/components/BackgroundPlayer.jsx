import React, { useContext, useState } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { Play, Pause, Volume2, VolumeX, Loader2, X } from 'lucide-react';
import { formatDuration } from '../utils/helpers';

const BackgroundPlayer = ({ isEmbedded = false }) => {
  const {
    currentMedia,
    setCurrentMedia,
    isPlaying,
    volume,
    setVolume,
    currentTime,
    duration,
    play,
    pause,
    seek,
    isLoadingAudio
  } = useContext(PlayerContext);

  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(0.8);

  if (!currentMedia) return null;

  const handleTogglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleSeekChange = (e) => {
    const val = parseFloat(e.target.value);
    seek(val);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setVolume(prevVolume);
      setIsMuted(false);
    } else {
      setPrevVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const handleClose = () => {
    pause();
    setCurrentMedia(null);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={isEmbedded 
      ? "w-full bg-[#14142d]/40 backdrop-blur-md p-3.5 rounded-2xl flex flex-col gap-3 hover:border-indigo-500/20 transition-all border border-[rgba(255,255,255,0.05)] shadow-inner"
      : "fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 z-50 w-auto md:w-80 glass-panel p-4 rounded-2xl shadow-2xl flex flex-col gap-3 animate-slide-up hover:border-indigo-500/30 transition-all border border-[rgba(255,255,255,0.1)]"
    }>
      {/* Header of floating card with Title and Close Button */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-xl overflow-hidden bg-black/40 border border-white/5 shadow-md shrink-0 relative">
            <img 
              src={currentMedia.thumbnail} 
              alt={currentMedia.title}
              className="w-full h-full object-cover"
            />
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="flex items-end gap-0.5 h-3">
                  <span className="w-0.5 bg-indigo-400 animate-[bounce_0.8s_infinite_100ms] h-2"></span>
                  <span className="w-0.5 bg-indigo-400 animate-[bounce_0.8s_infinite_300ms] h-3"></span>
                  <span className="w-0.5 bg-indigo-400 animate-[bounce_0.8s_infinite_200ms] h-1.5"></span>
                </div>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-display font-semibold text-xs md:text-sm text-white truncate" dangerouslySetInnerHTML={{ __html: currentMedia.title }}></h4>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider truncate mt-0.5">{currentMedia.uploader}</p>
          </div>
        </div>
        
        {/* Close Button to stop & hide the player */}
        <button 
          onClick={handleClose}
          className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition-all shrink-0 cursor-pointer"
          title="Stop Playback"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress slider and times */}
      <div className="space-y-1">
        <div className="relative w-full h-1 bg-black/40 rounded-full cursor-pointer group">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeekChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-75 relative"
            style={{ width: `${progressPercent}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 h-2.5 w-2.5 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform duration-200"></div>
          </div>
        </div>
        <div className="flex justify-between text-[9px] font-semibold text-gray-500 font-mono">
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Playback Controls & Volume in one row */}
      <div className="flex items-center justify-between gap-4">
        {/* Mute/Volume controls */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <button 
            onClick={handleToggleMute}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all shrink-0 cursor-pointer"
          >
            {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setVolume(val);
              if (val > 0 && isMuted) setIsMuted(false);
            }}
            className="w-16 accent-indigo-500 cursor-pointer bg-white/10 h-0.5 rounded-full outline-none"
          />
        </div>

        {/* Center Play Button */}
        <button 
          onClick={handleTogglePlay}
          disabled={isLoadingAudio}
          className="h-9 w-9 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-100 transition-all cursor-pointer shrink-0"
        >
          {isLoadingAudio ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" className="ml-0.5" />
          )}
        </button>
      </div>
    </div>
  );
};

export default BackgroundPlayer;
