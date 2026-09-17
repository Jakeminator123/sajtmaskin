import type { Metadata } from "next";
import { URLS } from "@/lib/config";
import {
  getSeoLandingEntry,
  type SeoLandingPageEntry,
  type SeoLandingSlug,
} from "./registry";

export function seoLandingMetadataFromEntry(entry: SeoLandingPageEntry): Metadata {
  const isReady = entry.status === "ready";
  return {
    title: isReady ? entry.title : `Testsida — ${entry.title}`,
    description: isReady
      ? entry.description
      : "Intern testsida för Sajtmaskin. Inte avsedd för sökindexering.",
    alternates: {
      canonical: `${URLS.baseUrl}/${entry.slug}`,
    },
    robots: isReady
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export function createSeoLandingMetadata(slug: SeoLandingSlug): Metadata {
  return seoLandingMetadataFromEntry(getSeoLandingEntry(slug));
}
