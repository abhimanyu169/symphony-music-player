import React, { useState, useContext, useRef, useEffect } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { Search, X, Clock } from 'lucide-react';

const SearchBar = ({ onSearch }) => {
  const { searchHistory, addToSearchHistory } = useContext(PlayerContext);
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
      addToSearchHistory(query);
      setIsFocused(false);
    }
  };

  const handleHistoryClick = (q) => {
    setQuery(q);
    onSearch(q);
    addToSearchHistory(q);
    setIsFocused(false);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto z-30">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onFocus={() => setIsFocused(true)}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube videos..."
          className="w-full bg-[rgba(20,20,40,0.4)] hover:bg-[rgba(25,25,50,0.6)] focus:bg-[rgba(15,15,35,0.85)] border border-[rgba(255,255,255,0.08)] focus:border-indigo-500 rounded-full py-4 pl-12 pr-12 text-sm text-white placeholder-gray-500 outline-none transition-all duration-300 backdrop-blur-md shadow-inner"
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
          <Search size={18} />
        </div>
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </form>

      {/* Search History Dropdown */}
      {isFocused && searchHistory.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-[#0d0d21] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-slide-up">
          <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.04)] flex justify-between items-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Recent Searches</span>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {searchHistory.map((q, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => handleHistoryClick(q)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-all text-left"
                >
                  <Clock size={14} className="text-gray-600" />
                  <span className="truncate">{q}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
