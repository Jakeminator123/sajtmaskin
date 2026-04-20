import type { Metadata } from "next";
import { SEO_CITIES, SEO_CITY_USECASES, SEO_USECASES } from "@/content/seo/config";
import {
  buildSeoMetadata,
  renderSeoLandingRoute,
} from "@/lib/seo/render-seo-page";
import { listSeoLandingSlugs } from "@/lib/seo/load-landing";

export const dynamic = "force-static";
export const revalidate = 60 * 60 * 24 * 7;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ stad: string; typ: string }>;
}

export async function generateStaticParams(): Promise<Array<{ stad: string; typ: string }>> {
  const slugs = await listSeoLandingSlugs("city-usecase");
  const valid = new Set(SEO_CITY_USECASES.map((c) => c.slug));
  return slugs
    .filter((slug) => valid.has(slug))
    .map((slug) => {
      const [stad, typ] = slug.split("/");
      return { stad, typ };
    });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { stad, typ } = await params;
  const slug = `${stad}/${typ}`;
  const city = SEO_CITIES.find((c) => c.slug === stad);
  const usecase = SEO_USECASES.find((u) => u.slug === typ);
  return buildSeoMetadata({
    family: "city-usecase",
    slug,
    canonicalPath: `/hemsida/${slug}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      { name: city?.label ?? stad, href: `/hemsida/${stad}` },
      { name: usecase?.label ?? typ, href: `/hemsida/${slug}` },
    ],
  });
}

export default async function CityUsecaseLandingPage({ params }: PageProps) {
  const { stad, typ } = await params;
  const slug = `${stad}/${typ}`;
  const city = SEO_CITIES.find((c) => c.slug === stad);
  const usecase = SEO_USECASES.find((u) => u.slug === typ);
  return renderSeoLandingRoute({
    family: "city-usecase",
    slug,
    canonicalPath: `/hemsida/${slug}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      { name: city?.label ?? stad, href: `/hemsida/${stad}` },
      { name: usecase?.label ?? typ, href: `/hemsida/${slug}` },
    ],
  });
}
