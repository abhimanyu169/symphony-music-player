import React, { useState, useEffect, useContext } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { X, Download, Music, Video, Loader2, ArrowRight } from 'lucide-react';
import { formatSize } from '../utils/helpers';

const DownloadModal = ({ video, onClose }) => {
  const { addToDownloadHistory } = useContext(PlayerContext);
  const [loading, setLoading] = useState(true);
  const [formats, setFormats] = useState([]);
  const [videoInfo, setVideoInfo] = useState(null);
  const [error, setError] = useState('');
  const [downloadingFormat, setDownloadingFormat] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;

  useEffect(() => {
    const fetchFormats = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:5000/api/info?url=${encodeURIComponent(videoUrl)}`);
        if (!response.ok) {
          throw new Error('Failed to retrieve formats from server');
        }
        const data = await response.json();
        setVideoInfo(data);
        
        // Sort and filter formats
        if (data.formats) {
          // Keep unique resolutions/qualities
          const seenQualities = new Set();
          const cleanFormats = data.formats.filter(f => {
            if (!f.quality || f.quality === 'unknown') return false;
            
            // Format identity string
            const identifier = `${f.quality}-${f.ext}-${f.vcodec !== 'none' ? 'video' : 'audio'}`;
            if (seenQualities.has(identifier)) return false;
            seenQualities.add(identifier);
            return true;
          });
          setFormats(cleanFormats);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch format options. Please ensure the backend server is running.');
      } finally {
        setLoading(false);
      }
    };

    fetchFormats();
  }, [video.id]);

  const handleDownload = (formatId, ext, isAudio) => {
    setDownloadingFormat(formatId);
    setDownloadProgress(0);

    // Simulate connection prep and stream setup
    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          
          // Trigger the actual file download using the browser's download flow
          const downloadUrl = `http://localhost:5000/api/download?url=${encodeURIComponent(videoUrl)}&format=${formatId}&isAudio=${isAudio}`;
          window.open(downloadUrl, '_blank');
          
          // Log to download history
          addToDownloadHistory({
            title: video.title,
            thumbnail: video.thumbnail,
            url: videoUrl,
            format: isAudio ? 'Audio (MP3)' : `${formatId} (${ext})`,
            platform: 'youtube'
          });

          // Close modal after complete
          setTimeout(() => {
            setDownloadingFormat(null);
            onClose();
          }, 1500);
          
          return 100;
        }
        return prev + 15;
      });
    }, 150);
  };

  // Group formats into video and audio
  const videoFormats = formats
    .filter(f => f.vcodec !== 'none')
    .sort((a, b) => {
      const resA = parseInt(a.quality) || 0;
      const resB = parseInt(b.quality) || 0;
      return resB - resA; // Sort highest resolution first
    });

  const audioFormats = formats
    .filter(f => f.vcodec === 'none' || f.acodec !== 'none' && f.vcodec === 'none');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
      <div className="glass-panel w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl relative border border-[rgba(255,255,255,0.08)] flex flex-col max-h-[85vh]">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/5 transition-all"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="p-6 border-b border-[rgba(255,255,255,0.08)] flex gap-4 items-center">
          <img 
            src={video.thumbnail} 
            alt={video.title} 
            className="w-24 aspect-video object-cover rounded-xl border border-[rgba(255,255,255,0.05)] shadow-md"
          />
          <div className="pr-8">
            <h2 className="font-display font-bold text-base md:text-lg text-white line-clamp-1" dangerouslySetInnerHTML={{ __html: video.title }}></h2>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">{video.uploader}</p>
          </div>
        </div>

        {/* Download Action State */}
        {downloadingFormat ? (
          <div className="p-12 flex flex-col items-center justify-center text-center grow">
            <Loader2 size={48} className="text-indigo-500 animate-spin mb-4" />
            <h3 className="font-display font-semibold text-lg text-white mb-2">Preparing Download Stream</h3>
            <p className="text-xs text-gray-400 max-w-sm mb-6">Connecting to YouTube servers, decoding streaming codecs, and initiating your safe file transmission...</p>
            
            <div className="w-full max-w-md bg-black/40 rounded-full h-2 overflow-hidden border border-white/5">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-150"
                style={{ width: `${downloadProgress}%` }}
              ></div>
            </div>
            <span className="text-xs font-mono font-bold text-indigo-400 mt-2">{downloadProgress}%</span>
          </div>
        ) : loading ? (
          <div className="p-12 flex flex-col items-center justify-center grow">
            <Loader2 size={36} className="text-indigo-500 animate-spin mb-3" />
            <p className="text-sm text-gray-400 font-medium">Fetching available resolution packages...</p>
          </div>
        ) : error ? (
          <div className="p-12 flex flex-col items-center justify-center text-center grow">
            <p className="text-sm text-red-500 font-semibold mb-4">{error}</p>
            <button 
              onClick={onClose}
              className="bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl text-xs font-display font-bold border border-white/10 transition-all"
            >
              Go Back
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto grow p-6 space-y-6">
            {/* Video Qualities */}
            <div>
              <h3 className="flex items-center gap-2 font-display font-bold text-sm text-white mb-4">
                <Video size={16} className="text-indigo-500" />
                <span>Video Formats</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {videoFormats.length > 0 ? videoFormats.map((f, index) => (
                  <button
                    key={index}
                    onClick={() => handleDownload(f.format_id, f.ext, false)}
                    className="flex items-center justify-between p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(99,102,241,0.08)] border border-[rgba(255,255,255,0.05)] hover:border-indigo-500/30 transition-all group"
                  >
                    <div className="text-left">
                      <p className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors uppercase">
                        {f.quality} ({f.ext})
                      </p>
                      <p className="text-[10px] text-gray-500 font-semibold mt-1">
                        {f.fps ? `${f.fps} FPS` : ''} • {f.vcodec !== 'none' ? 'HD Video' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 font-mono">
                        {f.filesize ? formatSize(f.filesize) : '15-40 MB'}
                      </span>
                      <Download size={14} className="text-gray-500 group-hover:text-white transition-colors" />
                    </div>
                  </button>
                )) : (
                  <p className="text-xs text-gray-600 col-span-2">No video formats available.</p>
                )}
              </div>
            </div>

            {/* Audio Qualities */}
            <div>
              <h3 className="flex items-center gap-2 font-display font-bold text-sm text-white mb-4">
                <Music size={16} className="text-purple-500" />
                <span>Audio Only Formats</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Custom best audio format */}
                <button
                  onClick={() => handleDownload('bestaudio', 'mp3', true)}
                  className="flex items-center justify-between p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(168,85,247,0.08)] border border-[rgba(255,255,255,0.05)] hover:border-purple-500/30 transition-all group"
                >
                  <div className="text-left">
                    <p className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors uppercase">
                      Premium Audio (MP3)
                    </p>
                    <p className="text-[10px] text-gray-500 font-semibold mt-1">
                      HQ 320kbps • Stereo Audio
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 font-mono">
                      ~6 MB
                    </span>
                    <Download size={14} className="text-gray-500 group-hover:text-white transition-colors" />
                  </div>
                </button>

                {audioFormats.map((f, index) => (
                  <button
                    key={index}
                    onClick={() => handleDownload(f.format_id, f.ext, true)}
                    className="flex items-center justify-between p-4 rounded-2xl bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(168,85,247,0.08)] border border-[rgba(255,255,255,0.05)] hover:border-purple-500/30 transition-all group"
                  >
                    <div className="text-left">
                      <p className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors uppercase">
                        {f.quality === 'audio' ? 'Standard Audio' : f.quality} ({f.ext})
                      </p>
                      <p className="text-[10px] text-gray-500 font-semibold mt-1">
                        {f.acodec || 'AAC'} Codec • Audio Stream
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 font-mono">
                        {f.filesize ? formatSize(f.filesize) : '3-8 MB'}
                      </span>
                      <Download size={14} className="text-gray-500 group-hover:text-white transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadModal;
