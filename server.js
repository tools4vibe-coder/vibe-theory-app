import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import handlers dynamically
import stateHandler from './api/state.js';
import videoProxyHandler from './api/video-proxy.js';

// MIME types dictionary for static file serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4'
};

const server = http.createServer(async (req, res) => {
  // Parse URL & Query parameters
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  
  req.query = {};
  for (const [key, value] of parsedUrl.searchParams.entries()) {
    req.query[key] = value;
  }
  
  // Helper to read the request body asynchronously
  const getBody = () => {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
  };

  // Emulate Vercel response helper methods
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };
  
  res.send = (data) => {
    if (data instanceof Buffer) {
      res.end(data);
    } else if (typeof data === 'object') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    } else {
      res.end(data);
    }
    return res;
  };

  // Route API requests to Vercel handlers
  if (pathname.startsWith('/api/state')) {
    req.body = await getBody();
    try {
      await stateHandler(req, res);
    } catch (err) {
      console.error('State API Error:', err);
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
    return;
  }
  
  if (pathname.startsWith('/api/video-proxy')) {
    try {
      await videoProxyHandler(req, res);
    } catch (err) {
      console.error('Video Proxy Error:', err);
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  
  // Security check: ensure path stays within workspace root
  const relative = path.relative(__dirname, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.status(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.status(404).end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // Avoid local caching issues during development
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Vibe Theory local server running at http://localhost:${PORT}`);
});
