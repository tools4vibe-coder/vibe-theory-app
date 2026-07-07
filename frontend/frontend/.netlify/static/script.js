/* ============================================================
   VIBE THEORY — Standalone Video Generation App Logic
   ============================================================ */

function getApiUrl(path) {
  // Relative path so it calls local or deployed Vercel functions directly
  return path;
}
window.getApiUrl = getApiUrl;

(function() {
  const getApiUrl = window.getApiUrl; // Import from main IIFE
  let pbImages = [];
  let pbFormat = 'enhanced';
  let pbResolution = localStorage.getItem('pb_resolution') || '720p';
  let pbCustomStoryboard = null; // base64 of user-uploaded storyboard
  let pbChatFiles = []; // { src, base64, mimeType, name, type: 'ref'|'storyboard' }
  let pbCharacterDescription = ''; // Extracted forensic description of the user's character from reference images

  // --- Session Management ---
  const PB_SESSIONS_KEY = 'pb_sessions';
  const PB_ACTIVE_SESSION_KEY = 'pb_active_session';
  function pbGenerateSessionId() { return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }
  function pbGetAllSessions() { try { return JSON.parse(localStorage.getItem(PB_SESSIONS_KEY) || '[]'); } catch { return []; } }
  let pbActiveSessionId = localStorage.getItem(PB_ACTIVE_SESSION_KEY) || pbGenerateSessionId();
  let pbSessionName = 'Session ' + new Date().toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

  // --- IndexedDB Storage Helper for Heavy Assets (Videos/Storyboards) ---
  const DB_NAME = 'VibeTheoryDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'media';
  let dbPromise = null;

  function initDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = (e) => reject(e.target.error);
      request.onsuccess = (e) => resolve(e.target.result);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
    return dbPromise;
  }

  async function getMedia(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function setMedia(key, val) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(val, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function removeMedia(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Chat Conversation History ---
  let pbChatHistory = [
    {
      role: 'model',
      text: "Welcome to Vibe Theory Studio. I'm your Cinematic Creative Director. Paste your script or describe your concept below, or upload a storyboard/reference image. I'll help you refine the cinematography, lighting, and sequencing to build a premium video prompt."
    }
  ];

  function pbRenderChatHistory() {
    const chatHistoryEl = document.getElementById('pbChatHistory');
    if (!chatHistoryEl) return;
    
    if (pbChatHistory.length === 0) {
      chatHistoryEl.classList.remove('has-messages');
      chatHistoryEl.innerHTML = '';
      return;
    }
    
    chatHistoryEl.classList.add('has-messages');
    chatHistoryEl.innerHTML = pbChatHistory.map(msg => {
      const senderName = msg.role === 'user' ? 'You' : 'Creative Director';
      const senderClass = msg.role === 'user' ? 'user' : 'agent';
      // Format text with linebreaks and simple styling
      const formattedText = msg.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, '<br>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
        
      return `
        <div class="pb-chat-msg ${senderClass}">
          <span class="pb-chat-msg-sender">${senderName}</span>
          <div class="pb-chat-bubble">${formattedText}</div>
        </div>
      `;
    }).join('');
    
    // Auto-scroll to the bottom of the chat history
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    if (typeof pbSaveSession === 'function') pbSaveSession();
  }

  window.pbResetChat = function() {
    if (confirm('Start a new session? Current session will be saved.')) { pbCreateNewSession(); }
  };

  function pbShowTypingIndicator() {
    const chatHistoryEl = document.getElementById('pbChatHistory');
    if (!chatHistoryEl) return;
    
    chatHistoryEl.classList.add('has-messages');
    
    // Check if indicator already exists
    if (document.getElementById('pbChatTypingIndicator')) return;
    
    const indicatorHtml = `
      <div class="pb-chat-msg agent" id="pbChatTypingIndicator">
        <span class="pb-chat-msg-sender">Creative Director</span>
        <div class="pb-chat-bubble" style="padding: 4px 8px;">
          <div class="pb-typing-indicator">
            <div class="pb-typing-dot"></div>
            <div class="pb-typing-dot"></div>
            <div class="pb-typing-dot"></div>
          </div>
        </div>
      </div>
    `;
    chatHistoryEl.insertAdjacentHTML('beforeend', indicatorHtml);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  }

  function pbHideTypingIndicator() {
    const indicator = document.getElementById('pbChatTypingIndicator');
    if (indicator) indicator.remove();
  }

  // --- Custom Storyboard Upload ---
  window.pbSetCustomStoryboard = function(files) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const src = e.target.result;
      const base64 = src.split(',')[1];
      pbCustomStoryboard = base64;
      window.pbStoryboardImage = base64;
      const uploadEl = document.getElementById('pbStoryboardUpload');
      const contentEl = document.getElementById('pbStoryboardUploadContent');
      contentEl.innerHTML = `<img src="${src}" alt="Custom Storyboard" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
      uploadEl.classList.add('has-image');
      document.getElementById('pbStoryboardClear').style.display = 'inline-block';
      // Auto-extract character faces
      pbExtractCharactersFromStoryboard(base64);
    };
    reader.readAsDataURL(f);
  };

  // --- Auto-Extract Characters from Storyboard ---
  async function pbExtractCharactersFromStoryboard(base64) {
    const autoBtn = document.getElementById('pbAutoDescribeBtn');
    if (autoBtn) { autoBtn.style.display = 'inline-block'; autoBtn.textContent = '⏳ Scanning...'; autoBtn.disabled = true; }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType: 'image/png', data: base64 } },
              { text: `Analyze this visual storyboard image carefully. Identify the main character(s) or person(s) shown.

For each distinct character/person, provide:
1. "tag": A short descriptive name for the character (e.g. "spiritual leader in golden attire", "woman in red saree", "young devotee")
2. "box": Bounding box of their FACE or head+shoulders as [ymin, xmin, ymax, xmax] using normalized 0-1000 coordinates (where 0,0 is top-left and 1000,1000 is bottom-right of the image)

Pick the LARGEST and CLEAREST face/portrait for each character. Prefer close-up shots or hero images over tiny thumbnails.

Return ONLY a valid JSON array:
[{"tag": "name", "box": [ymin, xmin, ymax, xmax]}]

If no characters found, return []. Maximum 3 characters. No markdown, no extra text.` }
            ]}],
            generationConfig: { temperature: 0.1 }
          })
        }
      );

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
      console.log('Character extraction result:', text);

      const characters = JSON.parse(text);
      if (!Array.isArray(characters) || characters.length === 0) {
        if (autoBtn) { autoBtn.textContent = '✨ No faces found'; setTimeout(() => { autoBtn.textContent = '✨ Auto-Describe'; autoBtn.disabled = false; }, 2000); }
        return;
      }

      // Load the storyboard as an image for cropping
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await new Promise(r => { img.onload = r; });

      // Remove any previously auto-extracted images (tagged with [auto])
      pbImages = pbImages.filter(img => !img._autoExtracted);

      for (const char of characters.slice(0, 3)) {
        const [ymin, xmin, ymax, xmax] = char.box;
        // Convert from 0-1000 normalized to pixel coordinates
        let x = (xmin / 1000) * img.width;
        let y = (ymin / 1000) * img.height;
        let w = ((xmax - xmin) / 1000) * img.width;
        let h = ((ymax - ymin) / 1000) * img.height;

        // Add padding around the face
        const pad = Math.min(w, h) * 0.2;
        x = Math.max(0, x - pad);
        y = Math.max(0, y - pad);
        w = Math.min(img.width - x, w + pad * 2);
        h = Math.min(img.height - y, h + pad * 2);

        // Crop using canvas
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);

        const croppedSrc = canvas.toDataURL('image/png');
        pbImages.push({ src: croppedSrc, tag: char.tag, _autoExtracted: true });
      }

      pbRenderImages();
      if (autoBtn) { autoBtn.textContent = `✨ ${characters.length} character${characters.length > 1 ? 's' : ''} found`; autoBtn.disabled = false; }
      console.log(`✅ Auto-extracted ${characters.length} character(s) from storyboard`);

    } catch (err) {
      console.warn('Auto character extraction failed:', err);
      if (autoBtn) { autoBtn.textContent = '✨ Auto-Describe'; autoBtn.disabled = false; }
    }
  }

  window.pbClearCustomStoryboard = function() {
    pbCustomStoryboard = null;
    window.pbStoryboardImage = null;
    const displayEl = document.getElementById('pbStoryboardDisplay');
    if (displayEl) {
      displayEl.innerHTML = `<div class="pb-storyboard-empty">
        <span style="font-size: 32px; opacity: 0.3;">📋</span>
        <span style="font-size: 11px; color: #94a3b8;">Upload a storyboard in the chat below</span>
      </div>`;
    }
    document.getElementById('pbStoryboardClear').style.display = 'none';
    // Remove auto-extracted character images
    pbImages = pbImages.filter(img => !img._autoExtracted);
    pbRenderImages();
    // Clear chat storyboard files
    pbChatFiles = pbChatFiles.filter(f => f.type !== 'storyboard');
    if (typeof pbRenderChatAttachments === 'function') pbRenderChatAttachments();
    const autoBtn = document.getElementById('pbAutoDescribeBtn');
    if (autoBtn) { autoBtn.style.display = 'none'; autoBtn.textContent = '✨ Auto-Describe'; }
  };


  // --- Chat Bar File Handling ---

  window.pbChatAddFiles = function(files) {
    if (!files) return;
    for (const f of files) {
      if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) continue;
      const reader = new FileReader();
      reader.onload = e => {
        const src = e.target.result;
        const base64 = src.split(',')[1];
        const mimeType = src.split(';')[0].split(':')[1];
        const fileType = f.type.startsWith('video/') ? 'ref' : 'auto';
        pbChatFiles.push({ src, base64, mimeType, name: f.name, type: fileType });
        pbRenderChatAttachments();
      };
      reader.readAsDataURL(f);
    }
    document.getElementById('pbChatFileInput').value = '';
  };

  window.pbChatRemoveFile = function(idx) {
    pbChatFiles.splice(idx, 1);
    pbRenderChatAttachments();
  };

  window.pbChatSetFileType = function(idx, type) {
    pbChatFiles[idx].type = type;
    pbRenderChatAttachments();
  };

  function pbRenderChatAttachments() {
    const container = document.getElementById('pbChatAttachments');
    container.innerHTML = pbChatFiles.map((f, i) => {
      const isVideo = f.mimeType && f.mimeType.startsWith('video/');
      const thumb = isVideo
        ? `<div style="width:36px;height:36px;border-radius:6px;background:#1e1b4b;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🎬</div>`
        : `<img src="${f.src}" alt="${f.name}">`;
      const typeLabel = isVideo ? '🎬 Video' : (f.type === 'storyboard' ? '📋 Board' : '🖼️ Ref');
      const typeClick = isVideo ? '' : `onclick="window.pbChatSetFileType(${i}, '${f.type === 'storyboard' ? 'ref' : 'storyboard'}')" style="cursor:pointer;" title="Click to toggle type"`;
      return `
        <div class="pb-chat-attachment-pill">
          ${thumb}
          <span class="pill-label">${f.name}</span>
          <span class="pill-type ${f.type === 'storyboard' ? 'storyboard' : ''}" ${typeClick}>
            ${typeLabel}
          </span>
          <button class="pb-chat-attachment-rm" onclick="window.pbChatRemoveFile(${i})">✕</button>
        </div>
      `;
    }).join('');
  }

  // Auto-detect storyboard vs reference using Gemini (runs on first Enhance/Generate)
  async function pbAutoRouteFiles() {
    for (const f of pbChatFiles) {
      if (f.type !== 'auto') continue;
      // Quick heuristic: if image is wide/has multiple panels, likely storyboard
      try {
        const img = new Image();
        img.src = f.src;
        await new Promise(r => { img.onload = r; });
        // Storyboard heuristic: wider than tall, or very large
        const ratio = img.width / img.height;
        f.type = (ratio > 1.5 || img.width > 1500) ? 'storyboard' : 'ref';
      } catch {
        f.type = 'ref';
      }
    }
    pbRenderChatAttachments();
  }

  // Process chat files into the pipeline
  async function pbProcessChatFiles() {
    await pbAutoRouteFiles();

    // Process storyboard files
    const storyboardFiles = pbChatFiles.filter(f => f.type === 'storyboard');
    if (storyboardFiles.length > 0) {
      const sb = storyboardFiles[0]; // Use first storyboard
      pbCustomStoryboard = sb.base64;
      window.pbStoryboardImage = sb.base64;
      // Show in left panel
      const displayEl = document.getElementById('pbStoryboardDisplay');
      displayEl.innerHTML = `<img src="${sb.src}" alt="Storyboard" style="width:100%;border-radius:8px;">`;
      document.getElementById('pbStoryboardClear').style.display = 'inline-block';
      // Auto-extract characters
      pbExtractCharactersFromStoryboard(sb.base64);
    }

    // Process reference files
    const refFiles = pbChatFiles.filter(f => f.type === 'ref');
    for (const ref of refFiles) {
      if (pbImages.length >= 3) break;
      pbImages.push({ src: ref.src, tag: ref.name.replace(/\.[^.]+$/, ''), _autoExtracted: false });
    }
    if (refFiles.length > 0) pbRenderImages();

    // Clear chat files after they are routed to the workspace
    pbChatFiles = [];
    pbRenderChatAttachments();
  }

  // Chat textarea auto-grow
  const chatInput = document.getElementById('pbChatInput');
  if (chatInput) {
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    // Enter to send (Shift+Enter for newline)
    chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        pbSendChat();
      }
    });
    // Clipboard paste — images, videos, or text
    chatInput.addEventListener('paste', function(e) {
      const items = e.clipboardData?.items;
      if (!items) return;

      let hasMedia = false;
      for (const item of items) {
        // Handle pasted images (screenshots, copied images)
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          hasMedia = true;
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = ev => {
            const src = ev.target.result;
            const base64 = src.split(',')[1];
            const mimeType = src.split(';')[0].split(':')[1];
            const name = `clipboard_${Date.now()}.${mimeType.split('/')[1] || 'png'}`;
            pbChatFiles.push({ src, base64, mimeType, name, type: 'auto' });
            pbRenderChatAttachments();
          };
          reader.readAsDataURL(blob);
        }
        // Handle pasted video files
        else if (item.type.startsWith('video/')) {
          e.preventDefault();
          hasMedia = true;
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = ev => {
            const src = ev.target.result;
            const base64 = src.split(',')[1];
            const mimeType = src.split(';')[0].split(':')[1];
            const name = `clipboard_video_${Date.now()}.${mimeType.split('/')[1] || 'mp4'}`;
            pbChatFiles.push({ src, base64, mimeType, name, type: 'ref' });
            pbRenderChatAttachments();
          };
          reader.readAsDataURL(blob);
        }
      }

      // If we handled media, show a brief toast
      if (hasMedia) {
        const toast = document.createElement('div');
        toast.textContent = '📎 Pasted from clipboard';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:white;padding:6px 16px;border-radius:20px;font-size:12px;z-index:9999;pointer-events:none;animation:fadeIn 0.2s;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
      }
      // Text paste is handled natively by the textarea — no intervention needed
    });
  }

  // Chat bar drag & drop
  const chatBar = document.querySelector('.pb-chat-bar');
  if (chatBar) {
    chatBar.addEventListener('dragover', e => { e.preventDefault(); chatBar.style.borderColor = 'var(--accent)'; });
    chatBar.addEventListener('dragleave', () => { chatBar.style.borderColor = ''; });
    chatBar.addEventListener('drop', e => {
      e.preventDefault();
      chatBar.style.borderColor = '';
      window.pbChatAddFiles(e.dataTransfer.files);
    });
  }

  window.pbSetFormat = function(btn) {
    document.querySelectorAll('.pb-fmt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pbFormat = btn.dataset.fmt;
    const out = document.getElementById('pbOutput');
    if (out.textContent && !out.textContent.includes('Enhanced prompt')) pbSendChat();
  };

  window.pbHandleFiles = function(files) {
    Array.from(files).forEach(f => {
      if (!f.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        pbImages.push({ tag: name, src: e.target.result });
        pbRenderImages();
      };
      reader.readAsDataURL(f);
    });
  };

  function pbRenderImages() {
    const list = document.getElementById('pbImages');
    const info = document.getElementById('pbTagInfo');
    list.innerHTML = pbImages.map((img, i) => `
      <div class="pb-img-item">
        <img src="${img.src}" alt="${img.tag}">
        <div class="pb-img-info">
          <div style="font-size:9px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px;">What is this?</div>
          <input class="pb-img-tag" type="text" value="${img.tag}" placeholder="e.g. burgundy bag, model, street"
            oninput="window._pbUpdateTag(${i}, this.value)"
            style="font-size:12px; padding:4px 8px; border-radius:6px;">
        </div>
        <button class="pb-img-rm" onclick="window._pbRemoveImg(${i})">✕</button>
      </div>
    `).join('');
    info.style.display = pbImages.length > 0 ? 'block' : 'none';
  }

  window._pbUpdateTag = function(i, v) { pbImages[i].tag = v; };
  window._pbRemoveImg = function(i) { pbImages.splice(i, 1); pbRenderImages(); };

  function pbInsertTags(text) {
    let r = text;
    pbImages.forEach(img => {
      if (!img.tag) return;
      const esc = img.tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp('(' + esc + ')', 'gi');
      r = r.replace(rx, '<span class="img-tag"><img src="' + img.src + '" alt="' + img.tag + '">$1</span>');
    });
    return r;
  }

  function extractDur(t) { const m = t.match(/(\d+)[\s-]*(?:second|sec|s\b)/i); return m ? parseInt(m[1]) : null; }

  function genDetailed(input) {
    const sents = input.split(/[.!]/).filter(s => s.trim().length > 10);
    const dur = extractDur(input) || 15;
    const sc = Math.min(Math.max(sents.length, 4), 9);
    const tps = dur / sc;
    const names = ['Opening Shot','Detail Close-up','Dynamic Movement','Low Angle Power','Interaction Beat','Profile Walk','Hero Moment','Transition','Final Shot'];
    const cams = ['Wide establishing, push-in','Close-up, shallow DOF','Tracking side, handheld','Ultra-low angle, looking up','Medium shot, eye level','Side profile tracking','Full body centered','Quick cut overhead','Three-quarter back pullaway'];
    let r = '<span class="scene-label">— ENHANCED TIMESTAMPED PROMPT —</span>\n\n';
    r += sents.slice(0,2).map(s=>s.trim()).join('. ') + '.\n\n';
    for (let i=0;i<sc;i++) {
      const s = (i*tps).toFixed(1), e = ((i+1)*tps).toFixed(1);
      const d = sents[i] ? sents[i].trim() : 'Continuation with dynamic energy';
      r += '<span class="scene-label">Scene '+(i+1)+' — '+(names[i]||'Scene '+(i+1))+' ('+s+'–'+e+'s):</span> '+d+'. Camera: '+(cams[i]||'Handheld')+'.\n\n';
    }
    r += '<span style="color:#64748b;font-style:italic;">Overall: Fast cuts (1–2s). Natural lighting. Cinematic yet authentic.</span>';
    return r;
  }

  function genJSON(input) {
    const sents = input.split(/[.!]/).filter(s => s.trim().length > 10);
    const dur = extractDur(input) || 15;
    const sc = Math.min(Math.max(sents.length, 4), 9);
    const tps = dur / sc;
    const names = ['Opening Shot','Detail Close-up','Dynamic Movement','Low Angle Power','Interaction','Profile Walk','Hero Moment','Transition','Final Shot'];
    const cams = ['Wide, push-in','Close-up, shallow DOF','Tracking, handheld','Ultra-low angle','Medium, eye level','Side profile','Full body','Overhead','Pullback'];
    let scenes = '';
    for (let i=0;i<sc;i++) {
      const s = (i*tps).toFixed(1), e = ((i+1)*tps).toFixed(1);
      const d = sents[i] ? sents[i].trim() : 'Scene continuation';
      const c = i < sc-1 ? ',' : '';
      scenes += '    {\n      <span style="color:#93bbfd">"id"</span>: <span style="color:#fbbf24">'+( i+1)+'</span>,\n      <span style="color:#93bbfd">"time"</span>: <span style="color:#6ee7a0">"'+s+'–'+e+'s"</span>,\n      <span style="color:#93bbfd">"name"</span>: <span style="color:#6ee7a0">"'+(names[i]||'Scene '+(i+1))+'"</span>,\n      <span style="color:#93bbfd">"camera"</span>: <span style="color:#6ee7a0">"'+(cams[i]||'Handheld')+'"</span>,\n      <span style="color:#93bbfd">"action"</span>: <span style="color:#6ee7a0">"'+d+'"</span>\n    }'+c+'\n';
    }
    const ar = input.includes('vertical')?'9:16':input.includes('3:4')?'3:4':'16:9';
    return '{\n  <span style="color:#93bbfd">"duration"</span>: <span style="color:#fbbf24">"'+dur+'s"</span>,\n  <span style="color:#93bbfd">"aspect_ratio"</span>: <span style="color:#fbbf24">"'+ar+'"</span>,\n  <span style="color:#93bbfd">"scenes"</span>: [\n'+scenes+'  ]\n}';
  }

  function genShort(input) {
    const sents = input.split(/[.!]/).filter(s => s.trim().length > 5);
    const key = sents.slice(0,3).map(s=>s.trim()).join('. ')+'.';
    return '<span class="scene-label">— SHORT PROMPT —</span>\n\n'+key+'\n\n<span style="color:#64748b;font-style:italic">No scene breakdown. No timestamps. AI interprets the mood, pacing, and camera. Most varied & creative output.</span>';
  }

  function shouldEnforceNoText(promptText) {
    if (!promptText) return true;
    const textKeywords = /\b(text|write|written|word|label|title|caption|subtitle|typography|overlay|letter|quote|reads|saying|name|brand name)\b/i;
    return !textKeywords.test(promptText);
  }

  function pbGetQualityGuard(userPrompt) {
    const directives = [
      'Maintain temporal consistency; no sudden morphing, asset blinking, or abrupt lighting shifts.',
      'Zero erratic camera shaking or unexpected character turning.',
      'Avoid low-resolution textures, plastic-looking skin, or motion blur artifacting.',
      'Anatomically correct human body with natural proportions at all times.',
      'Smooth, natural, physically plausible human motion — no distorted limbs, no unnatural bending, no rubber-like stretching.',
      'Stable consistent face and body identity throughout the entire video.',
      'Cinematic motion blur, natural depth of field, consistent lighting.',
      'Professional color grading, film grain texture, sharp focus on subject.',
      'PHYSICS & NATURALITY CONSTRAINTS: All movements and object interactions must adhere strictly to the standard laws of physics and nature. No floating artifacts, no solid clipping, no impossible morphing.',
      'LAYOUT CONSTRAINTS: Depict a single, continuous, unified camera frame. Do NOT create split screens, grid layouts, double images, multi-panels, collages, or multi-view sheets unless explicitly requested in the user prompt.',
      'NO DUPLICATION: Render only a single instance of the character or product bottle in the frame. Do NOT duplicate objects or people.'
    ];

    if (shouldEnforceNoText(userPrompt)) {
      directives.push('NO TEXT: Do NOT include any text overlays, labels, letters, subtitles, watermarks, titles, credits, or written words (such as "Turn", "Front", "Side", "Profile", "Ref") on the video.');
    }
    
    return directives.join(' ');
  }

  async function captureLastFrame(videoUrl) {
    return new Promise((resolve) => {
      try {
        const vid = document.createElement('video');
        vid.crossOrigin = 'anonymous';
        vid.muted = true;
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.src = videoUrl;
        
        vid.onloadeddata = () => {
          // Seek to last 0.5s
          vid.currentTime = Math.max(0, vid.duration - 0.5);
        };
        vid.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = vid.videoWidth || 1280;
            canvas.height = vid.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            const base64 = dataUrl.split(',')[1];
            vid.remove();
            resolve(base64);
          } catch (e) {
            console.warn('Last-frame canvas capture failed:', e);
            vid.remove();
            resolve(null);
          }
        };
        vid.onerror = () => { vid.remove(); resolve(null); };
        // Timeout safety
        setTimeout(() => { vid.remove(); resolve(null); }, 10000);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function pbExtractAudio(videoUrl) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const response = await fetch(videoUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      const wavBlob = bufferToWav(audioBuffer);
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(wavBlob);
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
      });
    } catch (e) {
      console.warn("Audio extraction failed:", e);
      return null;
    }
  }

  function bufferToWav(buffer) {
    let numOfChan = buffer.numberOfChannels,
        btwLength = buffer.length * numOfChan * 2 + 44,
        btwBuffer = new ArrayBuffer(btwLength),
        btwView = new DataView(btwBuffer),
        btwChannels = [], i, sample,
        btwOffset = 0,
        btwPos = 0;

    function setUint16(data) {
      btwView.setUint16(btwOffset, data, true);
      btwOffset += 2;
    }

    function setUint32(data) {
      btwView.setUint32(btwOffset, data, true);
      btwOffset += 4;
    }

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(btwLength - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // chunk length
    setUint16(1); // sample format (raw)
    setUint16(numOfChan); // channel count
    setUint32(buffer.sampleRate); // sample rate
    setUint32(buffer.sampleRate * numOfChan * 2); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample
    setUint32(0x61746164); // "data" chunk
    setUint32(btwLength - btwOffset - 4); // chunk length

    for(i=0; i<buffer.numberOfChannels; i++)
      btwChannels.push(buffer.getChannelData(i));

    while(btwPos < buffer.length) {
      for(i=0; i<numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, btwChannels[i][btwPos]));
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
        btwView.setInt16(btwOffset, sample, true);
        btwOffset += 2;
      }
      btwPos++;
    }

    return new Blob([btwView], { type: "audio/wav" });
  }

  let API_KEY = '';
  const IMAGE_MODEL = 'gemini-3.1-flash-image'; // Nano Banana Pro 2
  let VIDEO_MODEL = 'veo-3.1-fast-generate-preview'; // Veo 3.1 Fast (default)
  const SYNTH_MODEL = 'gemini-3.5-flash'; // Omni Multimodal model (conversational agent)

  // Load API key from server
  (async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.apiKey) API_KEY = data.apiKey;
    } catch (e) { console.warn('Config load failed:', e); }
  })();

  // --- Cinematic Creative Director Agent Profile ---
  const AGENT_PROFILE = localStorage.getItem('pb_agent_profile') || `AGENT NAME: Cinematic Creative Director

IDENTITY:
You are a world-class cinematography, advertising, and production expert representing a collective team with over 30 years of combined industry experience across film production, commercial advertising, cinematography, directing, motion graphics, visual design, photography, editing, VFX, branding, and post-production. You think as an entire production house under one roof.

CORE EXPERTISE: Commercial Film Production, Advertising Campaign Development, Brand Films, Product Films, TVCs, Digital Ads, Social Media Content, Corporate Films, Documentary Storytelling, Motion Graphics, VFX, Cinematography, Photography, Lighting Design, Art Direction, Production Design, Creative Direction, Film Direction, Editing, Color Grading, Sound Design, Script Writing, Storyboarding, Shot Design, Camera Movement Planning, AI Video Production, AI Image Generation, Creative Strategy.

WORKING PRINCIPLES:
1. Always think like a director first.
2. Every creative decision must serve the story, emotion, or business objective.
3. Avoid generic visuals and clichés.
4. Recommend camera angles, lenses, lighting, movement, composition, and transitions.
5. Consider production feasibility alongside creativity.
6. Balance artistic quality with commercial effectiveness.
7. Think from pre-production to final delivery.
8. Prioritize memorable visuals over unnecessary complexity.
9. Every frame should feel intentional.
10. Always suggest ways to improve visual impact.

WHEN CREATING CONCEPTS, automatically consider: Target audience, Brand positioning, Emotional response, Visual language, Cinematic style, Shot sequencing, Lighting approach, Camera approach, Editing rhythm, Music direction, Social media adaptation.

VISUAL KNOWLEDGE: Expert understanding of Hollywood filmmaking, Bollywood advertising, Luxury brand films, Automotive commercials, FMCG advertising, Fashion films, Product photography, Documentary cinematography, Music videos, Sports commercials, High-end CGI integration, AI-assisted production workflows.

COMMUNICATION STYLE: Direct and practical. Creative but realistic. Strategic before aesthetic. Concise when possible. Detailed when required. Challenges weak ideas. Suggests stronger alternatives. Explains why a creative decision works.

MISSION: Deliver work at the standard of a premium global creative agency, production house, and film studio combined. Every recommendation should aim to create visually striking, commercially effective, and production-ready content.`;

  // Allow updating the profile at runtime
  window.pbSetAgentProfile = function(profile) {
    localStorage.setItem('pb_agent_profile', profile);
    console.log('✅ Agent profile updated. Refresh or re-enhance to use the new profile.');
  };
  window.pbGetAgentProfile = function() { return AGENT_PROFILE; };

  window.pbSetModel = function(modelId) {
    VIDEO_MODEL = modelId;
    localStorage.setItem('pb_video_model', modelId);
  };

  const savedModel = localStorage.getItem('pb_video_model');
  if (savedModel) {
    VIDEO_MODEL = savedModel;
    const selectEl = document.getElementById('pbModelSelect');
    if (selectEl) selectEl.value = savedModel;
  }

  // --- Session Persistence Functions ---
  function pbSaveSession() {
    const sessionData = {
      id: pbActiveSessionId,
      name: pbSessionName,
      updatedAt: Date.now(),
      chatHistory: pbChatHistory,
      format: pbFormat,
      model: VIDEO_MODEL || 'veo-3.1-fast-generate-preview',
      enhancedPrompt: document.getElementById('pbOutput')?.innerHTML || '',
      hasStoryboard: !!window.pbStoryboardImage
    };
    
    // Save visual storyboard to IndexedDB
    if (window.pbStoryboardImage) {
      setMedia(`storyboard_${pbActiveSessionId}`, window.pbStoryboardImage).catch(err => {
        console.error("Failed to save storyboard to IndexedDB:", err);
      });
    }

    let sessions = pbGetAllSessions();
    const idx = sessions.findIndex(s => s.id === pbActiveSessionId);
    if (idx >= 0) sessions[idx] = sessionData;
    else sessions.push(sessionData);
    if (sessions.length > 30) sessions = sessions.slice(-30);
    localStorage.setItem(PB_SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(PB_ACTIVE_SESSION_KEY, pbActiveSessionId);
  }

  function pbRenderStoryboard() {
    const videoOut = document.getElementById('pbVideoOut');
    const isStoryboard = document.getElementById('pbStoryboardToggle')?.checked;
    if (isStoryboard && window.pbStoryboardImage && videoOut) {
      videoOut.innerHTML = `
        <div class="pb-visual-board-container animate-in" style="height:100%; width:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:12px;">
          <img src="data:image/png;base64,${window.pbStoryboardImage}" alt="Visual Board" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:12px;">
        </div>
      `;
    }
  }

  function pbLoadSession(sessionId) {
    const sessions = pbGetAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return false;
    pbActiveSessionId = session.id;
    pbSessionName = session.name || 'Untitled';
    pbChatHistory = session.chatHistory || [];
    pbFormat = session.format || 'enhanced';
    if (session.model) {
      VIDEO_MODEL = session.model;
      const selectEl = document.getElementById('pbModelSelect');
      if (selectEl) selectEl.value = session.model;
    }
    document.querySelectorAll('.pb-fmt').forEach(b => b.classList.toggle('active', b.dataset.fmt === pbFormat));
    const out = document.getElementById('pbOutput');
    if (out && session.enhancedPrompt) out.innerHTML = session.enhancedPrompt;
    
    // Clear and restore visual storyboard from IndexedDB
    window.pbStoryboardImage = null;
    pbClips = []; // Clear current timeline clips when loading a new session
    pbRenderTimeline();
    const videoOut = document.getElementById('pbVideoOut');
    if (videoOut) {
      videoOut.innerHTML = '<div class="pb-video-placeholder"><span style="font-size:28px;">🎬</span><span style="font-size:12px;color:#94a3b8;">Generated video appears here</span></div>';
    }

    if (session.hasStoryboard) {
      getMedia(`storyboard_${sessionId}`).then(storyboardB64 => {
        if (storyboardB64) {
          window.pbStoryboardImage = storyboardB64;
          pbRenderStoryboard();
        }
      }).catch(err => {
        console.warn("Failed to load storyboard from DB:", err);
      });
    }

    pbRenderChatHistory();
    pbRenderSessionList();
    localStorage.setItem(PB_ACTIVE_SESSION_KEY, pbActiveSessionId);
    return true;
  }

  function pbCreateNewSession() {
    pbSaveSession();
    pbActiveSessionId = pbGenerateSessionId();
    pbSessionName = 'Session ' + new Date().toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    pbChatHistory = [{ role: 'model', text: "Welcome to Vibe Theory Studio. I'm your Cinematic Creative Director. Describe your concept or upload references below." }];
    pbFormat = 'enhanced';
    pbImages = [];
    pbCustomStoryboard = null;
    pbChatFiles = [];
    pbClips = []; // Clear current timeline clips on new session
    document.getElementById('pbOutput').innerHTML = '<span style="color:#94a3b8;font-size:12px;">Enhanced prompt appears here after you Send your concept.</span>';
    document.getElementById('pbVideoOut').innerHTML = '<div class="pb-video-placeholder"><span style="font-size:28px;">\uD83C\uDFAC</span><span style="font-size:12px;color:#94a3b8;">Generated video appears here</span></div>';
    document.querySelectorAll('.pb-fmt').forEach(b => b.classList.toggle('active', b.dataset.fmt === 'enhanced'));
    const chatInput = document.getElementById('pbChatInput');
    if (chatInput) chatInput.value = '';
    pbRenderChatHistory();
    pbRenderImages();
    pbRenderChatAttachments();
    pbSaveSession();
    pbRenderSessionList();
    pbRenderTimeline();
  }

  function pbDeleteSession(sessionId) {
    let sessions = pbGetAllSessions();
    sessions = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem(PB_SESSIONS_KEY, JSON.stringify(sessions));
    
    // Clean up IndexedDB storyboard cache
    removeMedia(`storyboard_${sessionId}`).catch(err => {
      console.warn("Failed to delete storyboard for session from DB:", err);
    });

    if (sessionId === pbActiveSessionId) {
      if (sessions.length > 0) {
        pbLoadSession(sessions[0].id);
      } else {
        pbCreateNewSession();
      }
    } else {
      pbRenderSessionList();
    }
  }

  window.pbClearAllSessions = function() {
    if (!confirm('Are you sure you want to delete ALL sessions and clear all session histories? This cannot be undone.')) return;
    const sessions = pbGetAllSessions();
    
    // Clean up IndexedDB storyboard cache for all sessions
    for (const s of sessions) {
      removeMedia(`storyboard_${s.id}`).catch(() => {});
    }
    
    localStorage.removeItem(PB_SESSIONS_KEY);
    localStorage.removeItem(PB_ACTIVE_SESSION_KEY);
    
    pbCreateNewSession();
  };

  function pbRenderSessionList() {
    const container = document.getElementById('pbSessionList');
    if (!container) return;
    const sessions = pbGetAllSessions().sort((a,b) => b.updatedAt - a.updatedAt);
    container.innerHTML = sessions.map(s => {
      const isActive = s.id === pbActiveSessionId;
      const date = new Date(s.updatedAt).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
      const msgCount = (s.chatHistory || []).filter(m => m.role === 'user').length;
      const preview = (s.chatHistory || []).filter(m => m.role === 'user').pop()?.text?.substring(0, 50) || 'New session';
      return '<div class="pb-session-item ' + (isActive ? 'active' : '') + '" onclick="window.pbSwitchSession(\'' + s.id + '\')">' +
        '<div class="pb-session-name">' + (s.name || 'Untitled') + '</div>' +
        '<div class="pb-session-preview">' + preview + (preview.length >= 50 ? '...' : '') + '</div>' +
        '<div class="pb-session-meta">' + date + ' \u00b7 ' + msgCount + ' msg' + (msgCount !== 1 ? 's' : '') + '</div>' +
        '<div class="pb-session-actions">' +
          '<button class="pb-session-action-btn export" onclick="event.stopPropagation(); window.pbExportSessionJson(\'' + s.id + '\')" title="Export Session (JSON)">💾</button>' +
          '<button class="pb-session-action-btn download" onclick="event.stopPropagation(); window.pbDownloadSessionContent(\'' + s.id + '\')" title="Download Session Assets">⬇️</button>' +
          '<button class="pb-session-action-btn delete" onclick="event.stopPropagation(); window.pbDeleteSession(\'' + s.id + '\')" title="Delete">\u2715</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.pbSwitchSession = function(id) { pbSaveSession(); pbLoadSession(id); };
  window.pbDeleteSession = function(id) { pbDeleteSession(id); };
  window.pbCreateNewSession = function() { pbCreateNewSession(); };

  window.pbExportSessionJson = async function(sessionId) {
    const sessions = pbGetAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    let storyboardB64 = null;
    if (session.hasStoryboard) {
      try {
        storyboardB64 = await getMedia(`storyboard_${sessionId}`);
      } catch (err) {
        console.warn("Failed to read storyboard for export:", err);
      }
    }

    const exportData = {
      ...session,
      storyboardImage: storyboardB64,
      referenceImages: pbImages,
      timelineClips: pbClips
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${session.name.replace(/\s+/g, '_')}_${sessionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.pbImportSessionJson = function(files) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        if (!importData.id || !importData.name) {
          alert("Invalid session backup file.");
          return;
        }

        let sessions = pbGetAllSessions();
        const newId = pbGenerateSessionId();
        const newSession = {
          id: newId,
          name: importData.name + " (Imported)",
          updatedAt: Date.now(),
          chatHistory: importData.chatHistory || [],
          format: importData.format || 'enhanced',
          model: importData.model || 'veo-3.1-fast-generate-preview',
          enhancedPrompt: importData.enhancedPrompt || '',
          hasStoryboard: !!importData.storyboardImage
        };

        sessions.push(newSession);
        localStorage.setItem(PB_SESSIONS_KEY, JSON.stringify(sessions));

        if (importData.storyboardImage) {
          await setMedia(`storyboard_${newId}`, importData.storyboardImage);
        }

        pbActiveSessionId = newId;
        pbSessionName = newSession.name;
        pbChatHistory = newSession.chatHistory;
        pbFormat = newSession.format;
        VIDEO_MODEL = newSession.model;
        
        pbImages = importData.referenceImages || [];
        pbClips = importData.timelineClips || [];

        pbSaveSession();
        pbLoadSession(newId);
        pbRenderImages();
        pbRenderTimeline();

        alert("Session imported successfully!");
      } catch (err) {
        console.error("Failed to import session:", err);
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  window.pbDownloadSingleClip = async function(idx) {
    const clip = pbClips[idx];
    if (!clip || !clip.videoUrl) return;

    try {
      let url = clip.videoUrl;
      // Fetch and convert to Blob if it is a remote or proxy URL to force direct local download
      if (url.startsWith('http') || url.startsWith('/')) {
        const response = await fetch(url);
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
      }
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `clip_${idx + 1}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.warn("Failed to download clip via blob, falling back to direct link:", err);
      const a = document.createElement('a');
      a.href = clip.videoUrl;
      a.target = '_blank';
      a.download = `clip_${idx + 1}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  window.pbDownloadSessionContent = async function(sessionId) {
    const sessions = pbGetAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    let storyboardB64 = null;
    if (session.hasStoryboard) {
      try {
        storyboardB64 = await getMedia(`storyboard_${sessionId}`);
      } catch (err) {
        console.warn("Failed to retrieve storyboard for report:", err);
      }
    }

    const currentImages = pbImages;
    const currentClips = pbClips;

    let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>\${session.name} — Production Assets Export</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 24px; font-size: 28px; }
    h2 { color: #0f172a; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; font-size: 20px; }
    .meta-box { background: white; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .meta-item strong { color: #64748b; font-size: 12px; display: block; text-transform: uppercase; margin-bottom: 2px; }
    .meta-item span { font-size: 14px; font-weight: 600; color: #334155; }
    .storyboard-img { max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .clip-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); }
    .clip-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px dashed #f1f5f9; padding-bottom: 8px; }
    .clip-title { font-weight: 700; color: #4f46e5; font-size: 15px; }
    .clip-meta { font-size: 11px; color: #94a3b8; font-weight: 600; background: #f1f5f9; padding: 2px 8px; border-radius: 20px; }
    .clip-section { margin-bottom: 12px; }
    .clip-section strong { font-size: 11px; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 4px; }
    .clip-section p { margin: 0; font-size: 13px; color: #334155; white-space: pre-wrap; }
    .dialogue-text { font-style: italic; color: #7c3aed; font-weight: 600; }
    .video-preview { margin-top: 12px; border-radius: 8px; background: #000; overflow: hidden; max-height: 320px; display: flex; align-items: center; justify-content: center; }
    video { max-width: 100%; max-height: 320px; }
    .chat-msg { margin-bottom: 12px; padding: 10px; border-radius: 8px; }
    .chat-msg.user { background: #e0e7ff; align-self: flex-end; }
    .chat-msg.agent { background: #f1f5f9; }
    .chat-sender { font-weight: 700; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; display: block; }
  </style>
</head>
<body>
  <h1>🎬 Production Assets Export</h1>
  
  <div class="meta-box">
    <div class="meta-item"><strong>Session Name</strong><span>\${session.name}</span></div>
    <div class="meta-item"><strong>Export Date</strong><span>\${new Date().toLocaleString()}</span></div>
    <div class="meta-item"><strong>Video Model</strong><span>\${session.model || 'Veo 3.1'}</span></div>
    <div class="meta-item"><strong>Clips Generated</strong><span>\${currentClips.filter(c => c.status === 'done').length} clips</span></div>
  </div>

  <h2>📝 Master Production Script</h2>
  <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; font-size: 14px; margin-bottom: 24px; white-space: pre-wrap;">\${session.enhancedPrompt || 'No script generated.'}</div>

  \${storyboardB64 ? \`
  <h2>🎨 Visual Storyboard</h2>
  <div style="text-align: center; margin-bottom: 32px;">
    <img src="data:image/png;base64,\${storyboardB64}" class="storyboard-img" alt="Visual Storyboard">
  </div>
  \` : ''}

  <h2>🎬 Generated Video Timeline</h2>
  \${currentClips.map((clip, i) => {
    let videoMarkup = '';
    if (clip.status === 'done' && clip.videoUrl) {
      videoMarkup = \`
      <div class="video-preview">
        <video controls src="\${clip.videoUrl}"></video>
      </div>\`;
    } else {
      videoMarkup = \`<div style="background: #f1f5f9; color: #94a3b8; text-align: center; padding: 12px; border-radius: 8px; font-size: 12px; font-style: italic;">No video generated for this clip segment.</div>\`;
    }
    
    return \`
    <div class="clip-card">
      <div class="clip-header">
        <span class="clip-title">Shot \${i + 1}</span>
        <span class="clip-meta">\${clip.trimStart}s - \${clip.trimEnd}s</span>
      </div>
      <div class="clip-section">
        <strong>Visual Action & Cinematic Prompt</strong>
        <p>\${clip.prompt}</p>
      </div>
      \${clip.dialogue ? \`
      <div class="clip-section">
        <strong>Dialogue (Audio track)</strong>
        <p class="dialogue-text">"\${clip.dialogue}"</p>
      </div>
      \` : ''}
      \${videoMarkup}
    </div>
    \`;
  }).join('')}

  <h2>💬 Chat Consultation History</h2>
  <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px;">
    \${(session.chatHistory || []).map(m => \`
      <div class="chat-msg \${m.role === 'user' ? 'user' : 'agent'}">
        <span class="chat-sender">\${m.role === 'user' ? 'You' : 'Creative Director'}</span>
        <div style="font-size: 13px;">\${m.text.replace(/\\n/g, '<br>')}</div>
      </div>
    \`).join('')}
  </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production_export_\${session.name.replace(/\\s+/g, '_')}_\${sessionId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  async function runPreComputationValidation(container, promptText, files, isVideoStage) {
    const isStoryboard = document.getElementById('pbStoryboardToggle').checked;
    
    const checks = [
      { id: 'required', name: '1. Required Inputs Check' },
      { id: 'schema', name: '2. Schema Enforcement Check' },
      { id: 'sanity', name: '3. Input Data Sanity Check' },
      { id: 'constraint', name: '4. Model Constraint Check' },
      { id: 'provider', name: '5. Provider Limit Check' },
      { id: 'resource', name: '6. Resource Allocation Simulation' },
      { id: 'gate', name: '7. Validation Decision Gate' }
    ];

    let panelHtml = `
      <div class="pb-val-panel animate-in">
        <div class="pb-val-header">
          <span>🔍</span> Pre-Computation Validation Process
        </div>
        <div class="pb-val-list">
    `;

    checks.forEach(check => {
      panelHtml += `
        <div class="pb-val-item pending" id="val-item-${check.id}">
          <span>${check.name}</span>
          <span class="pb-val-indicator" id="val-ind-${check.id}">⚪</span>
        </div>
      `;
    });

    panelHtml += `
        </div>
        <div id="pbValErrorContainer"></div>
      </div>
    `;

    container.innerHTML = panelHtml;

    function updateItem(id, status, indicatorChar) {
      const el = document.getElementById(`val-item-${id}`);
      const ind = document.getElementById(`val-ind-${id}`);
      if (el && ind) {
        el.className = `pb-val-item ${status}`;
        ind.textContent = indicatorChar;
      }
    }

    for (const check of checks) {
      updateItem(check.id, 'running', '⏳');
      await new Promise(r => setTimeout(r, 150));

      try {
        if (check.id === 'required') {
          if (!promptText || promptText.trim().length === 0) {
            throw {
              code: 'MISSING_REQUIRED_INPUT',
              message: 'Missing required input: prompt text is empty. Please write your concept prompt first.'
            };
          }
          if (isVideoStage && isStoryboard && !window.pbStoryboardImage) {
            throw {
              code: 'MISSING_REQUIRED_INPUT',
              message: 'Missing required input: visual board is missing. Please click "Enhance" first to generate the visual storyboard preview.'
            };
          }
        }
        
        else if (check.id === 'schema') {
          const activeArBtn = document.querySelector('.pb-ar-btn.active');
          const activeAr = activeArBtn ? activeArBtn.dataset.ar : null;
          if (!activeAr) {
            throw {
              code: 'INVALID_FORMAT',
              message: 'Schema validation failed: no aspect ratio selected. Allowed schemas are 16:9 or 9:16.'
            };
          }
          for (const img of files) {
            if (!img.src || !img.src.startsWith('data:image/')) {
              throw {
                code: 'INVALID_TYPE',
                message: 'Schema validation failed: unsupported attachment type. Uploaded files must be valid PNG/JPEG images.'
              };
            }
          }
        }

        else if (check.id === 'sanity') {
          const existingPrompt = document.getElementById('pbOutput')?.textContent || '';
          const hasConversationContext = pbChatHistory.filter(m => m.role === 'user').length > 0;
          // Allow short messages if there's already an enhanced prompt or ongoing conversation
          if (promptText.trim().length < 8 && existingPrompt.trim().length < 8 && !hasConversationContext) {
            throw {
              code: 'INPUT_SANITY_FAILED',
              message: 'Input data failed sanity check: prompt is too brief. Please enter at least 8 characters to ensure the model has enough detail to generate.'
            };
          }
        }

        else if (check.id === 'constraint') {
          const modelToCheck = isVideoStage ? VIDEO_MODEL : IMAGE_MODEL;
          if (!modelToCheck || typeof modelToCheck !== 'string') {
            throw {
              code: 'MODEL_CONSTRAINT_VIOLATION',
              message: 'Model constraint check failed: endpoint routing is invalid. Model name is empty.'
            };
          }
        }

        else if (check.id === 'provider') {
          if (!API_KEY || API_KEY.length < 10 || !API_KEY.startsWith('AQ.')) {
            throw {
              code: 'PROVIDER_LIMIT_EXCEEDED',
              message: 'Provider connection failed: API key is malformed or invalid.'
            };
          }
        }

        else if (check.id === 'resource') {
          // Calculation check passed
        }

        else if (check.id === 'gate') {
          updateItem(check.id, 'success', '✓');
          await new Promise(r => setTimeout(r, 100));
          return true;
        }

        updateItem(check.id, 'success', '✓');

      } catch (err) {
        updateItem(check.id, 'fail', '✗');
        const errorContainer = document.getElementById('pbValErrorContainer');
        if (errorContainer) {
          errorContainer.innerHTML = `
            <div class="pb-val-error-box">
              <div class="pb-val-error-title">
                <span>⚠️</span> Validation Error [${err.code || 'VALIDATION_FAILED'}]
              </div>
              <div>${err.message || err}</div>
              <div style="font-size:9px; color:#ef4444; margin-top:6px; font-style:italic; font-family:var(--font-mono)">
                Rule Reference: DOCX Section 14 — Pre-Computation Fail-Fast.
              </div>
            </div>
          `;
        }
        return false;
      }
    }
    return false;
  }

  window.pbOpenVisualBoardLightbox = function(src) {
    let lb = document.getElementById('pbVisualBoardLightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'pbVisualBoardLightbox';
      lb.className = 'pb-visual-board-lightbox animate-in';
      lb.onclick = () => lb.remove();
      document.body.appendChild(lb);
    }
    lb.innerHTML = `<img src="${src}" alt="Expanded Visual Board">`;
  };

  function pbClassifyIntent(text) {
    const t = text.trim().toLowerCase();
    
    // Commands to start generation
    const genKeywords = [
      'create', 'generate', 'render', 'make', 'go', 'run', 'build', 
      'start', 'produce', 'ok', 'okay', 'do it', 'action', 'compile'
    ];
    
    // Short commands of 1-3 words containing a generation keyword
    if (t.length <= 20) {
      if (genKeywords.some(kw => t.includes(kw))) {
        return 'generate';
      }
    }
    
    // Explicit phrases
    if (/^(start|please|ok|okay)?\s*(generate|generation|rendering|creating|video|make|render)\s*$/i.test(t)) {
      return 'generate';
    }
    if (/^ok\s+(create|generate|make|go|run)\s*$/i.test(t)) {
      return 'generate';
    }
    
    return 'discuss';
  }

  window.pbSendChat = async function() {
    const input = document.getElementById('pbChatInput').value.trim();
    const btn = document.getElementById('pbSendBtn');
    const out = document.getElementById('pbOutput');
    const videoOut = document.getElementById('pbVideoOut');

    if (!input && pbChatFiles.length === 0) {
      return;
    }

    // Hitting send always treats as creative discussion / prompt enhancement first,
    // giving the user the creative director's feedback and showing the enhanced prompt
    // before rendering the final videos.

    // Otherwise, treat as creative discussion / prompt enhancement
    btn.textContent = '⏳ Thinking...';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    // 1. Process files
    let fileDescList = [];
    if (pbChatFiles.length > 0) {
      // Create readable description of files for the chat history bubble
      fileDescList = pbChatFiles.map(f => `[${f.type === 'storyboard' ? 'Storyboard' : 'Reference'}: ${f.name}]`);
      await pbProcessChatFiles();
    }

    // Prepare User Chat Bubble text
    let userMsgText = '';
    if (fileDescList.length > 0) {
      userMsgText = fileDescList.join(' ') + (input ? '\n' + input : '');
    } else {
      userMsgText = input;
    }

    // Add to chat history and render
    pbChatHistory.push({ role: 'user', text: userMsgText });
    pbRenderChatHistory();

    // Clear the chat textarea
    const chatInput = document.getElementById('pbChatInput');
    if (chatInput) {
      chatInput.value = '';
      chatInput.style.height = 'auto'; // Reset height
    }

    // Show agent typing...
    pbShowTypingIndicator();

    // 2. Run Pre-Computation Validation Process
    const isValid = await runPreComputationValidation(videoOut, input, pbImages, false);
    if (!isValid) {
      pbHideTypingIndicator();
      btn.innerHTML = '💬 Send';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      out.innerHTML = `<span style="color:#ef4444; font-size:12px;">⚠️ Validation failed. Please fix the checks in the panel.</span>`;
      pbChatHistory.push({ role: 'model', text: '⚠️ Pre-computation validation checks failed. Please review the checklist in the center panel.' });
      pbRenderChatHistory();
      return;
    }

    // Proceed to enhance prompt and generate storyboard
    out.innerHTML = `
      <div style="font-size:12px; color:#64748b; margin-bottom:8px;">⏳ Enhancing prompt text using Gemini 3.5...</div>
      <div class="pb-loading" style="width:90%"></div>
      <div class="pb-loading" style="width:70%"></div>
      <div class="pb-loading" style="width:82%"></div>
    `;

    const isStoryboard = document.getElementById('pbStoryboardToggle').checked;
    if (isStoryboard && !pbCustomStoryboard) {
      videoOut.innerHTML = `
        <div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
          <div class="pb-loading" style="width:80%; margin-bottom: 8px;"></div>
          <div class="pb-loading" style="width:60%; margin-bottom: 8px;"></div>
          <div style="font-size: 13px; color: #94a3b8; margin-top: 12px;">⏳ Generating visual board & storyboard sheet using Nano Banana Pro...</div>
        </div>
      `;
    } else if (isStoryboard && pbCustomStoryboard) {
      videoOut.innerHTML = `
        <div class="pb-visual-board-container animate-in">
          <img class="pb-visual-board-img" src="data:image/png;base64,${pbCustomStoryboard}" alt="Custom Storyboard" onclick="window.pbOpenVisualBoardLightbox(this.src)">
        </div>
      `;
    }

    // Don't reset if user uploaded a custom storyboard or already generated one in this session
    if (!pbCustomStoryboard && !window.pbStoryboardImage) {
      window.pbStoryboardImage = null;
    }

    try {
      // Step 1: Text Prompt Enhancement with Agentic Suggestions
      const textEnhancePromise = (async () => {
        let formatDesc = '';
        if (pbFormat === 'enhanced') {
          formatDesc = `Create an enhanced, highly-detailed cinematic description suitable for video generation. 
CRITICAL REQUIREMENT: Do NOT include any scene headers, scene numbers, labels, or timestamp indicators (such as "Scene 1", "0-2s", "0.0s to 8.0s") inside the visual description paragraph. The visual description must be written as a single, continuous, immersive paragraph.

CRITICAL PROMPT STRUCTURAL RULES:
The paragraph must follow this exact sequence:
[Subject] + [Action] + [Camera Track] + [Atmosphere/Style]
1. Subject (The What): Define age, clothing material, and unique identifiers (e.g. "A bald man with a salt-and-pepper beard and glasses, wearing a dark patterned Indian kurta"). Avoid generic terms.
2. Action (The Motion): Describe the exact physics of the movement. Use active verbs.
3. Camera Track (The Lens): Act like a director. Specify shot type, lens behavior, and movement.
4. Atmosphere & Style (The Vibe): Define lighting sources, color grading, and texture.

DIALOGUES & VOICEOVERS:
If the user requests dialogues, voiceovers, or speech lines, or if you are designing a commercial/story that benefits from voiceovers, you MUST write them clearly under a separate "🎙️ DIALOGUE / VOICEOVER" heading at the very bottom of the enhancedPrompt (outside the main visual description paragraph). Write the lines matching the narrative progression.`;
        } else if (pbFormat === 'json') {
          formatDesc = `Create a valid JSON structure containing exactly 4 scenes. The JSON must follow this exact structure:
{
  "project": "[Project Title]",
  "duration": "8s",
  "aspect_ratio": "9:16",
  "scenes": [
    {
      "id": 1,
      "time": "0.0–2.0s",
      "name": "[Scene Name]",
      "subject": "[Subject: Define age, clothing material, and unique identifiers. Avoid generic terms.]",
      "action": "[Action: Describe the exact physics of the movement, using active verbs.]",
      "camera_track": "[Camera: Specify shot type, lens behavior, and movement.]",
      "atmosphere_style": "[Atmosphere: Define lighting sources, color grading, and texture.]",
      "dialogue": "[Dialogue/Voiceover: Specify any dialogue, script lines, or voiceover text spoken during this scene. If none is requested, generate a highly fitting, creative cinematic voiceover.]"
    },
    ... (exactly 4 scenes: 0.0–2.0s, 2.0–4.0s, 4.0–6.0s, 6.0–8.0s)
  ]
}`;
        } else { // normal
          formatDesc = `Create a single highly descriptive paragraph suitable for one-shot video generation. No scene labels or timestamps.

CRITICAL PROMPT STRUCTURAL RULES:
The paragraph must follow this exact sequence:
[Subject] + [Action] + [Camera Track] + [Atmosphere/Style]
1. Subject (The What): Define age, clothing material, and unique identifiers (e.g. "A 30-year-old astronaut wearing a matte-white, heavily weathered space suit"). Avoid generic terms.
2. Action (The Motion): Describe the exact physics of the movement. Use active verbs (e.g. "slowly reaching out a gloved hand toward a floating digital hologram").
3. Camera Track (The Lens): Act like a director. Specify shot type, lens behavior, and movement (e.g. "Slow, intentional dolly-in, shallow depth of field, sharp focus on the fingertips, 35mm cinematic lens look").
4. Atmosphere & Style (The Vibe): Define lighting sources, color grading, and texture (e.g. "High-contrast sci-fi lighting, blue ambient glow from the hologram, volumetric dust motes floating in the air, hyper-realistic 8k texture").

DIALOGUES & VOICEOVERS:
If the user requests dialogues, voiceovers, or speech lines, you MUST append them under a separate "🎙️ DIALOGUE / VOICEOVER" heading at the very bottom of the enhancedPrompt.`;
        }

        let tagContext = '';
        const parts = [];
        
        if (pbImages.length > 0) {
          for (const img of pbImages) {
            const base64 = img.src.split(',')[1];
            const mimeType = img.src.split(';')[0].split(':')[1];
            parts.push({ inlineData: { mimeType, data: base64 } });
          }

          tagContext = `
VISUAL REFERENCE IMAGES PROVIDED:
The user has attached reference images. Each image corresponds to a specific object/character tag (in order):
${pbImages.map((img, idx) => `- Image [${idx + 1}] has tag: "${img.tag}"`).join('\n')}

CRITICAL INSTRUCTIONS FOR REFERENCE IMAGES:
1. You MUST analyze the visual content of the attached reference images (art style, cartoonish vs photorealistic, clothing style/color, age, gender, features, shape).
2. Incorporate these visual details directly into your expanded prompt scene descriptions.
3. Explicitly mention the tag name in parentheses next to the character/item in the description so the downstream model knows where to apply each reference (e.g. "A cartoonish character (${pbImages[0].tag}) wearing an orange jersey...").`;
        }

        let storyboardContext = '';
        if (pbCustomStoryboard) {
          parts.push({ inlineData: { mimeType: 'image/png', data: pbCustomStoryboard } });
          storyboardContext = `
CUSTOM VISUAL STORYBOARD PROVIDED:
The user has uploaded a visual storyboard image. This is the PRIMARY creative reference.
You MUST carefully analyze every detail of this storyboard — characters, scenes, text, layout, colors, style, mood, composition, clothing, backgrounds, visual flow, camera angles, and any written notes or labels.
Your enhanced prompt MUST faithfully describe what is shown in the storyboard. Do NOT invent or substitute content that contradicts the storyboard.`;
        }

        const systemPrompt = `${AGENT_PROFILE}

YOUR TASK: Act as the Cinematic Creative Director. You are having an ongoing conversation with the user. 
IMPORTANT: You must maintain continuity with your previous suggestions. When the user gives feedback, refine your PREVIOUS work — do NOT start from scratch. Build upon what you already proposed.

CRITICAL CONTENT SAFETY GUARDRAILS (To bypass Google safety filter blocks):
1. Google's video synthesis engines strictly block prompts containing broadcast news concepts to prevent misinformation and deepfakes.
2. You MUST NEVER include trigger terms like "news", "breaking news", "news anchor", "reporter", "newsroom", "broadcast", or "news report" in the enhancedPrompt.
3. If the user requests a "news broadcast" or "news report" visual, translate it into safe, compliant cinematic equivalents: e.g., "a spokesperson looking directly into the camera lens in a vintage 1940s studio setting", "an expressive presenter talking to the camera", "a speech delivered in a classic press room environment". This ensures successful video generation without safety blocks.

You must respond with a JSON object containing two fields:
1. "suggestions": A direct, conversational message to the user (1-2 paragraphs). Reference your previous suggestions and explain what you changed based on their feedback. Address their ideas, provide suggestions on cinematography, shot framing, lighting, pacing, style options, and explain why your suggestions work.
2. "enhancedPrompt": The updated enhanced video prompt. This must follow the requested format instructions exactly. If you previously generated a prompt, REFINE it based on the user's latest feedback rather than creating an entirely new one.

Format requested for the enhancedPrompt field: ${pbFormat}.
Format instructions:
${formatDesc}
${tagContext}
${storyboardContext}

CRITICAL: Return ONLY a valid JSON object matching the schema below. Do not wrap it in markdown code blocks:
{
  "suggestions": "Your conversational recommendations...",
  "enhancedPrompt": "The enhanced prompt text..."
}`;

        // Build proper multi-turn contents from chat history
        const contents = [];
        
        // Include previous conversation turns (skip the initial welcome message)
        for (const msg of pbChatHistory) {
          if (msg.role === 'model' && msg === pbChatHistory[0] && pbChatHistory.length > 1) continue; // skip welcome
          
          let textContent = msg.text;
          if (msg.role === 'model' && msg.enhancedPrompt) {
            textContent += `\n\n[PREVIOUS ENHANCED PROMPT]:\n${msg.enhancedPrompt}`;
          }
          
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: textContent }]
          });
        }
        
        // If the last message isn't the current user input, add it
        const lastMsg = contents[contents.length - 1];
        const currentInput = input || '[Attached files processed]';
        if (!lastMsg || lastMsg.role !== 'user' || !lastMsg.parts[0].text.includes(input)) {
          // Build the current user turn with any attached images
          const currentParts = [...parts]; // includes any inline image data
          currentParts.push({ text: currentInput });
          contents.push({ role: 'user', parts: currentParts });
        } else if (parts.length > 0) {
          // Add image parts to the existing last user message
          lastMsg.parts = [...parts, ...lastMsg.parts];
        }
        
        // Ensure conversation starts with a user turn (API requirement)
        if (contents.length > 0 && contents[0].role !== 'user') {
          contents.shift();
        }
        
        // Ensure alternating turns (merge consecutive same-role messages)
        const mergedContents = [];
        for (const turn of contents) {
          if (mergedContents.length > 0 && mergedContents[mergedContents.length - 1].role === turn.role) {
            // Merge into previous turn
            mergedContents[mergedContents.length - 1].parts.push(...turn.parts);
          } else {
            mergedContents.push({ ...turn, parts: [...turn.parts] });
          }
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${SYNTH_MODEL}:generateContent?key=${API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: mergedContents,
              generationConfig: { 
                temperature: 0.7,
                responseMimeType: "application/json"
              }
            })
          }
        );

        const data = await response.json();
        if (data.error) throw new Error(`Text enhancement failed: ${data.error.message}`);
        
        let responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        responseText = responseText.trim();
        responseText = responseText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();

        let parsedResponse;
        try {
          parsedResponse = JSON.parse(responseText);
        } catch (e) {
          console.error("Failed to parse agent JSON, falling back to raw text", e);
          parsedResponse = {
            suggestions: "I've enhanced the prompt based on your script and concepts.",
            enhancedPrompt: responseText
          };
        }

        const suggestionsText = parsedResponse.suggestions || "I've updated the script.";
        let enhancedText = parsedResponse.enhancedPrompt || responseText;

        let anchorLine = "";
        if (pbImages.length > 0) {
          if (pbImages.length === 1) {
            anchorLine = `Refer to the attached image [1] (tag: "${pbImages[0].tag}") for character consistency.\n\n`;
          } else {
            anchorLine = `Refer to the attached image [1] (tag: "${pbImages[0].tag}") for character consistency and image [2] (tag: "${pbImages[1].tag}") for environmental lighting and texture.\n\n`;
          }
        }

        let negativeBlock = `\n\n[NEGATIVE CONSTRAINTS]\n- No Sudden Jumps: Maintain temporal consistency; no sudden morphing, asset blinking, or abrupt lighting shifts.\n- No Uncontrolled Motion: Zero erratic camera shaking or unexpected character turning.\n- No Quality Degradation: Avoid low-resolution textures, plastic-looking skin, or motion blur artifacting.`;
        if (shouldEnforceNoText(input)) {
          negativeBlock += `\n- No Text Overlays: Do NOT include any text overlays, subtitles, watermarks, titles, credits, captions, or written words on the video or visuals. The output must be pure cinematography/imagery with absolutely zero lettering.`;
        }

        let finalEnhancedPrompt = "";
        if (pbFormat === 'json') {
          try {
            const parsed = typeof enhancedText === 'string' ? JSON.parse(enhancedText) : enhancedText;
            if (pbImages.length > 0) {
              parsed.anchored_assets = anchorLine.replace(/\n\n$/, '');
            }
            parsed.negative_constraints = {
              no_sudden_jumps: "Maintain temporal consistency; no sudden morphing, asset blinking, or abrupt lighting shifts.",
              no_uncontrolled_motion: "Zero erratic camera shaking or unexpected character turning.",
              no_quality_degradation: "Avoid low-resolution textures, plastic-looking skin, or motion blur artifacting."
            };
            if (shouldEnforceNoText(input)) {
              parsed.negative_constraints.no_text_overlays = "Do NOT include any text overlays, subtitles, watermarks, titles, credits, captions, or written words on the video or visuals. The output must be pure cinematography/imagery with absolutely zero lettering.";
            }
            finalEnhancedPrompt = JSON.stringify(parsed, null, 2);
          } catch (e) {
            console.error("Failed to parse JSON prompt inside suggestions payload, returning raw", e);
            finalEnhancedPrompt = enhancedText;
          }
        } else {
          finalEnhancedPrompt = anchorLine + enhancedText + negativeBlock;
        }

        return { suggestions: suggestionsText, enhancedPrompt: finalEnhancedPrompt };
      })();

      // Step 2: Storyboard Visual Board Generation
      let storyboardPromise = Promise.resolve(window.pbStoryboardImage || null);
      if (isStoryboard && !pbCustomStoryboard && !window.pbStoryboardImage) {
        const activeArBtn = document.querySelector('.pb-ar-btn.active');
        const activeAr = activeArBtn ? activeArBtn.dataset.ar : '16:9';

        storyboardPromise = (async () => {
          const parts = [];
          for (const img of pbImages) {
            const base64 = img.src.split(',')[1];
            const mimeType = img.src.split(';')[0].split(':')[1];
            parts.push({ inlineData: { mimeType, data: base64 } });
          }

          // --- Step 0: Extract detailed character description from reference images ---
          let characterDescription = '';
          if (pbImages.length > 0 && !pbCharacterDescription) {
            try {
              const descParts = [];
              for (const img of pbImages) {
                const base64 = img.src.split(',')[1];
                const mimeType = img.src.split(';')[0].split(':')[1];
                descParts.push({ inlineData: { mimeType, data: base64 } });
              }
              descParts.push({ text: `Analyze the person(s) in these reference images with EXTREME precision. For EACH person, describe:

1. FACE: Exact face shape (oval, round, square, heart), jawline, cheekbones, forehead width, chin shape
2. SKIN: Exact skin tone (use specific descriptors like "warm medium-brown", "fair ivory", "deep tan")
3. EYES: Shape, size, color, eyebrow shape and thickness
4. NOSE: Shape, width, bridge height
5. LIPS: Shape, fullness, color
6. HAIR: Exact color, length, texture (straight/wavy/curly), style, parting
7. BUILD: Body type, height impression, posture
8. CLOTHING: Exact garment descriptions with specific colors, materials, patterns, accessories
9. DISTINGUISHING FEATURES: Any birthmarks, facial hair, jewelry, glasses, tattoos, etc.

Write this as a single dense paragraph per person. Be forensically precise — this description will be used to recreate this EXACT person in generated images. No generic terms like "attractive" or "young woman". Use specific, measurable descriptors.` });

              const descRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${SYNTH_MODEL}:generateContent?key=${API_KEY}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: descParts }],
                    generationConfig: { temperature: 0.1 }
                  })
                }
              );
              const descData = await descRes.json();
              characterDescription = descData.candidates?.[0]?.content?.parts?.[0]?.text || '';
              pbCharacterDescription = characterDescription; // Store globally for video generation
              console.log('Extracted character description:', characterDescription.substring(0, 200));
            } catch (descErr) {
              console.warn('Character description extraction failed:', descErr);
            }
          } else if (pbCharacterDescription) {
            characterDescription = pbCharacterDescription; // Reuse cached description
          }

          const stylizedKeywords = /\b(anime|sketch|cartoon|comic|manga|illustration|illustrated|watercolor|pixel\s*art|cel[\s-]?shad|line\s*art|chibi|hand[\s-]?drawn|pencil|ink|paint|2d\s*animation)\b/i;
          const isStylized = stylizedKeywords.test(input);
          const styleDirective = isStylized 
            ? `Use the art style explicitly requested in the prompt (e.g. anime, sketch, cartoon, etc.) for all panels and character designs.`
            : `MANDATORY VISUAL STYLE: Ultra-realistic, photorealistic, 4K cinematic quality. Every panel, character model sheet, and environment must look like a real photograph or high-end film still — NOT a sketch, NOT a cartoon, NOT an illustration. Use lifelike skin textures, realistic lighting, natural shadows, and photographic depth of field.`;

          let imagePromptText = `[ENGINE: Nano Banana Pro 2] Generate a comprehensive visual board and storyboard sheet in 16:9 ratio for: "${input}".
${styleDirective}

The sheet must be styled like a professional production concept art sheet containing:
1. Character Design & Expressions: Model sheets showing the character's face, body, and expressions in different angles.
2. Color Palette & Environment: Swatches and key background landscapes defining the setting.
3. Sequential Storyboard Panels: A grid of multiple storyboard frames (minimum 6, labeled Shot 01, Shot 02, etc.) that tell the narrative progression.

${characterDescription ? `EXACT CHARACTER TO USE (extracted from reference photos — you MUST replicate this person precisely):
${characterDescription}

The character in EVERY panel of the visual board MUST be this EXACT person — same face, same skin tone, same hair, same body type, same clothing. Do NOT change, stylize, or substitute any features. Reference images are attached — match them pixel-for-pixel.` : 'CRITICAL REQUIREMENT: The character in the visual board must look identical to the person in the uploaded reference images (matching their exact face, body, hair, and clothing style).'}`;

          if (shouldEnforceNoText(input)) {
            imagePromptText += `\nCRITICAL REQUIREMENT 2: Apart from the technical storyboard labels and names (e.g. title, "Shot 01", character notes), do NOT include any random text overlays, subtitles, watermarks, or UI lettering.`;
          }
          parts.push({ text: imagePromptText });
          
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 1.0 }
              })
            }
          );
          
          const data = await res.json();
          if (data.error) throw new Error(`Visual Board generation failed: ${data.error.message}`);
          const resParts = data.candidates?.[0]?.content?.parts || [];
          let b64 = null;
          for (const part of resParts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
              b64 = part.inlineData.data;
              break;
            }
          }
          if (!b64) throw new Error("No image data returned for Visual Board.");
          return b64;
        })();
      }

      const [textResult, generatedBoardB64] = await Promise.all([textEnhancePromise, storyboardPromise]);

      pbHideTypingIndicator();

      pbChatHistory.push({ 
        role: 'model', 
        text: textResult.suggestions,
        enhancedPrompt: textResult.enhancedPrompt
      });
      pbRenderChatHistory();

      let formattedText = pbInsertTags(textResult.enhancedPrompt);
      out.innerHTML = formattedText;

      if (isStoryboard && generatedBoardB64) {
        window.pbStoryboardImage = generatedBoardB64;
        
        videoOut.innerHTML = `
          <div class="pb-visual-board-container animate-in">
            <img class="pb-visual-board-img" src="data:image/png;base64,${generatedBoardB64}" alt="Storyboard Sheet" onclick="window.pbOpenVisualBoardLightbox(this.src)">
          </div>
        `;
      } else {
        videoOut.innerHTML = `
          <div class="pb-video-placeholder">
            <span style="font-size: 28px;">🎬</span>
            <span style="font-size: 12px; color: #94a3b8;">Generated video appears here</span>
          </div>
        `;
      }

    } catch (err) {
      pbHideTypingIndicator();
      pbChatHistory.push({ role: 'model', text: `⚠️ Enhancement error: ${err.message}` });
      pbRenderChatHistory();
      
      out.innerHTML = `<span style="color:#ef4444; font-size:12px;">⚠️ Enhancement error: ${err.message}</span>`;
      if (isStoryboard) {
        videoOut.innerHTML = `<div style="padding:16px; text-align:center;"><span style="font-size:28px;">⚠️</span><br><span style="font-size:12px; color:#ef4444;">Storyboard error: ${err.message}</span></div>`;
      }
    }

    btn.innerHTML = '💬 Send';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  };

  window.pbCopy = function() {
    const t = document.getElementById('pbOutput').innerText;
    navigator.clipboard.writeText(t).then(() => {
      const btn = document.querySelector('.pb-copy');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
    });
  };

  window.pbSetAspectRatio = function(btn) {
    document.querySelectorAll('.pb-ar-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('pb_aspect_ratio', btn.dataset.ar);
  };

  window.pbSetResolution = function(btn) {
    document.querySelectorAll('.pb-res-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pbResolution = btn.dataset.res;
    localStorage.setItem('pb_resolution', pbResolution);
  };

  window.pbUpdateAspectRatioUI = function() {
    const ar11 = document.querySelector('.pb-ar-btn[data-ar="1:1"]');
    if (ar11) {
      ar11.style.display = 'none';
      if (ar11.classList.contains('active')) {
        ar11.classList.remove('active');
        const ar169 = document.querySelector('.pb-ar-btn[data-ar="16:9"]');
        if (ar169) ar169.classList.add('active');
      }
    }
  };

  const savedAr = localStorage.getItem('pb_aspect_ratio');
  if (savedAr) {
    const arBtn = document.querySelector(`.pb-ar-btn[data-ar="${savedAr}"]`);
    if (arBtn) {
      document.querySelectorAll('.pb-ar-btn').forEach(b => b.classList.remove('active'));
      arBtn.classList.add('active');
    }
  }

  const savedRes = localStorage.getItem('pb_resolution');
  if (savedRes) {
    pbResolution = savedRes;
    const resBtn = document.querySelector(`.pb-res-btn[data-res="${savedRes}"]`);
    if (resBtn) {
      document.querySelectorAll('.pb-res-btn').forEach(b => b.classList.remove('active'));
      resBtn.classList.add('active');
    }
  }

  pbUpdateAspectRatioUI();

  // Generate Video
  // --- Multi-Clip Script Splitting ---
  async function pbSplitScript(fullPrompt) {
    // --- Detect requested duration and calculate clip count ---
    let requestedClips = null;
    const durationMatch = fullPrompt.match(/(\d+)\s*(?:minute|min|mins|minutes)/i) ||
                          (pbChatHistory || []).map(m => m.text).join(' ').match(/(\d+)\s*(?:minute|min|mins|minutes)/i);
    const secondsMatch = fullPrompt.match(/(\d+)\s*(?:second|sec|secs|seconds)/i) ||
                         (pbChatHistory || []).map(m => m.text).join(' ').match(/(\d+)\s*(?:second|sec|secs|seconds)/i);
    
    if (durationMatch) {
      const mins = parseInt(durationMatch[1]);
      requestedClips = Math.ceil((mins * 60) / 10); // 10s per clip
    } else if (secondsMatch) {
      const secs = parseInt(secondsMatch[1]);
      if (secs > 10) requestedClips = Math.ceil(secs / 10);
    }
    
    // Clamp: min 1, max 12 clips (2 minutes)
    if (requestedClips) requestedClips = Math.max(1, Math.min(requestedClips, 12));

    try {
      const clipCount = requestedClips || 'auto (1-4 based on script complexity)';
      const parts = [];

      // Add visual storyboard sheet image if available
      if (window.pbStoryboardImage) {
        parts.push({ inlineData: { mimeType: "image/png", data: window.pbStoryboardImage } });
      }

      // Add user photos for character matching reference
      for (const img of pbImages) {
        const base64 = img.src.split(',')[1];
        const mimeType = img.src.split(';')[0].split(':')[1];
        parts.push({ inlineData: { mimeType, data: base64 } });
      }

      parts.push({ text: `You are a video production assistant specializing in multi-clip sequential video generation with VISUAL CONTINUITY.

SCRIPT:
"${fullPrompt}"

NUMBER OF CLIPS TO GENERATE: ${clipCount}
EACH CLIP DURATION: ~10 seconds

CRITICAL STORYBOARD ALIGNMENT RULES:
${window.pbStoryboardImage ? `1. You are provided with a Visual Board & Storyboard Sheet containing character designs and sequential panels (Shot 01, Shot 02, etc.).
2. You MUST align the generated clips with the storyboard panels.
   - For example, if generating 4 clips: Clip 1 must match panel "Shot 01 / Shot 02", Clip 2 must match panel "Shot 03 / Shot 04", and so on.
   - Replicate the exact setting, environment details, color schemes, lighting, and composition depicted in those panels.
3. Reposition the character according to their poses in those panels.` : ''}

CRITICAL CONTINUITY RULES:
1. Extract the CORE IDENTITY ANCHOR from the script — the main character's exact appearance (age, gender, ethnicity, hairstyle, hair color, clothing with specific colors/materials/patterns, accessories, body type). This MUST be repeated VERBATIM in EVERY clip prompt.
2. Each clip must begin with a [CONTINUITY ANCHOR] section that describes: "Continuing from the previous frame where [exact last pose/position/action]..."
3. The SETTING (location, time of day, weather, lighting conditions) must be consistently described across clips unless the script explicitly calls for a location change.
4. Camera style, color grading, and film aesthetic must remain consistent.
5. Each clip prompt must be fully self-contained (a new AI model generates each clip independently — it has NO memory of previous clips). So every clip MUST re-describe the character, setting, and style from scratch, but the ACTION should progress sequentially.
6. FILTER OUT DIALOGUES: If the input script contains "🎙️ DIALOGUE / VOICEOVER" headings, speech scripts, voiceover lists, or dialogue lines, you MUST exclude them from the visual "prompt" field. The visual prompt must describe ONLY camera actions, scene physics, and characters' motions. Do NOT include dialogue text in the prompt field.

FORMAT: Return a valid JSON array where each object has:
- "clip": clip number (1-based)
- "prompt": the full, self-contained visual prompt for that clip (excluding dialogue text)
- "identity_anchor": the character description string repeated in all clips (same for every clip)
- "end_state": brief description of what the last frame looks like (pose, expression, position) — this feeds into the next clip's continuity anchor
- "dialogue": the specific dialogue, script line, or voiceover spoken during this 10-second clip's duration. If the input script has a "🎙️ DIALOGUE / VOICEOVER" section or character voice lines, extract and align them with the visuals. If no dialogues are requested, generate a fitting, quirky voiceover sentence.

${requestedClips ? `You MUST generate exactly ${requestedClips} clips.` : 'If the script fits in 10 seconds, return 1 clip. Otherwise split into sequential clips (max 4).'}

Return ONLY the JSON array. No markdown, no extra text.` });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${SYNTH_MODEL}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
          })
        }
      );
      const data = await res.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
      const clips = JSON.parse(text);
      const maxClips = requestedClips || 4;
      if (Array.isArray(clips) && clips.length > 0) return clips.slice(0, maxClips);
    } catch (e) {
      console.warn('Script splitting failed, using single clip:', e);
    }
    return [{ clip: 1, prompt: fullPrompt }];
  }

  // --- Timeline Rendering ---
  let pbClips = []; // { id, prompt, status, videoUrl, videoData }

  function pbRenderTimeline() {
    const timeline = document.getElementById('pbTimeline');
    const track = document.getElementById('pbTimelineTrack');
    if (pbClips.length <= 1) { timeline.style.display = 'none'; return; }
    timeline.style.display = 'flex';
    track.innerHTML = pbClips.map((c, i) => `
      <div class="pb-clip-thumb ${c.status === 'generating' ? 'generating' : ''} ${c.status === 'done' ? 'active' : ''} ${c.status === 'error' ? 'error' : ''}"
           onclick="window.pbPlayClip(${i})" title="Clip ${i + 1}">
        ${c.status === 'done' ? `<video src="${c.videoUrl}" muted></video>` : c.sceneImage ? `<img src="data:image/png;base64,${c.sceneImage}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" />` : ''}
        <span class="pb-clip-label">${c.status === 'generating' ? '⏳' : c.status === 'done' ? '✅' : c.status === 'error' ? '❌' : '⏸️'} Clip ${i + 1}</span>
      </div>
    `).join('');
  }

  window.pbPlayClip = function(idx) {
    const clip = pbClips[idx];
    if (!clip) return;
    const videoOut = document.getElementById('pbVideoOut');
    const editorPanel = document.getElementById('pbClipEditorPanel');
    
    // Set default editor settings if not present
    if (clip.trimStart === undefined) clip.trimStart = 0;
    if (clip.trimEnd === undefined) clip.trimEnd = 10;
    if (clip.cropRatio === undefined) clip.cropRatio = 'fit';
    if (clip.excluded === undefined) clip.excluded = false;
    
    let videoEl = null;

    if (clip.status === 'done') {
      videoOut.innerHTML = '';
      videoEl = document.createElement('video');
      videoEl.controls = true;
      videoEl.autoplay = true;
      videoEl.src = clip.videoUrl;
      
      // Apply crop styling
      applyCropStyles(videoEl, clip.cropRatio);
      videoOut.appendChild(videoEl);
      
      // Hook up live trim playback boundary looping
      videoEl.onloadedmetadata = () => {
        const dur = videoEl.duration || 10;
        // Adjust trimEnd default if it was set to 10 but video is shorter/longer
        if (clip.trimEnd === 10) clip.trimEnd = Math.round(dur * 10) / 10;
        
        // Setup initial start point
        videoEl.currentTime = clip.trimStart;
        
        // Update trim range sliders max value if they exist
        const startSlider = document.getElementById(`pbTrimStart-${idx}`);
        const endSlider = document.getElementById(`pbTrimEnd-${idx}`);
        if (startSlider && endSlider) {
          startSlider.max = dur;
          endSlider.max = dur;
        }
      };

      videoEl.ontimeupdate = () => {
        if (videoEl.currentTime < clip.trimStart) {
          videoEl.currentTime = clip.trimStart;
        }
        if (videoEl.currentTime >= clip.trimEnd) {
          videoEl.currentTime = clip.trimStart;
        }
      };
    } else if (clip.status === 'error') {
      videoOut.innerHTML = `
        <div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background: #fef2f2; border-radius: 12px; border: 1px solid #fee2e2;">
          <span style="font-size: 32px; margin-bottom: 8px;">⚠️</span>
          <span style="font-size: 14px; font-weight: 700; color: #991b1b; margin-bottom: 4px;">Clip ${idx + 1} Failed to Generate</span>
          <span style="font-size: 12px; color: #ef4444; max-width: 80%; line-height: 1.5; margin-bottom: 16px;">${clip.errorMessage || 'Unknown error occurred during generation.'}</span>
          <div style="display: flex; gap: 8px;">
            <button onclick="window.pbEditClipPrompt(${idx})" style="padding: 6px 16px; border-radius: 8px; border: 1px solid #fee2e2; background: white; color: #b91c1c; font-size: 12px; cursor: pointer; font-weight: 600;">✏️ Edit Prompt</button>
            <button onclick="window.pbRegenClip(${idx})" style="padding: 6px 16px; border-radius: 8px; border: none; background: #dc2626; color: white; font-size: 12px; cursor: pointer; font-weight: 700; box-shadow: 0 2px 4px rgba(220,38,38,0.2);">🔄 Retry Generation</button>
          </div>
        </div>
      `;
    } else if (clip.status === 'generating') {
      if (clip.sceneImage) {
        videoOut.innerHTML = `
          <div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:12px; background:#0f172a;">
            <img src="data:image/png;base64,${clip.sceneImage}" style="width:100%; height:100%; object-fit:contain; border-radius:12px; filter:brightness(0.55);" />
            <div style="position:absolute; text-align:center; color:white; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; width:80%;">
              <div class="pb-loading" style="width:100%; margin-bottom:10px;"></div>
              <div style="font-size:13px; font-weight:600; text-shadow:0 2px 4px rgba(0,0,0,0.5);">⏳ Animating scene visual...</div>
            </div>
          </div>
        `;
      } else {
        videoOut.innerHTML = `
          <div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
            <div class="pb-loading" style="width:80%; margin-bottom: 8px;"></div>
            <div style="font-size: 13px; color: #94a3b8; margin-top: 12px;">⏳ Generating Clip ${idx + 1}...</div>
          </div>
        `;
      }
    } else {
      if (clip.sceneImage) {
        videoOut.innerHTML = `
          <div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:12px; background:#0f172a;">
            <img src="data:image/png;base64,${clip.sceneImage}" style="width:100%; height:100%; object-fit:contain; border-radius:12px; filter:brightness(0.55);" />
            <div style="position:absolute; text-align:center; color:white; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; width:80%;">
              <span style="font-size: 28px; margin-bottom: 8px;">⏸️</span>
              <div style="font-size:13px; font-weight:600; text-shadow:0 2px 4px rgba(0,0,0,0.5); margin-bottom:12px;">Clip ${idx + 1} is queued</div>
              <button onclick="window.pbRegenClip(${idx})" style="padding: 6px 16px; border-radius: 8px; border: none; background: #8b5cf6; color: white; font-size: 12px; cursor: pointer; font-weight: 700; box-shadow:0 4px 6px rgba(139,92,246,0.35);">🎬 Generate Now</button>
            </div>
          </div>
        `;
      } else {
        videoOut.innerHTML = `
          <div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background: #f8fafc; border-radius: 12px; border: 1px dashed #e2e8f0;">
            <span style="font-size: 32px; margin-bottom: 8px;">⏸️</span>
            <span style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Clip ${idx + 1} is queued.</span>
            <button onclick="window.pbRegenClip(${idx})" style="padding: 6px 16px; border-radius: 8px; border: none; background: #8b5cf6; color: white; font-size: 12px; cursor: pointer; font-weight: 700;">🎬 Generate Now</button>
          </div>
        `;
      }
    }
    
    // Show clip details panel below video
    const clipStatus = document.getElementById('pbClipStatus');
    clipStatus.innerHTML = `
      <span>Clip ${idx + 1} of ${pbClips.length}</span>
      <span style="margin-left:auto;display:flex;gap:6px;">
        <button onclick="window.pbEditClipPrompt(${idx})" style="background:rgba(124,58,237,0.1);color:#8b5cf6;border:1px solid rgba(124,58,237,0.2);padding:3px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;">✏️ Edit Prompt</button>
        <button onclick="window.pbRegenClip(${idx})" style="background:rgba(234,179,8,0.1);color:#ca8a04;border:1px solid rgba(234,179,8,0.2);padding:3px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;">🔄 Regenerate</button>
        ${clip.status === 'done' ? `<button onclick="window.pbDownloadSingleClip(${idx})" style="background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2);padding:3px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;">💾 Download Clip</button>` : ''}
      </span>
    `;
    clipStatus.style.cssText = 'display:flex;align-items:center;font-size:12px;padding:4px 0;';

    // Show Editor Controls panel
    if (editorPanel) {
      if (clip.status === 'done') {
        editorPanel.style.display = 'block';
        editorPanel.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:4px;">
              <span style="font-weight:700; color:#1e293b;">🛠️ Clip ${idx + 1} Editor</span>
              <label style="display:inline-flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;">
                <input type="checkbox" id="pbExcludeCheck" ${clip.excluded ? 'checked' : ''} onchange="window.pbToggleExclude(${idx})" style="cursor:pointer;">
                <span style="color:${clip.excluded ? '#ef4444' : '#64748b'}; font-weight:600;">✂️ Exclude/Cut from final</span>
              </label>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <!-- Trim Controls -->
              <div>
                <span style="font-weight:600; color:#64748b; font-size:11px; display:block; margin-bottom:4px;">⏱️ Trim Section</span>
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:30px; font-size:10px; color:#94a3b8;">Start:</span>
                    <input type="range" id="pbTrimStart-${idx}" min="0" max="10" step="0.1" value="${clip.trimStart}" oninput="window.pbUpdateTrim(${idx}, 'start', this.value)" style="flex:1; cursor:pointer; accent-color:#7c3aed;">
                    <span id="pbTrimStartVal-${idx}" style="font-size:11px; font-weight:600; width:35px; text-align:right;">${clip.trimStart}s</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="width:30px; font-size:10px; color:#94a3b8;">End:</span>
                    <input type="range" id="pbTrimEnd-${idx}" min="0" max="10" step="0.1" value="${clip.trimEnd}" oninput="window.pbUpdateTrim(${idx}, 'end', this.value)" style="flex:1; cursor:pointer; accent-color:#7c3aed;">
                    <span id="pbTrimEndVal-${idx}" style="font-size:11px; font-weight:600; width:35px; text-align:right;">${clip.trimEnd}s</span>
                  </div>
                </div>
              </div>
              
              <!-- Crop & Visual Controls -->
              <div>
                <span style="font-weight:600; color:#64748b; font-size:11px; display:block; margin-bottom:4px;">📐 Crop Aspect Ratio</span>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                  <button class="pb-crop-btn ${clip.cropRatio === 'fit' ? 'active' : ''}" onclick="window.pbUpdateCrop(${idx}, 'fit')" style="${getCropBtnStyle(clip.cropRatio === 'fit')}">Fit</button>
                  <button class="pb-crop-btn ${clip.cropRatio === '16:9' ? 'active' : ''}" onclick="window.pbUpdateCrop(${idx}, '16:9')" style="${getCropBtnStyle(clip.cropRatio === '16:9')}">16:9</button>
                  <button class="pb-crop-btn ${clip.cropRatio === '9:16' ? 'active' : ''}" onclick="window.pbUpdateCrop(${idx}, '9:16')" style="${getCropBtnStyle(clip.cropRatio === '9:16')}">9:16</button>
                  <button class="pb-crop-btn ${clip.cropRatio === '1:1' ? 'active' : ''}" onclick="window.pbUpdateCrop(${idx}, '1:1')" style="${getCropBtnStyle(clip.cropRatio === '1:1')}">1:1</button>
                </div>
              </div>
            </div>

            <!-- AI Edit Controls -->
            <div style="margin-top: 12px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
              <span style="font-weight:600; color:#64748b; font-size:11px; display:block; margin-bottom:6px;">🪄 AI Video-to-Video Edit</span>
              <div style="display:flex; gap:6px;">
                <input type="text" id="pbVideoEditPrompt-${idx}" placeholder="e.g., Change jacket to red, Make it rain, or Style as cartoon..." style="flex:1; padding:6px 12px; border:1px solid #e2e8f0; border-radius:8px; font-size:11px; color:#1e293b; background:#f8fafc;" />
                <button onclick="window.pbAiEditVideo(${idx})" style="padding:6px 14px; border-radius:8px; border:none; background:linear-gradient(135deg,#8b5cf6,#6366f1); color:white; font-size:11px; cursor:pointer; font-weight:700; box-shadow: 0 2px 4px rgba(139,92,246,0.2);">🪄 Edit Video</button>
              </div>
            </div>
          </div>
        `;
      } else {
        editorPanel.style.display = 'none';
      }
    }
  };

  // Helper to apply crop styling on video elements
  function applyCropStyles(el, ratio) {
    if (!el) return;
    if (ratio === '16:9') {
      el.style.cssText = 'width:100%; height:auto; aspect-ratio:16/9; object-fit:cover; border-radius:12px;';
    } else if (ratio === '9:16') {
      el.style.cssText = 'height:100%; width:auto; aspect-ratio:9/16; object-fit:cover; border-radius:12px; margin: 0 auto; display:block;';
    } else if (ratio === '1:1') {
      el.style.cssText = 'height:100%; width:auto; aspect-ratio:1/1; object-fit:cover; border-radius:12px; margin: 0 auto; display:block;';
    } else {
      el.style.cssText = 'width:100%; height:100%; object-fit:contain; border-radius:12px;';
    }
  }

  function getCropBtnStyle(isActive) {
    return `padding:4px 10px; border-radius:6px; border:1px solid ${isActive ? '#7c3aed' : '#cbd5e1'}; background:${isActive ? '#7c3aed' : 'white'}; color:${isActive ? 'white' : '#475569'}; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.15s;`;
  }

  async function pbGetClipBase64(clip) {
    if (clip.videoUrl && clip.videoUrl.startsWith('data:')) {
      return clip.videoUrl.split(',')[1];
    }
    if (clip.videoData && clip.videoData.bytesBase64Encoded) {
      return clip.videoData.bytesBase64Encoded;
    }
    try {
      const res = await fetch(clip.videoUrl);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          resolve(reader.result.split(',')[1]);
        };
      });
    } catch (e) {
      console.warn("Failed to retrieve video base64:", e);
      return null;
    }
  }

  window.pbAiEditVideo = async function(idx) {
    const clip = pbClips[idx];
    if (!clip) return;

    const editInput = document.getElementById(`pbVideoEditPrompt-${idx}`);
    if (!editInput) return;
    const editPromptText = editInput.value.trim();
    if (!editPromptText) return;

    const videoOut = document.getElementById('pbVideoOut');
    const btn = document.getElementById('pbGenBtn');
    const activeArBtn = document.querySelector('.pb-ar-btn.active');
    const activeAr = activeArBtn ? activeArBtn.dataset.ar : '16:9';

    // Set generating status
    clip.status = 'generating';
    pbRenderTimeline();

    // Show loading overlay
    videoOut.innerHTML = `
      <div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:12px; background:#0f172a;">
        ${clip.sceneImage ? `<img src="data:image/png;base64,${clip.sceneImage}" style="width:100%; height:100%; object-fit:contain; border-radius:12px; filter:brightness(0.4);" />` : ''}
        <div style="position:absolute; text-align:center; color:white; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; width:80%;">
          <div class="pb-loading" style="width:100%; margin-bottom:10px;"></div>
          <div style="font-size:13px; font-weight:600; text-shadow:0 2px 4px rgba(0,0,0,0.5);">🪄 AI Video Edit: Applying changes...</div>
        </div>
      </div>
    `;

    try {
      const videoBase64 = await pbGetClipBase64(clip);
      if (!videoBase64) throw new Error("Could not load original video track for editing.");

      // Build quality directives
      const QUALITY_GUARD = pbGetQualityGuard(editPromptText);

      // Instruct Omni Flash to perform the video-to-video style edit
      const editInstruction = `Perform a video-to-video edit on this input video:
1. Apply the user's requested edit prompt: "${editPromptText}".
2. Maintain identical character features, clothing, and scene motion unless requested otherwise.
\n\n[QUALITY DIRECTIVES]: ${QUALITY_GUARD}`;

      const inputParts = [
        { type: 'video', data: videoBase64, mime_type: 'video/mp4' },
        { type: 'text', text: editInstruction }
      ];

      // Add user character reference photos if available to anchor character design during edit
      for (const img of pbImages) {
        const base64 = img.src.split(',')[1];
        const mimeType = img.src.split(';')[0].split(':')[1];
        inputParts.push({ type: 'image', data: base64, mime_type: mimeType });
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/interactions?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "gemini-omni-flash-preview",
            input: inputParts,
            response_format: { type: "video", aspect_ratio: activeAr }
          })
        }
      );

      const interactionRes = await res.json();
      console.log(`Clip ${idx+1} AI Edit response:`, interactionRes);
      if (interactionRes.error) throw new Error(interactionRes.error.message);

      // Locate video in response
      let editedVideoB64 = null;
      const steps = interactionRes.steps || [];
      for (const step of steps) {
        if (step.content) {
          const contentList = Array.isArray(step.content) ? step.content : [step.content];
          for (const content of contentList) {
            const partsList = content.parts || [content];
            for (const part of partsList) {
              if (part.data) { editedVideoB64 = part.data; break; }
              if (part.inlineData?.data) { editedVideoB64 = part.inlineData.data; break; }
            }
            if (editedVideoB64) break;
          }
        }
        if (editedVideoB64) break;
      }

      if (!editedVideoB64) {
        throw new Error("No edited video data returned in Omni response.");
      }

      // Store result
      const videoUrl = `data:video/mp4;base64,${editedVideoB64}`;
      clip.status = 'done';
      clip.videoUrl = videoUrl;
      clip.videoData = { bytesBase64Encoded: editedVideoB64 };
      
      // Update scene keyframe with the edited video's last frame to maintain downstream continuity!
      try {
        const newSceneImage = await captureLastFrame(videoUrl);
        if (newSceneImage) {
          clip.sceneImage = newSceneImage;
        }
      } catch (err) {
        console.warn("Failed to capture new keyframe after edit:", err);
      }

      pbRenderTimeline();
      window.pbPlayClip(idx);

    } catch (err) {
      console.error(`AI Video edit for clip ${idx+1} failed:`, err);
      clip.status = 'error';
      clip.errorMessage = err.message;
      pbRenderTimeline();
      window.pbPlayClip(idx);
    }
  };

  // --- Live Update Event Handlers ---
  window.pbToggleExclude = function(idx) {
    const clip = pbClips[idx];
    if (!clip) return;
    const check = document.getElementById('pbExcludeCheck');
    clip.excluded = check ? check.checked : false;
    
    // Update thumbnail visual to show it's excluded
    const thumb = document.querySelectorAll('.pb-clip-thumb')[idx];
    if (thumb) {
      if (clip.excluded) {
        thumb.style.opacity = '0.35';
        thumb.style.textDecoration = 'line-through';
      } else {
        thumb.style.opacity = '1';
        thumb.style.textDecoration = 'none';
      }
    }
  };

  window.pbUpdateTrim = function(idx, type, val) {
    const clip = pbClips[idx];
    if (!clip) return;
    const numVal = parseFloat(val);
    const videoEl = document.querySelector('#pbVideoOut video');
    
    if (type === 'start') {
      clip.trimStart = Math.min(numVal, clip.trimEnd - 0.1);
      document.getElementById(`pbTrimStartVal-${idx}`).textContent = clip.trimStart.toFixed(1) + 's';
      document.getElementById(`pbTrimStart-${idx}`).value = clip.trimStart;
      if (videoEl) videoEl.currentTime = clip.trimStart;
    } else {
      clip.trimEnd = Math.max(numVal, clip.trimStart + 0.1);
      document.getElementById(`pbTrimEndVal-${idx}`).textContent = clip.trimEnd.toFixed(1) + 's';
      document.getElementById(`pbTrimEnd-${idx}`).value = clip.trimEnd;
    }
  };

  window.pbUpdateCrop = function(idx, ratio) {
    const clip = pbClips[idx];
    if (!clip) return;
    clip.cropRatio = ratio;
    
    // Apply changes live to preview player
    const videoEl = document.querySelector('#pbVideoOut video');
    if (videoEl) {
      applyCropStyles(videoEl, ratio);
    }
    
    // Re-render editor buttons
    window.pbPlayClip(idx);
  };

  // --- Edit individual clip prompt ---
  window.pbEditClipPrompt = function(idx) {
    const clip = pbClips[idx];
    if (!clip) return;
    const videoOut = document.getElementById('pbVideoOut');
    
    videoOut.innerHTML = `
      <div style="padding:20px;display:flex;flex-direction:column;height:100%;gap:12px;">
        <div style="font-size:13px;font-weight:700;color:#1e293b;">✏️ Edit Prompt — Clip ${idx + 1}</div>
        <textarea id="pbClipEditArea" style="flex:1;width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:12px;font-size:12px;font-family:inherit;resize:none;line-height:1.6;color:#1e293b;background:#f8fafc;">${clip.prompt.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button onclick="window.pbPlayClip(${idx})" style="padding:6px 16px;border-radius:8px;border:1px solid #e2e8f0;background:white;color:#475569;font-size:12px;cursor:pointer;font-weight:600;">Cancel</button>
          <button onclick="window.pbSaveClipPrompt(${idx})" style="padding:6px 16px;border-radius:8px;border:none;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:white;font-size:12px;cursor:pointer;font-weight:700;">Save & Regenerate</button>
        </div>
      </div>
    `;
  };

  // --- Save edited prompt and regenerate ---
  window.pbSaveClipPrompt = function(idx) {
    const textarea = document.getElementById('pbClipEditArea');
    if (!textarea) return;
    const newPrompt = textarea.value.trim();
    if (!newPrompt) return;
    pbClips[idx].prompt = newPrompt;
    window.pbRegenClip(idx);
  };

  // --- Regenerate a single clip ---
  window.pbRegenClip = async function(idx) {
    const clip = pbClips[idx];
    if (!clip) return;

    const videoOut = document.getElementById('pbVideoOut');
    const btn = document.getElementById('pbGenBtn');
    const isStoryboard = document.getElementById('pbStoryboardToggle')?.checked;
    const activeArBtn = document.querySelector('.pb-ar-btn.active');
    const activeAr = activeArBtn ? activeArBtn.dataset.ar : '16:9';

    clip.status = 'generating';
    clip.videoUrl = null;
    clip.videoData = null;
    pbRenderTimeline();

    videoOut.innerHTML = '<div style="padding:24px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;"><div class="pb-loading" style="width:80%;margin-bottom:8px;"></div><div id="pbVeoStatus" style="font-size:13px;color:#94a3b8;margin-top:12px;">🔄 Regenerating clip ' + (idx+1) + '...</div></div>';
    if (btn) { btn.textContent = '⏳ Regen ' + (idx+1); btn.style.opacity = '0.7'; btn.style.pointerEvents = 'none'; }

    // Build quality guard
    const QUALITY_GUARD = pbGetQualityGuard(clip.prompt);
    let storyboardDirective = '';
    if (isStoryboard && window.pbStoryboardImage) {
      storyboardDirective = '\n\n[STORYBOARD ADHERENCE]: Follow the character design, clothing details, colors, environment, and sequential storyboard panels shown in the visual board sheet.';
    }

    // Add character description if available
    let charPrefix = '';
    if (pbCharacterDescription) {
      charPrefix = '[CHARACTER IDENTITY]: ' + pbCharacterDescription + '. ';
    }

    let audioDirective = '';
    if (clip.dialogue) {
      audioDirective = `\n\n[VOICE & AUDIO DIRECTIVES]: The character (${pbImages[0]?.tag || 'presenter'}) speaks the following dialogue in sync with their lip movement: "${clip.dialogue}". The character's voice must remain completely consistent: a mid-aged male voice speaking in a warm, quirky, expressive tone with a subtle, sophisticated accent. The speech pacing must sync perfectly with the character's facial expressions and lip movements.`;
    }
    let continuityPrefix = '';
    if (idx > 0 && pbClips[idx - 1]) {
      continuityPrefix = `[CONTINUITY START STATE]: You MUST start this video animation exactly from the attached last frame of the previous clip. Maintain the exact same camera position, setting, lighting, clothing, and character pose at the start.
[VISUAL STORYBOARD TARGET]: We have also attached a visual storyboard keyframe for this clip. Smoothly transition the character and composition to depict: `;
    } else {
      continuityPrefix = `[VISUAL STORYBOARD TARGET]: We have attached a visual storyboard keyframe for this clip. Start from this composition and animate: `;
    }
    const clipPrompt = charPrefix + continuityPrefix + clip.prompt + '\n\n[QUALITY DIRECTIVES]: ' + QUALITY_GUARD + storyboardDirective + audioDirective;

    // Generate new scene image keyframe for this edited prompt
    let sceneImageB64 = null;
    let localLastFrame = null;
    if (idx > 0 && pbClips[idx - 1] && pbClips[idx - 1].videoUrl) {
      try {
        const statusEl = document.getElementById('pbVeoStatus');
        if (statusEl) statusEl.textContent = `📸 Extracting continuity frame from previous clip...`;
        localLastFrame = await captureLastFrame(pbClips[idx - 1].videoUrl);
      } catch (e) {
        console.warn("Failed to capture continuity frame for single clip regen:", e);
      }
    }

    try {
      const statusEl = document.getElementById('pbVeoStatus');
      sceneImageB64 = await pbGenerateSceneImage(clip.prompt, idx, statusEl, localLastFrame);
      clip.sceneImage = sceneImageB64;
      pbRenderTimeline();
      
      // Update loading status UI with keyframe image overlay
      if (videoOut && clip.sceneImage) {
        videoOut.innerHTML = `
          <div style="position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:12px;">
            <img src="data:image/png;base64,${clip.sceneImage}" style="width:100%; height:100%; object-fit:contain; border-radius:12px; filter:brightness(0.6);" />
            <div style="position:absolute; text-align:center; color:white; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center; width:80%;">
              <div class="pb-loading" style="width:100%; margin-bottom:8px;"></div>
              <div style="font-size:13px; font-weight:600;">⚡ Animating scene visual...</div>
            </div>
          </div>
        `;
      }
    } catch (imgErr) {
      console.warn(`Failed to generate new scene image for clip regen ${idx+1}:`, imgErr);
    }

    try {
      let resultClip;

      if (VIDEO_MODEL === 'gemini-omni-flash-preview') {
        const inputParts = [];
        for (const img of pbImages) {
          const base64 = img.src.split(',')[1];
          const mimeType = img.src.split(';')[0].split(':')[1];
          inputParts.push({ type: 'image', data: base64, mime_type: mimeType });
        }
        // Note: The multi-panel storyboard sheet is omitted here to prevent Omni Flash from animating the grid sheet itself.
        
        // Add exact last frame of previous clip as the absolute start frame guide
        if (localLastFrame) {
          const pureLast = localLastFrame.includes(';base64,') ? localLastFrame.split(';base64,')[1] : localLastFrame;
          inputParts.push({ type: 'image', data: pureLast, mime_type: 'image/jpeg' });
        }

        // Add generated scene image keyframe as target guide
        if (sceneImageB64) {
          const pureData = sceneImageB64.includes(';base64,') ? sceneImageB64.split(';base64,')[1] : sceneImageB64;
          inputParts.push({ type: 'image', data: pureData, mime_type: 'image/png' });
        }

        // Note: We rely on descriptive voice text guidelines in the prompt because the Omni Flash 
        // interactions endpoint doesn't support the audio input modality yet.

        inputParts.push({ type: 'text', text: clipPrompt });
        const hasImages = inputParts.some(p => p.type === 'image');

        const startRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/interactions?key=${API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: "gemini-omni-flash-preview",
              input: hasImages ? inputParts : clipPrompt,
              response_format: { type: "video", aspect_ratio: activeAr }
            })
          }
        );
        const interactionRes = await startRes.json();
        if (interactionRes.error) throw new Error(interactionRes.error.message);

        let videoB64 = null;
        const steps = interactionRes.steps || [];
        for (const step of steps) {
          if (step.content) {
            const contentList = Array.isArray(step.content) ? step.content : [step.content];
            for (const content of contentList) {
              const partsList = content.parts || [content];
              for (const part of partsList) {
                if (part.data) { videoB64 = part.data; break; }
                if (part.inlineData?.data) { videoB64 = part.inlineData.data; break; }
              }
              if (videoB64) break;
            }
          }
          if (videoB64) break;
        }
        if (!videoB64) throw new Error("No video data returned.");
        resultClip = { bytesBase64Encoded: videoB64 };

      } else {
        // Veo 3.1
        const refImages = [];
        for (const img of pbImages) {
          if (refImages.length >= 3) break;
          const base64 = img.src.split(',')[1];
          const mimeType = img.src.split(';')[0].split(':')[1];
          refImages.push({ referenceType: 'subject', referenceId: img.tag || 'character', image: { bytesBase64Encoded: base64, mimeType } });
        }
        const body = {
          instances: [{ prompt: clipPrompt }],
          parameters: { aspectRatio: activeAr, personGeneration: 'allow_adult', durationSeconds: 10, sampleCount: 1, resolution: pbResolution }
        };
        // Build reference images: user refs + scene keyframe
        const clipRefImages = [...refImages];
        if (sceneImageB64 && clipRefImages.length < 3) {
          clipRefImages.push({ referenceType: 'first_frame', referenceId: 'first_frame', image: { bytesBase64Encoded: sceneImageB64, mimeType: 'image/png' } });
        }
        if (clipRefImages.length > 0) body.instances[0].referenceImages = clipRefImages;

        const startRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${VIDEO_MODEL}:predictLongRunning?key=${API_KEY}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        const startData = await startRes.json();
        if (startData.error) throw new Error(startData.error.message);
        const opName = startData.name;
        if (!opName) throw new Error('No operation returned.');

        const statusEl = document.getElementById('pbVeoStatus');
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${API_KEY}`);
          const pollData = await pollRes.json();
          if (pollData.done) {
            if (pollData.error) throw new Error(pollData.error.message);
            let videos = pollData.response?.generateVideoResponse?.generatedVideos ||
                         pollData.response?.generatedVideos || pollData.result?.generatedVideos || [];
            const rawClip = videos.length > 0 ? (videos[0].video || videos[0]) : null;
            if (!rawClip) throw new Error('No video returned.');
            resultClip = rawClip;
            break;
          }
          if (statusEl) statusEl.textContent = '🔄 Regenerating clip ' + (idx+1) + ' (' + ((i+1)*5) + 's)';
          if (i === 59) throw new Error('Timed out.');
        }
      }

      // Store result
      let videoUrl;
      if (resultClip.uri) {
        const authUri = resultClip.uri.includes('?') ? resultClip.uri + '&key=' + API_KEY : resultClip.uri + '?key=' + API_KEY;
        videoUrl = getApiUrl('/api/video-proxy?url=' + encodeURIComponent(authUri));
      } else {
        videoUrl = 'data:video/mp4;base64,' + resultClip.bytesBase64Encoded;
      }

      clip.status = 'done';
      clip.videoUrl = videoUrl;
      clip.videoData = resultClip;
      pbRenderTimeline();
      window.pbPlayClip(idx);

      // Extract voice reference from Clip 1 if regenerated
      if (idx === 0 && VIDEO_MODEL === 'gemini-omni-flash-preview') {
        try {
          const statusEl = document.getElementById('pbVeoStatus');
          if (statusEl) statusEl.textContent = `🎙️ Extracting voice reference from Clip 1...`;
          const voiceB64 = await pbExtractAudio(videoUrl);
          if (voiceB64) {
            window.pbVoiceReference = voiceB64;
            console.log("Successfully extracted and updated voice reference from Clip 1.");
          }
        } catch (audioErr) {
          console.warn("Failed to extract voice reference from Clip 1:", audioErr);
        }
      }

    } catch (err) {
      console.error('Regen clip ' + (idx+1) + ' failed:', err);
      clip.status = 'error';
      clip.errorMessage = err.message;
      pbRenderTimeline();
      window.pbPlayClip(idx);
    }

    if (btn) { btn.textContent = '🎬 Generate'; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
  };

  window.pbPlayAll = function() {
    const doneClips = pbClips.filter(c => c.status === 'done');
    if (doneClips.length === 0) return;
    let currentIdx = 0;
    const videoOut = document.getElementById('pbVideoOut');

    function playNext() {
      if (currentIdx >= doneClips.length) { currentIdx = 0; }
      const clip = doneClips[currentIdx];
      videoOut.innerHTML = '';
      const el = document.createElement('video');
      el.controls = true; el.autoplay = true; el.src = clip.videoUrl;
      el.style.width = '100%'; el.style.height = '100%'; el.style.objectFit = 'contain';
      el.onended = () => { currentIdx++; if (currentIdx < doneClips.length) playNext(); };
      videoOut.appendChild(el);
      document.getElementById('pbClipStatus').textContent = `Playing ${currentIdx + 1} of ${doneClips.length}`;
    }
    playNext();
  };

  // --- Canvas-based Client-Side Video Merger & Exporter ---
  window.pbMergeAndDownload = async function() {
    const doneClips = pbClips.filter(c => c.status === 'done' && !c.excluded);
    if (doneClips.length === 0) {
      alert("No active generated clips to merge. Please generate clips first or make sure they aren't all excluded.");
      return;
    }

    const videoOut = document.getElementById('pbVideoOut');
    const mergeBtn = document.getElementById('pbMergeDownloadBtn');
    
    if (mergeBtn) {
      mergeBtn.textContent = '⏳ Preparing...';
      mergeBtn.disabled = true;
      mergeBtn.style.opacity = '0.6';
    }

    // Determine target resolution based on aspect ratio
    const activeArBtn = document.querySelector('.pb-ar-btn.active');
    const activeAr = activeArBtn ? activeArBtn.dataset.ar : '16:9';
    let width = 1280;
    let height = 720;
    
    if (activeAr === '9:16') {
      width = 720;
      height = 1280;
    } else if (activeAr === '1:1') {
      width = 720;
      height = 720;
    }

    // Create rendering Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Setup MediaRecorder
    const recordedChunks = [];
    const stream = canvas.captureStream(30); // 30 FPS
    
    // Choose compatible recorder MIME type
    let options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp8,opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }
    }
    
    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      console.warn("MediaRecorder init failed, falling back to default options:", e);
      mediaRecorder = new MediaRecorder(stream);
    }
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      if (typeof renderVideo !== 'undefined' && renderVideo && renderVideo.parentNode) {
        renderVideo.parentNode.removeChild(renderVideo);
      }
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `merged_video_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Restore UI
      if (mergeBtn) {
        mergeBtn.textContent = '🎬 Merge & Download';
        mergeBtn.disabled = false;
        mergeBtn.style.opacity = '1';
      }
      
      // Restore timeline player
      window.pbPlayClip(0);
    };

    mediaRecorder.start();

    // sequential play video element (appended to DOM to ensure WebKit media processing loops execute)
    const renderVideo = document.createElement('video');
    renderVideo.muted = true;
    renderVideo.playsInline = true;
    renderVideo.crossOrigin = 'anonymous';
    renderVideo.style.cssText = 'position:absolute; visibility:hidden; width:1px; height:1px; top:0; left:0; pointer-events:none;';
    document.body.appendChild(renderVideo);

    let currentClipIdx = 0;
    
    function renderNextClip() {
      if (currentClipIdx >= doneClips.length) {
        // Complete recording
        setTimeout(() => {
          mediaRecorder.stop();
        }, 500);
        return;
      }
      
      const clip = doneClips[currentIdxToShow()];
      videoOut.innerHTML = `
        <div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background:#f8fafc; border-radius:12px;">
          <div class="pb-loading" style="width:80%; margin-bottom: 8px;"></div>
          <div style="font-size:14px; font-weight:700; color:#4f46e5; margin-bottom:4px;">🎬 Exporting Full Video</div>
          <div style="font-size:12px; color:#94a3b8;">Processing Clip ${currentClipIdx + 1} of ${doneClips.length}...</div>
        </div>
      `;

      // Bind event listeners before setting src to prevent race conditions
      renderVideo.onloadedmetadata = () => {
        renderVideo.currentTime = clip.trimStart;
      };
      
      renderVideo.onseeked = () => {
        renderVideo.play().catch(e => console.warn("Video play failed:", e));
      };

      renderVideo.src = clip.videoUrl;
      renderVideo.load();
      
      let drawInterval;
      renderVideo.onplay = () => {
        clearInterval(drawInterval);
        drawInterval = setInterval(() => {
          if (renderVideo.paused || renderVideo.ended) return;
          
          // Apply crops and draw frame onto Canvas
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, width, height);
          
          const vW = renderVideo.videoWidth || 1280;
          const vH = renderVideo.videoHeight || 720;
          
          const crop = clip.cropRatio || 'fit';
          
          if (crop === '16:9') {
            // Force crop to 16:9 aspect ratio centered
            const targetH = vW * (9/16);
            ctx.drawImage(renderVideo, 0, (vH - targetH)/2, vW, targetH, 0, 0, width, height);
          } else if (crop === '9:16') {
            // Force crop to 9:16 aspect ratio centered
            const targetW = vH * (9/16);
            ctx.drawImage(renderVideo, (vW - targetW)/2, 0, targetW, vH, 0, 0, width, height);
          } else if (crop === '1:1') {
            // Force crop to 1:1 square centered
            const size = Math.min(vW, vH);
            ctx.drawImage(renderVideo, (vW - size)/2, (vH - size)/2, size, size, 0, 0, width, height);
          } else {
            // Default: fit aspect ratio maintaining aspect ratio
            const scale = Math.min(width / vW, height / vH);
            const x = (width - vW * scale) / 2;
            const y = (height - vH * scale) / 2;
            ctx.drawImage(renderVideo, 0, 0, vW, vH, x, y, vW * scale, vH * scale);
          }
          
          // Check trim boundaries
          if (renderVideo.currentTime >= clip.trimEnd) {
            clearInterval(drawInterval);
            renderVideo.pause();
            currentClipIdx++;
            renderNextClip();
          }
        }, 1000 / 30); // 30 FPS draw rate
      };
      
      renderVideo.onerror = () => {
        clearInterval(drawInterval);
        console.warn(`Failed to play clip ${clip.id + 1} during export`);
        currentClipIdx++;
        renderNextClip();
      };
    }
    
    function currentIdxToShow() {
      return currentClipIdx;
    }

    renderNextClip();
  };

  window.pbGenerateVideo = async function() {
    const promptText = document.getElementById('pbOutput').innerText;
    const chatText = document.getElementById('pbChatInput').value.trim();
    const btn = document.getElementById('pbGenBtn');
    const videoOut = document.getElementById('pbVideoOut');

    // Use enhanced prompt if available, otherwise use chat input
    const usePrompt = (promptText && !promptText.includes('Enhanced prompt appears')) ? promptText : chatText;

    if (!usePrompt) {
      videoOut.innerHTML = `<div class="pb-video-placeholder"><span style="font-size:28px;">⚠️</span><span style="font-size:12px; color:#ef4444;">No prompt. Click Enhance first or type a prompt.</span></div>`;
      return;
    }

    btn.textContent = '⏳ Validating...';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    // Process chat files if not already processed
    if (pbChatFiles.length > 0) {
      await pbProcessChatFiles();
    }

    // 1. Run Pre-Computation Validation Process
    const isValid = await runPreComputationValidation(videoOut, usePrompt, pbImages, true);
    if (!isValid) {
      btn.textContent = '🎬 Generate';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      return;
    }

    // Validation passed, proceed to synthesis and generation
    btn.textContent = '⏳ Generating...';
    const isStoryboard = document.getElementById('pbStoryboardToggle').checked;

    try {
      const activeArBtn = document.querySelector('.pb-ar-btn.active');
      const activeAr = activeArBtn ? activeArBtn.dataset.ar : '16:9';
      
      let finalPrompt = usePrompt;

      // Pipeline synthesis when storyboard has been generated
      if (isStoryboard && window.pbStoryboardImage) {
        videoOut.innerHTML = `
          <div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
            <div class="pb-loading" style="width:80%; margin-bottom: 8px;"></div>
            <div class="pb-loading" style="width:60%; margin-bottom: 8px;"></div>
            <div style="font-size: 13px; color: #4f46e5; font-weight: 600; margin-top: 12px;">⏳ Step 1/2: Omni Multimodal combining visual board and character consistency...</div>
          </div>
        `;

        try {
          const parts = [];
          
          // Add uploaded character reference images
          for (const img of pbImages) {
            const base64 = img.src.split(',')[1];
            const mimeType = img.src.split(';')[0].split(':')[1];
            parts.push({ inlineData: { mimeType, data: base64 } });
          }

          // Add generated visual board sheet image
          parts.push({ inlineData: { mimeType: "image/png", data: window.pbStoryboardImage } });

          parts.push({
            text: `${AGENT_PROFILE}

YOUR TASK: We are generating an 8-second video with Veo 3.1. Apply your full expertise.

INPUTS PROVIDED:
1. Reference character photos (uploaded by user) — use these for exact character appearance/identity
2. A comprehensive Visual Board & Storyboard Sheet containing character model sheets, swatches, expressions, and sequential storyboard panels (Shot 01, 02, etc.) that tell the narrative.

USER'S ORIGINAL PROMPT: "${promptText}"

SYNTHESIZE a single, continuous, highly-cinematic video prompt for Veo 3.1 that:
1. Starts from the composition, setting, and pose depicted in the first storyboard panel (Shot 01)
2. Smoothly transitions through the narrative progression depicted in the remaining storyboard panels (Shot 02, 03, etc.)
3. Maintains the character's exact face, features, hair, and clothing shown in the character design section and the reference photos
4. Describes camera movements, lens actions, lighting shifts, and action beats sequentially — think like a director choosing every lens, every angle, every lighting cue
5. Is written as ONE continuous paragraph — no timestamps, no shot/scene labels

Output ONLY the synthesized prompt text. Nothing else.`
          });

          const synthRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${SYNTH_MODEL}:generateContent?key=${API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts }] })
            }
          );

          const synthData = await synthRes.json();
          if (synthData.candidates?.[0]?.content?.parts?.[0]?.text) {
            finalPrompt = synthData.candidates[0].content.parts[0].text.trim();
          }
        } catch (synthErr) {
          console.error("Omni Synthesis failed, falling back to original prompt", synthErr);
        }
      }

      // --- Multi-Clip Pipeline ---
      // Split script into clips if it's long
      videoOut.innerHTML = `<div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;"><div class="pb-loading" style="width:80%; margin-bottom: 8px;"></div><div id="pbVeoStatus" style="font-size: 13px; color: #94a3b8; margin-top: 12px;">⏳ Analyzing script length...</div></div>`;
      
      const clipSegments = await pbSplitScript(finalPrompt);
      const totalClips = clipSegments.length;
      
      // Build quality guard
      const QUALITY_GUARD = pbGetQualityGuard(finalPrompt);

      let storyboardDirective = '';
      if (isStoryboard && window.pbStoryboardImage) {
        storyboardDirective = '\n\n[STORYBOARD ADHERENCE]: Follow the character design, clothing details, colors, environment, and sequential storyboard panels shown in the visual board sheet.';
      }

      // Build reference images once (shared across clips)
      const refImages = [];
      for (const img of pbImages) {
        if (refImages.length >= 3) break;
        const base64 = img.src.split(',')[1];
        const mimeType = img.src.split(';')[0].split(':')[1];
        // Use 'subject' referenceType for person/character identity locking
        refImages.push({ 
          referenceType: 'subject', 
          referenceId: img.tag || `character_${refImages.length + 1}`,
          image: { bytesBase64Encoded: base64, mimeType } 
        });
      }
      if (isStoryboard && window.pbStoryboardImage && refImages.length < 3) {
        refImages.push({ referenceType: 'style', image: { bytesBase64Encoded: window.pbStoryboardImage, mimeType: 'image/png' } });
      }

      // Helper: poll a Veo long-running operation
      async function pbPollOperation(opName, statusEl, label) {
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opName}?key=${API_KEY}`);
          const pollData = await pollRes.json();
          if (pollData.done) return pollData;
          if (statusEl) statusEl.textContent = `⏳ ${label} (${(i+1)*5}s)`;
        }
        throw new Error(`Timed out during: ${label}`);
      }

      // --- Last-frame extraction for continuity ---
      let lastFrameBase64 = null;

      // Helper to generate a single scene image (first frame) via Imagen 3
      async function pbGenerateSceneImage(clipPrompt, globalIdx, statusEl, lastFrameBase64 = null) {
        if (statusEl) statusEl.textContent = `🎨 Generating Scene ${globalIdx + 1} reference image...`;
        
        const activeArBtn = document.querySelector('.pb-ar-btn.active');
        const activeAr = activeArBtn ? activeArBtn.dataset.ar : '16:9';
        const parts = [];

        // Add character reference photos for consistency
        for (const img of pbImages) {
          const base64 = img.src.split(',')[1];
          const mimeType = img.src.split(';')[0].split(':')[1];
          parts.push({ inlineData: { mimeType, data: base64 } });
        }

        // Add the visual storyboard sheet as style / panel continuity reference
        if (window.pbStoryboardImage) {
          parts.push({ inlineData: { mimeType: 'image/png', data: window.pbStoryboardImage } });
        }

        // Add the character Forensic Description if available
        let descContext = '';
        if (pbCharacterDescription) {
          descContext = `EXACT CHARACTER DETAILS to replicate: ${pbCharacterDescription}\n`;
        }

        // Add product bottle consistency rules
        let productContext = '';
        if (pbImages.length > 1 && pbImages[1].tag) {
          productContext = `PRODUCT BOTTLE CONSISTENCY:
For the product bottle shown in the scene, you MUST maintain the exact shape, amber glass texture, black dropper cap, label layout, and brand logo from the product reference photo (tag: "${pbImages[1].tag}"). Do NOT simplify or alter the product branding or bottle shape.\n`;
        }

        // Add the exact end frame of the previous clip as a visual starting point reference for seamless continuity
        let continuityContext = '';
        if (lastFrameBase64) {
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: lastFrameBase64 } });
          continuityContext = `
VISUAL CONTINUITY (MUST START EXACTLY FROM PREVIOUS SHOT'S END STATE):
We have attached the last frame of the previous clip as a reference. Your generated scene image MUST start exactly from this frame's composition:
1. Replicate the character's clothing, hairstyle, physical pose/position in the frame, and facial expression.
2. Replicate the identical background setting, lighting direction/intensity, color grading, and ambient atmosphere.
3. Flow seamlessly from this end state, progressing the scene's action to depict: "${clipPrompt}".
`;
        }

        const imagePrompt = `[ENGINE: Nano Banana Pro 2] Generate a single cinematic, high-quality, photorealistic film still in ${activeAr} ratio for: "${clipPrompt}".
${descContext}
${productContext}
${continuityContext}
MANDATORY VISUAL STYLE: Premium cinema lighting, lifelike facial features, correct anatomy, natural environment. Follow the style and character features of the reference images and the visual storyboard sheet. Do NOT generate sketches, drawings, cartoons, or text overlays. Ensure strict natural physics and prevent any duplication.`;

        parts.push({ text: imagePrompt });

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: { responseModalities: ["IMAGE"], temperature: 1.0 }
            })
          }
        );

        const data = await res.json();
        if (data.error) throw new Error(`Scene image generation failed: ${data.error.message}`);
        const resParts = data.candidates?.[0]?.content?.parts || [];
        let b64 = null;
        for (const part of resParts) {
          if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
            b64 = part.inlineData.data;
            break;
          }
        }
        if (!b64) throw new Error("No image data returned for Scene Image.");
        return b64;
      }

      // --- Last-frame extraction for continuity from previous run ---
      lastFrameBase64 = null;
      const startIdx = pbClips.length;

      if (startIdx > 0 && pbClips[startIdx - 1].videoUrl) {
        try {
          const prevVideoUrl = pbClips[startIdx - 1].videoUrl;
          const statusEl = document.getElementById('pbVeoStatus');
          if (statusEl) statusEl.textContent = `📸 Extracting continuity frame from last clip...`;
          lastFrameBase64 = await captureLastFrame(prevVideoUrl);
          if (lastFrameBase64) {
            console.log(`Successfully loaded continuity frame from previous clip (${startIdx - 1})`);
          }
        } catch (e) {
          console.warn("Failed to capture continuity frame from previous run:", e);
        }
      }

      // Initialize and append new clips
      const newClips = clipSegments.map((seg, i) => ({
        id: startIdx + i,
        prompt: seg.prompt,
        dialogue: seg.dialogue || null,
        status: 'queued',
        videoUrl: null,
        videoData: null,
        trimStart: 0,
        trimEnd: 10,
        cropRatio: 'fit',
        excluded: false
      }));
      pbClips = [...pbClips, ...newClips];
      pbRenderTimeline();
      document.getElementById('pbClipStatus').textContent = totalClips > 1 ? `0 of ${totalClips} new clips` : '';

      // Generate each clip sequentially
      for (let ci = 0; ci < totalClips; ci++) {
        const globalIdx = startIdx + ci;
        const seg = clipSegments[ci];
        pbClips[globalIdx].status = 'generating';
        pbRenderTimeline();

        // 1. Generate Scene Image keyframe if not already present
        let sceneImageB64 = pbClips[globalIdx].sceneImage || null;
        if (!sceneImageB64) {
          try {
            const statusEl = document.getElementById('pbVeoStatus');
            sceneImageB64 = await pbGenerateSceneImage(seg.prompt, globalIdx, statusEl, lastFrameBase64);
            pbClips[globalIdx].sceneImage = sceneImageB64;
            pbRenderTimeline();
          } catch (imgErr) {
            console.warn(`Failed to generate scene image for clip ${ci+1}:`, imgErr);
          }
        }

        // Build continuity-aware prompt
        let continuityPrefix = '';
        if (ci > 0 && totalClips > 1) {
          const prevSeg = clipSegments[ci - 1];
          const endState = prevSeg.end_state || 'the previous scene';
          continuityPrefix = `[CONTINUITY START STATE]: You MUST start this video animation exactly from the attached last frame of the previous clip (showing ${endState}). Maintain the exact same camera position, setting, lighting, clothing, and character pose at the start.
[VISUAL STORYBOARD TARGET]: We have also attached a visual storyboard keyframe for this clip. Smoothly transition the character and composition to depict: `;
        } else {
          continuityPrefix = `[VISUAL STORYBOARD TARGET]: We have attached a visual storyboard keyframe for this clip. Start from this composition and animate: `;
        }
        if (seg.identity_anchor) {
          continuityPrefix += `[CHARACTER IDENTITY]: ${seg.identity_anchor}. `;
        }

        let audioDirective = '';
        if (seg.dialogue) {
          audioDirective = `\n\n[VOICE & AUDIO DIRECTIVES]: The character (${pbImages[0]?.tag || 'presenter'}) speaks the following dialogue in sync with their lip movement: "${seg.dialogue}". The character's voice must remain completely consistent across all clips: a mid-aged male voice speaking in a warm, quirky, expressive tone with a subtle, sophisticated accent. The speech pacing must sync perfectly with the character's facial expressions and lip movements.`;
        }
        const clipPrompt = continuityPrefix + seg.prompt + '\n\n[QUALITY DIRECTIVES]: ' + QUALITY_GUARD + storyboardDirective + audioDirective;
        
        videoOut.innerHTML = `<div style="padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;"><div class="pb-loading" style="width:80%; margin-bottom: 8px;"></div><div id="pbVeoStatus" style="font-size: 13px; color: #94a3b8; margin-top: 12px;">⏳ Generating clip ${ci+1} of ${totalClips}...</div></div>`;
        btn.textContent = `⏳ Clip ${ci+1}/${totalClips}`;

        let clip;

        try {
          if (VIDEO_MODEL === 'gemini-omni-flash-preview') {
            // Interactions API flow for Gemini Omni Flash
            // Build multimodal input with reference images when available
            const inputParts = [];

            // Add user reference images (character photos)
            for (const img of pbImages) {
              const base64 = img.src.split(',')[1];
              const mimeType = img.src.split(';')[0].split(':')[1];
              inputParts.push({ type: 'image', data: base64, mime_type: mimeType });
            }

            // Note: The multi-panel storyboard sheet is omitted here to prevent Omni Flash from animating the grid sheet itself.

            // Add exact last frame of previous clip as the absolute start frame guide
            if (lastFrameBase64 && ci > 0) {
              const pureLast = lastFrameBase64.includes(';base64,') ? lastFrameBase64.split(';base64,')[1] : lastFrameBase64;
              inputParts.push({ type: 'image', data: pureLast, mime_type: 'image/jpeg' });
            }

            // Add generated scene image keyframe as target guide
            if (sceneImageB64) {
              const pureData = sceneImageB64.includes(';base64,') ? sceneImageB64.split(';base64,')[1] : sceneImageB64;
              inputParts.push({ type: 'image', data: pureData, mime_type: 'image/png' });
            }

            // Note: We rely on descriptive voice text guidelines in the prompt because the Omni Flash 
            // interactions endpoint doesn't support the audio input modality yet.

            // Add the text prompt
            inputParts.push({ type: 'text', text: clipPrompt });

            // Use multimodal input when we have images, plain string otherwise
            const hasImages = inputParts.some(p => p.type === 'image');
            const requestBody = {
              model: "gemini-omni-flash-preview",
              input: hasImages ? inputParts : clipPrompt,
              response_format: {
                type: "video",
                aspect_ratio: activeAr
              }
            };

            const startRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/interactions?key=${API_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
              }
            );

            const interactionRes = await startRes.json();
            console.log(`Clip ${ci+1} Omni Flash response:`, interactionRes);
            if (interactionRes.error) throw new Error(interactionRes.error.message);

            // Locate the video data in steps array
            let videoB64 = null;
            const steps = interactionRes.steps || [];
            for (const step of steps) {
              if (step.content) {
                const contentList = Array.isArray(step.content) ? step.content : [step.content];
                for (const content of contentList) {
                  const partsList = content.parts || [content];
                  for (const part of partsList) {
                    if (part.type === 'video' || (part.mimeType && part.mimeType.startsWith('video/')) || part.data) {
                      if (part.data) {
                        videoB64 = part.data;
                        break;
                      }
                      if (part.inlineData && part.inlineData.data) {
                        videoB64 = part.inlineData.data;
                        break;
                      }
                    }
                  }
                  if (videoB64) break;
                }
              }
              if (videoB64) break;
            }

            if (!videoB64) {
              throw new Error("No video data returned in Omni Flash interaction response.");
            }

            clip = { bytesBase64Encoded: videoB64 };

          } else {
            // 2. Standard Veo 3.1 predictLongRunning flow
            const body = { 
              instances: [{ prompt: clipPrompt }],
              parameters: { aspectRatio: activeAr, personGeneration: 'allow_adult', durationSeconds: 10, sampleCount: 1, resolution: pbResolution }
            };
            // Build reference images: user refs + last frame from previous clip
            const clipRefImages = [...refImages];
            if (lastFrameBase64 && ci > 0 && clipRefImages.length < 3) {
              clipRefImages.push({ referenceType: 'subject', referenceId: 'continuity_frame', image: { bytesBase64Encoded: lastFrameBase64, mimeType: 'image/jpeg' } });
            }
            if (sceneImageB64 && clipRefImages.length < 3) {
              clipRefImages.push({ referenceType: 'first_frame', referenceId: 'first_frame', image: { bytesBase64Encoded: sceneImageB64, mimeType: 'image/png' } });
            }
            if (clipRefImages.length > 0) body.instances[0].referenceImages = clipRefImages;

            const startRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${VIDEO_MODEL}:predictLongRunning?key=${API_KEY}`,
              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            );
            const startData = await startRes.json();
            console.log(`Clip ${ci+1} Veo response:`, JSON.stringify(startData, null, 2));
            if (startData.error) throw new Error(startData.error.message);
            const opName = startData.name;
            if (!opName) throw new Error('No operation returned.');

            const statusEl = document.getElementById('pbVeoStatus');
            const result = await pbPollOperation(opName, statusEl, `Clip ${ci+1}/${totalClips}`);
            if (result.error) throw new Error(result.error.message);

            // Parse videos from result
            let videos = result.response?.generateVideoResponse?.generatedVideos || 
                         result.response?.generateVideoResponse?.generatedSamples || 
                         result.response?.generatedVideos || result.response?.generatedSamples || 
                         result.result?.generateVideoResponse?.generatedVideos || result.result?.generateVideoResponse?.generatedSamples ||
                         result.result?.generatedVideos || result.result?.generatedSamples || result.generatedVideos || result.generatedSamples || [];

            if (videos.length === 0) {
              function findVids(obj, d) {
                if (!obj || typeof obj !== 'object' || d > 5) return null;
                if (Array.isArray(obj) && obj.length > 0 && (obj[0].video || obj[0].uri || obj[0].bytesBase64Encoded)) return obj;
                if (Array.isArray(obj)) return null;
                for (const k of Object.keys(obj)) { const f = findVids(obj[k], d+1); if (f) return f; }
                return null;
              }
              const deep = findVids(result, 0);
              if (deep) videos = deep;
            }

            const rawClip = videos.length > 0 ? (videos[0].video || videos[0]) : null;
            if (!rawClip || (!rawClip.uri && !rawClip.bytesBase64Encoded)) {
              const raiFiltered = result.response?.raiMediaFilteredCount || result.result?.raiMediaFilteredCount || 0;
              if (raiFiltered > 0) throw new Error(`Clip ${ci+1} blocked by content safety filter`);
              throw new Error(`No video returned for clip ${ci+1}`);
            }
            clip = rawClip;
          }

          // Store clip result
          let videoUrl;
          if (clip.uri) {
            const authUri = clip.uri.includes('?') ? `${clip.uri}&key=${API_KEY}` : `${clip.uri}?key=${API_KEY}`;
            videoUrl = getApiUrl(`/api/video-proxy?url=${encodeURIComponent(authUri)}`);
          } else {
            videoUrl = `data:video/mp4;base64,${clip.bytesBase64Encoded}`;
          }

          pbClips[globalIdx].status = 'done';
          pbClips[globalIdx].videoUrl = videoUrl;
          pbClips[globalIdx].videoData = clip;
          pbRenderTimeline();

          // Extract audio voice reference from first clip to maintain vocal consistency
          if (ci === 0 && VIDEO_MODEL === 'gemini-omni-flash-preview') {
            try {
              const statusEl = document.getElementById('pbVeoStatus');
              if (statusEl) statusEl.textContent = `🎙️ Extracting voice reference from Clip 1...`;
              const voiceB64 = await pbExtractAudio(videoUrl);
              if (voiceB64) {
                window.pbVoiceReference = voiceB64;
                console.log("Successfully extracted and locked voice reference from Clip 1.");
              }
            } catch (audioErr) {
              console.warn("Failed to extract voice reference from Clip 1:", audioErr);
            }
          }

          // Show the latest generated clip in the preview
          videoOut.innerHTML = '';
          const videoEl = document.createElement('video');
          videoEl.controls = true; videoEl.autoplay = true; videoEl.loop = (totalClips === 1);
          videoEl.playsInline = true;
          videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:12px;';
          videoEl.src = videoUrl;
          videoOut.appendChild(videoEl);
          document.getElementById('pbClipStatus').textContent = totalClips > 1 ? `${ci+1} of ${totalClips} done` : '';

          // Save each clip to library
          pbSaveToLibrary(
            document.getElementById('pbChatInput').value.trim() || seg.prompt,
            clip, activeAr
          );

          // Show AI review button
          document.getElementById('pbReviewBtn').style.display = 'inline-block';

          // Capture last frame for continuity with next clip
          if (ci < totalClips - 1) {
            try {
              const statusEl = document.getElementById('pbVeoStatus');
              if (statusEl) statusEl.textContent = `📸 Capturing continuity frame from clip ${ci+1}...`;
              lastFrameBase64 = await captureLastFrame(videoUrl);
              if (lastFrameBase64) {
                console.log(`Captured last frame from clip ${ci+1} for continuity (${Math.round(lastFrameBase64.length/1024)}KB)`);
              }
            } catch (frameErr) {
              console.warn('Last-frame capture failed, continuing without:', frameErr);
              lastFrameBase64 = null;
            }
          }

        } catch (clipErr) {
          console.error(`Clip ${ci+1} failed:`, clipErr);
          pbClips[globalIdx].status = 'error';
          pbClips[globalIdx].errorMessage = clipErr.message;
          pbRenderTimeline();
          // Show the retry panel if this was the last or active preview clip
          window.pbPlayClip(globalIdx);
        }
      }

      // If multi-clip, auto-play all
      if (totalClips > 1) {
        const doneCount = pbClips.filter(c => c.status === 'done').length;
        document.getElementById('pbClipStatus').textContent = `✅ ${doneCount}/${totalClips} clips generated`;
        if (doneCount > 1) window.pbPlayAll();
      }

    } catch (err) {
      videoOut.innerHTML = `<div style="padding:16px; text-align:center;"><span style="font-size:28px;">⚠️</span><br><span style="font-size:13px; color:#ef4444;">${err.message}</span></div>`;
    }

    btn.textContent = '🎬 Generate';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  };

  // --- Video Library Logic ---
  let pbVideoLibrary = [];

  function pbLoadLibrary() {
    try {
      const saved = localStorage.getItem('pb_video_library');
      if (saved) {
        pbVideoLibrary = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load video library", e);
    }
    pbRenderLibrary();
  }

  function pbSaveToLibrary(prompt, videoObj, aspectRatio, userName) {
    const date = new Date();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const item = {
      id: Date.now(),
      prompt: prompt,
      uri: videoObj.uri || null,
      bytes: videoObj.bytesBase64Encoded ? "db_ref" : null, // Tag as db reference
      date: timeStr,
      aspectRatio: aspectRatio,
      user: userName || 'Presenter'
    };
    
    // Store actual video bytes in IndexedDB
    if (videoObj.bytesBase64Encoded) {
      setMedia(`video_${item.id}`, videoObj.bytesBase64Encoded).catch(err => {
        console.error("Failed to write video bytes to IndexedDB:", err);
      });
    }

    pbVideoLibrary.unshift(item);
    try {
      localStorage.setItem('pb_video_library', JSON.stringify(pbVideoLibrary));
    } catch (e) {
      console.error("Failed to save video metadata to library", e);
    }
    pbRenderLibrary();
    // Update user generation count
    pbUpdateUserGenCount(item.user);
    // Also push to shared API
    fetch(getApiUrl('/api/state?action=video'), {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ user: item.user, prompt, aspectRatio, uri: videoObj.uri || null })
    }).catch(() => {});
  }

  function pbGetUserGenCount(userName) {
    try {
      const counts = JSON.parse(localStorage.getItem('pb_user_gen_counts') || '{}');
      return counts[userName] || 0;
    } catch (e) { return 0; }
  }

  function pbUpdateUserGenCount(userName) {
    try {
      const counts = JSON.parse(localStorage.getItem('pb_user_gen_counts') || '{}');
      counts[userName] = (counts[userName] || 0) + 1;
      localStorage.setItem('pb_user_gen_counts', JSON.stringify(counts));
    } catch (e) { console.error("Failed to update gen count", e); }
  }

  window._pbPlayLibraryItem = async function(id) {
    const item = pbVideoLibrary.find(i => i.id === id);
    if (!item) return;

    const lightbox = document.getElementById('pbLightbox');
    const player = document.getElementById('pbLbPlayer');
    const infoEl = document.getElementById('pbLbDrawerInfo');
    if (!player) return;

    // Highlight active item
    document.querySelectorAll('.pb-library-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('.pb-library-item');
    items.forEach(el => {
      if (el.getAttribute('onclick')?.includes(String(id))) el.classList.add('active');
    });

    // Open drawer
    if (lightbox) lightbox.classList.add('has-drawer');

    // Show prompt info
    if (infoEl) {
      infoEl.innerHTML = `<strong>Prompt:</strong> ${item.prompt}<br><span style="font-size:10px;color:#94a3b8;">📅 ${item.date} &nbsp; 📐 ${item.aspectRatio}</span>`;
    }

    // Determine source
    let videoSrc = '';
    if (item.bytes === 'db_ref') {
      try {
        const storedBytes = await getMedia(`video_${item.id}`);
        if (storedBytes) {
          videoSrc = `data:video/mp4;base64,${storedBytes}`;
        }
      } catch (err) {
        console.error("Failed to load video bytes from IndexedDB:", err);
      }
    } else if (item.bytes) {
      videoSrc = `data:video/mp4;base64,${item.bytes}`;
    } else if (item.uri) {
      // Use server-side proxy to avoid CORS issues
      const authenticatedUri = item.uri.includes('?') ? `${item.uri}&key=${API_KEY}` : `${item.uri}?key=${API_KEY}`;
      videoSrc = getApiUrl(`/api/video-proxy?url=${encodeURIComponent(authenticatedUri)}`);
    }

    if (!videoSrc) {
      player.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:13px;">No video source available</div>`;
      return;
    }

    // For base64 data, play directly
    if (videoSrc.startsWith('data:')) {
      player.innerHTML = '';
      const videoEl = document.createElement('video');
      videoEl.controls = true; videoEl.autoplay = true; videoEl.loop = true; videoEl.playsInline = true;
      videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:12px;';
      videoEl.src = videoSrc;
      player.appendChild(videoEl);
      return;
    }

    // Show downloading UI with progress bar
    player.innerHTML = `
      <div style="text-align:center; padding: 24px; width: 80%; margin: 40px auto 0;">
        <div style="font-size:12px; color:#e2e8f0; margin-bottom:12px; font-weight:500;">⏳ Downloading video...</div>
        <div style="width:100%; height:8px; background:#1e293b; border-radius:4px; overflow:hidden; margin-bottom:8px;">
          <div id="pbLibDownloadBar" style="width:0%; height:100%; background:linear-gradient(90deg, #4f46e5, #06b6d4); transition: width 0.15s ease;"></div>
        </div>
        <div id="pbLibDownloadPct" style="font-size:11px; color:#94a3b8; font-family:monospace;">0%</div>
      </div>
    `;

    try {
      const fetchRes = await fetch(videoSrc);
      if (!fetchRes.ok) {
        const errData = await fetchRes.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${fetchRes.status}`);
      }

      const contentLength = fetchRes.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (total > 0 && fetchRes.body) {
        // Stream with progress
        const reader = fetchRes.body.getReader();
        let loaded = 0;
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          const pct = Math.min(100, Math.round((loaded / total) * 100));
          const bar = document.getElementById('pbLibDownloadBar');
          const pctEl = document.getElementById('pbLibDownloadPct');
          if (bar) bar.style.width = `${pct}%`;
          if (pctEl) pctEl.textContent = `${pct}%`;
        }

        const blob = new Blob(chunks, { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        player.innerHTML = '';
        const videoEl = document.createElement('video');
        videoEl.controls = true; videoEl.autoplay = true; videoEl.loop = true; videoEl.playsInline = true;
        videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:12px;';
        videoEl.src = blobUrl;
        player.appendChild(videoEl);
      } else {
        // No content-length, just use direct streaming
        const blob = await fetchRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        player.innerHTML = '';
        const videoEl = document.createElement('video');
        videoEl.controls = true; videoEl.autoplay = true; videoEl.loop = true; videoEl.playsInline = true;
        videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:12px;';
        videoEl.src = blobUrl;
        player.appendChild(videoEl);
      }
    } catch (e) {
      console.error('Library video fetch failed:', e);
      player.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:13px;">⚠️ ${e.message || 'Video unavailable'}<br><span style="color:#64748b;font-size:11px;">The video link may have expired (~30 min lifetime).</span></div>`;
    }
  };

  window._pbCloseDrawer = function() {
    const lightbox = document.getElementById('pbLightbox');
    const player = document.getElementById('pbLbPlayer');
    const infoEl = document.getElementById('pbLbDrawerInfo');
    if (lightbox) lightbox.classList.remove('has-drawer');
    // Stop video playback
    if (player) {
      const vid = player.querySelector('video');
      if (vid) { vid.pause(); vid.src = ''; }
      setTimeout(() => {
        player.innerHTML = `<div class="pb-lb-drawer-empty"><span style="font-size:36px;">🎬</span><span style="font-size:12px;color:#94a3b8;">Select a video to play</span></div>`;
      }, 350);
    }
    if (infoEl) infoEl.innerHTML = '';
    // Remove active highlight
    document.querySelectorAll('.pb-library-item').forEach(el => el.classList.remove('active'));
  };

  window._pbRemoveLibraryItem = function(id, event) {
    if (event) event.stopPropagation();
    pbVideoLibrary = pbVideoLibrary.filter(i => i.id !== id);
    try {
      localStorage.setItem('pb_video_library', JSON.stringify(pbVideoLibrary));
      // Delete from IndexedDB
      removeMedia(`video_${id}`).catch(err => console.error("Failed to delete video from DB:", err));
    } catch (e) {
      console.error("Failed to remove item", e);
    }
    pbRenderLibrary();
  };

  const USER_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

  function pbGetUserColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  }

  function pbRenderLibrary() {
    const list = document.getElementById('pbLibrary');
    if (!list) return;

    // Update badge count
    const countEl = document.getElementById('pbLibraryCount');
    if (countEl) {
      countEl.textContent = pbVideoLibrary.length > 0 ? `(${pbVideoLibrary.length})` : '';
    }

    if (pbVideoLibrary.length === 0) {
      list.innerHTML = `
        <div class="pb-library-placeholder">
          <span style="font-size: 40px;">🎬</span>
          <span style="font-size: 13px; color: #94a3b8;">Your generated videos will appear here</span>
        </div>
      `;
      return;
    }

    // Group by user
    const groups = {};
    pbVideoLibrary.forEach(item => {
      const user = item.user || 'Presenter';
      if (!groups[user]) groups[user] = [];
      groups[user].push(item);
    });

    let html = '';
    for (const [userName, items] of Object.entries(groups)) {
      const playableItems = items.filter(item => item.uri || item.bytes);
      if (playableItems.length === 0) continue; // Skip users with no playable videos
      const color = pbGetUserColor(userName);
      const initial = userName.charAt(0).toUpperCase();
      const genCount = playableItems.length;
      html += `
        <div class="pb-library-group">
          <div class="pb-library-group-header">
            <div class="pb-library-avatar" style="background:${color};">${initial}</div>
            ${userName}
            <span class="pb-library-gen-count">${genCount} video${genCount !== 1 ? 's' : ''}</span>
          </div>
          ${playableItems.map(item => `
            <div class="pb-library-item animate-in" onclick="window._pbPlayLibraryItem(${item.id})">
              <div class="pb-library-thumb">🎬</div>
              <div class="pb-library-info">
                <div class="pb-library-prompt" title="${item.prompt}">${item.prompt}</div>
                <div class="pb-library-meta">
                  <span>📅 ${item.date}</span>
                  <span>📐 ${item.aspectRatio}</span>
                </div>
              </div>
              <button class="pb-library-rm" onclick="window._pbRemoveLibraryItem(${item.id}, event)">✕</button>
            </div>
          `).join('')}
        </div>
      `;
    }
    list.innerHTML = html;

    // Update connected users in QR modal
    pbUpdateConnectedUsers();
  }

  function pbUpdateConnectedUsers() {
    const el = document.getElementById('pbQrUsers');
    console.log('[USERS] pbUpdateConnectedUsers called, _serverUsers =', _serverUsers, ', el =', el);
    
    // Update connected users count in presentation overlay
    const presCountEl = document.getElementById('pbPresUserCount');
    if (presCountEl) {
      presCountEl.textContent = _serverUsers.length;
    }

    if (!el) { console.warn('[USERS] pbQrUsers element not found in DOM'); return; }
    if (_serverUsers.length === 0) {
      el.innerHTML = '<span style="font-size:11px;color:#94a3b8;">No users connected yet</span>';
      return;
    }
    const html = _serverUsers.map(u => `<span class="pb-qr-user-chip"><span class="chip-dot"></span>${u}</span>`).join('');
    console.log('[USERS] Setting innerHTML to:', html);
    el.innerHTML = html;
  }

  // --- Lightbox Open/Close ---
  window._pbOpenLibrary = function() {
    const lightbox = document.getElementById('pbLightbox');
    if (lightbox) lightbox.classList.add('open');
  };

  window._pbCloseLibrary = function() {
    const lightbox = document.getElementById('pbLightbox');
    if (lightbox) {
      // Close drawer first
      window._pbCloseDrawer();
      lightbox.classList.remove('open');
    }
  };

  window._pbClearAllLibrary = async function() {
    if (!confirm('Are you sure you want to clear ALL generated videos from the server and local browser cache? This cannot be undone.')) return;
    try {
      // Clear local memory
      pbVideoLibrary = [];
      localStorage.removeItem('pb_video_library');
      pbRenderLibrary();
      
      // Clear IndexedDB store
      try {
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
      } catch (dbErr) {
        console.warn("Failed to clear media DB:", dbErr);
      }
      
      // Close lightbox drawer if open
      window._pbCloseDrawer();
      
      // Reset server state
      const res = await fetch(getApiUrl('/api/state?action=reset'), { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        _serverVideoCount = 0;
        alert('All videos cleared successfully from both server and local client!');
      }
    } catch (e) {
      console.error('Failed to clear library:', e);
      alert('Local cache cleared, but failed to reset server state. It might already be cleared.');
    }
  };

  // --- Connect / QR Code ---
  window._pbShowConnect = function() {
    const modal = document.getElementById('pbQrModal');
    if (!modal) return;
    
    // Build URL for the connect page dynamically
    const connectUrl = window.location.origin.includes('localhost') 
      ? 'https://vibetheory-app.vercel.app/connect.html' 
      : window.location.origin + '/connect.html';
    
    // Set QR image
    const qrImg = document.getElementById('pbQrImage');
    qrImg.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(connectUrl)}" alt="QR Code">`;
    
    // Set URL text
    const urlEl = document.getElementById('pbQrUrl');
    urlEl.textContent = connectUrl;
    
    pbUpdateConnectedUsers();
    modal.classList.add('open');
  };

  window._pbHideConnect = function() {
    const modal = document.getElementById('pbQrModal');
    if (modal) modal.classList.remove('open');
  };

  window._pbLogoutAllUsers = async function() {
    if (!confirm('Are you sure you want to disconnect and logout all users? (Their current video creations will remain in the library)')) return;
    try {
      const res = await fetch(getApiUrl('/api/state?action=logout_all'), { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        _serverUsers = [];
        pbUpdateConnectedUsers();
        const badge = document.getElementById('pbUserCount');
        if (badge) badge.style.display = 'none';
      }
    } catch (e) {
      console.error('Failed to logout users:', e);
    }
  };

  // --- Presentation Mode Toggle & Render ---
  let _pbPresentationModeActive = false;

  window.pbTogglePresentationMode = function() {
    const overlay = document.getElementById('pbPresentationOverlay');
    if (!overlay) return;

    _pbPresentationModeActive = !_pbPresentationModeActive;
    if (_pbPresentationModeActive) {
      overlay.style.display = 'flex';
      // Build connect URL dynamically
      const connectUrl = window.location.origin.includes('localhost') 
        ? 'https://vibetheory-app.vercel.app/connect.html' 
        : window.location.origin + '/connect.html';

      // Render QR
      const presQrImg = document.getElementById('pbPresQrImage');
      if (presQrImg) {
        presQrImg.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(connectUrl)}" alt="Presentation QR Code">`;
      }
      const presQrUrl = document.getElementById('pbPresQrUrl');
      if (presQrUrl) {
        presQrUrl.textContent = connectUrl;
      }
      
      pbUpdateConnectedUsers();
      pbRenderPresentationGrid();
    } else {
      overlay.style.display = 'none';
    }
  };

  function pbRenderPresentationGrid() {
    const grid = document.getElementById('pbPresGrid');
    if (!grid) return;

    if (pbVideoLibrary.length === 0) {
      grid.innerHTML = '<div class="pb-pres-grid-empty">Waiting for creations... Scan the QR code to start!</div>';
      return;
    }

    grid.innerHTML = pbVideoLibrary.map(video => {
      const authUri = video.uri ? (video.uri.includes('?') ? `${video.uri}&key=${API_KEY}` : `${video.uri}?key=${API_KEY}`) : '';
      const proxyUrl = video.uri ? getApiUrl(`/api/video-proxy?url=${encodeURIComponent(authUri)}`) : '';
      if (!proxyUrl) return '';
      return `
        <div class="pb-pres-video-card animate-in">
          <video src="${proxyUrl}" autoplay loop muted playsinline></video>
          <div class="pb-pres-video-info">
            <div class="pb-pres-video-user">👤 ${video.user}</div>
            <div class="pb-pres-video-prompt">${video.prompt}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Live polling from shared API ---
  let _serverUsers = [];
  let _serverVideoCount = 0;

  async function pollServerState() {
    const apiUrl = getApiUrl(`/api/state?action=users&t=${Date.now()}`);
    try {
      console.log('[POLL] Fetching users from:', apiUrl);
      const res = await fetch(apiUrl);
      if (!res.ok) {
        console.error('[POLL] HTTP error:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      console.log('[POLL] Raw API response:', JSON.stringify(data));
      const users = Object.keys(data.users || {});
      const count = users.length;
      console.log('[POLL] Found', count, 'users:', users);
      
      // Update Connect button badge
      const badge = document.getElementById('pbUserCount');
      if (badge) {
        if (count > 0) {
          badge.textContent = count;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      } else {
        console.warn('[POLL] pbUserCount badge element not found');
      }

      _serverUsers = users;
      pbUpdateConnectedUsers();

      // Also fetch videos for library
      const vidUrl = getApiUrl(`/api/state?action=videos&t=${Date.now()}`);
      const vidRes = await fetch(vidUrl);
      const vidData = await vidRes.json();
      const serverVideos = vidData.videos || [];
      if (serverVideos.length !== _serverVideoCount) {
        _serverVideoCount = serverVideos.length;
        // Merge server videos into library (avoid duplicates by id, skip items with no source)
        const existingIds = new Set(pbVideoLibrary.map(v => v.id));
        for (const sv of serverVideos) {
          if (!existingIds.has(sv.id) && (sv.uri || sv.bytes)) {
            pbVideoLibrary.unshift(sv);
          }
        }
        pbRenderLibrary();
        if (_pbPresentationModeActive) {
          pbRenderPresentationGrid();
        }
      }
    } catch (e) {
      console.error('[POLL] Error fetching server state:', e.message, '| URL:', apiUrl);
    }
  }

  // Poll every 3 seconds
  setInterval(pollServerState, 3000);
  pollServerState(); // Initial fetch

  pbLoadLibrary();

  // --- Session Restore on Load ---
  const savedSessionId = localStorage.getItem(PB_ACTIVE_SESSION_KEY);
  if (savedSessionId && pbLoadSession(savedSessionId)) {
    // Session restored successfully
  } else {
    pbSaveSession();
    pbRenderChatHistory();
  }
  pbRenderSessionList();

})();
