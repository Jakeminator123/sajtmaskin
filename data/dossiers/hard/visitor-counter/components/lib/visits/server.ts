import "server-only";

import {
  VISIT_HISTORY_DAYS,
  VISIT_KEY_PREFIX,
  buildStats,
  dayKey,
  getVisitStoreConfig,
  readDemoStats,
  recentDayKeys,
  recordDemoVisit,
  type VisitDay,
  type VisitStats,
} from "./config";

// Daily buckets are kept for ~400 days so a year-over-year view stays possible
// without the key space growing forever.
const DAY_TTL_SECONDS = 400 * 24 * 60 * 60;

type RedisCommand = (string | number)[];

/**
 * Upstash Redis over plain REST — one `fetch`, no SDK. The pipeline endpoint
 * runs every command in order and answers `[{ result }, ...]`.
 * https://upstash.com/docs/redis/features/restapi
 */
async function redisPipeline(commands: RedisCommand[]): Promise<unknown[]> {
  const config = getVisitStoreConfig();
  if (!config) throw new Error("Visitor counter store is not configured.");
  const res = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Visitor counter store answered HTTP ${res.status}.`);
  }
  const payload = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  if (!Array.isArray(payload)) throw new Error("Unexpected pipeline response.");
  return payload.map((entry) => {
    if (entry && typeof entry === "object" && "error" in entry && entry.error) {
      throw new Error(`Visitor counter store error: ${entry.error}`);
    }
    return entry?.result;
  });
}

function toCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const KEY = {
  totalViews: `${VISIT_KEY_PREFIX}views:total`,
  totalVisitors: `${VISIT_KEY_PREFIX}visitors:total`,
  dayViews: (day: string) => `${VISIT_KEY_PREFIX}views:day:${day}`,
  dayVisitors: (day: string) => `${VISIT_KEY_PREFIX}visitors:day:${day}`,
};

/**
 * Count one page view (and one visit when the browser session is new).
 * SEED FALLBACK CONTRACT (`mock: seed`): with no real store this ticks the
 * in-memory demo counters instead — it never throws and never calls out.
 */
export async function recordVisit(params: { newVisitor: boolean }): Promise<void> {
  if (!getVisitStoreConfig()) {
    recordDemoVisit({ newVisitor: params.newVisitor });
    return;
  }
  const day = dayKey();
  const commands: RedisCommand[] = [
    ["INCR", KEY.totalViews],
    ["INCR", KEY.dayViews(day)],
    ["EXPIRE", KEY.dayViews(day), DAY_TTL_SECONDS],
  ];
  if (params.newVisitor) {
    commands.push(
      ["INCR", KEY.totalVisitors],
      ["INCR", KEY.dayVisitors(day)],
      ["EXPIRE", KEY.dayVisitors(day), DAY_TTL_SECONDS],
    );
  }
  await redisPipeline(commands);
}

/**
 * Read totals plus the last {@link VISIT_HISTORY_DAYS} days. Demo mode returns
 * the in-memory series with `demo: true`; a configured store that fails to
 * answer throws so the route can report a calm 502.
 */
export async function readVisitStats(): Promise<VisitStats> {
  if (!getVisitStoreConfig()) return readDemoStats();
  const keys = recentDayKeys(VISIT_HISTORY_DAYS);
  const [totalViews, totalVisitors, dayViews, dayVisitors] = await redisPipeline([
    ["GET", KEY.totalViews],
    ["GET", KEY.totalVisitors],
    ["MGET", ...keys.map(KEY.dayViews)],
    ["MGET", ...keys.map(KEY.dayVisitors)],
  ]);
  const viewsList = Array.isArray(dayViews) ? dayViews : [];
  const visitorsList = Array.isArray(dayVisitors) ? dayVisitors : [];
  const days: VisitDay[] = keys.map((date, index) => ({
    date,
    views: toCount(viewsList[index]),
    visitors: toCount(visitorsList[index]),
  }));
  return buildStats(
    days,
    { views: toCount(totalViews), visitors: toCount(totalVisitors) },
    false,
  );
}
