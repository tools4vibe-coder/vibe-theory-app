// Gemini API proxy — keeps the API key server-side
// Mirrors: POST /api/gemini/{models/..., interactions}
//          GET  /api/gemini/operations/{name}  (Gemini async polling)

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for video generation (Vercel Pro)

const ALLOWED_PREFIX = (p) =>
  p.startsWith("models/") || p.startsWith("operations/") || p === "interactions";

function getApiKey() {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  return key;
}

// POST — generateContent, interactions, generateVideos
export async function POST(request, { params }) {
  const { path } = await params;
  const geminiPath = path.join("/");

  if (!ALLOWED_PREFIX(geminiPath)) {
    return new Response(JSON.stringify({ error: "Endpoint not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const GEMINI_API_KEY = getApiKey();
  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured on Vercel. Add it as a server Environment Variable, then redeploy." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.text();
  const url = `https://generativelanguage.googleapis.com/v1beta/${geminiPath}?key=${GEMINI_API_KEY}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`Gemini proxy error for ${geminiPath}:`, err);
    return new Response(
      JSON.stringify({ error: `Gemini proxy error: ${err.message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

// GET — poll Gemini async operations until done
export async function GET(request, { params }) {
  const { path } = await params;
  const geminiPath = path.join("/");

  if (!geminiPath.startsWith("operations/")) {
    return new Response(JSON.stringify({ error: "Only operations/ polling allowed via GET" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const GEMINI_API_KEY = getApiKey();
  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured on Vercel. Add it as a server Environment Variable, then redeploy." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${geminiPath}?key=${GEMINI_API_KEY}`;

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`Gemini operation poll error for ${geminiPath}:`, err);
    return new Response(
      JSON.stringify({ error: `Operation poll error: ${err.message}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
