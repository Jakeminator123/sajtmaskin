import type { Metadata } from "next";

import { metadataKeywords, siteConfig } from "@/lib/site-data";

type CreateMetadataParams = {
  title: string;
  description: string;
  path: string;
};

export function createMetadata({
  title,
  description,
  path,
}: CreateMetadataParams): Metadata {
  const canonicalUrl = new URL(path, siteConfig.siteUrl).toString();
  const openGraphTitle =
    path === "/"
      ? siteConfig.defaultTitle
      : `${title} | ${siteConfig.titleSuffix}`;

  return {
    title: path === "/" ? { absolute: siteConfig.defaultTitle } : title,
    description,
    keywords: [...metadataKeywords],
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: openGraphTitle,
      description,
      url: canonicalUrl,
      siteName: siteConfig.name,
      locale: "sv_SE",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: openGraphTitle,
      description,
    },
  };
}