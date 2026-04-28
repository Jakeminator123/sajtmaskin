
import { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://glodburgerclub.se";
  const lastModified = new Date();

  return [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/spel`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/om`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.75,
    },
  ];
}