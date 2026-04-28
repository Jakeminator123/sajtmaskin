import type { NextConfig } from "next";

/** Tier 2 preview-host (Fly): public URL is /{chatId}/* — the path key is the own-engine chat id, not the app project id. */
const previewBasePath = process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim() || "";

const nextConfig: NextConfig = {
  ...(previewBasePath ? { basePath: previewBasePath } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "*.blob.vercel-storage.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },
  async rewrites() {
    return [{ source: "/placeholder.svg", destination: "/api/placeholder" }];
  },
};

export default nextConfig;
