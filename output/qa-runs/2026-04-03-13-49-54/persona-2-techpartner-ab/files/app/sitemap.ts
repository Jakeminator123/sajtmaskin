import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-data";



export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2025-01-01");

  return [
    {
      url: siteConfig.siteUrl,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteConfig.siteUrl}/om-oss`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${siteConfig.siteUrl}/tjanster`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.siteUrl}/priser`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.siteUrl}/kontakt`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}