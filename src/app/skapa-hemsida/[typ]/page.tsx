import type { Metadata } from "next";
import { SEO_USECASES } from "@/content/seo/config";
import {
  buildSeoMetadata,
  renderSeoLandingRoute,
} from "@/lib/seo/render-seo-page";
import { listSeoLandingSlugs } from "@/lib/seo/load-landing";

export const dynamic = "force-static";
export const revalidate = 604800;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ typ: string }>;
}

export async function generateStaticParams(): Promise<Array<{ typ: string }>> {
  const slugs = await listSeoLandingSlugs("usecase");
  const valid = new Set(SEO_USECASES.map((u) => u.slug));
  return slugs
    .filter((slug) => valid.has(slug))
    .map((slug) => ({ typ: slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { typ } = await params;
  return buildSeoMetadata({
    family: "usecase",
    slug: typ,
    canonicalPath: `/skapa-hemsida/${typ}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      {
        name: SEO_USECASES.find((u) => u.slug === typ)?.label ?? typ,
        href: `/skapa-hemsida/${typ}`,
      },
    ],
  });
}

export default async function UsecaseLandingPage({ params }: PageProps) {
  const { typ } = await params;
  const usecase = SEO_USECASES.find((u) => u.slug === typ);
  return renderSeoLandingRoute({
    family: "usecase",
    slug: typ,
    canonicalPath: `/skapa-hemsida/${typ}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      { name: usecase?.label ?? typ, href: `/skapa-hemsida/${typ}` },
    ],
  });
}
