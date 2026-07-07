import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const filename = formData.get("filename") || `clip_${Date.now()}.mp4`;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const blob = await put(filename, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Blob upload failed:", err);
    return NextResponse.json(
      { error: `Upload failed: ${err.message}` },
      { status: 500 }
    );
  }
}
