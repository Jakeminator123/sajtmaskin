import type { Metadata } from "next";

import { siteConfig } from "@/lib/site-data";

type MetadataInput = {
  title: string;
  description: string;
  keywords: string[];
};

export function createMetadata({
  title,
  description,
  keywords,
}: MetadataInput): Metadata {
  return {
    title,
    description,
    keywords,
    authors: [{ name: siteConfig.name }],
    creator: siteConfig.name,
    openGraph: {
      title,
      description,
      siteName: siteConfig.name,
      locale: "sv_SE",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}