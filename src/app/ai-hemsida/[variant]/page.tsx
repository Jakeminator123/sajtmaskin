import type { Metadata } from "next";
import { SEO_AI_VARIANTS } from "@/content/seo/config";
import {
  buildSeoMetadata,
  renderSeoLandingRoute,
} from "@/lib/seo/render-seo-page";
import { listSeoLandingSlugs } from "@/lib/seo/load-landing";

export const dynamic = "force-static";
export const revalidate = 60 * 60 * 24 * 7;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ variant: string }>;
}

export async function generateStaticParams(): Promise<Array<{ variant: string }>> {
  const slugs = await listSeoLandingSlugs("ai");
  const valid = new Set(SEO_AI_VARIANTS.map((a) => a.slug));
  return slugs
    .filter((slug) => valid.has(slug))
    .map((slug) => ({ variant: slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { variant } = await params;
  return buildSeoMetadata({
    family: "ai",
    slug: variant,
    canonicalPath: `/ai-hemsida/${variant}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      {
        name: SEO_AI_VARIANTS.find((a) => a.slug === variant)?.label ?? variant,
        href: `/ai-hemsida/${variant}`,
      },
    ],
  });
}

export default async function AiLandingPage({ params }: PageProps) {
  const { variant } = await params;
  const ai = SEO_AI_VARIANTS.find((a) => a.slug === variant);
  return renderSeoLandingRoute({
    family: "ai",
    slug: variant,
    canonicalPath: `/ai-hemsida/${variant}`,
    breadcrumbs: [
      { name: "Hem", href: "/" },
      { name: ai?.label ?? variant, href: `/ai-hemsida/${variant}` },
    ],
  });
}
