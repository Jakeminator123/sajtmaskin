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
};

export default nextConfig;
