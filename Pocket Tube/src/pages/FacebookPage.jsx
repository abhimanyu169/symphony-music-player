import React from 'react';
import LinkDownloader from '../components/LinkDownloader';

const Facebook = (props) => (
  <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const FacebookPage = () => {
  return (
    <div className="space-y-8 pb-32">
      <LinkDownloader
        platform="facebook"
        logoIcon={Facebook}
        gradientClass="from-blue-700 to-indigo-800"
        placeholder="Paste Facebook video or Watch link URL here..."
      />
    </div>
  );
};

export default FacebookPage;
