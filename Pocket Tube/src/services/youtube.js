const BACKEND_URL = `http://${window.location.hostname || 'localhost'}:5000`;

/**
 * Perform search via local Express proxy
 */
const searchInvidious = async (query, page = 1) => {
  const url = `${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(query)}&page=${page}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP error ${response.status}`);
  }
  return await response.json();
};

/**
 * Fetch trending videos via local Express proxy
 */
const getTrendingInvidious = async () => {
  const url = `${BACKEND_URL}/api/youtube/trending`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP error ${response.status}`);
  }
  return await response.json();
};


/**
 * Fallback to standard YouTube Data API v3 if key is present
 */
const searchYouTubeAPI = async (query, apiKey, pageToken = '') => {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=24&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'YouTube API search failed');
  }
  const data = await response.json();
  
  return data.items.map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    uploader: item.snippet.channelTitle,
    duration: 0, // YouTube search doesn't return duration, need separate video details call
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    views: 0,
    publishedText: new Date(item.snippet.publishedAt).toLocaleDateString()
  }));
};

export const searchVideos = async (query, apiKey = null) => {
  if (apiKey) {
    try {
      return await searchYouTubeAPI(query, apiKey);
    } catch (err) {
      console.warn("YouTube API failed, falling back to Invidious:", err);
      return await searchInvidious(query);
    }
  }
  return await searchInvidious(query);
};

export const getTrendingVideos = async (apiKey = null) => {
  // Free trending API is easiest via Invidious
  return await getTrendingInvidious();
};
