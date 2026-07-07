// Shared state API using JSONBlob as free persistent storage
// Perfect for short seminar sessions (30-40 min)

const BLOB_URL = 'https://jsonblob.com/api/jsonBlob/019eb1d8-2c50-7651-b227-41402333579d';

async function getState() {
  const res = await fetch(BLOB_URL, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`JSONBlob status: ${res.status}`);
  return await res.json();
}

async function setState(data) {
  await fetch(BLOB_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data)
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  try {
    const state = await getState();

    if (req.method === 'GET') {
      if (action === 'users') {
        return res.json({ users: state.users || {}, count: Object.keys(state.users || {}).length });
      }
      if (action === 'videos') {
        return res.json({ videos: state.videos || [] });
      }
      return res.json({ 
        users: state.users || {}, 
        userCount: Object.keys(state.users || {}).length,
        videos: state.videos || [],
        videoCount: (state.videos || []).length
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      if (action === 'join') {
        const { name } = body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        if (!state.users) state.users = {};
        if (!state.videos) state.videos = [];
        const userVideos = state.videos.filter(v => v.user === name);
        state.users[name] = { 
          name, 
          joinedAt: new Date().toISOString(),
          videoCount: userVideos.length
        };
        await setState(state);
        return res.json({ 
          ok: true, 
          userCount: Object.keys(state.users).length,
          remaining: 3 - userVideos.length
        });
      }

      if (action === 'video') {
        const { user, prompt, aspectRatio, uri } = body;
        if (!user) return res.status(400).json({ error: 'User required' });
        if (!state.videos) state.videos = [];
        
        const userVideos = state.videos.filter(v => v.user === user);
        if (userVideos.length >= 3) {
          return res.status(429).json({ error: 'Limit reached', remaining: 0 });
        }

        const video = {
          id: Date.now(),
          user,
          prompt: prompt || '',
          uri: uri || null,
          aspectRatio: aspectRatio || '9:16',
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: new Date().toISOString()
        };
        state.videos.unshift(video);
        
        if (!state.users) state.users = {};
        if (state.users[user]) {
          state.users[user].videoCount = userVideos.length + 1;
        }

        await setState(state);
        return res.json({ 
          ok: true, 
          video,
          remaining: 3 - (userVideos.length + 1)
        });
      }

      if (action === 'reset') {
        await setState({ users: {}, videos: [] });
        return res.json({ ok: true, message: 'State reset' });
      }

      if (action === 'logout_all') {
        state.users = {};
        await setState(state);
        return res.json({ ok: true, message: 'All users logged out' });
      }

      if (action === 'logout') {
        const { name } = body;
        if (name && state.users) {
          delete state.users[name];
          await setState(state);
        }
        return res.json({ ok: true, message: `User ${name} logged out` });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
