import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fix workspace root detection (prevents lockfile warning)
  outputFileTracingRoot: path.join(__dirname, "./"),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "v0.dev",
        pathname: "/api/og/**",
      },
      {
        protocol: "https",
        hostname: "api.v0.dev",
        pathname: "/v1/chats/**",
      },
      // DiceBear avatars
      {
        protocol: "https",
        hostname: "api.dicebear.com",
        pathname: "/**",
      },
      // QuickChart (QR codes & charts)
      {
        protocol: "https",
        hostname: "quickchart.io",
        pathname: "/**",
      },
      // Lorem Picsum (placeholder images)
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      // Google user images (OAuth avatars)
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      // Google favicon service (used in audit report header)
      {
        protocol: "https",
        hostname: "www.google.com",
        pathname: "/s2/favicons",
      },
      // Vercel Blob Storage
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.blob.vercel-storage.com",
        pathname: "/**",
      },
      // v0.app template images
      {
        protocol: "https",
        hostname: "v0.app",
        pathname: "/**",
      },
      // Vercel Next.js image proxy (used in some v0 outputs)
      {
        protocol: "https",
        hostname: "vercel.com",
        pathname: "/_next/image",
      },
      // Contentful CDN (seen in v0 template assets)
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
        pathname: "/**",
      },
      // v0 preview sandbox assets
      {
        protocol: "https",
        hostname: "**.vusercontent.net",
        pathname: "/**",
      },
    ],
  },
  // Cross-Origin Isolation headers required for WebContainer (SharedArrayBuffer)
  // ONLY applied to /project/* routes where WebContainer is used (after takeover)
  // NOT applied to /builder/* where we embed v0's demo iframes
  // See: https://webcontainers.io/guides/configuring-headers
  async headers() {
    return [
      {
        // Only apply to project pages (where WebContainer runs after takeover)
        source: "/project/:path*",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
