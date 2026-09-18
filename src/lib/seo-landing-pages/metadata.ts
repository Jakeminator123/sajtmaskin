import type { Metadata } from "next";
import { URLS } from "@/lib/config";
import {
  getSeoLandingEntry,
  type SeoLandingPageEntry,
  type SeoLandingSlug,
} from "./registry";

export function seoLandingMetadataFromEntry(entry: SeoLandingPageEntry): Metadata {
  const isReady = entry.status === "ready";
  const title = isReady ? entry.title : `Testsida — ${entry.title}`;
  const description = isReady
    ? entry.description
    : "Intern testsida för Sajtmaskin. Inte avsedd för sökindexering.";
  const canonical = `${URLS.baseUrl}/${entry.slug}`;
  return {
    title,
    description,
    alternates: {
      canonical,
    },
    robots: isReady
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      locale: "sv_SE",
      siteName: "Sajtmaskin",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function createSeoLandingMetadata(slug: SeoLandingSlug): Metadata {
  return seoLandingMetadataFromEntry(getSeoLandingEntry(slug));
}
