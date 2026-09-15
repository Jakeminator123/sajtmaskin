import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { hashPassword } from "@/lib/auth/auth";
import {
  createKostnadsfriPage,
  getKostnadsfriPageBySlug,
  listKostnadsfriPages,
  markKostnadsfriPageSent,
} from "@/lib/db/services/kostnadsfri";
import type { KostnadsfriPage } from "@/lib/db/services/shared";
import { getAppBaseUrl } from "@/lib/app-url";
import { kostnadsfriVisitPath } from "@/lib/kostnadsfri/analytics-paths";
import {
  findPersonalIdentityViolations,
  hasInvalidOrgNumber,
  normalizeKostnadsfriCompanyProfile,
  sanitizeProfileViolationFields,
} from "@/lib/kostnadsfri/company-profile";
import { generateSlug } from "@/lib/kostnadsfri/index";
import { buildKostnadsfriInvite, KostnadsfriInviteError } from "@/lib/kostnadsfri/invite";
import { normalizeKostnadsfriOpenClawConfig } from "@/lib/kostnadsfri/openclaw-config";

/**
 * Machine entry for the kostnadsfri mail-link flow. Requires
 * KOSTNADSFRI_API_KEY in the x-api-key header.
 *
 * POST — create a password-protected company landing page at
 *        /kostnadsfri/[slug]. Password can be provided explicitly, or omitted
 *        to auto-generate a deterministic password from the slug + secret seed.
 *        With `sentAt` the call is an upsert instead: an existing slug records
 *        the send (200) rather than conflicting (409).
 * GET  — the send register: every stored page without credentials, newest
 *        first. Backs the external mail tool and `/admin/kostnadsfri`.
 */

const createSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  industry: z.string().optional(),
  website: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  password: z.string().min(4, "Password must be at least 4 characters").optional(),
  expiresInDays: z.number().positive().optional(),
  /**
   * When the invite mail went out. ISO 8601 **with** timezone (`Z` or `±HH:MM`):
   * a timezone-aware Python `datetime.now(timezone.utc).isoformat()` passes,
   * a naive `datetime.now().isoformat()` is rejected with 400 — an ambiguous
   * timestamp is worse than none in a register. Presence turns the call into
   * an upsert; absence keeps the original create-only behaviour.
   */
  sentAt: z.string().datetime({ offset: true }).optional(),
  /** Who registered the send, e.g. `python-utskick`. Defaults to `api`. */
  source: z.string().min(1).max(60).optional(),
  openclaw: z
    .object({
      roleLabel: z.string().trim().min(1).max(80).optional(),
      introTitle: z.string().trim().min(1).max(120).optional(),
      introBody: z.string().trim().min(1).max(320).optional(),
      starterPrompts: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
    })
    .optional(),
  /**
   * Bolagsfakta från utskicksverktyget. Medvetet otypad här och normaliserad av
   * `normalizeKostnadsfriCompanyProfile`: guarden nedan ska se den **råa**
   * nyckeluppsättningen, så ett fält som inte finns i allowlisten kan fälla
   * requesten i stället för att tyst försvinna. Fältlista och motiv:
   * `src/lib/kostnadsfri/company-profile.ts`.
   */
  profile: z.record(z.string(), z.unknown()).optional(),
});

/** Default `source` when a send is registered without naming its origin. */
const DEFAULT_SEND_SOURCE = "api";

/** Hard cap on the register read so the list can never grow unbounded. */
const LIST_LIMIT = 2000;

/** Konstant 500-text: felutdata får inte variera med det underliggande felet. */
const INTERNAL_ERROR_MESSAGE = "Internt fel. Försök igen senare.";

/**
 * Loggar ett oväntat fel med bara uttryckligt säker metadata — felets typ,
 * aldrig dess meddelande, `cause`, query eller parametrar.
 */
function logKostnadsfriFailure(operation: string, error: unknown) {
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(`[API/kostnadsfri] Failed to ${operation} (${kind})`);
}

function isAuthorized(request: NextRequest): boolean {
  const expectedKey = process.env.KOSTNADSFRI_API_KEY;
  return Boolean(expectedKey) && request.headers.get("x-api-key") === expectedKey;
}

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Register-safe view of a row: never the password hash, never `extra_data`
 * (which is handed to the browser after a successful password verification).
 */
function serializePage(page: KostnadsfriPage) {
  return {
    slug: page.slug,
    companyName: page.company_name,
    contactEmail: page.contact_email,
    contactName: page.contact_name,
    status: page.status,
    sentAt: toIso(page.sent_at),
    source: page.source,
    createdAt: toIso(page.created_at),
    expiresAt: toIso(page.expires_at),
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const validation = createSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const {
      companyName,
      industry,
      website,
      contactEmail,
      contactName,
      password: explicitPassword,
      expiresInDays,
      sentAt,
      source,
      openclaw,
      profile,
    } = validation.data;

    // Personnummer och ledamöters hemadresser finns i källan men hör inte i en
    // sajt, och `extra_data` går både till browsern och in i wizarden. Fältnamn
    // i svaret, aldrig värdet — ett personnummer ska inte vidare till loggar.
    const identityViolations = sanitizeProfileViolationFields(
      findPersonalIdentityViolations(profile),
    );
    if (identityViolations.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Profilen innehåller personnummerformade värden och avvisades.",
          fields: identityViolations,
        },
        { status: 400 },
      );
    }
    if (hasInvalidOrgNumber(profile)) {
      return NextResponse.json(
        { success: false, error: "profile.orgNumber måste vara ett organisationsnummer." },
        { status: 400 },
      );
    }
    const companyProfile = normalizeKostnadsfriCompanyProfile(profile);

    // The slug is pure (no seed involved), so an existing row can be looked
    // up — and a send registered on it — without the password seed at all.
    // Only the create path below needs `buildKostnadsfriInvite`.
    const slug = generateSlug(companyName.trim());
    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Kunde inte skapa en giltig länk av företagsnamnet." },
        { status: 400 },
      );
    }

    const existing = await getKostnadsfriPageBySlug(slug);
    if (existing) {
      // Without `sentAt` this route stays create-only, so a known slug is a
      // conflict exactly like before.
      if (!sentAt) {
        return NextResponse.json(
          { success: false, error: `A page with slug "${slug}" already exists` },
          { status: 409 },
        );
      }

      const updated = await markKostnadsfriPageSent(slug, {
        sentAt: new Date(sentAt),
        source: source || DEFAULT_SEND_SOURCE,
        contactEmail,
        // Utskicksverktyget skickar ofta profilen i samma anrop som
        // sändregistreringen. Utan den här patchen tappades den på upsert-vägen.
        // Nyckeln utelämnas helt utan profil — en tom patch är inget att skriva.
        ...(companyProfile ? { extraDataPatch: { profile: companyProfile } } : {}),
      });
      if (!updated) {
        // Row disappeared between the lookup and the update.
        return NextResponse.json(
          { success: false, error: `A page with slug "${slug}" no longer exists` },
          { status: 409 },
        );
      }

      // No password here: a row created with its own explicit password cannot
      // be recovered from the seed, so the derived one would be a lie.
      const url = `${getAppBaseUrl()}${kostnadsfriVisitPath(slug)}`;
      return NextResponse.json({
        success: true,
        updated: true,
        page: { id: updated.id, ...serializePage(updated), url },
      });
    }

    // Create: slug + password (explicit or deterministic from slug + seed) + link
    let invite;
    try {
      invite = buildKostnadsfriInvite(companyName, { password: explicitPassword });
    } catch (error) {
      if (error instanceof KostnadsfriInviteError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }
    const { password, url } = invite;

    const passwordHash = hashPassword(password);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const openclawConfig = normalizeKostnadsfriOpenClawConfig(openclaw);
    const extraData: Record<string, unknown> = {};
    if (openclawConfig) extraData.openclaw = openclawConfig;
    if (companyProfile) extraData.profile = companyProfile;

    const page = await createKostnadsfriPage({
      slug,
      passwordHash,
      companyName,
      industry,
      website,
      contactEmail,
      contactName,
      extraData: Object.keys(extraData).length > 0 ? extraData : undefined,
      expiresAt,
      sentAt: sentAt ? new Date(sentAt) : undefined,
      source: sentAt ? source || DEFAULT_SEND_SOURCE : undefined,
    });

    return NextResponse.json({
      success: true,
      updated: false,
      page: {
        id: page.id,
        ...serializePage(page),
        password,
        url,
        openclaw: openclawConfig,
        profile: companyProfile,
      },
    });
  } catch (error: unknown) {
    // Aldrig `error.message` ut, och aldrig hela felobjektet i loggen: ett
    // Drizzle-fel bär SQL:ens parametrar, och de innehåller här profil,
    // kontakt-e-post och lösenordshash. Parameteriserad SQL skyddar
    // frågan, inte felutdatan.
    logKostnadsfriFailure("create page", error);
    return NextResponse.json({ success: false, error: INTERNAL_ERROR_MESSAGE }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) return unauthorized();

    const rows = await listKostnadsfriPages(LIST_LIMIT);
    return NextResponse.json({ success: true, pages: rows.map(serializePage) });
  } catch (error: unknown) {
    logKostnadsfriFailure("list pages", error);
    return NextResponse.json({ success: false, error: INTERNAL_ERROR_MESSAGE }, { status: 500 });
  }
}
