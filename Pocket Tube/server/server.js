import express from 'express';
import cors from 'cors';
import YTDlpWrap from 'yt-dlp-wrap';
import path from 'path';
import { spawn } from 'child_process';

// Setup environment paths for ffmpeg and yt-dlp on Windows
const ffmpegDir = "C:\\Users\\abhim\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin";
const ytdlpDir = "C:\\Users\\abhim\\AppData\\Local\\Programs\\Python\\Python314\\Scripts";
process.env.PATH = `${ffmpegDir};${ytdlpDir};${process.env.PATH}`;

const ytDlpPath = "C:\\Users\\abhim\\AppData\\Local\\Programs\\Python\\Python314\\Scripts\\yt-dlp.exe";
const ytDlp = new YTDlpWrap.default(ytDlpPath);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Endpoint to fetch media info
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    console.log(`Fetching info for: ${url}`);
    const metadata = await ytDlp.getVideoInfo([
      url,
      '--no-warnings',
      '--no-playlist'
    ]);

    // Format options for client selection
    const responseData = {
      title: metadata.title,
      description: metadata.description,
      duration: metadata.duration,
      uploader: metadata.uploader,
      view_count: metadata.view_count,
      thumbnail: metadata.thumbnail || (metadata.thumbnails && metadata.thumbnails.length ? metadata.thumbnails[metadata.thumbnails.length - 1].url : null),
      originalUrl: url,
      formats: metadata.formats ? metadata.formats.map(f => ({
        format_id: f.format_id,
        ext: f.ext,
        resolution: f.resolution,
        quality: f.format_note || f.height + 'p',
        filesize: f.filesize || f.filesize_approx || null,
        acodec: f.acodec,
        vcodec: f.vcodec,
        fps: f.fps
      })) : []
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch video information' });
  }
});

// Endpoint to download / stream video or audio
app.get('/api/download', (req, res) => {
  const { url, format, isAudio } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const isAudioOnly = isAudio === 'true';
    const formatSelection = format || 'best';
    
    console.log(`Starting download for: ${url} (Format: ${formatSelection}, AudioOnly: ${isAudioOnly})`);

    const args = [
      url,
      '--no-playlist',
      '--no-warnings',
      '-o', '-' // Output to stdout
    ];

    let filename = 'download';
    let contentType = 'application/octet-stream';

    if (isAudioOnly) {
      // Audio-only download: Stream raw M4A audio to avoid post-processing/transcoding errors on stdout
      args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
      
      filename = 'audio.m4a';
      contentType = 'audio/mp4';
    } else {
      // Video download
      // If format is specified, we try format + bestaudio to merge
      if (formatSelection && formatSelection !== 'best') {
        args.push('-f', `${formatSelection}+bestaudio/best`);
      } else {
        args.push('-f', 'bestvideo+bestaudio/best');
      }
      args.push('--merge-output-format', 'mp4');
      
      filename = 'video.mp4';
      contentType = 'video/mp4';
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Type', contentType);

    const ytDlpStream = ytDlp.execStream(args);

    ytDlpStream.pipe(res);

    ytDlpStream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    });

    req.on('close', () => {
      console.log('Client closed connection. Killing download process.');
      ytDlpStream.destroy();
    });

  } catch (error) {
    console.error('Download setup error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Download failed initialization' });
    }
  }
});

// Invidious instances configuration with fallbacks
let invidiousInstances = [
  'https://yt.chocolatemoo53.com',
  'https://inv.thepixora.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.flokinet.to',
  'https://yewtu.be'
];
let lastInstanceUpdate = 0;
let currentInstanceIndex = 0;

// Fetch and filter healthy instances dynamically
async function getHealthyInstances() {
  const now = Date.now();
  // Update once every 15 minutes
  if (now - lastInstanceUpdate > 15 * 60 * 1000) {
    try {
      console.log('Fetching active Invidious instances dynamically...');
      const response = await fetch('https://api.invidious.io/instances.json?sort_by=type,health');
      if (response.ok) {
        const data = await response.json();
        const healthy = data
          .filter(item => {
            const details = item[1];
            return details && details.type === 'https' && details.uri && details.monitor && details.monitor.uptime > 85;
          })
          .map(item => item[1].uri);
        
        if (healthy.length > 0) {
          invidiousInstances = [...new Set([...healthy, ...invidiousInstances])];
          lastInstanceUpdate = now;
          console.log(`Updated Invidious instances. Total pool: ${invidiousInstances.length}`);
        }
      }
    } catch (error) {
      console.warn('Failed to fetch dynamic Invidious instances, using fallback list:', error.message);
    }
  }
  return invidiousInstances;
}

// Global fetch helper with auto-fallback and rotation
async function fetchFromInvidious(path) {
  const instances = await getHealthyInstances();
  let attempts = 0;
  
  while (attempts < Math.min(instances.length, 8)) {
    const instance = instances[currentInstanceIndex];
    const url = `${instance}${path}`;
    try {
      console.log(`Attempting Invidious fetch [attempt ${attempts + 1}]: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Response is not an array (likely endpoint disabled or HTML page)');
      }

      return data;
    } catch (error) {
      console.warn(`Instance failed: ${instance}. Error: ${error.message}`);
      // Try next instance
      currentInstanceIndex = (currentInstanceIndex + 1) % instances.length;
      attempts++;
    }
  }
  throw new Error('All checked Invidious instances failed.');
}

// Endpoint to proxy YouTube search queries
app.get('/api/youtube/search', (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Search query "q" is required' });
  }

  console.log(`Searching YouTube via Python for: ${q}`);

  const pyProcess = spawn('python', ['server/extractor.py', 'search', q]);
  let stdoutData = '';
  let stderrData = '';

  pyProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  pyProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  pyProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python search failed with code ${code}. Error: ${stderrData}`);
      return res.status(500).json({ error: stderrData.trim() || 'Failed to search YouTube' });
    }

    try {
      const result = JSON.parse(stdoutData);
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }
      res.json(result);
    } catch (parseError) {
      console.error('Error parsing python search output:', parseError);
      res.status(500).json({ error: 'Failed to parse search results' });
    }
  });
});

// Endpoint to proxy YouTube trending list
app.get('/api/youtube/trending', (req, res) => {
  console.log('Fetching YouTube trending music via Python');

  const pyProcess = spawn('python', ['server/extractor.py', 'trending']);
  let stdoutData = '';
  let stderrData = '';

  pyProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  pyProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  pyProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python trending failed with code ${code}. Error: ${stderrData}`);
      return res.status(500).json({ error: stderrData.trim() || 'Failed to fetch trending videos' });
    }

    try {
      const result = JSON.parse(stdoutData);
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }
      res.json(result);
    } catch (parseError) {
      console.error('Error parsing python trending output:', parseError);
      res.status(500).json({ error: 'Failed to parse trending results' });
    }
  });
});

// Endpoint to extract direct seekable audio URL using Python extractor
app.get('/api/youtube/audio-url', (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`Extracting direct audio URL for: ${url}`);

  const pyProcess = spawn('python', ['server/extractor.py', 'info', url]);
  let stdoutData = '';
  let stderrData = '';

  pyProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  pyProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  pyProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python extractor failed with code ${code}. Error: ${stderrData}`);
      return res.status(500).json({ error: stderrData.trim() || 'Failed to extract audio stream URL' });
    }

    try {
      const result = JSON.parse(stdoutData);
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }
      res.json({ audioUrl: result.audioStreamUrl });
    } catch (parseError) {
      console.error('Error parsing python extractor output:', parseError);
      res.status(500).json({ error: 'Failed to parse stream metadata' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Pocket Tube Express Server is running on port ${PORT}`);
});
