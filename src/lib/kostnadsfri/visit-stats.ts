import type { KostnadsfriAnalyticsEvent, KostnadsfriMailKind } from "./analytics-paths";
import { parseKostnadsfriAnalyticsPath } from "./analytics-paths";

export type KostnadsfriVariantCounts = {
  rent: number;
  animated: number;
  /** Older mails without ?variant=. Not a third mail sort. */
  unknown: number;
};

export function emptyVariantCounts(): KostnadsfriVariantCounts {
  return { rent: 0, animated: 0, unknown: 0 };
}

export function variantBucket(variant: KostnadsfriMailKind | null): keyof KostnadsfriVariantCounts {
  return variant ?? "unknown";
}

export interface KostnadsfriSlugStats {
  slug: string;
  visits: number;
  visitsByVariant: KostnadsfriVariantCounts;
  uniqueVisitors: number;
  uniqueByVariant: KostnadsfriVariantCounts;
  verified: number;
  started: number;
  firstSeen: string;
  lastSeen: string;
}

export interface KostnadsfriVisitRow {
  slug: string;
  event: KostnadsfriAnalyticsEvent;
  variant: KostnadsfriMailKind | null;
  at: string;
  userEmail: string | null;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export type KostnadsfriVisitSourceRow = {
  path: string;
  session_id: string | null;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date | string;
  user_email: string | null;
};

type Acc = KostnadsfriSlugStats & {
  visitorKeys: Set<string>;
  visitorKeysByVariant: Record<keyof KostnadsfriVariantCounts, Set<string>>;
};

function visitorKey(row: KostnadsfriVisitSourceRow, at: string): string {
  return row.session_id || row.ip_address || `row:${at}`;
}

/**
 * Pure aggregation over page_views rows. Used by the service and by tests so
 * variant splits do not need a live database.
 */
export function aggregateKostnadsfriVisitRows(
  rows: KostnadsfriVisitSourceRow[],
  recentLimit = 100,
): { perSlug: KostnadsfriSlugStats[]; recent: KostnadsfriVisitRow[] } {
  const bySlug = new Map<string, Acc>();
  const recent: KostnadsfriVisitRow[] = [];

  for (const row of rows) {
    const parsed = parseKostnadsfriAnalyticsPath(row.path);
    if (!parsed) continue;
    const at = new Date(row.created_at).toISOString();
    const bucket = variantBucket(parsed.variant);

    let entry = bySlug.get(parsed.slug);
    if (!entry) {
      entry = {
        slug: parsed.slug,
        visits: 0,
        visitsByVariant: emptyVariantCounts(),
        uniqueVisitors: 0,
        uniqueByVariant: emptyVariantCounts(),
        verified: 0,
        started: 0,
        firstSeen: at,
        lastSeen: at,
        visitorKeys: new Set(),
        visitorKeysByVariant: { rent: new Set(), animated: new Set(), unknown: new Set() },
      };
      bySlug.set(parsed.slug, entry);
    }
    if (at < entry.firstSeen) entry.firstSeen = at;
    if (at > entry.lastSeen) entry.lastSeen = at;

    if (parsed.event === "besok") {
      entry.visits += 1;
      entry.visitsByVariant[bucket] += 1;
      const key = visitorKey(row, at);
      entry.visitorKeys.add(key);
      entry.visitorKeysByVariant[bucket].add(key);
    } else if (parsed.event === "verifierad") {
      entry.verified += 1;
    } else {
      entry.started += 1;
    }

    if (recent.length < recentLimit) {
      recent.push({
        slug: parsed.slug,
        event: parsed.event,
        variant: parsed.variant,
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
    .map(({ visitorKeys, visitorKeysByVariant, ...stats }) => ({
      ...stats,
      uniqueVisitors: visitorKeys.size,
      uniqueByVariant: {
        rent: visitorKeysByVariant.rent.size,
        animated: visitorKeysByVariant.animated.size,
        unknown: visitorKeysByVariant.unknown.size,
      },
    }))
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));

  return { perSlug, recent };
}

export type KostnadsfriPixelKindStats = {
  hits: number;
  firstHitAt: string | null;
  lastHitAt: string | null;
};

export type KostnadsfriPixelSlugStats = {
  slug: string;
  rent: KostnadsfriPixelKindStats;
  animated: KostnadsfriPixelKindStats;
};

/** One counted pixel hit. There is no lifetime counter on the row. */
export type KostnadsfriPixelSourceRow = {
  slug: string;
  kind: string;
  hit_at: Date | string;
};

function emptyPixelKind(): KostnadsfriPixelKindStats {
  return { hits: 0, firstHitAt: null, lastHitAt: null };
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

/**
 * Collapse individual pixel hits into per-slug rent/animated totals.
 * Each row counts as one hit. Callers that want a period must pass only hits
 * inside it — summing a lifetime counter would label old hits as “today”.
 */
export function aggregateKostnadsfriPixelRows(rows: KostnadsfriPixelSourceRow[]): KostnadsfriPixelSlugStats[] {
  const bySlug = new Map<string, KostnadsfriPixelSlugStats>();

  for (const row of rows) {
    if (row.kind !== "rent" && row.kind !== "animated") continue;
    let entry = bySlug.get(row.slug);
    if (!entry) {
      entry = { slug: row.slug, rent: emptyPixelKind(), animated: emptyPixelKind() };
      bySlug.set(row.slug, entry);
    }
    const kind = row.kind;
    const at = toIso(row.hit_at);
    entry[kind].hits += 1;
    if (!entry[kind].firstHitAt || at < entry[kind].firstHitAt) entry[kind].firstHitAt = at;
    if (!entry[kind].lastHitAt || at > entry[kind].lastHitAt) entry[kind].lastHitAt = at;
  }

  return [...bySlug.values()];
}

/** Hits strictly after `periodStart`. Older hits on the same row do not exist. */
export function pixelHitsWithinPeriod(
  rows: KostnadsfriPixelSourceRow[],
  periodStart: Date,
): KostnadsfriPixelSlugStats[] {
  const start = periodStart.getTime();
  return aggregateKostnadsfriPixelRows(
    rows.filter((row) => {
      const at = new Date(row.hit_at).getTime();
      return Number.isFinite(at) && at > start;
    }),
  );
}

export function pixelHitsTotal(pixels: KostnadsfriPixelSlugStats | null | undefined): number {
  if (!pixels) return 0;
  return pixels.rent.hits + pixels.animated.hits;
}
