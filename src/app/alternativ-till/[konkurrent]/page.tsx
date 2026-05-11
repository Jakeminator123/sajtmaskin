import type { Metadata } from "next";
import { SEO_COMPARE } from "@/content/seo/config";
import {
  buildSeoMetadata,
  renderSeoLandingRoute,
} from "@/lib/seo/render-seo-page";
import { listSeoLandingSlugs } from "@/lib/seo/load-landing";

export const dynamic = "force-static";
export const revalidate = 604800;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ konkurrent: string }>;
}

export async function generateStaticParams(): Promise<Array<{ konkurrent: string }>> {
  const slugs = await listSeoLandingSlugs("compare");
  const valid = new Set(SEO_COMPARE.map((c) => c.slug));
  return slugs
    .filter((slug) => valid.has(slug))
    .map((slug) => ({ konkurrent: slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { konkurrent } = await params;
  return buildSeoMetadata({
    family: "compare",
    slug: konkurrent,
    canonicalPath: `/alternativ-till/${konkurrent}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      {
        name: `Alternativ till ${SEO_COMPARE.find((c) => c.slug === konkurrent)?.label ?? konkurrent}`,
        href: `/alternativ-till/${konkurrent}`,
      },
    ],
  });
}

export default async function CompareLandingPage({ params }: PageProps) {
  const { konkurrent } = await params;
  const cmp = SEO_COMPARE.find((c) => c.slug === konkurrent);
  return renderSeoLandingRoute({
    family: "compare",
    slug: konkurrent,
    canonicalPath: `/alternativ-till/${konkurrent}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      {
        name: `Alternativ till ${cmp?.label ?? konkurrent}`,
        href: `/alternativ-till/${konkurrent}`,
      },
    ],
  });
}
