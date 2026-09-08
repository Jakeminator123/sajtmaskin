import { and, desc, eq, gt, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { kostnadsfriPages, pageViews, users } from "@/lib/db/schema";
import {
  KOSTNADSFRI_PATH_PREFIX,
  parseKostnadsfriAnalyticsPath,
  type KostnadsfriAnalyticsEvent,
} from "@/lib/kostnadsfri/analytics-paths";
import { assertDbConfigured } from "./shared";
import type { KostnadsfriPage } from "./shared";

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
    })
    .returning();
  return rows[0];
}

export async function getKostnadsfriPageBySlug(
  slug: string,
): Promise<KostnadsfriPage | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(kostnadsfriPages)
    .where(eq(kostnadsfriPages.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/** Every pre-created page, newest first. Password hashes are NOT stripped here. */
export async function listKostnadsfriPages(): Promise<KostnadsfriPage[]> {
  assertDbConfigured();
  return db.select().from(kostnadsfriPages).orderBy(desc(kostnadsfriPages.created_at));
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
      and(
        like(pageViews.path, `${KOSTNADSFRI_PATH_PREFIX}%`),
        gt(pageViews.created_at, startDate),
      ),
    )
    .orderBy(desc(pageViews.created_at))
    .limit(VISIT_ROW_LIMIT);

  const bySlug = new Map<
    string,
    KostnadsfriSlugStats & { visitorKeys: Set<string> }
  >();
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
