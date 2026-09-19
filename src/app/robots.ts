import type { MetadataRoute } from "next";
import {
  PRIVATE_SEARCH_DISALLOW_PATHS,
  PUBLIC_CANONICAL_ORIGIN,
  allowsPublicSearchIndexing,
} from "@/lib/public-canonical-url";

export default function robots(): MetadataRoute.Robots {
  const sitemap = `${PUBLIC_CANONICAL_ORIGIN}/sitemap.xml`;

  if (!allowsPublicSearchIndexing()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap,
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // `/admin` is deliberately omitted so robots.txt does not advertise the
      // private slug. The route itself requires an admin account and declares
      // `noindex` in its metadata.
      disallow: [...PRIVATE_SEARCH_DISALLOW_PATHS],
    },
    sitemap,
  };
}
