import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";

const starterPackage = CREDIT_PACKAGES[0];

export function OrganizationJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Pretty Good B.V.",
    alternateName: "Sajtmaskin",
    url: "https://sajtmaskin.se",
    sameAs: ["https://sajtmaskin.se"],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Sajtmaskin",
    applicationCategory: "WebApplication",
    operatingSystem: "Web",
    description: "AI-driven webbplatsgenerering. Skapa professionella webbplatser på minuter.",
    url: "https://sajtmaskin.se",
    offers: {
      "@type": "Offer",
      price: String(starterPackage.price),
      priceCurrency: "SEK",
      description: `Startpaket med ${starterPackage.credits} credits`,
    },
    creator: {
      "@type": "Organization",
      name: "Pretty Good B.V.",
      url: "https://sajtmaskin.se",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
