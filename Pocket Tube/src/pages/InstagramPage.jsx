import React from 'react';
import LinkDownloader from '../components/LinkDownloader';

const Instagram = (props) => (
  <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const InstagramPage = () => {
  return (
    <div className="space-y-8 pb-32">
      <LinkDownloader
        platform="instagram"
        logoIcon={Instagram}
        gradientClass="from-pink-600 via-purple-600 to-orange-500"
        placeholder="Paste Instagram post, TV or Reel URL here..."
      />
    </div>
  );
};

export default InstagramPage;
