import { NextResponse } from 'next/server';

const BLOB_URL = 'https://jsonblob.com/api/jsonBlob/019eb1d8-2c50-7651-b227-41402333579d';

async function getState() {
  const res = await fetch(BLOB_URL, { 
    headers: { 'Accept': 'application/json' },
    cache: 'no-store'
  });
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const state = await getState();

    if (action === 'users') {
      return NextResponse.json({ users: state.users || {}, count: Object.keys(state.users || {}).length });
    }
    if (action === 'videos') {
      return NextResponse.json({ videos: state.videos || [] });
    }
    return NextResponse.json({ 
      users: state.users || {}, 
      userCount: Object.keys(state.users || {}).length,
      videos: state.videos || [],
      videoCount: (state.videos || []).length
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const state = await getState();
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    if (action === 'join') {
      const { name } = body;
      if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
      if (!state.users) state.users = {};
      if (!state.videos) state.videos = [];
      const userVideos = state.videos.filter(v => v.user === name);
      state.users[name] = { 
        name, 
        joinedAt: new Date().toISOString(),
        videoCount: userVideos.length
      };
      await setState(state);
      return NextResponse.json({ 
        ok: true, 
        userCount: Object.keys(state.users).length,
        remaining: 3 - userVideos.length
      });
    }

    if (action === 'video') {
      const { user, prompt, aspectRatio, uri } = body;
      if (!user) return NextResponse.json({ error: 'User required' }, { status: 400 });
      if (!state.videos) state.videos = [];
      
      const userVideos = state.videos.filter(v => v.user === user);
      if (userVideos.length >= 3) {
        return NextResponse.json({ error: 'Limit reached', remaining: 0 }, { status: 429 });
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
      return NextResponse.json({ 
        ok: true, 
        video,
        remaining: 3 - (userVideos.length + 1)
      });
    }

    if (action === 'reset') {
      await setState({ users: {}, videos: [] });
      return NextResponse.json({ ok: true, message: 'State reset' });
    }

    if (action === 'logout_all') {
      state.users = {};
      await setState(state);
      return NextResponse.json({ ok: true, message: 'All users logged out' });
    }

    if (action === 'logout') {
      const { name } = body;
      if (name && state.users) {
        delete state.users[name];
        await setState(state);
      }
      return NextResponse.json({ ok: true, message: `User ${name} logged out` });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
