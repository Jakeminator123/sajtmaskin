/**
 * JSON-LD-builders för SEO-landningssidor.
 *
 * Outputen är plain objekt som serialiseras med `JSON.stringify` och skrivs
 * in i en `<script type="application/ld+json">` i renderaren.
 */

import type { SeoLandingContent, SeoLandingFaqEntry } from "@/content/seo/types";

/** Trail-element för breadcrumbs. Byggs av pagen som vet sin URL. */
export interface BreadcrumbTrailItem {
  name: string;
  url: string;
}

export function buildFaqPageLd(faq: SeoLandingFaqEntry[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.a,
      },
    })),
  };
}

export function buildArticleLd(
  content: SeoLandingContent,
  canonicalUrl: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.h1,
    description: content.metaDescription,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    datePublished: content.generatedAt,
    dateModified: content.generatedAt,
    author: {
      "@type": "Organization",
      name: "Sajtmaskin",
      url: "https://sajtmaskin.se",
    },
    publisher: {
      "@type": "Organization",
      name: "Pretty Good AB",
      url: "https://sajtstudio.se",
    },
  };
}

export function buildBreadcrumbLd(trail: BreadcrumbTrailItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * För stad-sidor: en `Organization` som representerar Sajtmaskin och
 * markerar `areaServed`. Sajtmaskin är inte en lokal verksamhet per stad,
 * så vi använder `Organization` snarare än `LocalBusiness` för att vara
 * schema-korrekta.
 */
export function buildCityOrganizationLd(
  cityLabel: string,
  canonicalUrl: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: `Sajtmaskin – ${cityLabel}`,
    url: canonicalUrl,
    parentOrganization: {
      "@type": "Organization",
      name: "Pretty Good AB",
      url: "https://sajtstudio.se",
    },
    areaServed: {
      "@type": "City",
      name: cityLabel,
      addressCountry: "SE",
    },
  };
}
