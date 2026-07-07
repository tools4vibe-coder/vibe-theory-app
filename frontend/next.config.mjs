import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_OUTPUT=export produces the static `out/` bundle served by the local
  // FastAPI backend. Default (Vercel) build keeps API route handlers enabled.
  ...(process.env.NEXT_OUTPUT === "export" ? { output: "export" } : {}),
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  images: {
    unoptimized: true,
  },
  // Vercel serverless functions need longer timeout for video generation
  serverExternalPackages: [],
};

export default nextConfig;
