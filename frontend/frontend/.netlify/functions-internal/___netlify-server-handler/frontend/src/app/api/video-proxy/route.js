// Video proxy — downloads Google-hosted video files to avoid CORS issues
// Used by: Veo 3.1 bridge clip generation (when response contains a URI)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GOOGLE_HOST_SUFFIXES = ["googleapis.com", "google.com", "googleusercontent.com"];

function isTrustedGoogleUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return GOOGLE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isTrustedGoogleUrl(url)) {
    return new Response(JSON.stringify({ error: "Only trusted Google media URLs allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const upstream = await fetch(url);

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${upstream.status}. Link may have expired.` }),
        { status: upstream.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Video proxy error:", err);
    return new Response(
      JSON.stringify({ error: `Video proxy error: ${err.message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
