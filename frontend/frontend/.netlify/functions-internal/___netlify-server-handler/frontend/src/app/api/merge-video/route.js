import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { put } from "@vercel/blob";


export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for video processing (Vercel Pro)

const MAX_INPUT_BYTES = Number(process.env.MAX_VIDEO_INPUT_BYTES || 300 * 1024 * 1024);
const ALLOWED_HOST_SUFFIXES = (process.env.VIDEO_ALLOWED_HOST_SUFFIXES || "googleapis.com,google.com,googleusercontent.com,vercel-storage.com,public.blob.vercel-storage.com")
  .split(",")
  .map((suffix) => suffix.trim().toLowerCase().replace(/^\./, ""))
  .filter(Boolean);
const MAX_MERGE_CLIPS = Number(process.env.MAX_MERGE_CLIPS || 60);
const MAX_CLIP_SECONDS = Number(process.env.MAX_CLIP_SECONDS || 600);
const ALLOWED_ASPECT_RATIOS = new Set([
  "16:9",
  "9:16",
  "1:1",
  "16:9-2k",
  "9:16-2k",
  "1:1-2k",
  "16:9-4k",
  "9:16-4k",
  "1:1-4k",
]);

const AR_RESOLUTIONS = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "16:9-2k": [2560, 1440],
  "9:16-2k": [1440, 2560],
  "1:1-2k": [1440, 1440],
  "16:9-4k": [3840, 2160],
  "9:16-4k": [2160, 3840],
  "1:1-4k": [2160, 2160],
};

function isAllowedRemoteMediaUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

// Helper: Run FFmpeg info command and extract audio presence and duration
function getVideoInfo(filePath) {
  try {
    const output = execSync(`"${ffmpegPath}" -i "${filePath}" 2>&1`).toString();
    const hasAudio = /Stream #.*Audio:/.test(output);
    
    let duration = 0.0;
    const durationMatch = /Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(output);
    if (durationMatch) {
      const hours = parseInt(durationMatch[1], 10);
      const minutes = parseInt(durationMatch[2], 10);
      const seconds = parseInt(durationMatch[3], 10);
      const centiseconds = parseInt(durationMatch[4], 10);
      duration = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    }
    return { hasAudio, duration };
  } catch (err) {
    // ffmpeg -i returns non-zero code when no output is specified; this is expected
    const output = err.output ? err.output.toString() : err.toString();
    const hasAudio = /Stream #.*Audio:/.test(output);
    let duration = 0.0;
    const durationMatch = /Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(output);
    if (durationMatch) {
      const hours = parseInt(durationMatch[1], 10);
      const minutes = parseInt(durationMatch[2], 10);
      const seconds = parseInt(durationMatch[3], 10);
      const centiseconds = parseInt(durationMatch[4], 10);
      duration = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    }
    return { hasAudio, duration };
  }
}

// Helper: Save video from base64 data URL or HTTP URL
async function saveVideo(url, destPath) {
  if (url.startsWith("data:")) {
    if (!url.includes(",")) throw new Error("Invalid data URL");
    const payload = url.split(",")[1];
    if (payload.length > Math.floor(MAX_INPUT_BYTES * 1.38)) {
      throw new Error(`Input media exceeds ${MAX_INPUT_BYTES} bytes`);
    }
    const buffer = Buffer.from(payload, "base64");
    if (buffer.byteLength > MAX_INPUT_BYTES) {
      throw new Error(`Input media exceeds ${MAX_INPUT_BYTES} bytes`);
    }
    fs.writeFileSync(destPath, buffer);
  } else {
    if (!isAllowedRemoteMediaUrl(url)) {
      throw new Error("Media URL host is not allowed");
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_INPUT_BYTES) {
      throw new Error(`Input media exceeds ${MAX_INPUT_BYTES} bytes`);
    }
    if (!res.body) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength > MAX_INPUT_BYTES) {
        throw new Error(`Input media exceeds ${MAX_INPUT_BYTES} bytes`);
      }
      fs.writeFileSync(destPath, buffer);
      return;
    }

    const reader = res.body.getReader();
    const fd = fs.openSync(destPath, "w");
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_INPUT_BYTES) {
          throw new Error(`Input media exceeds ${MAX_INPUT_BYTES} bytes`);
        }
        fs.writeSync(fd, Buffer.from(value));
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

// Helper: Process/normalize a single clip
function processClip(inputPath, outputPath, start, end, cropRatio, targetAr) {
  const [tw, th] = AR_RESOLUTIONS[targetAr] || [1280, 720];
  const { hasAudio } = getVideoInfo(inputPath);
  
  const args = ["-y", "-ss", start.toString(), "-to", end.toString(), "-i", inputPath];
  if (!hasAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }

  let upscaleSharpen = "";
  if (targetAr.endsWith("-2k") || targetAr.endsWith("-4k")) {
    upscaleSharpen = ",unsharp=3:3:0.5:3:3:0.0";
  }

  let vf = "";
  if (cropRatio === "fill") {
    vf = `scale=w='if(gte(iw/ih,${tw}/${th}),-1,${tw})':h='if(gte(iw/ih,${tw}/${th}),${th},-1)':flags=bicubic,crop=${tw}:${th}${upscaleSharpen},fps=24,format=yuv420p`;
  } else {
    vf = `scale=w='if(lte(iw/ih,${tw}/${th}),-1,${tw})':h='if(lte(iw/ih,${tw}/${th}),${th},-1)':flags=bicubic,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black${upscaleSharpen},fps=24,format=yuv420p`;
  }

  args.push("-vf", vf);

  // Micro audio fades (50ms) at clip edges so hard-cut joins never click/pop
  const clipDur = Math.max(0.2, end - start);
  const fadeOutStart = Math.max(0, clipDur - 0.05);
  args.push("-af", `afade=t=in:st=0:d=0.05,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.05`);

  if (hasAudio) {
    args.push("-map", "0:v:0", "-map", "0:a:0");
  } else {
    args.push("-map", "0:v:0", "-map", "1:a:0", "-shortest");
  }

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    "-movflags", "+faststart",
    outputPath
  );

  execSync(`"${ffmpegPath}" ${args.map(a => `"${a}"`).join(" ")}`);
}

// Helper: Concatenate clips without transitions
function concatClips(processedFiles, tempDir) {
  const concatListPath = path.join(tempDir, "concat.txt");
  const listContent = processedFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(concatListPath, listContent);

  const mergedOutputPath = path.join(tempDir, "final_merged.mp4");
  execSync(`"${ffmpegPath}" -y -f concat -safe 0 -i "${concatListPath}" -c copy "${mergedOutputPath}"`);
  return mergedOutputPath;
}

const ALLOWED_XFADE_TRANSITIONS = new Set([
  "fade", "dissolve", "wipeleft", "wiperight", "wipeup", "wipedown",
  "slideleft", "slideright", "slideup", "slidedown", "zoomin", "hblur",
  "circleopen", "circleclose", "radial", "diagtr", "diagtl", "diagbr", "diagbl",
  "smoothleft", "smoothright", "smoothup", "smoothdown"
]);

function normalizeTransitions(transitions, boundaryCount, fallbackSeconds) {
  return Array.from({ length: boundaryCount }, (_, idx) => {
    const raw = Array.isArray(transitions) ? transitions[idx] : null;
    const ffmpeg = ALLOWED_XFADE_TRANSITIONS.has(raw?.ffmpeg) ? raw.ffmpeg : "fade";
    const duration = Number.isFinite(Number(raw?.duration))
      ? Math.max(0, Math.min(2, Number(raw.duration)))
      : Math.max(0, Number(fallbackSeconds) || 0);
    return { ffmpeg, duration };
  });
}

// Helper: Concatenate clips with selected video transitions
function crossfadeClips(processedFiles, tempDir, transitionSeconds, transitions = []) {
  if (processedFiles.length < 2) {
    return concatClips(processedFiles, tempDir);
  }

  const normalizedTransitions = normalizeTransitions(transitions, processedFiles.length - 1, transitionSeconds);
  const hasStyledTransition = normalizedTransitions.some(t => t.duration > 0);
  if (!hasStyledTransition) return concatClips(processedFiles, tempDir);

  const durations = processedFiles.map(f => getVideoInfo(f).duration);
  const validDurations = durations.filter(d => d > 0);
  if (validDurations.length === 0) return concatClips(processedFiles, tempDir);

  const mergedOutputPath = path.join(tempDir, "final_merged.mp4");
  
  const args = ["-y"];
  processedFiles.forEach(f => args.push("-i", f));

  const filterParts = [];
  processedFiles.forEach((_, idx) => {
    filterParts.push(`[${idx}:v]settb=AVTB,format=yuv420p[v${idx}]`);
    filterParts.push(`[${idx}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${idx}]`);
  });

  let currentVideo = "[v0]";
  let currentAudio = "[a0]";
  let currentDuration = durations[0];

  for (let idx = 1; idx < processedFiles.length; idx++) {
    const requestedTransition = normalizedTransitions[idx - 1];
    const localShortest = Math.min(
      Math.max(0.01, currentDuration || durations[idx - 1] || 0),
      Math.max(0.01, durations[idx] || 0)
    );
    const transition = Math.min(
      requestedTransition.duration > 0 ? requestedTransition.duration : 0.001,
      Math.max(0.001, localShortest / 3)
    );
    const offset = Math.max(0.0, currentDuration - transition);
    const nextVideo = `[vx${idx}]`;
    const nextAudio = `[ax${idx}]`;
    filterParts.push(
      `${currentVideo}[v${idx}]xfade=transition=${requestedTransition.ffmpeg}:duration=${transition.toFixed(3)}:offset=${offset.toFixed(3)}${nextVideo}`
    );
    filterParts.push(
      `${currentAudio}[a${idx}]acrossfade=d=${transition.toFixed(3)}:c1=tri:c2=tri${nextAudio}`
    );
    currentVideo = nextVideo;
    currentAudio = nextAudio;
    currentDuration = currentDuration + durations[idx] - transition;
  }

  args.push(
    "-filter_complex", filterParts.join(";"),
    "-map", currentVideo,
    "-map", currentAudio,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    mergedOutputPath
  );

  execSync(`"${ffmpegPath}" ${args.map(a => `"${a}"`).join(" ")}`);
  return mergedOutputPath;
}

// Helper: Lay a continuous music bed (e.g. Lyria) under the merged video's
// existing audio — ducked under dialogue/sound via sidechain compression.
function mixMusicBed(videoPath, musicPath, tempDir, musicGainDb = -7.0) {
  const { duration } = getVideoInfo(videoPath);
  if (!duration || duration <= 0) return videoPath;

  const fadeDur = Math.min(2.0, duration / 4);
  const fadeStart = Math.max(0.0, duration - fadeDur);
  const outputPath = path.join(tempDir, "final_with_music.mp4");

  const filterComplex =
    `[1:a]aloop=loop=-1:size=2e9,atrim=0:${duration.toFixed(3)},` +
    `aformat=sample_rates=44100:channel_layouts=stereo,` +
    `volume=${musicGainDb}dB,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDur.toFixed(3)}[music];` +
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[voice][sc];` +
    `[music][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[ducked];` +
    `[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[aout]`;

  const args = [
    "-y",
    "-i", videoPath,
    "-i", musicPath,
    "-filter_complex", filterComplex,
    "-map", "0:v:0", "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    "-movflags", "+faststart",
    outputPath
  ];
  execSync(`"${ffmpegPath}" ${args.map(a => `"${a}"`).join(" ")}`);
  return outputPath;
}

export async function POST(request) {
  const tempDir = path.join(os.tmpdir(), `vikkid_merge_${Math.random().toString(36).substring(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const processedFiles = [];

  try {
    const body = await request.json();
    const { clips, aspectRatio, transitionSeconds = 0, transitions = [], musicB64 = null, musicGainDb = -7.0 } = body;

    if (!clips || clips.length === 0) {
      return NextResponse.json({ error: "No clips provided" }, { status: 400 });
    }
    if (clips.length > MAX_MERGE_CLIPS) {
      return NextResponse.json({ error: `Too many clips. Maximum is ${MAX_MERGE_CLIPS}.` }, { status: 413 });
    }
    if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) {
      return NextResponse.json({ error: "Unsupported aspect ratio" }, { status: 400 });
    }

    // Step 1: Process all individual clips
    for (let idx = 0; idx < clips.length; idx++) {
      const clip = clips[idx];
      const trimStart = Number(clip.trimStart || 0);
      const trimEnd = Number(clip.trimEnd || 10);
      if (trimEnd <= trimStart) {
        return NextResponse.json({ error: "Clip trimEnd must be greater than trimStart" }, { status: 400 });
      }
      if (trimEnd - trimStart > MAX_CLIP_SECONDS) {
        return NextResponse.json({ error: `Clip duration exceeds ${MAX_CLIP_SECONDS} seconds` }, { status: 413 });
      }
      if (!["fit", "fill"].includes(clip.cropRatio || "fit")) {
        return NextResponse.json({ error: "Unsupported crop ratio" }, { status: 400 });
      }
      const rawPath = path.join(tempDir, `raw_${idx}.mp4`);
      const procPath = path.join(tempDir, `proc_${idx}.mp4`);

      await saveVideo(clip.url, rawPath);
      processClip(rawPath, procPath, trimStart, trimEnd, clip.cropRatio || "fit", aspectRatio);
      processedFiles.push(procPath);
    }

    // Step 2: Merge the processed clips
    let mergedPath;
    try {
      mergedPath = crossfadeClips(processedFiles, tempDir, parseFloat(transitionSeconds) || 0, transitions);
    } catch (crossfadeErr) {
      console.warn("Crossfade merge failed, falling back to concat:", crossfadeErr);
      mergedPath = concatClips(processedFiles, tempDir);
    }

    // Step 3: Optionally lay a continuous music bed (e.g. Lyria) under the whole timeline
    if (musicB64) {
      try {
        const musicPath = path.join(tempDir, "music_bed.audio");
        fs.writeFileSync(musicPath, Buffer.from(musicB64, "base64"));
        mergedPath = mixMusicBed(mergedPath, musicPath, tempDir, musicGainDb ?? -7.0);
      } catch (musicErr) {
        console.warn("Music bed mixing failed, exporting without music:", musicErr);
      }
    }

    // If BLOB_READ_WRITE_TOKEN is configured (standard on Vercel deployment linked with Vercel Blob),
    // we upload the video file to Vercel Blob to bypass Vercel's 4.5MB response size limit.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const fileStream = fs.createReadStream(mergedPath);
        const filename = `merged_video_${Date.now()}.mp4`;
        const blob = await put(filename, fileStream, {
          access: "public",
          contentType: "video/mp4",
        });
        return NextResponse.json({ url: blob.url });
      } catch (blobErr) {
        console.warn("Vercel Blob upload failed, falling back to direct response:", blobErr);
      }
    }

    const mergedBytes = fs.readFileSync(mergedPath);

    return new Response(mergedBytes, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": "attachment; filename=merged_video.mp4",
      },
    });
  } catch (err) {
    console.error("FFmpeg merging failed:", err);
    return NextResponse.json({ error: `FFmpeg stitch failure: ${err.message}` }, { status: 500 });
  } finally {
    // Clean up temporary files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("Temporary files cleanup failed:", cleanupErr);
    }
  }
}
