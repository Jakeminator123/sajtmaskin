import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["esbuild", "pg"],
  // Keep tracing root stable without pulling the whole tree into Turbopack's broad patterns.
  outputFileTracingRoot: path.join(/* turbopackIgnore: true */ __dirname, "./"),
  outputFileTracingExcludes: {
    "*": [
      "./data/external-template-pipeline/**",
      "./templates_v0/**",
      "./archive/**",
      "./output/**",
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [
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
      // Lorem Picsum (legacy; prompt now uses /placeholder.svg pipeline instead)
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
      // Unsplash stock photos (used in generated sites)
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      // Pexels stock photos
      {
        protocol: "https",
        hostname: "images.pexels.com",
        pathname: "/**",
      },
      // v0 user content assets (used in some template previews)
      {
        protocol: "https",
        hostname: "**.vusercontent.net",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/placeholder.svg",
        destination: "/api/placeholder",
      },
    ];
  },
  // Cross-Origin Isolation headers required for WebContainer (SharedArrayBuffer)
  // ONLY applied to /project/* routes where WebContainer is used (after takeover)
  // NOT applied to /builder/* where preview iframes may point at sandbox/runtime surfaces
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
