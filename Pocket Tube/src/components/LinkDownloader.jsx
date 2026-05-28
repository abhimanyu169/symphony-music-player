import React, { useState, useContext } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { Clipboard, Download, Loader2, Play, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { validateUrl } from '../utils/helpers';

const LinkDownloader = ({ platform, gradientClass, placeholder, logoIcon: LogoIcon }) => {
  const { addToDownloadHistory } = useContext(PlayerContext);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
    } catch (err) {
      setError('Could not access clipboard. Please paste the link manually.');
    }
  };

  const handleFetchPreview = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    if (!validateUrl(url, platform)) {
      setError(`Please paste a valid ${platform} URL.`);
      return;
    }

    setLoading(true);
    setError('');
    setPreviewData(null);
    setSuccess(false);

    try {
      const response = await fetch(`http://localhost:5000/api/info?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch media details for this URL.`);
      }
      const data = await response.json();
      setPreviewData(data);
    } catch (err) {
      console.error(err);
      setError('Could not retrieve metadata for this URL. Make sure the backend server is running and the URL is public.');
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = (formatId, isAudio = false) => {
    setDownloading(true);
    setSuccess(false);

    // Simulated parsing delay, then trigger browser attachment download
    setTimeout(() => {
      const downloadUrl = `http://localhost:5000/api/download?url=${encodeURIComponent(url)}&format=${formatId || 'best'}&isAudio=${isAudio}`;
      window.open(downloadUrl, '_blank');

      addToDownloadHistory({
        title: previewData?.title || `${platform} Download`,
        thumbnail: previewData?.thumbnail || '',
        url: url,
        format: isAudio ? 'Audio (MP3)' : 'Video (MP4)',
        platform: platform
      });

      setDownloading(false);
      setSuccess(true);
    }, 1500);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Brand card */}
      <div className={`p-8 rounded-3xl bg-gradient-to-br ${gradientClass} relative overflow-hidden shadow-2xl border border-white/5`}>
        <div className="absolute top-0 right-0 -translate-y-6 translate-x-6 h-36 w-36 bg-white/5 rounded-full blur-2xl"></div>
        <div className="relative z-10 flex flex-col items-center text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md shadow-inner border border-white/10">
            <LogoIcon size={32} className="text-white animate-pulse" />
          </div>
          <div>
            <h2 className="font-display font-black text-xl md:text-2xl text-white tracking-tight">
              {platform} Video Downloader
            </h2>
            <p className="text-xs text-white/70 font-medium max-w-sm mt-1 mx-auto">
              Paste the post link below to extract full resolution MP4 videos or HQ MP3 audio directly.
            </p>
          </div>
        </div>
      </div>

      {/* Input section */}
      <div className="glass-panel rounded-3xl p-6 shadow-xl border border-[rgba(255,255,255,0.06)]">
        <form onSubmit={handleFetchPreview} className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-black/40 hover:bg-black/60 focus:bg-black/80 border border-[rgba(255,255,255,0.08)] focus:border-indigo-500 rounded-2xl py-4 pl-4 pr-24 text-sm text-white placeholder-gray-600 outline-none transition-all"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all border border-white/5"
            >
              <Clipboard size={14} />
              <span>Paste</span>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 font-semibold bg-red-500/5 p-3 rounded-xl border border-red-500/10">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-display font-bold text-sm py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Fetching Media Link...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>Fetch Download Preview</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Preview Section */}
      {previewData && (
        <div className="glass-panel rounded-3xl p-6 shadow-xl border border-[rgba(255,255,255,0.06)] animate-slide-up flex flex-col md:flex-row gap-6">
          {/* Thumbnail */}
          <div className="relative w-full md:w-56 aspect-video md:aspect-square bg-black/40 rounded-2xl overflow-hidden shadow-inner border border-white/5 grow-0 shrink-0">
            {previewData.thumbnail ? (
              <img 
                src={previewData.thumbnail} 
                alt="Preview" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-700">
                <Play size={36} />
              </div>
            )}
          </div>

          {/* Details & Download Options */}
          <div className="flex-1 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="font-display font-bold text-white text-base leading-snug line-clamp-2">
                {previewData.title || `${platform} Post`}
              </h3>
              {previewData.uploader && (
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1.5">
                  By {previewData.uploader}
                </p>
              )}
            </div>

            {success && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10">
                <CheckCircle2 size={14} />
                <span>Download has been sent to the browser! Check your browser downlods.</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => triggerDownload('best', false)}
                disabled={downloading}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-display font-semibold text-xs p-4 rounded-xl transition-all shadow-md"
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>Download Video (MP4)</span>
              </button>

              <button
                onClick={() => triggerDownload('bestaudio', true)}
                disabled={downloading}
                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white border border-[rgba(255,255,255,0.06)] font-display font-semibold text-xs p-4 rounded-xl transition-all"
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>Download Audio (MP3)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkDownloader;
