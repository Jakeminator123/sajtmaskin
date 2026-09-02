/**
 * Shared (server + client safe) contract for the site's own visitor counter.
 * No SDK and no secrets here — this module only knows the env-gate, the day
 * bucketing and the demo store, so the client can import the types without
 * pulling the Redis call into the browser bundle.
 */

export interface VisitDay {
  /** Local calendar day (Europe/Stockholm), ISO `YYYY-MM-DD`. */
  date: string;
  /** Page views recorded that day. */
  views: number;
  /** Distinct visits (browser sessions) that day. */
  visitors: number;
}

export interface VisitStats {
  today: VisitDay;
  total: { views: number; visitors: number };
  /** Oldest → newest, always {@link VISIT_HISTORY_DAYS} entries incl. today. */
  days: VisitDay[];
  /** True when the numbers come from the in-memory demo store, not storage. */
  demo: boolean;
}

/** Days shown in the bar chart on /statistik. */
export const VISIT_HISTORY_DAYS = 14;

/** Redis key namespace so the counter never collides with other app data. */
export const VISIT_KEY_PREFIX = "visits:";

/** Statistics are per local day for the site owner, not per UTC day. */
export const VISIT_TIME_ZONE = "Europe/Stockholm";

/**
 * F2/preview injects stub values (e.g. `upstash_redis_rest_url_placeholder_preview_not_real`);
 * a call against them would fail, so any placeholder-marked value counts as
 * NOT configured. Mirrors the stub vocabulary used by the other hard dossiers.
 */
export function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

export interface VisitStoreConfig {
  url: string;
  token: string;
}

/**
 * Resolve the Upstash Redis REST endpoint. Primary keys are the ones the
 * Upstash console shows; the `KV_REST_API_*` pair is what the Vercel
 * Marketplace ("Storage → Upstash Redis") injects, so both work unchanged.
 * Returns null when either half is missing, a placeholder or not https.
 */
export function getVisitStoreConfig(): VisitStoreConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (isPlaceholderValue(url) || isPlaceholderValue(token)) return null;
  const cleanUrl = url!.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/i.test(cleanUrl)) return null;
  return { url: cleanUrl, token: token!.trim() };
}

/** True when a REAL statistics store is configured (otherwise demo mode). */
export function isVisitorCounterConfigured(): boolean {
  return getVisitStoreConfig() !== null;
}

const DAY_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: VISIT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` for the given instant in the site's local time zone. */
export function dayKey(date: Date = new Date()): string {
  // sv-SE already formats as ISO-like "2026-09-02"; normalise separators anyway.
  return DAY_FORMATTER.format(date).replace(/[^\d]+/g, "-");
}

/** The last `count` day keys ending with today, oldest first. */
export function recentDayKeys(count: number = VISIT_HISTORY_DAYS, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  }
  return keys;
}

const BOT_UA_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|uptime|curl\/|wget\/|python-requests|vercel-screenshot/i;

/** Cheap user-agent heuristic; an empty UA is treated as a bot too. */
export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return BOT_UA_RE.test(ua);
}

// ─── Demo store ─────────────────────────────────────────────────────────────
//
// SEED FALLBACK CONTRACT (`mock: seed`): without a real store the counter still
// works within one server instance — live page views tick the numbers below —
// but nothing is persisted and the history is a plausible sample series. The
// UI must say so (`demo: true` → notice). Weekday/weekend rhythm makes the
// chart look like a real small-business site rather than a flat line.
const DEMO_VIEWS_PATTERN = [23, 31, 28, 35, 30, 14, 11, 26, 34, 29, 38, 33, 17, 9];

const demoDays = new Map<string, { views: number; visitors: number }>();
let demoSeededFor: string | null = null;

function ensureDemoSeed(now: Date): void {
  const today = dayKey(now);
  if (demoSeededFor === today) return;
  demoSeededFor = today;
  const keys = recentDayKeys(VISIT_HISTORY_DAYS, now);
  keys.forEach((key, index) => {
    if (demoDays.has(key)) return;
    const views = DEMO_VIEWS_PATTERN[index % DEMO_VIEWS_PATTERN.length];
    demoDays.set(key, { views, visitors: Math.max(1, Math.round(views * 0.62)) });
  });
}

/** Tick the in-memory demo counters (used when no store is configured). */
export function recordDemoVisit(params: { newVisitor: boolean; now?: Date }): void {
  const now = params.now ?? new Date();
  ensureDemoSeed(now);
  const key = dayKey(now);
  const day = demoDays.get(key) ?? { views: 0, visitors: 0 };
  day.views += 1;
  if (params.newVisitor) day.visitors += 1;
  demoDays.set(key, day);
}

/** Read the demo series; `demo` is always true here. */
export function readDemoStats(now: Date = new Date()): VisitStats {
  ensureDemoSeed(now);
  const days = recentDayKeys(VISIT_HISTORY_DAYS, now).map((date) => {
    const day = demoDays.get(date) ?? { views: 0, visitors: 0 };
    return { date, views: day.views, visitors: day.visitors };
  });
  return buildStats(days, sumDays(days), true);
}

/** Assemble a stats payload from a complete, oldest-first day series. */
export function buildStats(
  days: VisitDay[],
  total: { views: number; visitors: number },
  demo: boolean,
): VisitStats {
  const today = days[days.length - 1] ?? { date: dayKey(), views: 0, visitors: 0 };
  return { today, total, days, demo };
}

function sumDays(days: VisitDay[]): { views: number; visitors: number } {
  return days.reduce(
    (acc, day) => ({ views: acc.views + day.views, visitors: acc.visitors + day.visitors }),
    { views: 0, visitors: 0 },
  );
}
