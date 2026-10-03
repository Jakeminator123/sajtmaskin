import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { hashPassword } from "@/lib/auth/auth";
import {
  createKostnadsfriPage,
  createKostnadsfriPageWithMailEvent,
  getKostnadsfriGenerationBySlug,
  getKostnadsfriPageBySlug,
  getKostnadsfriVisitStats,
  listKostnadsfriPagesAfterId,
  listKostnadsfriPages,
  markKostnadsfriPageSent,
  recordKostnadsfriMailEvent,
} from "@/lib/db/services/kostnadsfri";
import { unsubscribedAtFromExtra } from "@/lib/kostnadsfri/unsubscribe";
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
import {
  KOSTNADSFRI_MAIL_SOURCE_ANIMATED,
  KOSTNADSFRI_MAIL_SOURCE_TEXT,
  UNKNOWN_KOSTNADSFRI_GENERATION,
  type KostnadsfriGeneration,
} from "@/lib/kostnadsfri/mail-register-contract";

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
  /** Additive one-row-per-message receipt. Old callers may omit it. */
  mailEvent: z
    .object({
      messageId: z.string().regex(/^[a-f0-9]{32}$/),
      flowId: z.string().trim().min(1).max(120),
      step: z.enum(["first", "follow"]),
      variant: z.enum(["text", "animated"]),
      sender: z.email(),
      recipient: z.email(),
      scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
      smtpAcceptedAt: z.string().datetime({ offset: true }).nullable().optional(),
      deliveredAt: z.string().datetime({ offset: true }).nullable().optional(),
      repliedAt: z.string().datetime({ offset: true }).nullable().optional(),
      outcome: z.enum(["scheduled", "accepted", "uncertain", "failed"]),
    })
    .optional(),
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
function serializePage(
  page: KostnadsfriPage,
  visits?: { visits: number; verified: number; started: number },
  options: {
    analyticsAvailable?: boolean;
    generation?: KostnadsfriGeneration;
  } = {},
) {
  const analyticsAvailable = options.analyticsAvailable !== false;
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
    unsubscribedAt: unsubscribedAtFromExtra(page.extra_data),
    visits: analyticsAvailable ? (visits?.visits ?? 0) : null,
    verified: analyticsAvailable ? (visits?.verified ?? 0) : null,
    started: analyticsAvailable ? (visits?.started ?? 0) : null,
    generation: options.generation ?? { ...UNKNOWN_KOSTNADSFRI_GENERATION },
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
      mailEvent,
    } = validation.data;

    const expectedMailSource = mailEvent
      ? mailEvent.variant === "text"
        ? KOSTNADSFRI_MAIL_SOURCE_TEXT
        : KOSTNADSFRI_MAIL_SOURCE_ANIMATED
      : null;
    if (mailEvent) {
      if (mailEvent.outcome === "accepted") {
        if (source !== expectedMailSource) {
          return NextResponse.json(
            { success: false, error: `source must be ${expectedMailSource} for this mailEvent` },
            { status: 400 },
          );
        }
        if (!sentAt || !mailEvent.smtpAcceptedAt) {
          return NextResponse.json(
            { success: false, error: "accepted mailEvent requires sentAt and smtpAcceptedAt" },
            { status: 400 },
          );
        }
        if (new Date(sentAt).getTime() !== new Date(mailEvent.smtpAcceptedAt).getTime()) {
          return NextResponse.json(
            { success: false, error: "sentAt must equal mailEvent.smtpAcceptedAt" },
            { status: 400 },
          );
        }
      } else if (sentAt || source || mailEvent.smtpAcceptedAt) {
        return NextResponse.json(
          {
            success: false,
            error: "non-accepted mailEvent must not include sentAt, source or smtpAcceptedAt",
          },
          { status: 400 },
        );
      }
    }

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
      if (!sentAt && !mailEvent) {
        return NextResponse.json(
          { success: false, error: `A page with slug "${slug}" already exists` },
          { status: 409 },
        );
      }

      // Unsubscribe stops every new mail receipt for the company, first mail
      // and follow-ups alike. A plain `sentAt` upsert without mailEvent keeps
      // its old behaviour.
      if (mailEvent && unsubscribedAtFromExtra(existing.extra_data)) {
        return NextResponse.json(
          {
            success: false,
            error:
              mailEvent.step === "follow"
                ? "The company unsubscribed before this follow-up"
                : "The company unsubscribed before this mail",
          },
          { status: 409 },
        );
      }

      const mailReceipt = mailEvent
        ? await recordKostnadsfriMailEvent({
            messageId: mailEvent.messageId,
            pageId: existing.id,
            slug,
            recipient: mailEvent.recipient,
            sender: mailEvent.sender,
            flowId: mailEvent.flowId,
            step: mailEvent.step,
            variant: mailEvent.variant,
            scheduledAt: mailEvent.scheduledAt ? new Date(mailEvent.scheduledAt) : null,
            smtpAcceptedAt: mailEvent.smtpAcceptedAt ? new Date(mailEvent.smtpAcceptedAt) : null,
            deliveredAt: mailEvent.deliveredAt ? new Date(mailEvent.deliveredAt) : null,
            repliedAt: mailEvent.repliedAt ? new Date(mailEvent.repliedAt) : null,
            outcome: mailEvent.outcome,
            source: source || expectedMailSource || DEFAULT_SEND_SOURCE,
          })
        : null;
      if (mailReceipt?.status === "conflict") {
        return NextResponse.json(
          { success: false, error: "messageId is already registered with different facts" },
          { status: 409 },
        );
      }

      // A follow-up is a new mail event, not a rewrite of the company's
      // original register row. The compatibility fields stay on the first
      // recorded send: a later `step=first` (new flow, new messageId) never
      // overwrites an existing sentAt/source, or the A/B cohort would move.
      const shouldUpdateCompatibilityFields =
        !mailEvent ||
        (mailEvent.step === "first" && mailEvent.outcome === "accepted" && !existing.sent_at);
      const updated =
        shouldUpdateCompatibilityFields && sentAt
          ? await markKostnadsfriPageSent(slug, {
              sentAt: new Date(sentAt),
              source: source || DEFAULT_SEND_SOURCE,
              contactEmail,
              ...(companyProfile ? { extraDataPatch: { profile: companyProfile } } : {}),
            })
          : existing;
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
        ...(mailReceipt
          ? { mailEvent: { messageId: mailReceipt.event.message_id, status: mailReceipt.status } }
          : {}),
        page: { id: updated.id, ...serializePage(updated), url },
      });
    }

    if (mailEvent?.step === "follow") {
      return NextResponse.json(
        { success: false, error: "A follow-up cannot create a missing company register row" },
        { status: 409 },
      );
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

    const pageInput = {
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
    };

    let page: KostnadsfriPage;
    let mailReceipt: { status: string; event: { message_id: string } } | null = null;
    if (mailEvent) {
      // Page + receipt in one transaction: a messageId conflict rolls the new
      // page back instead of leaving it behind a 409.
      const created = await createKostnadsfriPageWithMailEvent(pageInput, {
        messageId: mailEvent.messageId,
        recipient: mailEvent.recipient,
        sender: mailEvent.sender,
        flowId: mailEvent.flowId,
        step: mailEvent.step,
        variant: mailEvent.variant,
        scheduledAt: mailEvent.scheduledAt ? new Date(mailEvent.scheduledAt) : null,
        smtpAcceptedAt: mailEvent.smtpAcceptedAt ? new Date(mailEvent.smtpAcceptedAt) : null,
        deliveredAt: mailEvent.deliveredAt ? new Date(mailEvent.deliveredAt) : null,
        repliedAt: mailEvent.repliedAt ? new Date(mailEvent.repliedAt) : null,
        outcome: mailEvent.outcome,
        source: source || expectedMailSource || DEFAULT_SEND_SOURCE,
      });
      if (created.status === "conflict") {
        return NextResponse.json(
          { success: false, error: "messageId is already registered with different facts" },
          { status: 409 },
        );
      }
      page = created.page;
      mailReceipt = { status: created.status, event: created.event };
    } else {
      page = await createKostnadsfriPage(pageInput);
    }

    return NextResponse.json({
      success: true,
      updated: false,
      ...(mailReceipt
        ? { mailEvent: { messageId: mailReceipt.event.message_id, status: mailReceipt.status } }
        : {}),
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

    const rawCursor = request.nextUrl.searchParams.get("cursor");
    // Canonical non-negative integer only: parseInt would accept "100garbage"
    // or "100.9" as 100 and silently skip rows.
    const afterId =
      rawCursor === null || !/^\d+$/.test(rawCursor) ? null : Number(rawCursor);
    if (rawCursor !== null && (afterId === null || !Number.isSafeInteger(afterId))) {
      return NextResponse.json({ success: false, error: "Invalid cursor" }, { status: 400 });
    }
    const rawLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "", 10);
    const pageLimit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), LIST_LIMIT)
      : rawCursor === null
        ? LIST_LIMIT
        : 500;
    const checkedAt = new Date().toISOString();
    const [rowBatch, visitStats] = await Promise.all([
      afterId === null
        ? listKostnadsfriPages(pageLimit + 1)
        : listKostnadsfriPagesAfterId(afterId, pageLimit + 1),
      getKostnadsfriVisitStats(90, 0).catch(() => null),
    ]);
    const hasMore = rowBatch.length > pageLimit;
    const rows = rowBatch.slice(0, pageLimit);
    // Only the entitlements for the rows on this page, not the whole table.
    const generations = await getKostnadsfriGenerationBySlug(rows.map((row) => row.slug)).catch(
      () => null,
    );
    const visitsBySlug = new Map(
      (visitStats?.perSlug ?? []).map((stat) => [
        stat.slug,
        { visits: stat.visits, verified: stat.verified, started: stat.started },
      ]),
    );
    return NextResponse.json({
      success: true,
      pages: rows.map((row) =>
        serializePage(row, visitsBySlug.get(row.slug), {
          analyticsAvailable: visitStats !== null,
          generation:
            generations?.get(row.slug) ??
            (generations ? { state: "not-started", completedAt: null, siteId: null } : undefined),
        }),
      ),
      registry: {
        checkedAt,
        returned: rows.length,
        limit: pageLimit,
        complete: !hasMore,
        // Legacy send order cannot be resumed by id, so a capped legacy read
        // points at the start of the complete id-ordered walk instead ("0").
        nextCursor: hasMore
          ? afterId === null
            ? "0"
            : String(rows.at(-1)?.id ?? "")
          : null,
        paginationMode: afterId === null ? "legacy-send-order" : "complete-id-order",
      },
      analytics: {
        available: visitStats !== null,
        windowDays: 90,
        checkedAt,
        complete: visitStats !== null && !visitStats.truncated,
      },
      generation: {
        available: generations !== null,
        checkedAt,
      },
    });
  } catch (error: unknown) {
    logKostnadsfriFailure("list pages", error);
    return NextResponse.json({ success: false, error: INTERNAL_ERROR_MESSAGE }, { status: 500 });
  }
}
