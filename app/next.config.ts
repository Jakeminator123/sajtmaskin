import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
