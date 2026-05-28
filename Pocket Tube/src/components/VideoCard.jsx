import React, { useContext } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { formatDuration, formatViews } from '../utils/helpers';
import { Play, Download, Music } from 'lucide-react';

const VideoCard = ({ video, onClick, onDownloadClick }) => {
  const { loadBackgroundAudio } = useContext(PlayerContext);

  return (
    <div 
      onClick={onClick}
      className="glass-panel glass-panel-hover rounded-2xl overflow-hidden cursor-pointer group flex flex-col h-full"
    >
      {/* Thumbnail Wrapper */}
      <div className="relative aspect-video w-full overflow-hidden bg-black/40">
        <img 
          src={video.thumbnail} 
          alt={video.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.target.src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
          }}
        />
        {/* Quick Actions Hover Overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3.5 backdrop-blur-[2px]">
          {/* Download Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownloadClick(video);
            }}
            className="h-10 w-10 rounded-full bg-[#12122a]/80 text-gray-300 hover:text-white hover:bg-indigo-600 hover:scale-110 active:scale-100 border border-[rgba(255,255,255,0.08)] hover:border-indigo-500/30 transition-all flex items-center justify-center shadow-lg cursor-pointer transform translate-y-2 group-hover:translate-y-0 duration-300"
            title="Download formats"
          >
            <Download size={16} />
          </button>

          {/* Center Play Button */}
          <button
            onClick={onClick}
            className="h-12 w-12 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-110 active:scale-100 transition-all flex items-center justify-center shadow-xl shadow-indigo-600/20 cursor-pointer transform translate-y-2 group-hover:translate-y-0 duration-300 delay-75"
            title="Watch video"
          >
            <Play size={20} fill="currentColor" className="ml-0.5" />
          </button>

          {/* Background Audio Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              loadBackgroundAudio(video);
            }}
            className="h-10 w-10 rounded-full bg-[#12122a]/80 text-gray-300 hover:text-white hover:bg-purple-600 hover:scale-110 active:scale-100 border border-[rgba(255,255,255,0.08)] hover:border-purple-500/30 transition-all flex items-center justify-center shadow-lg cursor-pointer transform translate-y-2 group-hover:translate-y-0 duration-300 delay-150"
            title="Play Audio in Background"
          >
            <Music size={16} />
          </button>
        </div>
        {/* Duration Badge */}
        {video.duration > 0 && (
          <span className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md text-[10px] font-bold text-white px-2 py-0.5 rounded-md font-mono">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      {/* Info Content */}
      <div className="p-4 flex flex-col justify-between grow">
        <div>
          <h3 className="font-display font-semibold text-sm text-white line-clamp-2 leading-snug group-hover:text-indigo-400 transition-colors" dangerouslySetInnerHTML={{ __html: video.title }}>
          </h3>
          <p className="text-xs text-gray-500 font-medium mt-2 truncate">
            {video.uploader}
          </p>
        </div>
        
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[rgba(255,255,255,0.04)] text-[10px] text-gray-500 font-semibold tracking-wider uppercase">
          <span>{formatViews(video.views)}</span>
          <span>•</span>
          <span>{video.publishedText || 'Recent'}</span>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
