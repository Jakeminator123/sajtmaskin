/**
 * HTML-index över alla publicerade SEO-landningssidor.
 *
 * Statisk sida som grupperar länkar per family och fungerar som en
 * mänsklig motsvarighet till sitemap.xml. Driven av filsystemet —
 * endast slugs med publicerad JSON listas.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import {
  SEO_AI_VARIANTS,
  SEO_CITIES,
  SEO_COMPARE,
  SEO_INDUSTRIES,
  SEO_USECASES,
  hrefForSeoLanding,
} from "@/content/seo/config";
import type { SeoLandingFamily } from "@/content/seo/types";
import { URLS } from "@/lib/config";
import { listSeoLandingSlugs } from "@/lib/seo/load-landing";

export const dynamic = "force-static";
export const revalidate = 60 * 60 * 24;

const PAGE_TITLE = "Alla landningssidor — Sajtmaskin";
const PAGE_DESCRIPTION =
  "Översikt över alla guider och landningssidor på Sajtmaskin: städer, användningsområden, branscher, AI-guider och jämförelser.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${URLS.baseUrl.replace(/\/$/, "")}/landningssidor` },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: "website",
    locale: "sv_SE",
  },
  robots: { index: true, follow: true },
};

interface Section {
  family: SeoLandingFamily;
  heading: string;
  description: string;
  labelFor: (slug: string) => string;
}

const SECTIONS: Section[] = [
  {
    family: "city",
    heading: "Städer",
    description: "Guider för att skapa hemsida i svenska städer.",
    labelFor: (slug) => SEO_CITIES.find((c) => c.slug === slug)?.label ?? slug,
  },
  {
    family: "usecase",
    heading: "Användningsområden",
    description: "Hemsidor per typ — webshop, portfolio, restaurang, mm.",
    labelFor: (slug) => SEO_USECASES.find((u) => u.slug === slug)?.label ?? slug,
  },
  {
    family: "industry",
    heading: "Branscher",
    description: "Hemsidor anpassade för olika branscher och yrken.",
    labelFor: (slug) => SEO_INDUSTRIES.find((i) => i.slug === slug)?.label ?? slug,
  },
  {
    family: "ai",
    heading: "AI-guider",
    description: "Svar på vanliga frågor om AI-drivna hemsidor.",
    labelFor: (slug) => SEO_AI_VARIANTS.find((a) => a.slug === slug)?.label ?? slug,
  },
  {
    family: "compare",
    heading: "Jämförelser",
    description: "Sajtmaskin jämfört med andra webbplatsbyggare.",
    labelFor: (slug) => {
      const cfg = SEO_COMPARE.find((c) => c.slug === slug);
      return cfg ? `Alternativ till ${cfg.label}` : slug;
    },
  },
];

interface CityUsecaseGroup {
  citySlug: string;
  cityLabel: string;
  items: Array<{ slug: string; href: string; label: string }>;
}

async function loadSections(): Promise<
  Array<{ section: Section; items: Array<{ slug: string; href: string; label: string }> }>
> {
  return Promise.all(
    SECTIONS.map(async (section) => {
      const slugs = await listSeoLandingSlugs(section.family);
      const items = slugs
        .map((slug) => ({
          slug,
          href: hrefForSeoLanding(section.family, slug),
          label: section.labelFor(slug),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "sv"));
      return { section, items };
    }),
  );
}

async function loadCityUsecaseGroups(): Promise<CityUsecaseGroup[]> {
  const slugs = await listSeoLandingSlugs("city-usecase");
  const cityMap = new Map(SEO_CITIES.map((c) => [c.slug, c.label]));
  const usecaseMap = new Map(SEO_USECASES.map((u) => [u.slug, u.label]));
  const groups = new Map<string, CityUsecaseGroup>();

  for (const slug of slugs) {
    const [citySlug, usecaseSlug] = slug.split("/");
    if (!citySlug || !usecaseSlug) continue;
    const cityLabel = cityMap.get(citySlug) ?? citySlug;
    const usecaseLabel = usecaseMap.get(usecaseSlug) ?? usecaseSlug;
    if (!groups.has(citySlug)) {
      groups.set(citySlug, { citySlug, cityLabel, items: [] });
    }
    groups.get(citySlug)!.items.push({
      slug,
      href: hrefForSeoLanding("city-usecase", slug),
      label: usecaseLabel,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.label.localeCompare(b.label, "sv")),
    }))
    .sort((a, b) => a.cityLabel.localeCompare(b.cityLabel, "sv"));
}

export default async function LandningssidorPage() {
  const [sections, cityUsecaseGroups] = await Promise.all([
    loadSections(),
    loadCityUsecaseGroups(),
  ]);

  const totalCount =
    sections.reduce((sum, s) => sum + s.items.length, 0) +
    cityUsecaseGroups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="bg-background min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <header className="mb-12 md:mb-16">
          <p className="text-muted-foreground text-xs tracking-wider uppercase">
            Sajtkarta
          </p>
          <h1 className="text-foreground mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Alla landningssidor
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed">
            {PAGE_DESCRIPTION} Totalt {totalCount} sidor.
          </p>
        </header>

        <div className="space-y-16">
          {sections.map(({ section, items }) =>
            items.length === 0 ? null : (
              <section key={section.family}>
                <div className="border-border/60 mb-6 border-b pb-4">
                  <h2 className="text-foreground text-xl font-medium tracking-tight">
                    {section.heading}
                    <span className="text-muted-foreground ml-3 text-sm font-normal">
                      {items.length}
                    </span>
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">{section.description}</p>
                </div>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3 lg:grid-cols-4">
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-foreground block py-1 text-sm transition-colors"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}

          {cityUsecaseGroups.length > 0 && (
            <section>
              <div className="border-border/60 mb-6 border-b pb-4">
                <h2 className="text-foreground text-xl font-medium tracking-tight">
                  Stad × Användningsområde
                  <span className="text-muted-foreground ml-3 text-sm font-normal">
                    {cityUsecaseGroups.reduce((sum, g) => sum + g.items.length, 0)}
                  </span>
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Kombinerade guider, till exempel &quot;webshop i Stockholm&quot;.
                </p>
              </div>
              <div className="space-y-8">
                {cityUsecaseGroups.map((group) => (
                  <div key={group.citySlug}>
                    <h3 className="text-foreground text-sm font-medium">
                      <Link
                        href={hrefForSeoLanding("city", group.citySlug)}
                        className="hover:underline"
                      >
                        {group.cityLabel}
                      </Link>
                    </h3>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {group.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
