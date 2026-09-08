/**
 * Kostnadsfri visit tracking — path conventions.
 *
 * Visits to `/kostnadsfri/<slug>` are already recorded by the global
 * `AnalyticsTracker` into `page_views`. The two later steps of the flow
 * (password verified, wizard completed) are recorded server-side into the same
 * table as synthetic paths so the admin console can show, per slug, how far
 * each invited company got — without a second event table.
 *
 * Client-safe: no Node imports (the flow page bundles this file).
 */

export const KOSTNADSFRI_PATH_PREFIX = "/kostnadsfri/";

export type KostnadsfriAnalyticsEvent = "besok" | "verifierad" | "skapad";

const EVENT_SEGMENTS: Record<Exclude<KostnadsfriAnalyticsEvent, "besok">, string> = {
  verifierad: "verifierad",
  skapad: "skapad",
};

/** Path of the landing page itself — what the analytics tracker records. */
export function kostnadsfriVisitPath(slug: string): string {
  return `${KOSTNADSFRI_PATH_PREFIX}${slug}`;
}

/** Synthetic path for a funnel step, e.g. `/kostnadsfri/ikea-ab/verifierad`. */
export function kostnadsfriEventPath(
  slug: string,
  event: Exclude<KostnadsfriAnalyticsEvent, "besok">,
): string {
  return `${KOSTNADSFRI_PATH_PREFIX}${slug}/${EVENT_SEGMENTS[event]}`;
}

/**
 * `verifierad` is written only by the verify route after a correct password,
 * `skapad` only by `POST /api/prompts` when the handoff row is created. A
 * browser beacon (or the page-view tracker on a 404 at that URL) must never
 * record them, or the admin funnel could be forged by anyone who knows the
 * path convention. Only `besok` is client-reported, like every other page view.
 */
export function isServerOnlyKostnadsfriPath(path: string): boolean {
  const event = parseKostnadsfriAnalyticsPath(path)?.event;
  return event === "verifierad" || event === "skapad";
}

/**
 * Reverse of the two builders above. Returns `null` for anything that is not a
 * kostnadsfri path, including deeper or unknown sub-paths.
 */
export function parseKostnadsfriAnalyticsPath(
  path: string,
): { slug: string; event: KostnadsfriAnalyticsEvent } | null {
  if (!path.startsWith(KOSTNADSFRI_PATH_PREFIX)) return null;
  const rest = path.slice(KOSTNADSFRI_PATH_PREFIX.length).replace(/\/+$/, "");
  if (!rest) return null;

  const [slug, segment, ...deeper] = rest.split("/");
  if (!slug || deeper.length > 0) return null;
  if (segment === undefined || segment === "") return { slug, event: "besok" };
  if (segment === EVENT_SEGMENTS.verifierad) return { slug, event: "verifierad" };
  if (segment === EVENT_SEGMENTS.skapad) return { slug, event: "skapad" };
  return null;
}
