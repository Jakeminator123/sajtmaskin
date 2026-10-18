import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import {
  clearAuthCookie,
  createToken,
  getCurrentUser,
  setAuthCookie,
  verifyPassword,
} from "@/lib/auth/auth";
import { expireCookieSetOptions } from "@/lib/auth/host-cookies";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { recordPageView } from "@/lib/db/services/analytics";
import { findOrCreateKostnadsfriCampaignUser } from "@/lib/db/services/kostnadsfri-account";
import { getKostnadsfriBoundProjectIdForOwner } from "@/lib/db/services/kostnadsfri-campaign";
import { updateUserLastLogin } from "@/lib/db/services/users";
import {
  backfillKostnadsfriPageProfile,
  getKostnadsfriPageBySlug,
  getAcceptedKostnadsfriMailEvent,
  markKostnadsfriProfileLookupSettled,
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
  isCampaignAccountProvider,
  isUnclaimedCampaignAccount,
  type CampaignAccountStatus,
} from "@/lib/kostnadsfri/campaign-account";
import {
  campaignClaimCookieName,
  kostnadsfriCampaignEmail,
  readCampaignClaimTicket,
} from "@/lib/kostnadsfri/campaign-account-ticket";
import {
  createKostnadsfriCampaignReceipt,
  KOSTNADSFRI_CAMPAIGN_COOKIE,
  KOSTNADSFRI_CAMPAIGN_RECEIPT_MAX_AGE,
} from "@/lib/kostnadsfri/campaign-receipt";
import { isKostnadsfriProfileFallbackSettled } from "@/lib/kostnadsfri/company-profile";
import {
  isKostnadsfriLookupConfigured,
  lookupKostnadsfriProfile,
} from "@/lib/kostnadsfri/profile-lookup";
import { withRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/kostnadsfri/[slug]/verify — Verify password for a kostnadsfri page
 *
 * Works in two modes:
 * 1. DB record exists: verifies against stored password hash + returns stored company data
 * 2. No DB record: verifies against deterministic password (HMAC) + derives company name from slug
 *
 * This means ANY slug works without pre-creation.
 * Rate-limited per IP via the shared limiter (`kostnadsfri:verify`).
 *
 * Kampanjkonto (ägarbeslut 2026-10-17): ett korrekt lösenord loggar in i sidans
 * kampanjkonto, utom när besökaren redan är inloggad med ett eget konto eller
 * inbjudan redan sparats till ett konto (`account` i svaret).
 *
 * A successful verification is recorded as a `page_views` row at
 * `/kostnadsfri/<slug>/verifierad` so the admin console can see which invited
 * companies actually got past the gate (see lib/kostnadsfri/analytics-paths).
 *
 * Profilfallback: saknas den *normaliserade* profilen efter ett korrekt
 * lösenord hämtas den från utskicksverktyget (`lib/kostnadsfri/profile-lookup`),
 * med bunden tid och våra egna PII-guards på svaret. Push förblir huvudvägen;
 * ogiltig legacy räknas som saknad. Träffen skrivs tillbaka så anropet sker
 * en gång. Negativ sentinel (`profileFallback`) har TTL; timeout/5xx cacheas inte.
 */

/**
 * Fyller på en saknad profil från utskicksverktyget. Körs bara när lösenordet
 * redan är verifierat och profilen saknas, så anropet kan inte användas för
 * uppräkning. Alla utfall utom träff lämnar `companyData` orörd — kunden får
 * då samma tomma wizard som före fallbacken, aldrig ett fel.
 */
function settleProfileLookup(slug: string, outcome: "miss" | "empty") {
  after(async () => {
    try {
      await markKostnadsfriProfileLookupSettled(slug, outcome);
    } catch (error) {
      const kind = error instanceof Error ? error.name : typeof error;
      console.error(`[API/kostnadsfri/verify] Failed to settle profile lookup (${kind})`);
    }
  });
}

async function withProfileFallback(
  companyData: KostnadsfriCompanyData,
  options: { hasRow: boolean; extraData?: unknown },
): Promise<KostnadsfriCompanyData> {
  if (companyData.profile) return companyData;
  if (isKostnadsfriProfileFallbackSettled(options.extraData)) return companyData;
  if (!isKostnadsfriLookupConfigured()) return companyData;

  const result = await lookupKostnadsfriProfile(companyData.slug);
  if (result.status !== "hit") {
    if (result.status === "unavailable") {
      // Orsakskod räcker för drift; inget ur svaret loggas.
      // Timeout/503 ska kunna retrys — ingen negativ sentinel.
      console.warn(`[API/kostnadsfri/verify] Profile lookup unavailable (${result.reason})`);
    } else if (result.status === "miss" && options.hasRow) {
      settleProfileLookup(companyData.slug, "miss");
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
  } else if (options.hasRow && !result.profile) {
    settleProfileLookup(companyData.slug, "empty");
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
  mailId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  variant: z.enum(["rent", "animated"]).optional(),
});

/**
 * Loggar in sidans kampanjkonto när besökaren inte redan har ett eget konto.
 * Ett befintligt vanligt konto loggas aldrig in via länklösenordet, och ett
 * sparat kampanjkonto nås bara med kundens egna inloggning.
 */
async function signInCampaignAccount(
  request: NextRequest,
  slug: string,
  companyName: string,
): Promise<{ account: CampaignAccountStatus; userId: string | null }> {
  const secure = new URL(request.url).protocol === "https:";
  let current: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    current = await getCurrentUser(request);
    if (current && !isCampaignAccountProvider(current.provider)) {
      return { account: "existing", userId: current.id };
    }

    const campaignUser = await findOrCreateKostnadsfriCampaignUser({
      email: kostnadsfriCampaignEmail(slug),
      companyName,
    });
    if (!isUnclaimedCampaignAccount(campaignUser)) {
      if (!isCampaignAccountProvider(campaignUser.provider)) {
        console.warn("[API/kostnadsfri/verify] Campaign address is held by a non-campaign account");
      }
      // Another invitation's campaign session must not build on this one.
      if (current) await clearAuthCookie({ secure });
      return { account: "claimed", userId: null };
    }

    await setAuthCookie(createToken(campaignUser.id, campaignUser.email), { secure });
    after(async () => {
      try {
        await updateUserLastLogin(campaignUser.id);
      } catch (error) {
        const kind = error instanceof Error ? error.name : typeof error;
        console.error(`[API/kostnadsfri/verify] Failed to stamp campaign login (${kind})`);
      }
    });
    return { account: "campaign", userId: campaignUser.id };
  } catch (error) {
    const kind = error instanceof Error ? error.name : typeof error;
    console.error(`[API/kostnadsfri/verify] Campaign account unavailable (${kind})`);
    // Same rule as a claimed invitation: another invitation's campaign session
    // must not stay active and receive this invitation's build.
    if (current && isCampaignAccountProvider(current.provider) && current.email !== kostnadsfriCampaignEmail(slug)) {
      await clearAuthCookie({ secure }).catch(() => {});
    }
    return { account: "unavailable", userId: null };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return withRateLimit(request, "kostnadsfri:verify", () => verifyInvitation(request, params));
}

async function verifyInvitation(
  request: NextRequest,
  params: Promise<{ slug: string }>,
): Promise<Response> {
  try {
    const { slug } = await params;
    const session = ensureSessionIdFromRequest(request);
    const verifiedResponse = async (
      companyData: ReturnType<typeof companyDataFromSlug>,
      mailId?: string,
    ) => {
      // Query input is correlation only. It is signed into the receipt solely
      // when it names an accepted event for this exact slug; changing mail_id
      // or variant in the URL can never create entitlement or generation proof.
      const acceptedMail = mailId
        ? await getAcceptedKostnadsfriMailEvent(mailId, slug).catch(() => null)
        : null;
      recordVerified(request, slug, session.sessionId);
      const { account, userId } = await signInCampaignAccount(request, slug, companyData.companyName);
      const boundProjectId = userId
        ? await getKostnadsfriBoundProjectIdForOwner(slug, userId).catch(() => null)
        : null;
      const response = NextResponse.json({
        success: true,
        companyData,
        account,
        ...(boundProjectId ? { boundProjectId } : {}),
      });
      const secure = new URL(request.url).protocol === "https:";
      const claimCookie = campaignClaimCookieName(secure);
      const claimTicket = readCampaignClaimTicket(request.cookies.get(claimCookie)?.value);
      if (request.cookies.get(claimCookie)?.value && claimTicket?.slug !== slug) {
        response.cookies.set({
          name: claimCookie,
          value: "",
          ...expireCookieSetOptions(secure),
        });
      }
      response.cookies.set({
        name: KOSTNADSFRI_CAMPAIGN_COOKIE,
        value: createKostnadsfriCampaignReceipt({
          slug,
          sessionId: session.sessionId,
          mailMessageId: acceptedMail?.message_id ?? null,
          mailVariant:
            acceptedMail?.variant === "text" || acceptedMail?.variant === "animated"
              ? acceptedMail.variant
              : null,
        }),
        httpOnly: true,
        secure,
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

    // Parse body
    const body = await request.json().catch(() => ({}));
    const validation = verifySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ success: false, error: "Lösenord krävs." }, { status: 400 });
    }

    const { password, mailId } = validation.data;

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

      return await verifiedResponse(
        await withProfileFallback(extractCompanyData(page), {
          hasRow: true,
          extraData: page.extra_data,
        }),
        mailId,
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
    return await verifiedResponse(
      await withProfileFallback(companyDataFromSlug(slug), { hasRow: false }),
      mailId,
    );
  } catch (error: unknown) {
    console.error("[API/kostnadsfri/verify] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte verifiera länken." },
      { status: 500 },
    );
  }
}
