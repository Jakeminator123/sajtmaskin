/**
 * Kostnadsfri visit tracking — path conventions.
 *
 * Visits to `/kostnadsfri/<slug>` are already recorded by the global
 * `AnalyticsTracker` into `page_views`. The two later steps of the flow
 * (password verified, wizard completed) are recorded server-side into the same
 * table as synthetic paths so the admin console can show, per slug, how far
 * each invited company got — without a second event table.
 *
 * Mail variant (`rent` | `animated`) lives on the query string of the landing
 * visit. Missing variant means an older mail. `kod` is an invite secret and is
 * never stored on the analytics path or returned to admin.
 *
 * Client-safe: no Node imports (the flow page bundles this file).
 */

import { parseKostnadsfriMailKind, type KostnadsfriMailKind } from "./mail-kind";

export const KOSTNADSFRI_PATH_PREFIX = "/kostnadsfri/";

/** Invite-only offer page. Sibling of the slug prefix, not a funnel path. */
export const KOSTNADSFRI_INFORMATION_PATH = "/kostnadsfri-information";

export type KostnadsfriAnalyticsEvent = "besok" | "verifierad" | "skapad";

/** How a `/kostnadsfri/<slug>` visit relates to the send register. */
export type KostnadsfriSlugKind = "utskick" | "ej_utskick" | "skrap";

export type { KostnadsfriMailKind };

export type KostnadsfriParsedPath = {
  slug: string;
  event: KostnadsfriAnalyticsEvent;
  /** Landing-visit mail sort. Null = older mail without ?variant=. */
  variant: KostnadsfriMailKind | null;
};

const EVENT_SEGMENTS: Record<Exclude<KostnadsfriAnalyticsEvent, "besok">, string> = {
  verifierad: "verifierad",
  skapad: "skapad",
};

/** Same shape the dash lookup accepts: lowercase company slugs, not arbitrary tokens. */
const INVITE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INVITE_SLUG_MAX = 120;

export function isInviteSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= INVITE_SLUG_MAX && INVITE_SLUG_RE.test(slug);
}

/**
 * `utskick` — giltig slug som finns i registret (sparad rad).
 * `ej_utskick` — giltig slug men aldrig sparad.
 * `skrap` — versaler, base64 eller annat som generateSlug inte kan ge.
 */
export function classifyKostnadsfriSlug(slug: string, registered: boolean): KostnadsfriSlugKind {
  if (!isInviteSlug(slug)) return "skrap";
  return registered ? "utskick" : "ej_utskick";
}

/**
 * Drop every `kod` query parameter from a path or absolute URL.
 * Other parameters, including `variant`, stay. Used before analytics storage
 * so an invite code cannot land in `page_views.path` or `referrer`.
 */
export function stripKostnadsfriKod(value: string): string {
  const hashIndex = value.indexOf("#");
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex < 0) return value;
  const params = new URLSearchParams(withoutHash.slice(queryIndex + 1));
  let removed = false;
  for (const key of [...params.keys()]) {
    if (key.toLowerCase() !== "kod") continue;
    params.delete(key);
    removed = true;
  }
  if (!removed) return value;
  const qs = params.toString();
  const base = withoutHash.slice(0, queryIndex);
  return qs ? `${base}?${qs}${hash}` : `${base}${hash}`;
}

function splitPathAndQuery(path: string): { pathname: string; search: string } {
  const q = path.indexOf("?");
  if (q < 0) return { pathname: path, search: "" };
  return { pathname: path.slice(0, q), search: path.slice(q + 1) };
}

function readVisitQuery(search: string): { variant: KostnadsfriMailKind | null } {
  if (!search) return { variant: null };
  return { variant: parseKostnadsfriMailKind(new URLSearchParams(search).get("variant")) };
}

/** Path of the landing page itself — what the analytics tracker records. */
export function kostnadsfriVisitPath(
  slug: string,
  query?: { variant?: KostnadsfriMailKind | null },
): string {
  const base = `${KOSTNADSFRI_PATH_PREFIX}${slug}`;
  const variant = query?.variant ? parseKostnadsfriMailKind(query.variant) : null;
  return variant ? `${base}?variant=${variant}` : base;
}

/**
 * Landing pathname plus only the allowlisted mail variant. `kod` is dropped
 * even when the live URL still carries it for the visitor.
 */
export function kostnadsfriTrackedVisitPath(pathname: string, search: string): string {
  const parsed = parseKostnadsfriAnalyticsPath(pathname);
  if (!parsed || parsed.event !== "besok") return stripKostnadsfriKod(pathname);
  const query = readVisitQuery(search.startsWith("?") ? search.slice(1) : search);
  return kostnadsfriVisitPath(parsed.slug, {
    variant: query.variant ?? parsed.variant,
  });
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
 * kostnadsfri path, including deeper or unknown sub-paths. Query `variant` is
 * read on landing visits; unknown variant values are treated as missing
 * (older mail). `kod` is ignored so a stored or replayed path cannot surface it.
 */
export function parseKostnadsfriAnalyticsPath(path: string): KostnadsfriParsedPath | null {
  const { pathname, search } = splitPathAndQuery(stripKostnadsfriKod(path));
  if (!pathname.startsWith(KOSTNADSFRI_PATH_PREFIX)) return null;
  const rest = pathname.slice(KOSTNADSFRI_PATH_PREFIX.length).replace(/\/+$/, "");
  if (!rest) return null;

  const [slug, segment, ...deeper] = rest.split("/");
  if (!slug || deeper.length > 0) return null;
  const query = readVisitQuery(search);
  if (segment === undefined || segment === "") {
    return { slug, event: "besok", variant: query.variant };
  }
  if (segment === EVENT_SEGMENTS.verifierad) {
    return { slug, event: "verifierad", variant: query.variant };
  }
  if (segment === EVENT_SEGMENTS.skapad) {
    return { slug, event: "skapad", variant: query.variant };
  }
  return null;
}
