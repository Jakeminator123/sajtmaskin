import { and, desc, eq, gt, like, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { kostnadsfriPages, kostnadsfriPixelHits, pageViews, users } from "@/lib/db/schema";
import { KOSTNADSFRI_PATH_PREFIX } from "@/lib/kostnadsfri/analytics-paths";
import { buildKostnadsfriProfileFallback } from "@/lib/kostnadsfri/company-profile";
import { isKostnadsfriMailKind, type KostnadsfriMailKind } from "@/lib/kostnadsfri/mail-kind";
import { shouldCountPixelHit } from "@/lib/kostnadsfri/pixel-token";
import {
  aggregateKostnadsfriPixelRows,
  aggregateKostnadsfriVisitRows,
  type KostnadsfriPixelSlugStats,
  type KostnadsfriSlugStats,
  type KostnadsfriVisitRow,
} from "@/lib/kostnadsfri/visit-stats";
import { assertDbConfigured } from "./shared";
import type { KostnadsfriPage } from "./shared";

export type { KostnadsfriPixelSlugStats, KostnadsfriSlugStats, KostnadsfriVisitRow };

function mergeMailKind(
  extraData: Record<string, unknown> | undefined,
  mailKind: KostnadsfriMailKind | undefined,
): Record<string, unknown> | null {
  if (!mailKind) return extraData || null;
  return { ...(extraData || {}), mailKind };
}

export async function createKostnadsfriPage(data: {
  slug: string;
  passwordHash: string;
  companyName: string;
  industry?: string;
  website?: string;
  contactEmail?: string;
  contactName?: string;
  extraData?: Record<string, unknown>;
  expiresAt?: Date;
  /** Set when the row is created by a caller that already mailed the invite. */
  sentAt?: Date;
  source?: string;
  /** Last registered mail sort. Optional; ignored when absent. */
  mailKind?: KostnadsfriMailKind;
}): Promise<KostnadsfriPage> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(kostnadsfriPages)
    .values({
      slug: data.slug,
      password_hash: data.passwordHash,
      company_name: data.companyName,
      industry: data.industry || null,
      website: data.website || null,
      contact_email: data.contactEmail || null,
      contact_name: data.contactName || null,
      extra_data: mergeMailKind(data.extraData, data.mailKind),
      status: "active",
      created_at: now,
      updated_at: now,
      expires_at: data.expiresAt || null,
      sent_at: data.sentAt || null,
      source: data.source || null,
    })
    .returning();
  return rows[0];
}

/**
 * Register that the invite mail for `slug` went out — the write half of the
 * send register behind `/admin/kostnadsfri`.
 *
 * `contactEmail` is only written when it is a non-empty string: a caller that
 * re-registers a send without repeating the address must not blank the one
 * already stored. Returns null when the slug has no row (the caller decides
 * whether to create one).
 *
 * `extraDataPatch` slås ihop med `jsonb ||` i databasen i stället för att läsas
 * och skrivas tillbaka. Den ytliga sammanslagningen är avsiktlig här: patchen
 * ska byta ut hela `profile`-nyckeln men lämna `openclaw` orörd, och en
 * read-modify-write hade kunnat tappa en samtidig skrivning.
 */
export async function markKostnadsfriPageSent(
  slug: string,
  data: {
    sentAt: Date;
    source: string;
    contactEmail?: string | null;
    extraDataPatch?: Record<string, unknown> | null;
    mailKind?: KostnadsfriMailKind;
  },
): Promise<KostnadsfriPage | null> {
  assertDbConfigured();
  const updates: {
    sent_at: Date;
    source: string;
    updated_at: Date;
    contact_email?: string;
    extra_data?: ReturnType<typeof sql>;
  } = {
    sent_at: data.sentAt,
    source: data.source,
    updated_at: new Date(),
  };
  const contactEmail = data.contactEmail?.trim();
  if (contactEmail) updates.contact_email = contactEmail;
  const extraDataPatch = {
    ...(data.extraDataPatch && Object.keys(data.extraDataPatch).length > 0 ? data.extraDataPatch : {}),
    ...(data.mailKind ? { mailKind: data.mailKind } : {}),
  };
  if (Object.keys(extraDataPatch).length > 0) {
    updates.extra_data = sql`coalesce(${kostnadsfriPages.extra_data}, '{}'::jsonb) || ${JSON.stringify(
      extraDataPatch,
    )}::jsonb`;
  }

  const rows = await db
    .update(kostnadsfriPages)
    .set(updates)
    .where(eq(kostnadsfriPages.slug, slug))
    .returning();
  return rows[0] ?? null;
}

/**
 * SQL-skydd mot att skriva över en giltig push. Speglar
 * `isKostnadsfriProfileSlotEmpty`: skrivbart när den *normaliserade*
 * profilen saknas. Ogiltig legacy (nonempty men inte allowlistad JSON-sträng)
 * får fallback. En giltig pushad profil vinner alltid.
 */
function storedProfileLacksNormalizedValueSql(extraData: ReturnType<typeof sql>) {
  const profile = sql`${extraData} -> 'profile'`;
  const nonemptyText = (key: "city" | "registeredOffice" | "postalCode" | "streetAddress" | "businessDescription") =>
    sql`(jsonb_typeof(${profile} -> ${key}) = 'string' AND length(btrim(${profile} ->> ${key})) > 0)`;
  return sql`(
    jsonb_typeof(${profile}) IS DISTINCT FROM 'object'
    OR NOT (
      ${nonemptyText("city")}
      OR ${nonemptyText("registeredOffice")}
      OR ${nonemptyText("postalCode")}
      OR ${nonemptyText("streetAddress")}
      OR ${nonemptyText("businessDescription")}
      OR (
        jsonb_typeof(${profile} -> 'orgNumber') = 'string'
        AND btrim(${profile} ->> 'orgNumber') ~ '^\\d{6}-?\\d{4}$'
        AND substring(regexp_replace(btrim(${profile} ->> 'orgNumber'), '-', '', 'g') from 3 for 1) ~ '[2-9]'
      )
      OR (
        jsonb_typeof(${profile} -> 'registeredAt') = 'string'
        AND btrim(${profile} ->> 'registeredAt') ~ '^\\d{4}-\\d{2}-\\d{2}'
      )
    )
  )`;
}

/**
 * Skriver in en profil som profilfallbacken hämtade från utskicksverktyget, så
 * att nästa besök på länken slipper anropet. Samma `jsonb ||`-sammanslagning
 * som `markKostnadsfriPageSent`: `profile` byts ut, `openclaw` lämnas orörd.
 *
 * Skriver när den normaliserade profilen saknas — saknad nyckel, JSON-null,
 * primitiv, array, `{}` eller ogiltig legacy. `-> 'profile' IS NULL` räcker
 * inte: i Postgres är `'{"profile": null}'::jsonb -> 'profile' IS NULL` false.
 * Returnerar true när en rad uppdaterades.
 */
export async function backfillKostnadsfriPageProfile(
  slug: string,
  profile: Record<string, unknown>,
): Promise<boolean> {
  assertDbConfigured();
  if (Object.keys(profile).length === 0) return false;
  const extraData = sql`coalesce(${kostnadsfriPages.extra_data}, '{}'::jsonb)`;
  const rows = await db
    .update(kostnadsfriPages)
    .set({
      extra_data: sql`${extraData} || ${JSON.stringify({ profile })}::jsonb`,
      updated_at: new Date(),
    })
    .where(and(eq(kostnadsfriPages.slug, slug), storedProfileLacksNormalizedValueSql(extraData)))
    .returning({ id: kostnadsfriPages.id });
  return rows.length > 0;
}

/**
 * Negativ cache för miss / träff utan publicerbar profil. Rör inte `profile`,
 * så en push som landar samtidigt vinner fortfarande. `unavailable` anropas
 * aldrig här. Sentinel bär `checkedAt` så TTL kan expira.
 */
export async function markKostnadsfriProfileLookupSettled(
  slug: string,
  outcome: "miss" | "empty",
): Promise<boolean> {
  assertDbConfigured();
  const extraData = sql`coalesce(${kostnadsfriPages.extra_data}, '{}'::jsonb)`;
  const rows = await db
    .update(kostnadsfriPages)
    .set({
      extra_data: sql`${extraData} || ${JSON.stringify({
        profileFallback: buildKostnadsfriProfileFallback(outcome),
      })}::jsonb`,
      updated_at: new Date(),
    })
    .where(eq(kostnadsfriPages.slug, slug))
    .returning({ id: kostnadsfriPages.id });
  return rows.length > 0;
}

export async function markKostnadsfriPageUnsubscribed(
  slug: string,
  at: Date = new Date(),
): Promise<KostnadsfriPage | null> {
  assertDbConfigured();
  const existing = await getKostnadsfriPageBySlug(slug);
  if (!existing) return null;
  const extra = (existing.extra_data as Record<string, unknown> | null) ?? {};
  if (typeof extra.unsubscribedAt === "string" && extra.unsubscribedAt.trim()) {
    return existing;
  }
  const extraData = sql`coalesce(${kostnadsfriPages.extra_data}, '{}'::jsonb)`;
  const rows = await db
    .update(kostnadsfriPages)
    .set({
      extra_data: sql`${extraData} || ${JSON.stringify({ unsubscribedAt: at.toISOString() })}::jsonb`,
      updated_at: new Date(),
    })
    .where(eq(kostnadsfriPages.slug, slug))
    .returning();
  return rows[0] ?? null;
}

export async function getKostnadsfriPageBySlug(slug: string): Promise<KostnadsfriPage | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(kostnadsfriPages)
    .where(eq(kostnadsfriPages.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Every pre-created page as a send register: rows with a send first, newest
 * send on top, then unsent rows newest-created first. Same order as
 * `/admin/kostnadsfri`, so a capped read never drops a recently re-sent old
 * row. Password hashes are NOT stripped here. `limit` caps the read for
 * callers that serve the list over HTTP.
 */
export async function listKostnadsfriPages(limit?: number): Promise<KostnadsfriPage[]> {
  assertDbConfigured();
  const query = db
    .select()
    .from(kostnadsfriPages)
    .orderBy(sql`${kostnadsfriPages.sent_at} DESC NULLS LAST`, desc(kostnadsfriPages.created_at));
  return limit && limit > 0 ? query.limit(limit) : query;
}

// ============================================================================
// VISIT STATISTICS (derived from page_views, see lib/kostnadsfri/analytics-paths)
// ============================================================================

/**
 * Hard cap so a bot hammering the prefix cannot make the admin page unbounded.
 * Counts are aggregated in application code over the newest rows only, so when
 * the cap is hit the result is a lower bound — `truncated` tells the UI.
 */
const VISIT_ROW_LIMIT = 5000;

export async function getKostnadsfriVisitStats(
  days: number,
  recentLimit = 100,
): Promise<{
  perSlug: KostnadsfriSlugStats[];
  recent: KostnadsfriVisitRow[];
  /** True when the period had more rows than the cap — counts are then incomplete. */
  truncated: boolean;
}> {
  assertDbConfigured();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const rows = await db
    .select({
      path: pageViews.path,
      session_id: pageViews.session_id,
      user_id: pageViews.user_id,
      ip_address: pageViews.ip_address,
      user_agent: pageViews.user_agent,
      created_at: pageViews.created_at,
      user_email: users.email,
    })
    .from(pageViews)
    .leftJoin(users, eq(pageViews.user_id, users.id))
    .where(
      and(like(pageViews.path, `${KOSTNADSFRI_PATH_PREFIX}%`), gt(pageViews.created_at, startDate)),
    )
    .orderBy(desc(pageViews.created_at))
    .limit(VISIT_ROW_LIMIT);

  const { perSlug, recent } = aggregateKostnadsfriVisitRows(rows, recentLimit);
  return { perSlug, recent, truncated: rows.length >= VISIT_ROW_LIMIT };
}

export async function getKostnadsfriPixelStats(days: number): Promise<KostnadsfriPixelSlugStats[]> {
  assertDbConfigured();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const rows = await db
    .select({
      slug: kostnadsfriPixelHits.slug,
      kind: kostnadsfriPixelHits.kind,
      hit_at: kostnadsfriPixelHits.hit_at,
    })
    .from(kostnadsfriPixelHits)
    .where(gt(kostnadsfriPixelHits.hit_at, startDate));

  return aggregateKostnadsfriPixelRows(rows);
}

export async function recordKostnadsfriPixelHit(input: {
  email: string;
  slug: string;
  kind: KostnadsfriMailKind;
  at?: Date;
}): Promise<{ counted: boolean }> {
  assertDbConfigured();
  if (!isKostnadsfriMailKind(input.kind)) return { counted: false };
  const email = input.email.trim().toLowerCase();
  const slug = input.slug.trim();
  if (!email || !slug) return { counted: false };
  const at = input.at ?? new Date();

  const existing = await db
    .select({
      hit_at: kostnadsfriPixelHits.hit_at,
    })
    .from(kostnadsfriPixelHits)
    .where(
      and(
        eq(kostnadsfriPixelHits.email, email),
        eq(kostnadsfriPixelHits.slug, slug),
        eq(kostnadsfriPixelHits.kind, input.kind),
      ),
    )
    .orderBy(desc(kostnadsfriPixelHits.hit_at))
    .limit(1);

  const row = existing[0];
  if (row && !shouldCountPixelHit(row.hit_at, at)) {
    return { counted: false };
  }

  await db.insert(kostnadsfriPixelHits).values({
    email,
    slug,
    kind: input.kind,
    hit_at: at,
  });
  return { counted: true };
}
