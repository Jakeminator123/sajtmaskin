import { getKostnadsfriPageBySlug } from "@/lib/db/services/kostnadsfri";
import { findKostnadsfriPageForSlug, isPageAccessible } from "@/lib/kostnadsfri";
import { companyNameFromSlug } from "@/lib/kostnadsfri/company-name";
import {
  extractKostnadsfriOpenClawConfig,
  type KostnadsfriOpenClawConfig,
} from "@/lib/kostnadsfri/openclaw-config";
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

async function loadKostnadsfriLandingPage(slug: string) {
  try {
    return await findKostnadsfriPageForSlug(slug, getKostnadsfriPageBySlug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;

  // Try DB first for a richer title, fall back to slug-derived name
  let companyName = companyNameFromSlug(slug);
  const page = await loadKostnadsfriLandingPage(slug);
  if (page) {
    companyName = page.company_name;
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
  let expiredReason: string | null = null;
  let openclawConfig: KostnadsfriOpenClawConfig | null = null;

  const page = await loadKostnadsfriLandingPage(slug);
  if (page) {
    const access = isPageAccessible(page);
    if (!access.accessible) {
      expiredReason = access.reason ?? "Länken är inte längre giltig.";
    } else {
      companyName = page.company_name;
      openclawConfig = extractKostnadsfriOpenClawConfig(
        page.extra_data as Record<string, unknown> | null,
      );
    }
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
      openclawConfig={openclawConfig}
    />
  );
}
