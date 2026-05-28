import React, { useContext } from 'react';
import { PlayerProvider, PlayerContext } from './context/PlayerContext';
import Sidebar from './components/Sidebar';
import YouTubePage from './pages/YouTubePage';
import InstagramPage from './pages/InstagramPage';
import FacebookPage from './pages/FacebookPage';
import SnapchatPage from './pages/SnapchatPage';
import BackgroundPlayer from './components/BackgroundPlayer';

const MainLayout = () => {
  const { activeTab, themeGlow, themeMode } = useContext(PlayerContext);

  const themeBlobColors = {
    all: {
      blob1: 'bg-[#3b82f6]/8',
      blob2: 'bg-[#a855f7]/8',
      blob3: 'bg-[#ec4899]/6',
      glow: 'rgba(99, 102, 241, 0.15)',
    },
    gaming: {
      blob1: 'bg-[#10b981]/9',
      blob2: 'bg-[#14b8a6]/8',
      blob3: 'bg-[#22c55e]/6',
      glow: 'rgba(16, 185, 129, 0.15)',
    },
    music: {
      blob1: 'bg-[#f43f5e]/9',
      blob2: 'bg-[#8b5cf6]/8',
      blob3: 'bg-[#ec4899]/8',
      glow: 'rgba(244, 63, 94, 0.15)',
    },
    'tech & gadgets': {
      blob1: 'bg-[#06b6d4]/9',
      blob2: 'bg-[#6366f1]/8',
      blob3: 'bg-[#3b82f6]/6',
      glow: 'rgba(6, 182, 212, 0.15)',
    },
    'movies & trailers': {
      blob1: 'bg-[#ef4444]/9',
      blob2: 'bg-[#f59e0b]/8',
      blob3: 'bg-[#f97316]/6',
      glow: 'rgba(239, 68, 68, 0.15)',
    },
    comedy: {
      blob1: 'bg-[#eab308]/9',
      blob2: 'bg-[#f97316]/8',
      blob3: 'bg-[#d97706]/6',
      glow: 'rgba(234, 179, 8, 0.15)',
    },
    news: {
      blob1: 'bg-[#0ea5e9]/9',
      blob2: 'bg-[#2563eb]/8',
      blob3: 'bg-[#64748b]/6',
      glow: 'rgba(14, 165, 233, 0.15)',
    },
    sports: {
      blob1: 'bg-[#f97316]/9',
      blob2: 'bg-[#dc2626]/8',
      blob3: 'bg-[#facc15]/6',
      glow: 'rgba(249, 115, 22, 0.15)',
    },
    instagram: {
      blob1: 'bg-[#d300c5]/9',
      blob2: 'bg-[#f77737]/8',
      blob3: 'bg-[#405de6]/7',
      glow: 'rgba(225, 48, 108, 0.15)',
    },
    facebook: {
      blob1: 'bg-[#1877f2]/10',
      blob2: 'bg-[#42b72a]/5',
      blob3: 'bg-[#0084ff]/7',
      glow: 'rgba(24, 119, 242, 0.15)',
    },
    snapchat: {
      blob1: 'bg-[#fffc00]/9',
      blob2: 'bg-[#ffffff]/5',
      blob3: 'bg-[#ff9000]/6',
      glow: 'rgba(255, 252, 0, 0.15)',
    }
  };

  const currentTheme = themeBlobColors[themeGlow] || themeBlobColors.all;

  const isAmoled = themeMode === 'amoled';
  const isLight = themeMode === 'light';
  const isCyberpunk = themeMode === 'cyberpunk';

  const renderActivePage = () => {
    switch (activeTab) {
      case 'youtube':
        return <YouTubePage />;
      case 'instagram':
        return <InstagramPage />;
      case 'facebook':
        return <FacebookPage />;
      case 'snapchat':
        return <SnapchatPage />;
      default:
        return <YouTubePage />;
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      {/* Dynamic Background Design Mesh */}
      <div 
        className="bg-gradient-mesh overflow-hidden"
        style={{
          '--glow-color': currentTheme.glow
        }}
      >
        <div className={`absolute top-[10%] left-[15%] w-[40vw] h-[40vw] rounded-full ${currentTheme.blob1} blur-[100px] md:blur-[150px] animate-blob transition-all duration-1000 ease-in-out ${isAmoled ? 'opacity-0 scale-0' : isLight ? 'opacity-[0.03]' : isCyberpunk ? 'opacity-[0.16]' : ''}`}></div>
        <div className={`absolute bottom-[15%] right-[10%] w-[45vw] h-[45vw] rounded-full ${currentTheme.blob2} blur-[120px] md:blur-[170px] animate-blob animation-delay-2000 transition-all duration-1000 ease-in-out ${isAmoled ? 'opacity-0 scale-0' : isLight ? 'opacity-[0.03]' : isCyberpunk ? 'opacity-[0.16]' : ''}`}></div>
        <div className={`absolute top-[40%] left-[45%] w-[35vw] h-[35vw] rounded-full ${currentTheme.blob3} blur-[110px] md:blur-[160px] animate-blob animation-delay-4000 transition-all duration-1000 ease-in-out ${isAmoled ? 'opacity-0 scale-0' : isLight ? 'opacity-[0.02]' : isCyberpunk ? 'opacity-[0.12]' : ''}`}></div>
      </div>

      {/* Persistent Left Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Workspace Panel */}
      <main className="flex-1 md:ml-64 min-h-screen p-4 md:p-8 transition-all duration-300">
        <div className="max-w-7xl mx-auto">
          {renderActivePage()}
        </div>
      </main>

      {/* Persistent Audio Player Bar (Mobile Only, Desktop is in Sidebar) */}
      <div className="block md:hidden">
        <BackgroundPlayer />
      </div>
    </div>
  );
};

function App() {
  return (
    <PlayerProvider>
      <MainLayout />
    </PlayerProvider>
  );
}

export default App;
