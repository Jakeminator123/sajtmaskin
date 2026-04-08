import type { Metadata } from "next";

import {
  baseKeywords,
  siteDescription,
  siteName,
  siteUrl,
} from "@/lib/site-data";

type MetadataOptions = {
  pageName?: string;
  description: string;
  path: string;
};

function buildTitle(pageName?: string) {
  if (!pageName) {
    return `${siteName} — Silverträdet säljer handgjorda silversmycken online`;
  }

  return `${pageName} | ${siteName} — Silverträdet säljer handgjorda silversmycken online`;
}

export function createPageMetadata({
  pageName,
  description,
  path,
}: MetadataOptions): Metadata {
  const title = buildTitle(pageName);
  const image =
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop&q=80";

  return {
    title,
    description,
    keywords: [...baseKeywords],
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${path}`,
      siteName,
      locale: "sv_SE",
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "Silverträdet handgjorda silversmycken",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${siteName} — Silverträdet säljer handgjorda silversmycken online`,
  description: siteDescription,
  keywords: [...baseKeywords],
  authors: [{ name: siteName }],
  openGraph: {
    title: `${siteName} — Silverträdet säljer handgjorda silversmycken online`,
    description: siteDescription,
    url: siteUrl,
    siteName,
    locale: "sv_SE",
    type: "website",
    images: [
      {
        url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop&q=80",
        width: 1200,
        height: 630,
        alt: "Silverträdet handgjorda silversmycken",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} — Silverträdet säljer handgjorda silversmycken online`,
    description: siteDescription,
    images: [
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop&q=80",
    ],
  },
};