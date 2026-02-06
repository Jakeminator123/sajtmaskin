import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sajtmaskin.se";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/builder", "/inspector", "/projects"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
