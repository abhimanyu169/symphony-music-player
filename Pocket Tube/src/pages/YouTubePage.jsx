import React, { useState, useEffect, useContext } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { getTrendingVideos, searchVideos } from '../services/youtube';
import SearchBar from '../components/SearchBar';
import VideoCard from '../components/VideoCard';
import VideoPlayer from '../components/VideoPlayer';
import DownloadModal from '../components/DownloadModal';
import { Flame, Loader2, SearchX, Globe, Gamepad2, Music, Tv, Newspaper, Trophy, Clapperboard } from 'lucide-react';

const YouTubePage = () => {
  const { ytApiKey, setThemeGlow } = useContext(PlayerContext);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [quickDownloadVideo, setQuickDownloadVideo] = useState(null);

  const categories = [
    { label: 'All', query: 'trending India' },
    { label: 'Gaming', query: 'trending gaming India', icon: Gamepad2 },
    { label: 'Music', query: 'trending music India', icon: Music },
    { label: 'Tech & Gadgets', query: 'trending tech India', icon: Tv },
    { label: 'Movies & Trailers', query: 'new movie trailers India', icon: Clapperboard },
    { label: 'Comedy', query: 'trending comedy India', icon: Clapperboard },
    { label: 'News', query: 'trending news India', icon: Newspaper },
    { label: 'Sports', query: 'trending sports India', icon: Trophy }
  ];

  // Fetch trending on load
  useEffect(() => {
    fetchTrending();
  }, []);

  const fetchTrending = async () => {
    setLoading(true);
    setError('');
    setSearchQuery('');
    setActiveCategory('All');
    setThemeGlow('all');
    try {
      const data = await getTrendingVideos(ytApiKey);
      setVideos(data);
    } catch (err) {
      console.error(err);
      setError('Could not fetch trending videos. Invidious node might be temporarily rate-limiting. Try searching directly.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setLoading(true);
    setError('');
    setSearchQuery(query);
    setActiveCategory(null);
    setThemeGlow('all');
    try {
      const data = await searchVideos(query, ytApiKey);
      setVideos(data);
    } catch (err) {
      console.error(err);
      setError('Search request failed. Invidious instance is busy. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = async (category) => {
    setActiveCategory(category.label);
    setSearchQuery('');
    setLoading(true);
    setError('');
    setThemeGlow(category.label.toLowerCase());
    try {
      let data;
      if (category.label === 'All') {
        data = await getTrendingVideos(ytApiKey);
      } else {
        data = await searchVideos(category.query, ytApiKey);
      }
      setVideos(data);
    } catch (err) {
      console.error(err);
      setError(`Could not fetch ${category.label} content. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      {/* Search Header */}
      <div className="flex flex-col items-center text-center space-y-4">
        <h2 className="font-display font-black text-2xl md:text-4xl text-white tracking-tight">
          Explore <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">YouTube Content</span>
        </h2>
        <p className="text-xs md:text-sm text-gray-500 max-w-md font-medium">
          Browse popular videos or query the global YouTube index directly. Play in background or convert immediately.
        </p>
      </div>

      <SearchBar onSearch={handleSearch} />

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.label;
          const IconComponent = cat.icon;
          return (
            <button
              key={cat.label}
              onClick={() => handleCategorySelect(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/20 scale-[1.02]'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-[rgba(255,255,255,0.05)] hover:text-white hover:scale-[1.01]'
              }`}
            >
              {IconComponent && <IconComponent size={13} className={isActive ? 'animate-pulse' : 'text-gray-400'} />}
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-4">
        <h3 className="flex items-center gap-2 font-display font-bold text-base text-white">
          {searchQuery ? (
            <>
              <Globe size={18} className="text-indigo-400" />
              <span>Search Results for "{searchQuery}"</span>
            </>
          ) : (
            <>
              {activeCategory === 'All' && <Flame size={18} className="text-red-500 fill-red-500/10 animate-bounce" />}
              {activeCategory === 'Gaming' && <Gamepad2 size={18} className="text-emerald-400" />}
              {activeCategory === 'Music' && <Music size={18} className="text-pink-400" />}
              {activeCategory === 'Tech & Gadgets' && <Tv size={18} className="text-indigo-400" />}
              {activeCategory === 'Movies & Trailers' && <Clapperboard size={18} className="text-amber-400" />}
              {activeCategory === 'Comedy' && <Clapperboard size={18} className="text-yellow-400" />}
              {activeCategory === 'News' && <Newspaper size={18} className="text-blue-400" />}
              {activeCategory === 'Sports' && <Trophy size={18} className="text-orange-400" />}
              <span>{activeCategory === 'All' ? 'Trending Content' : `${activeCategory} Feed`}</span>
            </>
          )}
        </h3>
        {(searchQuery || activeCategory !== 'All') && (
          <button 
            onClick={fetchTrending}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Grid or States */}
      {loading ? (
        // Premium Skeleton Loader
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, idx) => (
            <div key={idx} className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full space-y-4 border border-[rgba(255,255,255,0.04)] animate-pulse">
              <div className="aspect-video w-full bg-white/5 shimmer"></div>
              <div className="p-4 space-y-3 grow">
                <div className="h-4 bg-white/5 rounded-md w-5/6 shimmer"></div>
                <div className="h-3 bg-white/5 rounded-md w-1/2 shimmer"></div>
                <div className="h-3 bg-white/5 rounded-md w-1/3 mt-6 shimmer"></div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-16 text-center space-y-4">
          <p className="text-sm text-red-500 font-semibold">{error}</p>
          <button 
            onClick={searchQuery ? () => handleSearch(searchQuery) : fetchTrending}
            className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 font-display font-bold text-xs px-5 py-3 rounded-xl transition-all"
          >
            Retry Connection
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <SearchX size={36} className="text-gray-600 mx-auto" />
          <p className="text-sm text-gray-500 font-medium">No videos found. Try search with keywords.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {videos.map((video) => (
            <VideoCard 
              key={video.id} 
              video={video} 
              onClick={() => setSelectedVideo(video)}
              onDownloadClick={(vid) => setQuickDownloadVideo(vid)}
            />
          ))}
        </div>
      )}

      {/* Video details drawer */}
      {selectedVideo && (
        <VideoPlayer 
          video={selectedVideo} 
          onClose={() => setSelectedVideo(null)}
        />
      )}

      {/* Quick Action Download selector modal */}
      {quickDownloadVideo && (
        <DownloadModal 
          video={quickDownloadVideo} 
          onClose={() => setQuickDownloadVideo(null)}
        />
      )}
    </div>
  );
};

export default YouTubePage;
