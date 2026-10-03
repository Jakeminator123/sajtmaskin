import { and, asc, desc, eq, gt, inArray, like, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  engineGenerationLogs,
  engineVersions,
  generationBillings,
  kostnadsfriCampaignEntitlements,
  kostnadsfriMailEvents,
  kostnadsfriPages,
  pageViews,
  users,
} from "@/lib/db/schema";
import {
  KOSTNADSFRI_PATH_PREFIX,
  parseKostnadsfriAnalyticsPath,
  type KostnadsfriAnalyticsEvent,
} from "@/lib/kostnadsfri/analytics-paths";
import { buildKostnadsfriProfileFallback } from "@/lib/kostnadsfri/company-profile";
import { assertDbConfigured } from "./shared";
import type { KostnadsfriPage } from "./shared";
import type { KostnadsfriGeneration } from "@/lib/kostnadsfri/mail-register-contract";
import { resolveKostnadsfriGenerationProjection } from "@/lib/kostnadsfri/mail-register-contract";

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
      extra_data: data.extraData || null,
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
  if (data.extraDataPatch && Object.keys(data.extraDataPatch).length > 0) {
    updates.extra_data = sql`coalesce(${kostnadsfriPages.extra_data}, '{}'::jsonb) || ${JSON.stringify(
      data.extraDataPatch,
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

export async function listKostnadsfriPagesAfterId(
  afterId: number,
  limit: number,
): Promise<KostnadsfriPage[]> {
  assertDbConfigured();
  return db
    .select()
    .from(kostnadsfriPages)
    .where(gt(kostnadsfriPages.id, afterId))
    .orderBy(asc(kostnadsfriPages.id))
    .limit(limit);
}

export type KostnadsfriMailEventInput = {
  messageId: string;
  pageId: number | null;
  slug: string;
  recipient: string;
  sender: string;
  flowId: string;
  step: "first" | "follow";
  variant: "text" | "animated";
  scheduledAt: Date | null;
  smtpAcceptedAt: Date | null;
  deliveredAt: Date | null;
  repliedAt: Date | null;
  outcome: "scheduled" | "accepted" | "uncertain" | "failed";
  source: string;
};

export type KostnadsfriMailEvent = typeof kostnadsfriMailEvents.$inferSelect;

function mailEventMatches(row: KostnadsfriMailEvent, input: KostnadsfriMailEventInput): boolean {
  const sameTime = (stored: Date | string | null, expected: Date | null) =>
    stored === null || stored === undefined
      ? expected === null
      : expected !== null && new Date(stored).getTime() === expected.getTime();
  return (
    row.slug === input.slug &&
    row.recipient === input.recipient &&
    row.sender === input.sender &&
    row.flow_id === input.flowId &&
    row.step === input.step &&
    row.variant === input.variant &&
    row.source === input.source &&
    sameTime(row.scheduled_at, input.scheduledAt)
  );
}

/** Idempotent insert. A reused message id with different facts is a conflict. */
export async function recordKostnadsfriMailEvent(
  input: KostnadsfriMailEventInput,
): Promise<{
  status: "created" | "updated" | "duplicate" | "conflict";
  event: KostnadsfriMailEvent;
}> {
  assertDbConfigured();
  const inserted = await db
    .insert(kostnadsfriMailEvents)
    .values({
      message_id: input.messageId,
      kostnadsfri_page_id: input.pageId,
      slug: input.slug,
      recipient: input.recipient,
      sender: input.sender,
      flow_id: input.flowId,
      step: input.step,
      variant: input.variant,
      scheduled_at: input.scheduledAt,
      smtp_accepted_at: input.smtpAcceptedAt,
      delivered_at: input.deliveredAt,
      replied_at: input.repliedAt,
      outcome: input.outcome,
      source: input.source,
    })
    .onConflictDoNothing({ target: kostnadsfriMailEvents.message_id })
    .returning();
  if (inserted[0]) return { status: "created", event: inserted[0] };
  const existing = await db
    .select()
    .from(kostnadsfriMailEvents)
    .where(eq(kostnadsfriMailEvents.message_id, input.messageId))
    .limit(1);
  if (!existing[0]) throw new Error("Mail event disappeared after conflict");
  const current = existing[0];
  if (!mailEventMatches(current, input)) {
    return { status: "conflict", event: current };
  }
  const sameOptionalTime = (stored: Date | string | null, next: Date | null) =>
    next === null || stored === null || new Date(stored).getTime() === next.getTime();
  const acceptedCannotRegress = current.outcome === "accepted" && input.outcome !== "accepted";
  if (
    acceptedCannotRegress ||
    !sameOptionalTime(current.smtp_accepted_at, input.smtpAcceptedAt) ||
    !sameOptionalTime(current.delivered_at, input.deliveredAt) ||
    !sameOptionalTime(current.replied_at, input.repliedAt)
  ) {
    return { status: "conflict", event: current };
  }
  const shouldUpdate =
    current.outcome !== input.outcome ||
    (!current.smtp_accepted_at && input.smtpAcceptedAt) ||
    (!current.delivered_at && input.deliveredAt) ||
    (!current.replied_at && input.repliedAt);
  if (shouldUpdate) {
    const updated = await db
      .update(kostnadsfriMailEvents)
      .set({
        outcome: input.outcome,
        ...(!current.smtp_accepted_at && input.smtpAcceptedAt
          ? {
              smtp_accepted_at: sql`coalesce(${kostnadsfriMailEvents.smtp_accepted_at}, ${input.smtpAcceptedAt})`,
            }
          : {}),
        ...(!current.delivered_at && input.deliveredAt
          ? {
              delivered_at: sql`coalesce(${kostnadsfriMailEvents.delivered_at}, ${input.deliveredAt})`,
            }
          : {}),
        ...(!current.replied_at && input.repliedAt
          ? { replied_at: sql`coalesce(${kostnadsfriMailEvents.replied_at}, ${input.repliedAt})` }
          : {}),
        updated_at: new Date(),
      })
      .where(
        input.outcome === "accepted"
          ? eq(kostnadsfriMailEvents.message_id, input.messageId)
          : and(
              eq(kostnadsfriMailEvents.message_id, input.messageId),
              ne(kostnadsfriMailEvents.outcome, "accepted"),
            ),
      )
      .returning();
    if (!updated[0]) {
      const raced = await db
        .select()
        .from(kostnadsfriMailEvents)
        .where(eq(kostnadsfriMailEvents.message_id, input.messageId))
        .limit(1);
      if (!raced[0]) throw new Error("Mail event disappeared during update");
      return {
        status:
          raced[0].outcome === input.outcome && mailEventMatches(raced[0], input)
            ? "duplicate"
            : "conflict",
        event: raced[0],
      };
    }
    if (
      !sameOptionalTime(updated[0].smtp_accepted_at, input.smtpAcceptedAt) ||
      !sameOptionalTime(updated[0].delivered_at, input.deliveredAt) ||
      !sameOptionalTime(updated[0].replied_at, input.repliedAt)
    ) {
      return { status: "conflict", event: updated[0] };
    }
    return { status: "updated", event: updated[0] };
  }
  return {
    status: "duplicate",
    event: current,
  };
}

export async function getAcceptedKostnadsfriMailEvent(
  messageId: string,
  slug: string,
): Promise<KostnadsfriMailEvent | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(kostnadsfriMailEvents)
    .where(
      and(
        eq(kostnadsfriMailEvents.message_id, messageId),
        eq(kostnadsfriMailEvents.slug, slug),
        eq(kostnadsfriMailEvents.outcome, "accepted"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listKostnadsfriMailEventsAfter(
  afterCreatedAt: Date | null,
  afterMessageId: string | null,
  limit: number,
): Promise<KostnadsfriMailEvent[]> {
  assertDbConfigured();
  const query = db
    .select()
    .from(kostnadsfriMailEvents)
    .orderBy(asc(kostnadsfriMailEvents.created_at), asc(kostnadsfriMailEvents.message_id));
  return afterCreatedAt && afterMessageId
    ? query
        .where(
          or(
            gt(kostnadsfriMailEvents.created_at, afterCreatedAt),
            and(
              eq(kostnadsfriMailEvents.created_at, afterCreatedAt),
              gt(kostnadsfriMailEvents.message_id, afterMessageId),
            ),
          ),
        )
        .limit(limit)
    : query.limit(limit);
}

export type KostnadsfriMailEventStats = {
  total: number;
  accepted: number;
  delivered: number;
  replied: number;
  byVariant: Array<{
    variant: "text" | "animated";
    total: number;
    accepted: number;
    firstAccepted: number;
    delivered: number;
    replied: number;
  }>;
};

export async function getKostnadsfriMailEventStats(): Promise<KostnadsfriMailEventStats> {
  assertDbConfigured();
  const rows = await db
    .select({
      variant: kostnadsfriMailEvents.variant,
      total: sql<number>`count(*)::int`,
      accepted: sql<number>`count(*) filter (where ${kostnadsfriMailEvents.outcome} = 'accepted')::int`,
      firstAccepted: sql<number>`count(*) filter (where ${kostnadsfriMailEvents.outcome} = 'accepted' and ${kostnadsfriMailEvents.step} = 'first')::int`,
      delivered: sql<number>`count(*) filter (where ${kostnadsfriMailEvents.delivered_at} is not null)::int`,
      replied: sql<number>`count(*) filter (where ${kostnadsfriMailEvents.replied_at} is not null)::int`,
    })
    .from(kostnadsfriMailEvents)
    .groupBy(kostnadsfriMailEvents.variant);
  const byVariant = rows
    .filter(
      (row): row is typeof row & { variant: "text" | "animated" } =>
        row.variant === "text" || row.variant === "animated",
    )
    .map((row) => ({
      variant: row.variant,
      total: Number(row.total),
      accepted: Number(row.accepted),
      firstAccepted: Number(row.firstAccepted),
      delivered: Number(row.delivered),
      replied: Number(row.replied),
    }));
  return {
    total: byVariant.reduce((sum, row) => sum + row.total, 0),
    accepted: byVariant.reduce((sum, row) => sum + row.accepted, 0),
    delivered: byVariant.reduce((sum, row) => sum + row.delivered, 0),
    replied: byVariant.reduce((sum, row) => sum + row.replied, 0),
    byVariant,
  };
}

/**
 * Secure generation projection. Slug/project/chat/version ownership comes
 * solely from the server-created campaign entitlement; URL query values never
 * participate. A failed log is only terminal while no successful version is
 * bound to the invitation.
 */
export async function getKostnadsfriGenerationBySlug(): Promise<
  Map<string, KostnadsfriGeneration>
> {
  assertDbConfigured();
  const entitlements = await db.select().from(kostnadsfriCampaignEntitlements);
  const entitlementIds = entitlements.map((row) => row.id);
  const completionMarkers =
    entitlementIds.length > 0
      ? await db
          .select({
            entitlementId: generationBillings.campaign_entitlement_id,
            versionId: generationBillings.version_id,
            createdAt: generationBillings.created_at,
          })
          .from(generationBillings)
          .where(
            and(
              inArray(generationBillings.campaign_entitlement_id, entitlementIds),
              eq(generationBillings.campaign_phase, "initial"),
            ),
          )
      : [];
  const markerByEntitlement = new Map(
    completionMarkers.map((marker) => [marker.entitlementId, marker]),
  );
  const effectiveVersionIds = entitlements
    .map((row) => row.initial_version_id ?? markerByEntitlement.get(row.id)?.versionId ?? null)
    .filter((value): value is string => Boolean(value));
  const versions =
    effectiveVersionIds.length > 0
      ? await db
          .select({ id: engineVersions.id, createdAt: engineVersions.createdAt })
          .from(engineVersions)
          .where(inArray(engineVersions.id, effectiveVersionIds))
      : [];
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const chatIds = entitlements
    .map((row) => row.initial_chat_id)
    .filter((value): value is string => Boolean(value));
  const logs =
    chatIds.length > 0
      ? await db
          .select({
            chatId: engineGenerationLogs.chatId,
            success: engineGenerationLogs.success,
            createdAt: engineGenerationLogs.createdAt,
          })
          .from(engineGenerationLogs)
          .where(inArray(engineGenerationLogs.chatId, chatIds))
          .orderBy(desc(engineGenerationLogs.createdAt))
      : [];
  const latestLog = new Map<string, (typeof logs)[number]>();
  for (const log of logs) if (!latestLog.has(log.chatId)) latestLog.set(log.chatId, log);

  const result = new Map<string, KostnadsfriGeneration>();
  for (const row of entitlements) {
    const marker = markerByEntitlement.get(row.id);
    const versionId = row.initial_version_id ?? marker?.versionId ?? null;
    const completedAt = versionId
      ? (versionById.get(versionId)?.createdAt ?? row.initial_claimed_at ?? marker?.createdAt ?? null)
      : null;
    result.set(
      row.invitation_slug,
      resolveKostnadsfriGenerationProjection({
        projectId: row.project_id,
        initialChatId: row.initial_chat_id,
        initialVersionId: versionId,
        completedAt,
        latestGenerationSucceeded: row.initial_chat_id
          ? (latestLog.get(row.initial_chat_id)?.success ?? null)
          : null,
      }),
    );
  }
  return result;
}

// ============================================================================
// VISIT STATISTICS (derived from page_views, see lib/kostnadsfri/analytics-paths)
// ============================================================================

export interface KostnadsfriSlugStats {
  slug: string;
  /** Landing-page loads. */
  visits: number;
  /** Distinct session/IP that loaded the landing page. */
  uniqueVisitors: number;
  /** Successful password verifications. */
  verified: number;
  /** Completed wizards (builder handoff created). */
  started: number;
  firstSeen: string;
  lastSeen: string;
}

export interface KostnadsfriVisitRow {
  slug: string;
  event: KostnadsfriAnalyticsEvent;
  at: string;
  /** Email when the visitor was signed in, otherwise null. */
  userEmail: string | null;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

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

  const bySlug = new Map<string, KostnadsfriSlugStats & { visitorKeys: Set<string> }>();
  const recent: KostnadsfriVisitRow[] = [];

  for (const row of rows) {
    const parsed = parseKostnadsfriAnalyticsPath(row.path);
    if (!parsed) continue;
    const at = new Date(row.created_at).toISOString();

    let entry = bySlug.get(parsed.slug);
    if (!entry) {
      entry = {
        slug: parsed.slug,
        visits: 0,
        uniqueVisitors: 0,
        verified: 0,
        started: 0,
        firstSeen: at,
        lastSeen: at,
        visitorKeys: new Set(),
      };
      bySlug.set(parsed.slug, entry);
    }
    // Rows arrive newest first, so the first row is the last visit.
    if (at < entry.firstSeen) entry.firstSeen = at;
    if (at > entry.lastSeen) entry.lastSeen = at;

    if (parsed.event === "besok") {
      entry.visits += 1;
      entry.visitorKeys.add(row.session_id || row.ip_address || `row:${at}`);
    } else if (parsed.event === "verifierad") {
      entry.verified += 1;
    } else {
      entry.started += 1;
    }

    if (recent.length < recentLimit) {
      recent.push({
        slug: parsed.slug,
        event: parsed.event,
        at,
        userEmail: row.user_email ?? null,
        userId: row.user_id ?? null,
        sessionId: row.session_id ?? null,
        ipAddress: row.ip_address ?? null,
        userAgent: row.user_agent ?? null,
      });
    }
  }

  const perSlug = [...bySlug.values()]
    .map(({ visitorKeys, ...stats }) => ({ ...stats, uniqueVisitors: visitorKeys.size }))
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));

  return { perSlug, recent, truncated: rows.length >= VISIT_ROW_LIMIT };
}
