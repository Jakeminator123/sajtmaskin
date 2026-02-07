import { getKostnadsfriPageBySlug } from "@/lib/db/services";
import { companyNameFromSlug, isPageAccessible } from "@/lib/kostnadsfri";
import { KostnadsfriPage } from "@/components/kostnadsfri/kostnadsfri-page";

/**
 * /kostnadsfri/[slug] — Server-side rendered page
 *
 * Works in two modes:
 * 1. With DB record: uses stored company data (name, industry, website)
 * 2. Without DB record: derives company name from slug, password verified deterministically
 *
 * This means ANY slug works — no pre-creation needed.
 * Flow: PasswordGate -> MiniWizard -> ThinkingSpinner -> Builder redirect
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;

  // Try DB first for a richer title, fall back to slug-derived name
  let companyName = companyNameFromSlug(slug);
  try {
    const page = await getKostnadsfriPageBySlug(slug);
    if (page) {
      companyName = page.company_name;
    }
  } catch {
    // DB not available — use slug-derived name
  }

  return {
    title: `${companyName} — Kostnadsfri webbsida`,
    description: "Skapa din kostnadsfria webbsida med SajtMaskin.",
    robots: { index: false, follow: false },
  };
}

export default async function KostnadsfriSlugPage({ params }: PageProps) {
  const { slug } = await params;

  // Try to load from DB (for pre-created pages with extra data)
  let companyName = companyNameFromSlug(slug);
  let hasDbRecord = false;
  let expiredReason: string | null = null;

  try {
    const page = await getKostnadsfriPageBySlug(slug);
    if (page) {
      // Check if DB page is still accessible (expiry etc.)
      const access = isPageAccessible(page);
      if (!access.accessible) {
        expiredReason = access.reason ?? "Länken är inte längre giltig.";
      } else {
        companyName = page.company_name;
        hasDbRecord = true;
      }
    }
  } catch {
    // DB not available — continue with slug-derived data
  }

  if (expiredReason) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">Länken har gått ut</h1>
          <p className="text-gray-400">{expiredReason}</p>
        </div>
      </div>
    );
  }

  return (
    <KostnadsfriPage
      slug={slug}
      companyName={companyName}
      hasDbRecord={hasDbRecord}
    />
  );
}
