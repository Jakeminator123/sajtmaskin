/**
 * Delad render-helper för SEO-landningssidor.
 *
 * Används av samtliga sex app/.../page.tsx-routes för att undvika
 * duplicering av metadata-, JSON-LD- och rendering-logik. Varje route
 * tillför sin egen family, slug och breadcrumb-struktur.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeoLandingPage } from "@/components/seo/SeoLandingPage";
import { SEO_CITIES } from "@/content/seo/config";
import type { SeoLandingFamily } from "@/content/seo/types";
import { URLS } from "@/lib/config";
import {
  buildArticleLd,
  buildBreadcrumbLd,
  buildCityOrganizationLd,
  buildFaqPageLd,
  type BreadcrumbTrailItem,
} from "@/lib/seo/json-ld";
import { loadSeoLanding } from "@/lib/seo/load-landing";

export const SEO_FAMILY_BADGES: Record<SeoLandingFamily, string> = {
  city: "Ort",
  usecase: "Användningsområde",
  industry: "Bransch",
  ai: "AI-guide",
  compare: "Jämförelse",
  "city-usecase": "Ort × Typ",
};

export interface SeoPageDescriptor {
  family: SeoLandingFamily;
  slug: string;
  canonicalPath: string;
  breadcrumbs: { name: string; href: string }[];
}

function absoluteUrl(pathname: string): string {
  const base = URLS.baseUrl.replace(/\/$/, "");
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${suffix}`;
}

export async function buildSeoMetadata(descriptor: SeoPageDescriptor): Promise<Metadata> {
  const content = await loadSeoLanding(descriptor.family, descriptor.slug);
  if (!content) {
    return {
      title: "Sidan hittades inte",
      robots: { index: false, follow: false },
    };
  }

  const canonical = absoluteUrl(descriptor.canonicalPath);

  return {
    title: content.title,
    description: content.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: content.title,
      description: content.metaDescription,
      url: canonical,
      type: "article",
      locale: "sv_SE",
    },
    twitter: {
      card: "summary_large_image",
      title: content.title,
      description: content.metaDescription,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
    },
  };
}

export async function renderSeoLandingRoute(descriptor: SeoPageDescriptor) {
  const content = await loadSeoLanding(descriptor.family, descriptor.slug);
  if (!content) {
    notFound();
  }

  const canonical = absoluteUrl(descriptor.canonicalPath);
  const familyBadge = SEO_FAMILY_BADGES[descriptor.family];

  const trail: BreadcrumbTrailItem[] = descriptor.breadcrumbs.map((crumb) => ({
    name: crumb.name,
    url: absoluteUrl(crumb.href),
  }));

  const jsonLdBlocks: Record<string, unknown>[] = [
    buildArticleLd(content, canonical),
    buildBreadcrumbLd(trail),
  ];
  if (content.faq.length > 0) {
    jsonLdBlocks.push(buildFaqPageLd(content.faq));
  }
  if (descriptor.family === "city" || descriptor.family === "city-usecase") {
    const citySlug =
      descriptor.family === "city"
        ? descriptor.slug
        : descriptor.slug.split("/")[0];
    const city = SEO_CITIES.find((c) => c.slug === citySlug);
    if (city) {
      jsonLdBlocks.push(buildCityOrganizationLd(city.label, canonical));
    }
  }

  return (
    <>
      {jsonLdBlocks.map((block, index) => (
        <script
          key={`seo-ld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
      <SeoLandingPage
        content={content}
        familyBadge={familyBadge}
        breadcrumbs={descriptor.breadcrumbs}
      />
    </>
  );
}
