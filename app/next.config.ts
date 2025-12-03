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
    ],
  },
};

export default nextConfig;
