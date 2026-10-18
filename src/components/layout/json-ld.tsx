import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { PUBLIC_CANONICAL_ORIGIN, publicCanonicalPath } from "@/lib/public-canonical-url";

const prices = CREDIT_PACKAGES.map((pkg) => pkg.price);
const lowPrice = Math.min(...prices);
const highPrice = Math.max(...prices);

export function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd() {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Sajtmaskin",
        legalName: "Pretty Good B.V.",
        alternateName: "SajtMaskin",
        url: PUBLIC_CANONICAL_ORIGIN,
        logo: publicCanonicalPath("/icon.svg"),
        email: "support@sajtmaskin.se",
      }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Sajtmaskin",
        applicationCategory: "WebApplication",
        operatingSystem: "Web",
        description:
          "Svensk AI-hemsidebyggare. Skapa en professionell hemsida från en beskrivning, anpassa utkastet och publicera.",
        url: PUBLIC_CANONICAL_ORIGIN,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "SEK",
          lowPrice: String(lowPrice),
          highPrice: String(highPrice),
          offerCount: CREDIT_PACKAGES.length,
        },
        creator: {
          "@type": "Organization",
          name: "Sajtmaskin",
          legalName: "Pretty Good B.V.",
          url: PUBLIC_CANONICAL_ORIGIN,
        },
      }}
    />
  );
}

export function BreadcrumbListJsonLd({
  items,
}: {
  items: readonly { name: string; url: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      }}
    />
  );
}

export function FaqPageJsonLd({
  items,
}: {
  items: readonly { q: string; a: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <JsonLdScript
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      }}
    />
  );
}
