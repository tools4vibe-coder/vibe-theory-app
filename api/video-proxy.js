// Server-side video proxy — fetches video from Google API (no CORS server-side)
// and streams it back to the browser client.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Only allow proxying Google API URLs for security
  if (!url.includes('googleapis.com') && !url.includes('google.com')) {
    return res.status(403).json({ error: 'Only Google API URLs allowed' });
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'Accept': 'video/mp4, */*' }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ 
        error: `Upstream returned ${upstream.status}`,
        message: 'Video may have expired. Google API video links expire after ~30 minutes.'
      });
    }

    // Forward content headers
    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    const contentLength = upstream.headers.get('content-length');
    
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Stream the response
    const arrayBuffer = await upstream.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (e) {
    console.error('Video proxy error:', e);
    return res.status(502).json({ error: 'Failed to fetch video', message: e.message });
  }
}
