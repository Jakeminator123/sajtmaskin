import type { Metadata } from "next";
import { SEO_INDUSTRIES } from "@/content/seo/config";
import {
  buildSeoMetadata,
  renderSeoLandingRoute,
} from "@/lib/seo/render-seo-page";
import { listSeoLandingSlugs } from "@/lib/seo/load-landing";

export const dynamic = "force-static";
export const revalidate = 60 * 60 * 24 * 7;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ bransch: string }>;
}

export async function generateStaticParams(): Promise<Array<{ bransch: string }>> {
  const slugs = await listSeoLandingSlugs("industry");
  const valid = new Set(SEO_INDUSTRIES.map((i) => i.slug));
  return slugs
    .filter((slug) => valid.has(slug))
    .map((slug) => ({ bransch: slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { bransch } = await params;
  return buildSeoMetadata({
    family: "industry",
    slug: bransch,
    canonicalPath: `/hemsida-for/${bransch}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      {
        name: SEO_INDUSTRIES.find((i) => i.slug === bransch)?.label ?? bransch,
        href: `/hemsida-for/${bransch}`,
      },
    ],
  });
}

export default async function IndustryLandingPage({ params }: PageProps) {
  const { bransch } = await params;
  const industry = SEO_INDUSTRIES.find((i) => i.slug === bransch);
  return renderSeoLandingRoute({
    family: "industry",
    slug: bransch,
    canonicalPath: `/hemsida-for/${bransch}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      { name: industry?.label ?? bransch, href: `/hemsida-for/${bransch}` },
    ],
  });
}
