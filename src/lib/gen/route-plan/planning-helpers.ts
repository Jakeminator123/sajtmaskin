import type { BuildIntent } from "@/lib/builder/build-intent";
import { escapeRegexLiteral, uWord, uWordRegex } from "@/lib/utils/unicode-word-boundary";
import type { ScaffoldManifest } from "../scaffolds/types";
import { APP_ROUTE_PATTERNS, type RoutePatternEntry, WEBSITE_ROUTE_PATTERNS } from "./route-patterns";
import { normalizeRoutePath } from "./path-utils";

type BriefPageLike = {
  path?: unknown;
  name?: unknown;
  purpose?: unknown;
};

type RouteLike = {
  path: string;
  name: string;
  intent: string;
  required: boolean;
};

// Keep removal language explicit so "utan ..." copy/layout phrasing
// does not silently delete routes during follow-ups.
const ROUTE_REMOVAL_VERB_RE =
  /\b(remove|delete|drop|ta bort|plocka bort|radera)\b/i;
const ROUTE_REMOVAL_CONTEXT_RE =
  /\b(page|pages|route|routes|sida|sidor|sidan|sidorna)\b|[a-zåäö]+sida(?:n|rna)?\b/i;
const ROUTE_PATH_MENTION_RE = /\/[a-z0-9/_-]*/gi;
// A location preposition directly before a path mention ("remove the hero from
// /about", "ta bort knappen på /priser") means the removal targets content ON
// that page, not the page/route itself — so it must NOT delete the route.
const LOCATION_PREPOSITION_BEFORE_PATH_RE =
  /\b(?:from|on|in|into|inside|within|at|på|i|från|ur|inuti|hos)\s+$/i;

const EXPLICIT_ADD_ROUTE_PATTERNS = [
  /\b(?:add|create|make)\b[\s\S]{0,32}\b(?:new\s+)?(?:page|route)\b/i,
  /\b(?:new\s+)(?:page|route)\b/i,
  /\b(?:lägg till|skapa)\b[\s\S]{0,32}\b(?:en\s+ny\s+|ny\s+)?(?:sida|route)\b/i,
  /\b(?:ny\s+)(?:sida|route)\b/i,
];

const PAGE_NOUN = String.raw`(?:sidor|sida|pages?|routes?|vyer?|views?)`;
const PAGE_NOUN_PLURAL = String.raw`(?:sidor|pages|routes|vyer|views)`;
const PAGE_NOUN_SINGULAR = String.raw`(?:sidan?|pages?|routes?|vyer?|views?)`;

const EXPLICIT_PAGE_COUNT_RE = new RegExp(uWord(String.raw`(\d{1,2})\s*${PAGE_NOUN}`), "iu");

const WORD_NUMBER_COUNTS: Readonly<Record<string, number>> = {
  två: 2,
  tre: 3,
  fyra: 4,
  fem: 5,
  sex: 6,
  sju: 7,
  åtta: 8,
  nio: 9,
  tio: 10,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const WORD_PAGE_COUNT_RE = new RegExp(
  uWord(
    String.raw`(två|tre|fyra|fem|sex|sju|åtta|nio|tio|two|three|four|five|six|seven|eight|nine|ten)\s+${PAGE_NOUN_PLURAL}`,
  ),
  "iu",
);

/**
 * "en sida" / "one page" is an article or add-intent far more often than a
 * cap. Require a restrictive marker (bara/endast/enda/only/single/…).
 * Marker and page noun may be a few words apart for "den enda sida".
 */
const RESTRICTIVE_ONE_PAGE_RE = new RegExp(
  uWord(
    String.raw`(?:` +
      String.raw`(?:bara|endast|enbart)\s+(?:på\s+)?en\s+${PAGE_NOUN_SINGULAR}` +
      String.raw`|(?:en|den)\s+enda\s+${PAGE_NOUN_SINGULAR}` +
      String.raw`|(?:max|högst)\s+en\s+${PAGE_NOUN_SINGULAR}` +
      String.raw`|en\s*\(\s*1\s*\)\s*${PAGE_NOUN_SINGULAR}` +
      String.raw`|en\s+${PAGE_NOUN_SINGULAR}\s+totalt` +
      String.raw`|allt(?:\s+\p{L}+){0,3}\s+på\s+en\s+${PAGE_NOUN_SINGULAR}` +
      String.raw`|(?:only|just)\s+one\s+${PAGE_NOUN_SINGULAR}` +
      String.raw`|a\s+single\s+${PAGE_NOUN_SINGULAR}` +
      String.raw`|single-${PAGE_NOUN_SINGULAR}` +
      String.raw`|one\s+${PAGE_NOUN_SINGULAR}\s+only` +
      String.raw`|(?:all\s+)?on\s+one\s+${PAGE_NOUN_SINGULAR}` +
      String.raw`)`,
  ),
  "iu",
);

const INDEFINITE_PAGE_MENTION_RE = new RegExp(
  uWord(String.raw`(?:en|ett|one|a)\s+${PAGE_NOUN_SINGULAR}`),
  "giu",
);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function inferPathFromPageName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "/";
  if (/^(home|hem|start|startsida|homepage)$/i.test(trimmed)) return "/";
  const normalized = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return "/";
  return normalizeRoutePath(`/${normalized}`);
}

export function upsertRoute(routes: RouteLike[], route: RouteLike): void {
  const normalizedPath = normalizeRoutePath(route.path);
  const existing = routes.find((item) => item.path === normalizedPath);
  if (existing) {
    if (!existing.intent && route.intent) existing.intent = route.intent;
    existing.required = existing.required || route.required;
    return;
  }
  routes.push({
    ...route,
    path: normalizedPath,
  });
}

export function collectExplicitRouteRemovals(
  prompt: string,
  buildIntent: BuildIntent,
  existingPaths: string[],
): Set<string> {
  const removals = new Set<string>();
  const normalizedExisting = new Set(existingPaths.map((path) => normalizeRoutePath(path)));
  if (!ROUTE_REMOVAL_VERB_RE.test(prompt)) return removals;

  for (const match of prompt.matchAll(ROUTE_PATH_MENTION_RE)) {
    const normalized = normalizeRoutePath(match[0]);
    if (normalized === "/" || !normalizedExisting.has(normalized)) continue;
    // Skip "remove <content> from/på <path>" — the removal targets something ON
    // the page, not the page itself. Deleting the route here would silently drop
    // a page the user only asked to edit (the failure the removal-verb gate and
    // the line-19 comment exist to prevent). Bias toward keeping the route.
    const preceding = prompt.slice(0, match.index ?? 0);
    if (LOCATION_PREPOSITION_BEFORE_PATH_RE.test(preceding)) continue;
    removals.add(normalized);
  }

  // Keep keyword-based removals conservative: require route/page wording in the same prompt.
  if (!ROUTE_REMOVAL_CONTEXT_RE.test(prompt)) return removals;

  const candidatePatterns =
    buildIntent === "app"
      ? [...APP_ROUTE_PATTERNS, ...WEBSITE_ROUTE_PATTERNS]
      : [...WEBSITE_ROUTE_PATTERNS, ...APP_ROUTE_PATTERNS];

  for (const candidate of candidatePatterns) {
    if (candidate.path === "/") continue;
    if (!normalizedExisting.has(candidate.path)) continue;
    if (candidate.match.test(prompt)) {
      removals.add(candidate.path);
    }
  }

  return removals;
}

export function hasExplicitAddRouteIntent(prompt: string): boolean {
  return EXPLICIT_ADD_ROUTE_PATTERNS.some((pattern) => pattern.test(prompt));
}

/**
 * Explicit named-page intents where the user states a PAGE title, e.g.
 * `en ny sida som ska heta "Bilder"` / `a new page called Gallery`.
 * Bare copy edits (`Rubriken ska heta "…"`, `login page called from…`)
 * must NOT match — English requires create/new intent before called/named.
 *
 * Each pattern exposes exactly two capture groups, in this order:
 *   1. the QUOTED name — everything between the quotes, verbatim
 *   2. the BARE name — the unquoted tail, which still has to be trimmed
 *
 * The split matters. A quoted name states explicitly where the title ends, so a
 * multi-word one ("Bilder och video") is kept whole. An unquoted one has no such
 * marker: `Skapa en sida som ska heta Bilder och länka den i headern` contains
 * no comma or period, so a greedy tail swallowed the whole instruction and
 * produced `/bilder-och-lanka-den-i-headern`. Bare names are therefore cut at
 * the first conjunction/preposition ({@link PAGE_NAME_STOP_WORDS}) and bounded
 * to a handful of words.
 */
const NAME_CAPTURE = String.raw`(?:["'«»“”]([^"'«»“”\n]{1,60})["'«»“”]|([^"'«»“”.\n,;]+))`;

const EXPLICIT_NAMED_PAGE_PATTERNS: RegExp[] = [
  new RegExp(String.raw`(?:ny\s+)?(?:sida|page|route)\s+som\s+ska\s+heta\s+${NAME_CAPTURE}`, "giu"),
  new RegExp(
    String.raw`(?:create|add|make)\s+(?:a\s+)?(?:new\s+)?(?:page|route)\s+(?:called|named)\s+${NAME_CAPTURE}`,
    "giu",
  ),
  new RegExp(String.raw`new\s+(?:page|route)\s+(?:called|named)\s+${NAME_CAPTURE}`, "giu"),
  new RegExp(
    String.raw`(?:page|route)\s+that\s+should\s+be\s+(?:called|named)\s+${NAME_CAPTURE}`,
    "giu",
  ),
];

/**
 * Words that end an unquoted page name. Everything from here on belongs to the
 * rest of the instruction ("…och länka den i headern", "…and link it in the
 * header"), never to the title.
 *
 * A stop word in FIRST position is kept — `a page called The Team` is a real
 * title that happens to start with an article.
 */
const PAGE_NAME_STOP_WORDS = new Set([
  // svenska
  "och", "samt", "eller", "men", "som", "så", "sedan", "därefter", "med", "utan",
  "i", "på", "till", "från", "för", "under", "över", "vid", "av", "genom", "mot",
  "den", "det", "de", "dem", "denna", "detta", "dessa", "där", "när", "innan",
  "efter", "plus", "ovanför", "nedanför", "bredvid",
  // engelska
  "and", "or", "but", "then", "with", "without", "in", "on", "to", "from", "for",
  "under", "over", "at", "of", "by", "that", "which", "it", "them", "this",
  "these", "after", "before", "plus", "above", "below", "next",
]);

/** Bare names are titles, not sentences. */
const EXPLICIT_PAGE_NAME_MAX_WORDS = 4;

/**
 * Cut an unquoted name at the first clause boundary and bound its length.
 */
function trimBarePageName(raw: string): string {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const token of tokens) {
    const word = token.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    if (kept.length > 0 && PAGE_NAME_STOP_WORDS.has(word)) break;
    kept.push(token);
    if (kept.length >= EXPLICIT_PAGE_NAME_MAX_WORDS) break;
  }
  return kept.join(" ");
}

export type ExplicitNamedPage = {
  name: string;
  path: string;
};

function cleanExplicitPageName(raw: string): string {
  return raw
    .trim()
    .replace(/^["'«»“”]+|["'«»“”]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

/** Labeled lists like `Sidor: start, projekt, om oss, kontakt`. */
const LABELED_PAGE_LIST_RE = /\b(?:sidor|pages|routes)\s*:\s*([^\n]+)/giu;
const PAGE_LIST_CONJ_SPLIT_RE = /\s+och\s+|\s+and\s+/iu;
const PAGE_LIST_OXFORD_PREFIX_RE = /^(?:och|and)\s+/iu;
const MAX_NAMED_PAGES_FROM_LIST = 20;
/** After list `och`/`and`, only short intact titles count (`kontakt`, `om oss`). */
const MAX_WORDS_AFTER_LIST_CONJUNCTION = 2;

/**
 * Conjunction tails must be real page titles. Instruction clauses after
 * `och`/`and` (`…och länka den i footern`, `…och gör knapparna gröna`) either
 * hit stop-word truncation or exceed the short-title budget — reject both.
 */
function acceptConjunctionListItem(raw: string): string | null {
  const stripped = raw.replace(PAGE_LIST_OXFORD_PREFIX_RE, "").trim();
  if (!stripped) return null;
  const normalized = stripped.replace(/\s+/g, " ");
  const trimmed = trimBarePageName(normalized);
  if (!trimmed) return null;
  if (trimmed !== normalized) return null;
  if (trimmed.split(/\s+/).length > MAX_WORDS_AFTER_LIST_CONJUNCTION) return null;
  return trimmed;
}

/**
 * Split a labeled page list and stop at the first item that contains a
 * sentence boundary followed by more text (`Contact. Style: minimal`).
 * Leading Oxford `and`/`och` after a comma is stripped so it never becomes
 * part of the path (`and Contact` → `Contact`). Bare names go through
 * `trimBarePageName`; `och`/`and` tails that are instructions stop the list.
 */
function consumeLabeledPageList(rawList: string): string[] {
  const items: string[] = [];
  for (const commaPart of rawList.split(/\s*,\s*/)) {
    const conjParts = commaPart.split(PAGE_LIST_CONJ_SPLIT_RE);
    for (let i = 0; i < conjParts.length; i++) {
      const stripped = conjParts[i].replace(PAGE_LIST_OXFORD_PREFIX_RE, "").trim();
      if (!stripped) continue;
      const punct = stripped.search(/[.;!?]/);
      if (punct >= 0 && stripped.slice(punct + 1).trim().length > 0) {
        const before = stripped.slice(0, punct).trim();
        if (before) {
          if (i === 0) {
            const name = trimBarePageName(before);
            if (name) items.push(name);
          } else {
            const name = acceptConjunctionListItem(before);
            if (name) items.push(name);
          }
        }
        return items;
      }
      if (i === 0) {
        const name = trimBarePageName(stripped);
        if (name) items.push(name);
        continue;
      }
      const name = acceptConjunctionListItem(stripped);
      if (!name) return items;
      items.push(name);
    }
  }
  return items;
}

function parseExplicitPageName(raw: string): ExplicitNamedPage | null {
  const name = cleanExplicitPageName(raw.replace(/[.;:]+$/g, ""));
  if (!name || name.length < 2) return null;
  return { name, path: inferPathFromPageName(name) };
}

function pushExplicitNamedPage(
  raw: string,
  seenPaths: Set<string>,
  out: ExplicitNamedPage[],
): void {
  const page = parseExplicitPageName(raw);
  if (!page) return;
  if (page.path === "/" || seenPaths.has(page.path)) return;
  seenPaths.add(page.path);
  out.push(page);
}

export function extractExplicitNamedPages(prompt: string): ExplicitNamedPage[] {
  if (!prompt) return [];
  const seenPaths = new Set<string>();
  const out: ExplicitNamedPage[] = [];
  for (const pattern of EXPLICIT_NAMED_PAGE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of prompt.matchAll(pattern)) {
      const quoted = match[1];
      const raw =
        typeof quoted === "string" ? quoted : trimBarePageName(match[2] ?? "");
      pushExplicitNamedPage(raw, seenPaths, out);
    }
  }
  LABELED_PAGE_LIST_RE.lastIndex = 0;
  for (const match of prompt.matchAll(LABELED_PAGE_LIST_RE)) {
    const rawList = (match[1] ?? "").trim();
    if (!rawList) continue;
    // Parsa listan isolerat och acceptera den bara vid ≥2 giltiga poster.
    // En ensam träff är oftast prosa ("routes: se nedan") — utan spärren
    // blir löptexten en riktig skräpsida i planen (granskningsfynd).
    // Egen seen-mängd så en sida som redan fångats av de smala mönstren
    // ovan fortfarande räknas mot listans två.
    const listSeen = new Set<string>();
    const listPages: ExplicitNamedPage[] = [];
    let validListItems = 0;
    for (const raw of consumeLabeledPageList(rawList)) {
      if (listPages.length >= MAX_NAMED_PAGES_FROM_LIST) break;
      const page = parseExplicitPageName(raw);
      if (!page) continue;
      // Home-mapped names still count toward the ≥2 gate (`Sidor: start,
      // kontakt`) so a real two-item list is not rejected as prose.
      validListItems += 1;
      if (page.path === "/" || listSeen.has(page.path)) continue;
      listSeen.add(page.path);
      listPages.push(page);
    }
    if (validListItems < 2) continue;
    for (const page of listPages) {
      if (seenPaths.has(page.path)) continue;
      seenPaths.add(page.path);
      out.push(page);
    }
  }
  return out;
}

/** Remove already-resolved explicit page-name literals before keyword matching. */
export function neutralizeExplicitPageNameLiterals(
  prompt: string,
  names: string[],
): string {
  let out = prompt;
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length < 2) continue;
    // Unicode word boundaries so short names like "Art" do not match inside "part".
    out = out.replace(uWordRegex(escapeRegexLiteral(trimmed), "giu"), " ");
  }
  return out;
}

function countIndefinitePageMentions(prompt: string): number {
  INDEFINITE_PAGE_MENTION_RE.lastIndex = 0;
  return prompt.match(INDEFINITE_PAGE_MENTION_RE)?.length ?? 0;
}

/**
 * Detect when the user explicitly states a page count ("3 sidor", "två sidor",
 * "bara en sida"). Returns the count or null when no match is found.
 *
 * Bare "en sida" / "one page" is not a count: it is often an article
 * ("en sida med priser och en sida med kontakt") or an add-intent
 * ("lägg till en sida"). One-page phrasing requires a restrictive marker.
 */
export function detectExplicitPageCount(prompt: string): number | null {
  if (!prompt) return null;

  const digitMatch = prompt.match(EXPLICIT_PAGE_COUNT_RE);
  if (digitMatch) {
    const count = parseInt(digitMatch[1]!, 10);
    if (count >= 1 && count <= 20) return count;
  }

  const wordMatch = prompt.match(WORD_PAGE_COUNT_RE);
  if (wordMatch) {
    const count = WORD_NUMBER_COUNTS[wordMatch[1]!.toLowerCase()];
    if (count !== undefined && count >= 2 && count <= 20) return count;
  }

  // Two "en sida" / "one page" mentions are a list of pages, not a cap of 1.
  if (RESTRICTIVE_ONE_PAGE_RE.test(prompt) && countIndefinitePageMentions(prompt) < 2) {
    return 1;
  }

  return null;
}

export function buildRoutesFromBrief(
  brief: Record<string, unknown> | null | undefined,
): RouteLike[] {
  const pages = Array.isArray((brief as { pages?: unknown })?.pages)
    ? ((brief as { pages?: BriefPageLike[] }).pages ?? [])
    : [];
  if (pages.length === 0) return [];

  const routes: RouteLike[] = [];
  for (const page of pages.slice(0, 10)) {
    const explicitPath = asString(page?.path);
    const inferredPath = inferPathFromPageName(asString(page?.name));
    const path = normalizeRoutePath(explicitPath || inferredPath || "/");
    const name = asString(page?.name) || (path === "/" ? "Home" : "Page");
    const purpose = asString(page?.purpose);
    const intent = purpose
      ? `Route purpose: ${purpose}`
      : `Implement the ${name} route.`;
    upsertRoute(routes, {
      path,
      name,
      intent,
      required: true,
    });
  }
  return routes;
}

export function applyPromptPatterns(
  prompt: string,
  patterns: RoutePatternEntry[],
  routes: RouteLike[],
): boolean {
  const before = new Set(routes.map((route) => normalizeRoutePath(route.path)));
  for (const pattern of patterns) {
    if (pattern.match.test(prompt)) {
      upsertRoute(routes, {
        path: pattern.path,
        name: pattern.name,
        intent: pattern.intent,
        required: true,
      });
    }
  }
  return routes.some((route) => !before.has(normalizeRoutePath(route.path)));
}

function getScaffoldDefaultRoutes(
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest | null,
): RouteLike[] {
  switch (resolvedScaffold?.id) {
    case "blog":
      return [
        {
          path: "/blog",
          name: "Blog",
          intent: "Keep an editorial route for articles and archives.",
          required: buildIntent !== "app",
        },
      ];
    case "ecommerce":
      return [
        {
          path: "/products",
          name: "Products",
          intent: "Keep a storefront route for the product catalog.",
          required: true,
        },
        {
          path: "/cart",
          name: "Cart",
          intent: "Keep a cart route for purchase flow continuity.",
          required: false,
        },
      ];
    case "auth-pages":
      return [
        {
          path: "/login",
          name: "Login",
          intent: "Keep a dedicated authentication entry route.",
          required: true,
        },
        {
          path: "/signup",
          name: "Signup",
          intent: "Keep a dedicated registration route when auth is in scope.",
          required: false,
        },
      ];
    case "dashboard":
      if (buildIntent !== "app") return [];
      return [
        {
          path: "/analytics",
          name: "Analytics",
          intent: "Dashboard apps benefit from an analytics or metrics route.",
          required: false,
        },
        {
          path: "/settings",
          name: "Settings",
          intent: "App shells should usually expose at least one management/settings route.",
          required: false,
        },
      ];
    case "app-shell":
      if (buildIntent !== "app") return [];
      return [
        {
          path: "/settings",
          name: "Settings",
          intent: "App shells should usually expose at least one management/settings route.",
          required: false,
        },
      ];
    default:
      return [];
  }
}

export function collectScaffoldRequiredPaths(
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest | null,
): Set<string> {
  return new Set(
    getScaffoldDefaultRoutes(buildIntent, resolvedScaffold)
      .filter((route) => route.required)
      .map((route) => normalizeRoutePath(route.path)),
  );
}

export function applyScaffoldDefaults(
  buildIntent: BuildIntent,
  resolvedScaffold: ScaffoldManifest | null,
  routes: RouteLike[],
): void {
  for (const route of getScaffoldDefaultRoutes(buildIntent, resolvedScaffold)) {
    upsertRoute(routes, route);
  }
}
