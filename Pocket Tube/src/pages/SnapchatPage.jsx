import React from 'react';
import LinkDownloader from '../components/LinkDownloader';
import { Ghost } from 'lucide-react';

const SnapchatPage = () => {
  return (
    <div className="space-y-8 pb-32">
      <LinkDownloader
        platform="snapchat"
        logoIcon={Ghost}
        gradientClass="from-yellow-400 via-yellow-500 to-amber-500 text-[#0d0d21]"
        placeholder="Paste Snapchat Spotlight or public Story URL here..."
      />
    </div>
  );
};

export default SnapchatPage;
