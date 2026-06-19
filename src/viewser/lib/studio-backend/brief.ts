/**
 * Native data layer — DiscoveryPayload -> Sajtmaskin engine brief.
 *
 * The ported Sajtbyggaren wizard produces a `DiscoveryPayload` (rawPrompt +
 * normalized `directives` + raw `answers`). Sajtmaskin's own-engine consumes a
 * loosely-typed `meta.brief` (`Record<string, unknown>`) whose strongest
 * signals are `requestedCapabilities` and `BuildSpecBriefSignals`
 * (qualityBar / motionLevel / domainProfile / visualDirection / toneAndVoice).
 *
 * This module maps the wizard's structured discovery output onto that native
 * brief shape so the engine gets deterministic signals without re-running an
 * LLM brief extraction. It is pure + framework-free so it can be unit tested
 * and reused on both client and server.
 */

import type { DiscoveryPayload } from "@viewser/components/discovery-wizard/wizard-payload";

/** Scaffold ids Sajtmaskin's engine recognizes. The wizard's scaffoldHint uses
 *  Sajtbyggaren-specific names (e.g. "ecommerce-lite", "local-service-business")
 *  that the native engine doesn't know; passing those breaks orchestration, so
 *  we only forward a hint when it maps to a known native scaffold (the engine
 *  otherwise infers the scaffold from the message + capabilities). */
const NATIVE_SCAFFOLDS = new Set([
  "base-nextjs",
  "landing-page",
  "saas-landing",
  "portfolio",
  "blog",
  "dashboard",
  "auth-pages",
  "ecommerce",
  "app-shell",
]);

/** Map Sajtbyggaren scaffold hints onto the closest native scaffold id. */
function nativeScaffoldHint(hint: string | undefined): string | undefined {
  if (!hint) return undefined;
  if (NATIVE_SCAFFOLDS.has(hint)) return hint;
  const h = hint.toLowerCase();
  if (h.includes("ecommerce") || h.includes("webshop") || h.includes("shop"))
    return "ecommerce";
  if (h.includes("portfolio") || h.includes("creative")) return "portfolio";
  if (h.includes("blog")) return "blog";
  if (h.includes("saas")) return "saas-landing";
  if (h.includes("dashboard") || h.includes("app")) return "dashboard";
  // local-service-business and other marketing hints -> the generic landing.
  return "landing-page";
}

/** Premium-intent keywords (sv + en) that promote the quality bar. */
const PREMIUM_KEYWORDS = [
  "premium",
  "lyxig",
  "exklusiv",
  "påkostad",
  "elegant",
  "polished",
  "luxury",
  "high-end",
  "boutique",
  "editorial",
  "snygg",
  "snyggt",
];

/** Dramatic / bold keywords that push the bar past premium. */
const BOLD_KEYWORDS = [
  "dramatisk",
  "rockig",
  "atmosfärisk",
  "stämningsfull",
  "dramatic",
  "moody",
  "atmospheric",
  "cinematic",
  "bold",
];

/** Native brief shape (subset we populate). Loose by design — the engine reads
 *  it as `Record<string, unknown>` and ignores unknown fields. */
export interface StudioBrief {
  language?: string;
  businessType?: string;
  domainProfile?: string;
  scaffoldHint?: string;
  layoutHint?: string;
  pages?: string[];
  requestedCapabilities?: string[];
  conversionGoals?: string[];
  targetAudience?: string;
  uniqueSellingPoints?: string[];
  qualityBar?: "clean" | "premium" | "bold-dramatic";
  motionLevel?: "minimal" | "moderate" | "lively";
  toneAndVoice?: string[];
  visualDirection?: {
    styleKeywords?: string[];
    typography?: { headings?: string; body?: string };
    primaryColorHex?: string;
    accentColorHex?: string;
  };
  notesForPlanner?: string;
  [key: string]: unknown;
}

function inferQualityBar(haystack: string): StudioBrief["qualityBar"] {
  const lower = haystack.toLowerCase();
  if (BOLD_KEYWORDS.some((kw) => lower.includes(kw))) return "bold-dramatic";
  if (PREMIUM_KEYWORDS.some((kw) => lower.includes(kw))) return "premium";
  return "clean";
}

function dedupeNonEmpty(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const v = (raw ?? "").trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Map a DiscoveryPayload to a native engine brief. Only emits fields that the
 * wizard actually filled — empty/absent wizard input is left undefined so the
 * engine falls back to its own inference rather than receiving empty values.
 */
export function discoveryToBrief(payload: DiscoveryPayload): StudioBrief {
  const { directives, answers, rawPrompt, scaffoldHint, contentBranch } =
    payload;
  const brief: StudioBrief = {};

  brief.language = directives?.language ?? "sv";
  if (directives?.layoutHint) brief.layoutHint = directives.layoutHint;

  // NOTE: scaffold/scope-driving fields (scaffoldHint, domainProfile,
  // businessType, explicit pages, requestedCapabilities, conversionGoals) are
  // intentionally NOT forwarded to the native engine. Forwarding them pushed
  // the engine's scaffold selection toward heavy scaffolds (e.g. the advanced
  // "ecommerce" scaffold) which produced silent/empty generations for ordinary
  // prompts. The native engine reliably selects scaffold + routes from the
  // operator's message; the brief now carries only descriptive style/tone
  // signals. (`nativeScaffoldHint` retained for potential future use.)
  void scaffoldHint;
  void contentBranch;
  void nativeScaffoldHint;

  if (answers.targetAudience?.trim()) {
    brief.targetAudience = answers.targetAudience.trim();
  }

  const usps = dedupeNonEmpty(
    directives?.uniqueSellingPoints ?? answers.uniqueSellingPoints ?? [],
  );
  if (usps.length) brief.uniqueSellingPoints = usps;

  // Tone & voice — primary first, then secondary.
  const tone = dedupeNonEmpty([
    directives?.tone?.primary,
    ...(directives?.tone?.secondary ?? []),
    ...(answers.brand?.toneTags ?? []),
  ]);
  if (tone.length) brief.toneAndVoice = tone;

  // Visual direction — style keywords from design style + vibe + references.
  const styleKeywords = dedupeNonEmpty([
    directives?.brand?.designStyle,
    answers.brand?.designStyle,
    answers.vibe?.vibeId,
    answers.vibe?.references,
  ]);
  const typographyFeel = answers.vibe?.typographyFeel || undefined;
  const visualDirection: NonNullable<StudioBrief["visualDirection"]> = {};
  if (styleKeywords.length) visualDirection.styleKeywords = styleKeywords;
  if (typographyFeel) {
    visualDirection.typography = { headings: typographyFeel, body: typographyFeel };
  }
  const primaryColorHex =
    directives?.brand?.primaryColorHex ?? answers.brand?.primaryColorHex;
  const accentColorHex =
    directives?.brand?.accentColorHex ?? answers.brand?.accentColorHex;
  if (primaryColorHex?.trim()) visualDirection.primaryColorHex = primaryColorHex.trim();
  if (accentColorHex?.trim()) visualDirection.accentColorHex = accentColorHex.trim();
  if (Object.keys(visualDirection).length) {
    brief.visualDirection = visualDirection;
  }

  // Quality bar — promote on premium/bold keywords across the operator's
  // own words + chosen design style + tone tags.
  brief.qualityBar = inferQualityBar(
    [
      rawPrompt,
      answers.brand?.designStyle ?? "",
      ...(answers.brand?.toneTags ?? []),
      ...styleKeywords,
    ].join(" "),
  );

  // Motion level — lively for energetic/bold vibes, otherwise moderate.
  brief.motionLevel = brief.qualityBar === "bold-dramatic" ? "lively" : "moderate";

  if (directives?.notesForPlanner?.trim()) {
    brief.notesForPlanner = directives.notesForPlanner.trim();
  }

  return brief;
}
