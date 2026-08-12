import type { MetadataRoute } from "next";
import { URLS } from "@/lib/config";

const BASE_URL = URLS.baseUrl;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // `/admin` is deliberately omitted so robots.txt does not advertise the
      // private slug. The route itself requires an admin account and declares
      // `noindex` in its metadata.
      disallow: ["/api/", "/builder", "/projects"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
