import type { Metadata } from "next";
import { SEO_CITIES } from "@/content/seo/config";
import {
  buildSeoMetadata,
  renderSeoLandingRoute,
} from "@/lib/seo/render-seo-page";
import { listSeoLandingSlugs } from "@/lib/seo/load-landing";

export const dynamic = "force-static";
export const revalidate = 60 * 60 * 24 * 7;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ stad: string }>;
}

export async function generateStaticParams(): Promise<Array<{ stad: string }>> {
  const slugs = await listSeoLandingSlugs("city");
  const valid = new Set(SEO_CITIES.map((c) => c.slug));
  return slugs
    .filter((slug) => valid.has(slug))
    .map((slug) => ({ stad: slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { stad } = await params;
  return buildSeoMetadata({
    family: "city",
    slug: stad,
    canonicalPath: `/hemsida/${stad}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      {
        name: SEO_CITIES.find((c) => c.slug === stad)?.label ?? stad,
        href: `/hemsida/${stad}`,
      },
    ],
  });
}

export default async function CityLandingPage({ params }: PageProps) {
  const { stad } = await params;
  const city = SEO_CITIES.find((c) => c.slug === stad);
  return renderSeoLandingRoute({
    family: "city",
    slug: stad,
    canonicalPath: `/hemsida/${stad}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      { name: city?.label ?? stad, href: `/hemsida/${stad}` },
    ],
  });
}
