import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { text, voiceId = "21m00Tcm4TlvDq8ikWAM" } = body; // default voice (Rachel)

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured on the server." }, { status: 500 });
    }

    if (!text) {
      return NextResponse.json({ error: "No text provided for voice generation." }, { status: 400 });
    }

    // Call ElevenLabs Text-to-Speech API
    // Using eleven_multilingual_v2 to support both English and Hindi dialogue perfectly
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${errText || response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioB64 = Buffer.from(audioBuffer).toString("base64");

    return NextResponse.json({ audioB64 });
  } catch (err) {
    console.error("ElevenLabs TTS Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
