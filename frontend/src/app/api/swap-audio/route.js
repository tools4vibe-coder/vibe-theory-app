import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for processing

export async function POST(request) {
  const tempDir = path.join(os.tmpdir(), `vikkid_swap_${Math.random().toString(36).substring(2)}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const inputVidPath = path.join(tempDir, "input_vid.mp4");
  const inputAudPath = path.join(tempDir, "input_aud.mp3");
  const outputVidPath = path.join(tempDir, "output_swapped.mp4");

  try {
    const body = await request.json();
    const { videoB64, audioB64 } = body;

    if (!videoB64 || !audioB64) {
      return NextResponse.json({ error: "Missing videoB64 or audioB64 parameters" }, { status: 400 });
    }

    // Save inputs to temp files
    fs.writeFileSync(inputVidPath, Buffer.from(videoB64.split(",").pop(), "base64"));
    fs.writeFileSync(inputAudPath, Buffer.from(audioB64.split(",").pop(), "base64"));

    // Run FFmpeg to replace the video's audio track with the new audio track
    // Uses -c:v copy so the video is NOT re-encoded (which is instant and preserves quality)
    // Uses -shortest to match durations if they slightly mismatch
    const ffmpegCmd = `"${ffmpegPath}" -y -i "${inputVidPath}" -i "${inputAudPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest "${outputVidPath}"`;
    execSync(ffmpegCmd);

    // Read result
    const swappedBuffer = fs.readFileSync(outputVidPath);
    const swappedB64 = swappedBuffer.toString("base64");

    // Clean up
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanErr) {
      console.warn("Clean up failed:", cleanErr);
    }

    return NextResponse.json({ videoB64: swappedB64 });
  } catch (err) {
    console.error("Audio Swap Error:", err);
    // Clean up on error
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanErr) {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
