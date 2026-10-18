import {
  BreadcrumbListJsonLd,
  FaqPageJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/layout/json-ld";
import { PUBLIC_CANONICAL_ORIGIN, publicCanonicalPath } from "@/lib/public-canonical-url";
import { getSeoLandingEntry, type SeoLandingSlug } from "./registry";

export function seoLandingBreadcrumbName(title: string): string {
  return title.split(/[–?]/)[0]?.trim() || title;
}

export function SeoLandingJsonLd({
  slug,
  faqs,
}: {
  slug: SeoLandingSlug;
  faqs: readonly { q: string; a: string }[];
}) {
  const entry = getSeoLandingEntry(slug);
  return (
    <>
      <SoftwareApplicationJsonLd />
      <BreadcrumbListJsonLd
        items={[
          { name: "Sajtmaskin", url: PUBLIC_CANONICAL_ORIGIN },
          {
            name: seoLandingBreadcrumbName(entry.title),
            url: publicCanonicalPath(`/${entry.slug}`),
          },
        ]}
      />
      <FaqPageJsonLd items={faqs} />
    </>
  );
}
