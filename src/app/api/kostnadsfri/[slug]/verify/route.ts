import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { verifyPassword } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { recordPageView } from "@/lib/db/services/analytics";
import {
  backfillKostnadsfriPageProfile,
  getKostnadsfriPageBySlug,
} from "@/lib/db/services/kostnadsfri";
import {
  extractCompanyData,
  companyDataFromSlug,
  hasKostnadsfriPasswordSecret,
  isPageAccessible,
  verifyDeterministicPassword,
  type KostnadsfriCompanyData,
} from "@/lib/kostnadsfri";
import { kostnadsfriEventPath } from "@/lib/kostnadsfri/analytics-paths";
import {
  createKostnadsfriCampaignReceipt,
  KOSTNADSFRI_CAMPAIGN_COOKIE,
  KOSTNADSFRI_CAMPAIGN_RECEIPT_MAX_AGE,
} from "@/lib/kostnadsfri/campaign-receipt";
import {
  isKostnadsfriLookupConfigured,
  lookupKostnadsfriProfile,
} from "@/lib/kostnadsfri/profile-lookup";

/**
 * POST /api/kostnadsfri/[slug]/verify — Verify password for a kostnadsfri page
 *
 * Works in two modes:
 * 1. DB record exists: verifies against stored password hash + returns stored company data
 * 2. No DB record: verifies against deterministic password (HMAC) + derives company name from slug
 *
 * This means ANY slug works without pre-creation.
 * Rate-limited to 5 attempts per hour per IP.
 *
 * A successful verification is recorded as a `page_views` row at
 * `/kostnadsfri/<slug>/verifierad` so the admin console can see which invited
 * companies actually got past the gate (see lib/kostnadsfri/analytics-paths).
 *
 * Profilfallback: saknas `extra_data.profile` efter ett korrekt lösenord hämtas
 * den från utskicksverktyget (`lib/kostnadsfri/profile-lookup`), med bunden
 * tid och våra egna PII-guards på svaret. Push förblir huvudvägen; det här
 * täcker rader utan profil. Träffen skrivs tillbaka så anropet sker en gång.
 */

/**
 * Fyller på en saknad profil från utskicksverktyget. Körs bara när lösenordet
 * redan är verifierat och profilen saknas, så anropet kan inte användas för
 * uppräkning. Alla utfall utom träff lämnar `companyData` orörd — kunden får
 * då samma tomma wizard som före fallbacken, aldrig ett fel.
 */
async function withProfileFallback(
  companyData: KostnadsfriCompanyData,
  options: { hasRow: boolean },
): Promise<KostnadsfriCompanyData> {
  if (companyData.profile) return companyData;
  if (!isKostnadsfriLookupConfigured()) return companyData;

  const result = await lookupKostnadsfriProfile(companyData.slug);
  if (result.status !== "hit") {
    if (result.status === "unavailable") {
      // Orsakskod räcker för drift; inget ur svaret loggas.
      console.warn(`[API/kostnadsfri/verify] Profile lookup unavailable (${result.reason})`);
    }
    return companyData;
  }

  if (options.hasRow && result.profile) {
    const profile = result.profile as Record<string, unknown>;
    after(async () => {
      try {
        await backfillKostnadsfriPageProfile(companyData.slug, profile);
      } catch (error) {
        const kind = error instanceof Error ? error.name : typeof error;
        console.error(`[API/kostnadsfri/verify] Failed to backfill profile (${kind})`);
      }
    });
  }

  return {
    ...companyData,
    // Utan DB-rad är namnet härlett ur sluggen («Zax 2 0 Ab»). Registrets namn
    // är det företaget känner igen. Med rad äger raden namnet.
    companyName: options.hasRow ? companyData.companyName : result.companyName,
    profile: result.profile,
  };
}

function recordVerified(request: NextRequest, slug: string, sessionId: string) {
  const ip =
    request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  after(async () => {
    try {
      await recordPageView(
        kostnadsfriEventPath(slug, "verifierad"),
        sessionId,
        undefined,
        ip,
        userAgent,
      );
    } catch (error) {
      console.error("[API/kostnadsfri/verify] Failed to record verification:", error);
    }
  });
}

const verifySchema = z.object({
  password: z.string().min(1, "Password is required"),
});

// Simple in-memory rate limiting for password attempts
const attemptStore = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkAttemptLimit(key: string): boolean {
  const now = Date.now();
  const entry = attemptStore.get(key);

  if (!entry || now > entry.resetAt) {
    attemptStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const session = ensureSessionIdFromRequest(request);
    const verifiedResponse = (companyData: ReturnType<typeof companyDataFromSlug>) => {
      recordVerified(request, slug, session.sessionId);
      const response = NextResponse.json({ success: true, companyData });
      response.cookies.set({
        name: KOSTNADSFRI_CAMPAIGN_COOKIE,
        value: createKostnadsfriCampaignReceipt({ slug, sessionId: session.sessionId }),
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: KOSTNADSFRI_CAMPAIGN_RECEIPT_MAX_AGE,
      });
      const setCookies = session.setCookies ?? (session.setCookie ? [session.setCookie] : []);
      for (const setCookie of setCookies) {
        response.headers.append("Set-Cookie", setCookie);
      }
      return response;
    };

    // Rate limit by IP + slug
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const rateLimitKey = `${ip}:${slug}`;

    if (!checkAttemptLimit(rateLimitKey)) {
      return NextResponse.json(
        { success: false, error: "För många försök. Vänta en stund och försök igen." },
        { status: 429 },
      );
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const validation = verifySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Lösenord krävs." }, { status: 400 });
    }

    const { password } = validation.data;

    // Try DB first (pre-created pages with enriched data)
    let page;
    try {
      page = await getKostnadsfriPageBySlug(slug);
    } catch {
      // DB not available — fall through to deterministic verification
    }

    if (page) {
      // Mode 1: DB record exists — use stored hash + check accessibility
      const access = isPageAccessible(page);
      if (!access.accessible) {
        return NextResponse.json({ success: false, error: access.reason }, { status: 403 });
      }

      if (!verifyPassword(password, page.password_hash)) {
        return NextResponse.json({ success: false, error: "Felaktigt lösenord." }, { status: 401 });
      }

      return verifiedResponse(
        await withProfileFallback(extractCompanyData(page), { hasRow: true }),
      );
    }

    // Mode 2: No DB record — verify deterministically
    if (!hasKostnadsfriPasswordSecret()) {
      return NextResponse.json(
        { success: false, error: "Länkverifiering är inte konfigurerad." },
        { status: 503 },
      );
    }

    if (!verifyDeterministicPassword(slug, password)) {
      return NextResponse.json({ success: false, error: "Felaktigt lösenord." }, { status: 401 });
    }

    // Success — slug-derived company data, enriched from the send tool when it
    // knows the company (no row to backfill in this mode).
    return verifiedResponse(
      await withProfileFallback(companyDataFromSlug(slug), { hasRow: false }),
    );
  } catch (error: unknown) {
    console.error("[API/kostnadsfri/verify] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte verifiera länken." },
      { status: 500 },
    );
  }
}
