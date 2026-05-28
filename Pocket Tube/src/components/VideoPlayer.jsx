import React, { useState, useContext } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { X, Download, Music, Radio, ChevronRight, Play, Eye } from 'lucide-react';
import { formatViews } from '../utils/helpers';
import DownloadModal from './DownloadModal';

const VideoPlayer = ({ video, onClose }) => {
  const { loadBackgroundAudio, pause } = useContext(PlayerContext);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  // Pause the background audio when watching a video in the iframe
  React.useEffect(() => {
    pause();
  }, []);

  if (!video) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/60 backdrop-blur-sm p-0 md:p-4 animate-fade-in">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Main Drawer panel */}
      <div className="relative glass-panel w-full md:max-w-2xl h-full md:h-[95vh] md:rounded-3xl shadow-2xl border-l md:border border-[rgba(255,255,255,0.08)] flex flex-col z-10 overflow-hidden">
        {/* Header toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between">
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
            <Radio size={12} className="animate-pulse" />
            <span>Now Playing</span>
          </span>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/5 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Player Container */}
        <div className="aspect-video w-full bg-black">
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
            title={video.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full"
          ></iframe>
        </div>

        {/* Action buttons (Download, Background play) - Placed upfront and sticky */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.06)] bg-[#101026]/40">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowDownloadModal(true)}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-display font-semibold text-xs md:text-sm p-3.5 rounded-xl md:rounded-2xl shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all hover:scale-[1.01] active:scale-100 cursor-pointer"
            >
              <Download size={16} />
              <span>Download Formats</span>
            </button>

            <button
              onClick={() => {
                loadBackgroundAudio(video);
                onClose();
              }}
              className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-[rgba(255,255,255,0.08)] hover:border-indigo-500/30 font-display font-semibold text-xs md:text-sm p-3.5 rounded-xl md:rounded-2xl transition-all hover:scale-[1.01] active:scale-100 group cursor-pointer"
            >
              <Music size={16} className="text-purple-400 group-hover:animate-bounce" />
              <span>Background Play</span>
            </button>
          </div>
        </div>

        {/* Scrollable details */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="font-display font-bold text-lg md:text-xl text-white leading-snug" dangerouslySetInnerHTML={{ __html: video.title }}>
            </h2>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 font-medium">
              <span className="flex items-center gap-1">
                <Eye size={14} className="text-gray-500" />
                {formatViews(video.views)}
              </span>
              <span>•</span>
              <span>{video.publishedText}</span>
            </div>
          </div>

          {/* Video Description / Info details */}
          <div className="p-4 rounded-2xl bg-black/20 border border-[rgba(255,255,255,0.03)] space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Creator</p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{video.uploader}</span>
              <span className="text-xs font-semibold text-indigo-400 hover:underline cursor-pointer flex items-center">
                View Channel <ChevronRight size={14} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Download selector modal */}
      {showDownloadModal && (
        <DownloadModal 
          video={video} 
          onClose={() => setShowDownloadModal(false)}
        />
      )}
    </div>
  );
};

export default VideoPlayer;
