import React, { useContext, useState } from 'react';
import { PlayerContext } from '../context/PlayerContext';
import { Ghost, Settings, History, Download, X } from 'lucide-react';
import BackgroundPlayer from './BackgroundPlayer';

const Youtube = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);

const Instagram = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const Facebook = (props) => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const Sidebar = () => {
  const { 
    activeTab, 
    setActiveTab, 
    ytApiKey, 
    setYtApiKey, 
    currentMedia,
    themeMode,
    setThemeMode,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize
  } = useContext(PlayerContext);
  const [showSettings, setShowSettings] = useState(false);

  const menuItems = [
    { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500 hover:bg-red-500/10 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]' },
    { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500 hover:bg-pink-500/10 hover:shadow-[0_0_15px_rgba(236,72,153,0.2)]' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500 hover:bg-blue-500/10 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]' },
    { id: 'snapchat', label: 'Snapchat', icon: Ghost, color: 'text-yellow-400 hover:bg-yellow-400/10 hover:shadow-[0_0_15px_rgba(250,204,21,0.2)]' }
  ];

  return (
    <>
      {/* Sidebar for desktop, bottom bar for mobile */}
      <aside className="fixed bottom-0 left-0 right-0 z-40 flex h-16 w-full border-t border-[rgba(255,255,255,0.08)] bg-[#0b0b1a]/95 backdrop-blur-md md:bottom-auto md:top-0 md:h-screen md:w-64 md:flex-col md:border-r md:border-t-0 p-4">
        {/* Brand Logo */}
        <div className="hidden md:flex items-center gap-3 mb-8 px-2 py-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="font-display font-black text-xl text-white tracking-wider">PT</span>
          </div>
          <div>
            <h1 className="font-display font-bold text-lg text-white leading-none">Pocket Tube</h1>
            <span className="text-[10px] text-gray-500 font-semibold tracking-widest uppercase">Media Downloader</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex w-full items-center justify-around md:flex-col md:justify-start md:gap-2 md:grow">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 w-auto md:w-full font-display font-medium text-sm ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 text-white shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'text-gray-400 border border-transparent hover:text-white'
                } ${item.color}`}
              >
                <Icon size={20} className={isActive ? 'animate-pulse' : ''} />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Desktop: Embedded Audio Player inside Sidebar */}
        {currentMedia && (
          <div className="hidden md:block w-full mt-auto mb-4">
            <BackgroundPlayer isEmbedded={true} />
          </div>
        )}

        {/* Settings trigger */}
        <div className={`hidden md:flex flex-col gap-2 pt-4 ${currentMedia ? '' : 'mt-auto'} border-t border-[rgba(255,255,255,0.08)]`}>
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-300 w-full font-display font-medium text-sm"
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Floating Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 relative shadow-2xl border border-[rgba(255,255,255,0.1)]">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="font-display font-bold text-xl text-white mb-2">Settings</h2>
            <p className="text-xs text-gray-400 mb-6">Configure custom API settings or manage local preferences.</p>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 no-scrollbar">
              {/* API Key */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  YouTube Data API Key (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Paste your Google API key here..."
                  value={ytApiKey}
                  onChange={(e) => setYtApiKey(e.target.value)}
                  className="w-full bg-[#12122a] border border-[rgba(255,255,255,0.1)] focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-600 outline-none transition-all"
                />
                <p className="text-[9px] text-gray-500 mt-1.5 leading-relaxed">
                  Pocket Tube runs on active Invidious nodes (no API key needed) by default. Add a personal key to unlock faster query times.
                </p>
              </div>

              {/* Theme Mode Selector */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Theme Mode
                </label>
                <select
                  value={themeMode}
                  onChange={(e) => setThemeMode(e.target.value)}
                  className="w-full bg-[#12122a] border border-[rgba(255,255,255,0.1)] focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none cursor-pointer transition-all"
                >
                  <option value="ambient">Ambient Dark (Dynamic Glows)</option>
                  <option value="amoled">OLED Pure Black (High Contrast)</option>
                  <option value="cyberpunk">Cyberpunk Neon (Vibrant)</option>
                  <option value="light">Slate Light (Clean Classic)</option>
                </select>
              </div>

              {/* Font Family Selector */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Font Family
                </label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full bg-[#12122a] border border-[rgba(255,255,255,0.1)] focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none cursor-pointer transition-all"
                >
                  <option value="sans">Sans-Serif (Modern Inter)</option>
                  <option value="outfit">Display (Rounded Outfit)</option>
                  <option value="serif">Classic Serif (Georgia)</option>
                  <option value="mono">Developer Code (Monospace)</option>
                </select>
              </div>

              {/* Font Size Selector */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Font Size Scale
                </label>
                <select
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                  className="w-full bg-[#12122a] border border-[rgba(255,255,255,0.1)] focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none cursor-pointer transition-all"
                >
                  <option value="compact">Compact (14px / 87.5%)</option>
                  <option value="normal">Standard (16px / 100%)</option>
                  <option value="large">Large (18px / 112.5%)</option>
                  <option value="xl">Extra Large (20px / 125%)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-[rgba(255,255,255,0.08)] flex justify-end">
                <button
                  onClick={() => setShowSettings(false)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-display font-semibold text-xs px-5 py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
