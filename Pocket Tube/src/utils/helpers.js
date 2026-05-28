/**
 * Formats duration in seconds to MM:SS or HH:MM:SS
 */
export const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const paddedSecs = secs.toString().padStart(2, '0');

  if (hrs > 0) {
    const paddedMins = mins.toString().padStart(2, '0');
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  }

  return `${mins}:${paddedSecs}`;
};

/**
 * Formats view count to human readable format (e.g. 1.2M, 450K)
 */
export const formatViews = (views) => {
  if (!views || isNaN(views)) return '0 views';
  
  const num = Number(views);
  if (num >= 1e9) {
    return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B views';
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M views';
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K views';
  }
  return num + ' views';
};

/**
 * Formats file size in bytes to MB/KB
 */
export const formatSize = (bytes) => {
  if (!bytes || isNaN(bytes)) return 'Unknown size';
  const num = Number(bytes);
  if (num >= 1e9) {
    return (num / 1e9).toFixed(1) + ' GB';
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(1) + ' MB';
  }
  return (num / 1024).toFixed(0) + ' KB';
};

/**
 * Validate URL based on platform
 */
export const validateUrl = (url, platform) => {
  if (!url) return false;
  
  const patterns = {
    instagram: /instagram\.com\/(p|reel|tv)\/[\w-]+/i,
    facebook: /(facebook\.com|fb\.watch)\/.+/i,
    snapchat: /snapchat\.com\/add\/.+/i
  };

  return patterns[platform] ? patterns[platform].test(url) : false;
};
