import os
import base64
import json
import logging
from urllib.parse import urlparse
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from video_processor import merge_clips, swap_audio

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

app = FastAPI(title="Vibe Theory API Backend")

DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
]
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
]
ADMIN_TOKEN = os.environ.get("VIBE_ADMIN_TOKEN", "")
LOCAL_CLIENT_HOSTS = {"127.0.0.1", "::1", "localhost"}
GOOGLE_HOST_SUFFIXES = ("googleapis.com", "google.com", "googleusercontent.com")
MAX_MERGE_CLIPS = int(os.environ.get("MAX_MERGE_CLIPS", "60"))
MAX_CLIP_SECONDS = float(os.environ.get("MAX_CLIP_SECONDS", "600"))
ALLOWED_ASPECT_RATIOS = {
    "16:9",
    "9:16",
    "1:1",
    "16:9-2k",
    "9:16-2k",
    "1:1-2k",
    "16:9-4k",
    "9:16-4k",
    "1:1-4k",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state.json")

def _client_host(request: Request) -> str:
    return request.client.host if request.client else ""

def require_admin_or_local(request: Request):
    if ADMIN_TOKEN:
        token = request.headers.get("x-admin-token") or request.query_params.get("adminToken", "")
        if token != ADMIN_TOKEN:
            raise HTTPException(status_code=403, detail="Admin token required")
        return

    if _client_host(request) not in LOCAL_CLIENT_HOSTS:
        raise HTTPException(status_code=403, detail="Destructive action allowed only from localhost")

def hostname_matches(hostname: Optional[str], suffixes: tuple[str, ...]) -> bool:
    host = (hostname or "").lower().rstrip(".")
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in suffixes)

def validate_google_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid media URL")
    if not hostname_matches(parsed.hostname, GOOGLE_HOST_SUFFIXES):
        raise HTTPException(status_code=403, detail="Only trusted Google media URLs allowed")
    return raw_url

def read_state() -> dict:
    if not os.path.exists(STATE_FILE):
        return {"users": {}, "videos": []}
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"users": {}, "videos": []}

def write_state(state: dict):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write local state: {e}")

# State API Schemas
class JoinRequest(BaseModel):
    name: str

class VideoItem(BaseModel):
    user: str
    prompt: str
    aspectRatio: str
    uri: Optional[str] = None

# --- STATE SYNC ENDPOINTS ---

@app.get("/api/state")
def get_state(action: Optional[str] = None):
    state = read_state()
    if action == "users":
        return {"users": state.get("users", {}), "count": len(state.get("users", {}))}
    if action == "videos":
        return {"videos": state.get("videos", [])}
    return {
        "users": state.get("users", {}),
        "userCount": len(state.get("users", {})),
        "videos": state.get("videos", []),
        "videoCount": len(state.get("videos", []))
    }

@app.post("/api/state")
async def post_state(action: str, body: dict, request: Request):
    state = read_state()
    
    if action == "join":
        name = body.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Name required")
        if "users" not in state:
            state["users"] = {}
        if "videos" not in state:
            state["videos"] = []
        user_videos = [v for v in state["videos"] if v.get("user") == name]
        import time
        state["users"][name] = {
            "name": name,
            "joinedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "videoCount": len(user_videos)
        }
        write_state(state)
        return {
            "ok": True,
            "userCount": len(state["users"]),
            "remaining": 3 - len(user_videos)
        }

    if action == "video":
        user = body.get("user")
        prompt = body.get("prompt", "")
        aspect_ratio = body.get("aspectRatio", "9:16")
        uri = body.get("uri")
        
        if not user:
            raise HTTPException(status_code=400, detail="User required")
        if "videos" not in state:
            state["videos"] = []
            
        user_videos = [v for v in state["videos"] if v.get("user") == user]
        if len(user_videos) >= 10000:
            raise HTTPException(status_code=429, detail="Limit reached")
            
        import time
        video = {
            "id": int(time.time() * 1000),
            "user": user,
            "prompt": prompt,
            "uri": uri,
            "aspectRatio": aspect_ratio,
            "date": time.strftime("%I:%M %p"),
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        state["videos"].insert(0, video)
        
        if "users" not in state:
            state["users"] = {}
        if user in state["users"]:
            state["users"][user]["videoCount"] = len(user_videos) + 1
            
        write_state(state)
        return {
            "ok": True,
            "video": video,
            "remaining": 10000 - (len(user_videos) + 1)
        }

    if action == "reset":
        require_admin_or_local(request)
        write_state({"users": {}, "videos": []})
        return {"ok": True, "message": "State reset"}

    if action == "logout_all":
        require_admin_or_local(request)
        state["users"] = {}
        write_state(state)
        return {"ok": True, "message": "All users logged out"}

    if action == "logout":
        name = body.get("name")
        if name and "users" in state:
            state["users"].pop(name, None)
            write_state(state)
        return {"ok": True, "message": f"User {name} logged out"}

    raise HTTPException(status_code=400, detail="Unknown action")


# --- AGENT MEMORY (persistent learning brain for the Cinematic Creative Director) ---

MEMORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_memory.json")
MEMORY_CAP_PER_TYPE = 100  # keep the newest N entries per memory type

def read_memory() -> dict:
    if not os.path.exists(MEMORY_FILE):
        return {"entries": []}
    try:
        with open(MEMORY_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {"entries": []}

def write_memory(memory: dict):
    try:
        with open(MEMORY_FILE, "w") as f:
            json.dump(memory, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write agent memory: {e}")

class MemoryEntry(BaseModel):
    type: str  # "learning" | "mistake" | "lesson" | "preference"
    text: str
    meta: Optional[str] = None

@app.get("/api/agent-memory")
def get_agent_memory():
    memory = read_memory()
    return {"entries": memory.get("entries", [])}

@app.post("/api/agent-memory")
def post_agent_memory(entry: MemoryEntry):
    import time
    allowed_types = {"learning", "mistake", "lesson", "preference"}
    if entry.type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"type must be one of {sorted(allowed_types)}")
    memory = read_memory()
    entries = memory.get("entries", [])
    entries.append({
        "type": entry.type,
        "text": entry.text.strip()[:2000],
        "meta": (entry.meta or "").strip()[:500] or None,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    })
    # Cap each type to the newest entries so the brain stays sharp, not bloated
    trimmed = []
    for mem_type in {e["type"] for e in entries}:
        of_type = [e for e in entries if e["type"] == mem_type]
        trimmed.extend(of_type[-MEMORY_CAP_PER_TYPE:])
    trimmed.sort(key=lambda e: e.get("createdAt", ""))
    memory["entries"] = trimmed
    write_memory(memory)
    return {"ok": True, "count": len(trimmed)}

@app.delete("/api/agent-memory")
def clear_agent_memory(request: Request):
    require_admin_or_local(request)
    write_memory({"entries": []})
    return {"ok": True, "message": "Agent memory cleared"}


# --- GEMINI API PROXY (keeps the API key server-side, out of the JS bundle) ---

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    env_local_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", ".env.local")
    if os.path.exists(env_local_path):
        try:
            with open(env_local_path, "r") as f:
                for line in f:
                    if line.startswith("GEMINI_API_KEY="):
                        GEMINI_API_KEY = line.strip().split("=", 1)[1]
                        break
        except Exception as e:
            logger.warning(f"Could not read Gemini key from frontend env file: {e}")

def _allowed_gemini_path(p: str) -> bool:
    return p.startswith("models/") or p.startswith("operations/") or p == "interactions"

@app.post("/api/gemini/{gemini_path:path}")
async def gemini_proxy_post(gemini_path: str, request: Request):
    if not _allowed_gemini_path(gemini_path):
        raise HTTPException(status_code=403, detail="Endpoint not allowed")
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the backend server.")
    body = await request.body()
    url = f"https://generativelanguage.googleapis.com/v1beta/{gemini_path}?key={GEMINI_API_KEY}"
    try:
        # Video generation can take several minutes — generous timeout
        async with httpx.AsyncClient(timeout=httpx.Timeout(900.0)) as client:
            upstream = await client.post(url, content=body, headers={"Content-Type": "application/json"})
        return Response(content=upstream.content, media_type="application/json", status_code=upstream.status_code)
    except httpx.HTTPError as e:
        logger.error(f"Gemini proxy error for {gemini_path}: {e}")
        raise HTTPException(status_code=502, detail=f"Gemini proxy error: {str(e)}")

@app.get("/api/gemini/{gemini_path:path}")
async def gemini_proxy_get(gemini_path: str):
    """GET handler for polling Gemini async operations."""
    if not gemini_path.startswith("operations/"):
        raise HTTPException(status_code=403, detail="Only operations/ polling allowed via GET")
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the backend server.")
    url = f"https://generativelanguage.googleapis.com/v1beta/{gemini_path}?key={GEMINI_API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            upstream = await client.get(url, headers={"Content-Type": "application/json"})
        return Response(content=upstream.content, media_type="application/json", status_code=upstream.status_code)
    except httpx.HTTPError as e:
        logger.error(f"Gemini operation poll error for {gemini_path}: {e}")
        raise HTTPException(status_code=502, detail=f"Operation poll error: {str(e)}")



# --- GOOGLE VIDEO CORS PROXY ---

@app.get("/api/video-proxy")
async def video_proxy(url: str = Query(...)):
    url = validate_google_url(url)
        
    try:
        async with httpx.AsyncClient() as client:
            upstream = await client.get(url, timeout=30.0)
            
        if upstream.status_code != 200:
            raise HTTPException(
                status_code=upstream.status_code, 
                detail="Google video server returned non-200. Link may have expired."
            )
            
        # Return proxy media response
        headers = {
            "Content-Type": upstream.headers.get("content-type", "video/mp4"),
            "Cache-Control": "public, max-age=3600"
        }
        if "content-length" in upstream.headers:
            headers["Content-Length"] = upstream.headers["content-length"]
            
        return Response(content=upstream.content, headers=headers)
    except Exception as e:
        logger.error(f"Video proxy exception: {e}")
        raise HTTPException(status_code=502, detail=f"Proxy error: {str(e)}")


# --- SERVER-SIDE FFmpeg VIDEO MERGING & EXPORT ---

class ClipData(BaseModel):
    url: str
    trimStart: float = 0.0
    trimEnd: float = 10.0
    cropRatio: str = "fit"

class TransitionData(BaseModel):
    id: Optional[str] = None
    label: Optional[str] = None
    ffmpeg: str = "fade"
    duration: float = 0.0
    audio: Optional[str] = "fade"

class MergeRequest(BaseModel):
    clips: List[ClipData]
    aspectRatio: str
    transitionSeconds: Optional[float] = 0
    transitions: Optional[List[TransitionData]] = None
    musicB64: Optional[str] = None  # base64 audio (e.g. Lyria) laid as one continuous bed
    musicGainDb: Optional[float] = -7.0

@app.post("/api/merge-video")
def merge_video_endpoint(body: MergeRequest):
    if not body.clips:
        raise HTTPException(status_code=400, detail="No clips provided")
    if len(body.clips) > MAX_MERGE_CLIPS:
        raise HTTPException(status_code=413, detail=f"Too many clips. Maximum is {MAX_MERGE_CLIPS}.")
    if body.aspectRatio not in ALLOWED_ASPECT_RATIOS:
        raise HTTPException(status_code=400, detail="Unsupported aspect ratio")

    for clip in body.clips:
        if clip.trimEnd <= clip.trimStart:
            raise HTTPException(status_code=400, detail="Clip trimEnd must be greater than trimStart")
        if clip.trimEnd - clip.trimStart > MAX_CLIP_SECONDS:
            raise HTTPException(status_code=413, detail=f"Clip duration exceeds {MAX_CLIP_SECONDS:g} seconds")
        if clip.cropRatio not in {"fit", "fill"}:
            raise HTTPException(status_code=400, detail="Unsupported crop ratio")
        
    clips_list = [c.model_dump() for c in body.clips]
    try:
        merged_bytes = merge_clips(
            clips_list,
            body.aspectRatio,
            body.transitionSeconds or 0,
            transitions=[t.model_dump() for t in body.transitions] if body.transitions else None,
            music_b64=body.musicB64,
            music_gain_db=body.musicGainDb if body.musicGainDb is not None else -7.0
        )
        headers = {
            "Content-Type": "video/mp4",
            "Content-Disposition": "attachment; filename=merged_video.mp4"
        }
        return Response(content=merged_bytes, headers=headers)
    except Exception as e:
        logger.error(f"FFmpeg merging failed: {e}")
        raise HTTPException(status_code=500, detail=f"FFmpeg stitch failure: {str(e)}")

# --- ELEVENLABS TTS & AUDIO SWAP GATEWAY ---

# Read key from environment or local config
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
if not ELEVENLABS_API_KEY:
    env_local_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", ".env.local")
    if os.path.exists(env_local_path):
        try:
            with open(env_local_path, "r") as f:
                for line in f:
                    if line.startswith("ELEVENLABS_API_KEY="):
                        ELEVENLABS_API_KEY = line.strip().split("=", 1)[1]
                        break
        except Exception as e:
            logger.warning(f"Could not read ElevenLabs key from frontend env file: {e}")

class ElevenLabsTTSRequest(BaseModel):
    text: str
    voiceId: Optional[str] = "21m00Tcm4TlvDq8ikWAM"

class SwapAudioRequest(BaseModel):
    videoB64: str
    audioB64: str

@app.post("/api/elevenlabs/tts")
async def elevenlabs_tts_endpoint(body: ElevenLabsTTSRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(status_code=500, detail="ElevenLabs API Key is not configured on the backend server.")
    
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="No text provided for ElevenLabs generation.")
        
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{body.voiceId}"
    headers = {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY
    }
    payload = {
        "text": body.text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            
        if res.status_code != 200:
            err_text = res.text
            logger.error(f"ElevenLabs TTS failed: Status {res.status_code}, {err_text}")
            raise HTTPException(status_code=res.status_code, detail=f"ElevenLabs service error: {err_text}")
            
        audio_b64 = base64.b64encode(res.content).decode("utf-8")
        return {"audioB64": audio_b64}
    except Exception as e:
        logger.error(f"TTS exception: {e}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/swap-audio")
def swap_audio_endpoint(body: SwapAudioRequest):
    if not body.videoB64 or not body.audioB64:
        raise HTTPException(status_code=400, detail="Missing videoB64 or audioB64 params")
    try:
        import base64
        swapped_b64 = swap_audio(body.videoB64, body.audioB64)
        return {"videoB64": swapped_b64}
    except Exception as e:
        logger.error(f"Audio swapping failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files to serve Next.js frontend compiled pages
from fastapi.staticfiles import StaticFiles
frontend_out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "out")
if os.path.exists(frontend_out):
    app.mount("/", StaticFiles(directory=frontend_out, html=True), name="frontend")
else:
    logger.warning(f"Frontend static files folder '{frontend_out}' not found. Run 'npm run build' first to enable serving from the backend server.")
