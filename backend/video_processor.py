import os
import subprocess
import tempfile
import urllib.request
from urllib.parse import urlparse
import uuid
import base64
import shutil
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("video_processor")

MAX_INPUT_BYTES = int(os.environ.get("MAX_VIDEO_INPUT_BYTES", str(300 * 1024 * 1024)))
DOWNLOAD_TIMEOUT_SECONDS = int(os.environ.get("VIDEO_DOWNLOAD_TIMEOUT_SECONDS", "45"))
DEFAULT_ALLOWED_HOST_SUFFIXES = "googleapis.com,google.com,googleusercontent.com"
ALLOWED_HOST_SUFFIXES = tuple(
    suffix.strip().lower().lstrip(".")
    for suffix in os.environ.get("VIDEO_ALLOWED_HOST_SUFFIXES", DEFAULT_ALLOWED_HOST_SUFFIXES).split(",")
    if suffix.strip()
)

# Target Resolutions mapping supporting Standard, 2K, and 4K presets
AR_RESOLUTIONS = {
    # Standard (1080p/720p targets)
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    # 2K resolutions
    "16:9-2k": (2560, 1440),
    "9:16-2k": (1440, 2560),
    "1:1-2k": (1440, 1440),
    # 4K resolutions
    "16:9-4k": (3840, 2160),
    "9:16-4k": (2160, 3840),
    "1:1-4k": (2160, 2160)
}

def has_audio_track(file_path):
    """Checks if a video file contains a valid audio stream."""
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "a",
        "-show_entries", "stream=codec_name", "-of", "csv=p=0", file_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return bool(res.stdout.strip())
    except subprocess.CalledProcessError:
        return False

def get_video_duration(file_path):
    """Returns duration in seconds for a video file."""
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return max(0.0, float(res.stdout.strip() or 0))
    except (subprocess.CalledProcessError, ValueError):
        return 0.0

def _hostname_allowed(hostname):
    host = (hostname or "").lower().rstrip(".")
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in ALLOWED_HOST_SUFFIXES)

def _write_limited_response(response, out_file):
    total = 0
    while True:
        chunk = response.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_INPUT_BYTES:
            raise ValueError(f"Input media exceeds {MAX_INPUT_BYTES} bytes")
        out_file.write(chunk)

def download_video(url, dest_path):
    """Downloads a video from a URL or decodes a base64 data URL to a local file."""
    if url.startswith("data:"):
        # Handle base64 data URLs: data:video/mp4;base64,<payload>
        logger.info(f"Decoding base64 data URL -> {dest_path}")
        if "," not in url:
            raise ValueError("Invalid data URL")
        payload = url.split(",", 1)[1]
        # Base64 expands data by roughly 4/3, so reject clearly oversized input
        # before allocating the decoded bytes.
        if len(payload) > int(MAX_INPUT_BYTES * 1.38):
            raise ValueError(f"Input media exceeds {MAX_INPUT_BYTES} bytes")
        raw_bytes = base64.b64decode(payload, validate=True)
        if len(raw_bytes) > MAX_INPUT_BYTES:
            raise ValueError(f"Input media exceeds {MAX_INPUT_BYTES} bytes")
        with open(dest_path, "wb") as out_file:
            out_file.write(raw_bytes)
    else:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Invalid media URL")
        if not _hostname_allowed(parsed.hostname):
            raise ValueError("Media URL host is not allowed")

        logger.info(f"Downloading clip: {url} -> {dest_path}")
        headers = {"User-Agent": "Mozilla/5.0"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response, open(dest_path, "wb") as out_file:
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_INPUT_BYTES:
                raise ValueError(f"Input media exceeds {MAX_INPUT_BYTES} bytes")
            _write_limited_response(response, out_file)

def process_clip(input_path, output_path, start, end, crop_ratio, target_ar):
    """Trims, scales, crops, and normalizes a single clip."""
    tw, th = AR_RESOLUTIONS.get(target_ar, (1280, 720))
    audio_present = has_audio_track(input_path)
    
    # Base command structure
    cmd = ["ffmpeg", "-y"]
    
    # Input files
    cmd.extend(["-ss", str(start), "-to", str(end), "-i", input_path])
    
    # If no audio, generate synthetic silent audio stream
    if not audio_present:
        cmd.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"])
    
    # Construct Video Filter (with bicubic upscaling + unsharp filter for high quality 2K/4K outputs)
    upscale_sharpen = ""
    if target_ar.endswith("-2k") or target_ar.endswith("-4k"):
        upscale_sharpen = ",unsharp=3:3:0.5:3:3:0.0"

    if crop_ratio == "fill":
        vf = f"scale=w='if(gte(iw/ih,{tw}/{th}),-1,{tw})':h='if(gte(iw/ih,{tw}/{th}),{th},-1)':flags=bicubic,crop={tw}:{th}{upscale_sharpen},fps=24,format=yuv420p"
    else:
        vf = f"scale=w='if(lte(iw/ih,{tw}/{th}),-1,{tw})':h='if(lte(iw/ih,{tw}/{th}),{th},-1)':flags=bicubic,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2:black{upscale_sharpen},fps=24,format=yuv420p"
    
    cmd.extend(["-vf", vf])

    # Micro audio fades (50ms) at clip edges so hard-cut joins never click/pop
    clip_dur = max(0.2, float(end) - float(start))
    fade_out_start = max(0.0, clip_dur - 0.05)
    cmd.extend(["-af", f"afade=t=in:st=0:d=0.05,afade=t=out:st={fade_out_start:.3f}:d=0.05"])

    # Map video from input file, audio from input if exists, or silent stream if not
    if audio_present:
        cmd.extend(["-map", "0:v:0", "-map", "0:a:0"])
    else:
        cmd.extend(["-map", "0:v:0", "-map", "1:a:0", "-shortest"])
        
    # Audio/Video encoding parameters
    cmd.extend([
        "-c:v", "libx264", 
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", 
        "-b:a", "192k",
        "-ar", "44100",
        "-movflags", "+faststart"
    ])
    
    cmd.append(output_path)
    
    logger.info(f"Running clip processor command: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def concat_processed_clips(processed_files, temp_dir):
    """Joins already-normalized clips without a transition."""
    concat_list_path = os.path.join(temp_dir, "concat.txt")
    with open(concat_list_path, "w") as list_file:
        for processed_file in processed_files:
            escaped = processed_file.replace("\\", "/").replace("'", "'\\''")
            list_file.write(f"file '{escaped}'\n")

    merged_output_path = os.path.join(temp_dir, "final_merged.mp4")
    concat_cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list_path, "-c", "copy", merged_output_path
    ]

    logger.info(f"Running demux join: {' '.join(concat_cmd)}")
    subprocess.run(concat_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return merged_output_path

ALLOWED_XFADE_TRANSITIONS = {
    "fade", "dissolve", "wipeleft", "wiperight", "wipeup", "wipedown",
    "slideleft", "slideright", "slideup", "slidedown", "zoomin", "hblur",
    "circleopen", "circleclose", "radial", "diagtr", "diagtl", "diagbr", "diagbl",
    "smoothleft", "smoothright", "smoothup", "smoothdown"
}


def normalize_transitions(transitions, boundary_count, fallback_seconds):
    normalized = []
    source = transitions if isinstance(transitions, list) else []
    for index in range(boundary_count):
        raw = source[index] if index < len(source) and isinstance(source[index], dict) else {}
        ffmpeg_transition = raw.get("ffmpeg") if raw.get("ffmpeg") in ALLOWED_XFADE_TRANSITIONS else "fade"
        try:
            duration = float(raw.get("duration", fallback_seconds or 0))
        except (TypeError, ValueError):
            duration = float(fallback_seconds or 0)
        normalized.append({
            "ffmpeg": ffmpeg_transition,
            "duration": max(0.0, min(2.0, duration))
        })
    return normalized


def crossfade_processed_clips(processed_files, temp_dir, transition_seconds, transitions=None):
    """Joins normalized clips with selected video transitions."""
    if len(processed_files) < 2:
        return concat_processed_clips(processed_files, temp_dir)

    normalized_transitions = normalize_transitions(transitions, len(processed_files) - 1, transition_seconds)
    if not any(item["duration"] > 0 for item in normalized_transitions):
        return concat_processed_clips(processed_files, temp_dir)

    durations = [get_video_duration(file_path) for file_path in processed_files]
    valid_durations = [duration for duration in durations if duration > 0]
    if not valid_durations:
        return concat_processed_clips(processed_files, temp_dir)

    merged_output_path = os.path.join(temp_dir, "final_merged.mp4")
    cmd = ["ffmpeg", "-y"]
    for processed_file in processed_files:
        cmd.extend(["-i", processed_file])

    filter_parts = []
    for index in range(len(processed_files)):
        filter_parts.append(f"[{index}:v]settb=AVTB,format=yuv420p[v{index}]")
        filter_parts.append(f"[{index}:a]aformat=sample_rates=44100:channel_layouts=stereo[a{index}]")

    current_video = "[v0]"
    current_audio = "[a0]"
    current_duration = durations[0]

    for index in range(1, len(processed_files)):
        requested_transition = normalized_transitions[index - 1]
        local_shortest = min(
            max(0.01, current_duration or durations[index - 1] or 0),
            max(0.01, durations[index] or 0)
        )
        transition = min(
            requested_transition["duration"] if requested_transition["duration"] > 0 else 0.001,
            max(0.001, local_shortest / 3)
        )
        offset = max(0.0, current_duration - transition)
        next_video = f"[vx{index}]"
        next_audio = f"[ax{index}]"
        filter_parts.append(
            f"{current_video}[v{index}]xfade=transition={requested_transition['ffmpeg']}:duration={transition:.3f}:offset={offset:.3f}{next_video}"
        )
        filter_parts.append(
            f"{current_audio}[a{index}]acrossfade=d={transition:.3f}:c1=tri:c2=tri{next_audio}"
        )
        current_video = next_video
        current_audio = next_audio
        current_duration = current_duration + durations[index] - transition

    cmd.extend([
        "-filter_complex", ";".join(filter_parts),
        "-map", current_video,
        "-map", current_audio,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        merged_output_path
    ])

    logger.info(f"Running crossfade join: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return merged_output_path

def mix_music_bed(video_path, music_path, temp_dir, music_gain_db=-7.0):
    """Lays a continuous music bed under the merged video's existing audio.

    The music is looped/trimmed to the video duration, ducked under dialogue
    and diegetic sound via sidechain compression, and faded out at the end.
    """
    duration = get_video_duration(video_path)
    if duration <= 0:
        return video_path

    fade_dur = min(2.0, duration / 4)
    fade_start = max(0.0, duration - fade_dur)
    output_path = os.path.join(temp_dir, "final_with_music.mp4")

    filter_complex = (
        f"[1:a]aloop=loop=-1:size=2e9,atrim=0:{duration:.3f},"
        f"aformat=sample_rates=44100:channel_layouts=stereo,"
        f"volume={music_gain_db}dB,afade=t=out:st={fade_start:.3f}:d={fade_dur:.3f}[music];"
        f"[0:a]aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[voice][sc];"
        f"[music][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[ducked];"
        f"[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[aout]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", music_path,
        "-filter_complex", filter_complex,
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-movflags", "+faststart",
        output_path
    ]
    logger.info(f"Mixing music bed: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return output_path


def merge_clips(clips, target_ar, transition_seconds=0, transitions=None, music_b64=None, music_gain_db=-7.0):
    """
    Downloads, processes, and merges multiple clips sequentially.
    clips parameter format:
    [
        {"url": "http...", "trimStart": 0.0, "trimEnd": 10.0, "cropRatio": "fit"}
    ]
    """
    task_id = str(uuid.uuid4())
    temp_dir = os.path.join(tempfile.gettempdir(), f"vikkid_merge_{task_id}")
    os.makedirs(temp_dir, exist_ok=True)
    
    processed_files = []
    
    try:
        # Step 1: Process individual clips
        for idx, clip in enumerate(clips):
            url = clip["url"]
            start = clip.get("trimStart", 0)
            end = clip.get("trimEnd", 10)
            crop_ratio = clip.get("cropRatio", "fit")
            
            raw_path = os.path.join(temp_dir, f"raw_{idx}.mp4")
            proc_path = os.path.join(temp_dir, f"proc_{idx}.mp4")
            
            # Download and transcode
            download_video(url, raw_path)
            process_clip(raw_path, proc_path, start, end, crop_ratio, target_ar)
            processed_files.append(proc_path)
            
        # Step 2: Run final join. Crossfade improves exported multi-clip continuity.
        try:
            merged_output_path = crossfade_processed_clips(processed_files, temp_dir, transition_seconds, transitions)
        except Exception as exc:
            logger.warning(f"Crossfade merge failed, falling back to concat: {exc}")
            merged_output_path = concat_processed_clips(processed_files, temp_dir)

        # Step 3: Optionally lay a continuous music bed (e.g. Lyria) under the whole timeline
        if music_b64:
            try:
                music_path = os.path.join(temp_dir, "music_bed.audio")
                with open(music_path, "wb") as music_file:
                    music_file.write(base64.b64decode(music_b64))
                merged_output_path = mix_music_bed(merged_output_path, music_path, temp_dir, music_gain_db)
            except Exception as exc:
                logger.warning(f"Music bed mixing failed, exporting without music: {exc}")

        # Read final video into memory bytes
        with open(merged_output_path, "rb") as out_file:
            merged_bytes = out_file.read()
            
        return merged_bytes
        
    finally:
        # Clean up all raw/processed files and temp task directory
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Error removing temp task directory: {e}")

def swap_audio(video_b64: str, audio_b64: str) -> str:
    """Swaps the audio of a video with a new audio track using FFmpeg."""
    logger.info("Swapping audio track in backend...")
    with tempfile.TemporaryDirectory() as temp_dir:
        input_vid_path = os.path.join(temp_dir, "input_vid.mp4")
        input_aud_path = os.path.join(temp_dir, "input_aud.mp3")
        output_vid_path = os.path.join(temp_dir, "output.mp4")

        # Decode base64
        vid_payload = video_b64.split(",", 1)[-1] if "," in video_b64 else video_b64
        aud_payload = audio_b64.split(",", 1)[-1] if "," in audio_b64 else audio_b64

        with open(input_vid_path, "wb") as f:
            f.write(base64.b64decode(vid_payload))
        with open(input_aud_path, "wb") as f:
            f.write(base64.b64decode(aud_payload))

        # FFmpeg command
        cmd = [
            "ffmpeg", "-y",
            "-i", input_vid_path,
            "-i", input_aud_path,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest",
            output_vid_path
        ]
        
        logger.info(f"Running FFmpeg swap command: {' '.join(cmd)}")
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            err_msg = res.stderr.decode("utf-8", errors="ignore")
            logger.error(f"FFmpeg swap failed: {err_msg}")
            raise Exception(f"FFmpeg swap failed: {err_msg}")

        with open(output_vid_path, "rb") as f:
            out_bytes = f.read()

        return base64.b64encode(out_bytes).decode("utf-8")
