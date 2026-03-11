import type { MetadataRoute } from "next";
import { URLS } from "@/lib/config";

const BASE_URL = URLS.baseUrl;

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
