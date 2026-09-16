import Link from "next/link";
import { getSeoLandingEntry, type SeoLandingSlug } from "@/lib/seo-landing-pages/registry";

/**
 * Shared blue test surface for unfinished SEO landing routes.
 * Future finished pages should replace this per-route instead of extending
 * it into a page-builder. Styles stay on this wrapper so they cannot leak
 * into `globals.css`.
 */
export function SeoLandingPlaceholder({ slug }: { slug: SeoLandingSlug }) {
  const entry = getSeoLandingEntry(slug);

  return (
    <main className="flex min-h-screen flex-col bg-blue-600 text-white">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-medium underline-offset-4 hover:underline">
          Sajtmaskin
        </Link>
        <Link
          href={entry.ctaHref}
          className="rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium underline-offset-4 hover:bg-white/25 hover:underline"
        >
          Skapa hemsida
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
        <p className="text-xs font-medium tracking-[0.22em] text-blue-100 uppercase">
          Placeholder
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
          Testsida Sajtmaskin
        </h1>
        <p className="max-w-xl text-base text-blue-50 md:text-lg">{entry.plannedH1}</p>
        <p className="text-sm text-blue-100">/{entry.slug}</p>
        <Link
          href={entry.ctaHref}
          className="mt-2 rounded-lg bg-white px-5 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          Öppna Sajtmaskin
        </Link>
      </div>
    </main>
  );
}
