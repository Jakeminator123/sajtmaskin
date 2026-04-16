/**
 * Dynamic guidance resolvers for code generation system prompts.
 *
 * These produce request-specific guidance blocks for motion, visual identity,
 * quality bar, and domain structure — consumed directly by `buildDynamicContext()`
 * in `system-prompt.ts`.
 *
 * Previously these lived in `promptAssist.ts` and were wired through a
 * client-side addendum. Now they are server-side only.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import { type DomainProfile, inferDomain } from "@/lib/builder/domain-inference";

// ── Keyword arrays ────────────────────────────────────────────────────────

const MOTION_STATIC_STRICT_KEYWORDS = [
  "statisk",
  "stillsam",
  "ingen animation",
  "inga animationer",
  "undvik animationer",
  "utan animation",
  "no animation",
  "no animations",
  "avoid animation",
  "avoid animations",
  "no motion",
  "motionless",
  "static site",
  "still website",
  "still page",
  "reduced motion only",
] as const;

const MOTION_STATIC_KEYWORDS = [
  "minimal motion",
  "subtle motion",
  "calm",
  "quiet",
  "lugn",
  "still",
  "static",
  "no effects",
  "reduced motion",
  "prefers-reduced-motion",
] as const;

const MOTION_LIVELY_KEYWORDS = [
  "livlig",
  "lively",
  "animated",
  "animerad",
  "animerade",
  "animation",
  "animationer",
  "motion",
  "dynamic",
  "interaktiv",
  "energisk",
  "energetic",
  "parallax",
  "stagger",
  "scroll reveal",
  "micro-interactions",
  "wow",
  "glow",
  "floating",
  "playful",
] as const;

const MOTION_LIVELY_STYLE_KEYWORDS = [
  "animated",
  "animerad",
  "dynamic",
  "motion",
  "futuristic",
  "neon",
  "bold",
  "dramatic",
  "maximal",
  "playful",
] as const;

const MOTION_STATIC_STYLE_KEYWORDS = [
  "minimal",
  "clean",
  "simple",
  "corporate",
  "professional",
  "quiet",
] as const;

const MOTION_GUIDANCE = {
  detailed: [
    "Add tasteful motion throughout: hover states, scroll-reveal animations (fade-in, slide-up), micro-interactions.",
    "Include subtle motion in hero and at least 2 additional sections.",
    "Use Tailwind animate-* utilities for simple motion and motion-safe/motion-reduce variants to respect user preferences.",
    "Avoid custom @keyframes or @property CSS rules unless explicitly requested.",
    "Respect prefers-reduced-motion for accessibility.",
  ],
  compact: [
    "Add tasteful motion throughout: hover states, scroll-reveal animations, micro-interactions.",
    "Include subtle motion in hero and at least 2 additional sections.",
    "Use Tailwind animate-* utilities and motion-safe/motion-reduce variants.",
    "Avoid custom @keyframes or @property CSS rules unless explicitly requested.",
  ],
};

const QUALITY_BAR_GUIDANCE = {
  detailed: [
    "Aim for a premium, layered look: cards with borders, soft shadows, glassy panels, depth.",
    "Vary layouts: bento grids, split hero, stats row, logo wall, testimonial carousel, alternating sections.",
    "Increase visual density with tasteful imagery, lucide-react icons, and decorative accents.",
    "Avoid flat, empty sections; use section separators, background bands, or subtle gradients.",
  ],
  compact: [
    "Aim for a premium, layered look: cards with borders, soft shadows, glassy panels.",
    "Vary layouts: bento grids, split hero, stats row, logo wall, testimonial carousel.",
    "Use lucide-react icons and decorative accents for visual richness.",
    "Avoid flat, empty sections; use section separators or subtle gradients.",
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────

function hasAny(list: readonly string[], keywords: readonly string[]): boolean {
  const lower = list.map((s) => s.toLowerCase());
  return keywords.some((k) => lower.some((l) => l.includes(k)));
}

function extractKeywordMatches(value: string, keywords: readonly string[]): string[] {
  const normalized = value.toLowerCase();
  const matches = keywords.filter((keyword) => normalized.includes(keyword));
  return Array.from(new Set(matches));
}

export interface ColorPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

function isSeasonalOrCulturalTopic(value: string): boolean {
  const lower = value.toLowerCase();
  return [
    "jul", "christmas", "holiday", "festive", "vinter", "winter",
    "gran", "granar", "tree", "trees", "tyskland", "germany",
    "julmarknad", "market", "skog", "forest",
  ].some((keyword) => lower.includes(keyword));
}

function getSubjectPaletteGuidance(value: string): string[] {
  const lower = value.toLowerCase();
  if (
    ["jul", "christmas", "festive", "holiday", "gran", "granar",
      "julmarknad", "snow", "snö", "winter", "vinter"].some((k) => lower.includes(k))
  ) {
    return [
      "Suggested subject palette: evergreen/spruce green, deep Christmas red, snow white, bark brown, and warm gold.",
      "Use those colors in hero backgrounds, CTA accents, badges, borders, and decorative details instead of default SaaS blue.",
    ];
  }
  return [];
}

// ── Motion profile ────────────────────────────────────────────────────────

export type MotionProfile = "static" | "balanced" | "lively";

export function inferMotionProfile(params: {
  prompt?: string;
  tone?: string[];
  styleKeywords?: string[];
  buildIntent?: BuildIntent;
  preferLively?: boolean;
}): MotionProfile {
  const prompt = params.prompt ?? "";
  const tone = params.tone ?? [];
  const styleKeywords = params.styleKeywords ?? [];
  const preferLively = params.preferLively ?? true;

  const strictStaticHits = extractKeywordMatches(prompt, MOTION_STATIC_STRICT_KEYWORDS).length;
  if (strictStaticHits > 0) return "static";

  let staticScore = extractKeywordMatches(prompt, MOTION_STATIC_KEYWORDS).length;
  let livelyScore = extractKeywordMatches(prompt, MOTION_LIVELY_KEYWORDS).length;

  if (hasAny(tone, ["playful", "fun", "energetic", "lively", "lekfull"])) livelyScore += 1;
  if (hasAny(tone, ["professional", "corporate", "minimal", "calm", "lugn", "serious", "formal"])) staticScore += 1;

  if (hasAny(styleKeywords, MOTION_LIVELY_STYLE_KEYWORDS)) livelyScore += 1;
  if (hasAny(styleKeywords, MOTION_STATIC_STYLE_KEYWORDS)) staticScore += 1;

  if (params.buildIntent === "template") staticScore += 1;

  if (livelyScore >= staticScore + 1) return "lively";
  if (staticScore >= livelyScore + 1) return "static";
  return preferLively ? "lively" : "balanced";
}

export function resolveMotionGuidance(
  tone: string[],
  styleKeywords: string[],
  variant: "detailed" | "compact" = "detailed",
  profile: MotionProfile = "balanced",
): string[] {
  if (profile === "static") {
    return [
      "Keep motion minimal: only subtle hover and focus states.",
      "Avoid scroll-reveal, autoplay, parallax, looping, and background animations.",
      "Default to reduced motion (motion-reduce:animate-none) and respect prefers-reduced-motion.",
      "Add data-animate hooks for future upgrades, but keep animations inactive for now.",
    ];
  }

  let base = [...MOTION_GUIDANCE[variant]];
  if (hasAny(tone, ["playful", "fun", "energetic", "lekfull"])) {
    base.push("Use bouncy, playful micro-interactions and generous spring easing.");
  }
  if (hasAny(tone, ["professional", "corporate", "serious", "formal"])) {
    base[0] = "Add restrained, professional motion: subtle fades and clean transitions only.";
  }
  if (hasAny(styleKeywords, ["minimal", "clean", "simple"])) {
    base = base.filter((l) => !l.includes("at least 2"));
  }
  if (hasAny(styleKeywords, ["animated", "dynamic", "motion", "animerad"])) {
    base.push("Go heavy on animations — scroll-triggered reveals, parallax, floating elements.");
  }
  if (profile === "lively") {
    base.push(
      "Add richer motion: staggered entrances, scroll-triggered reveals, gentle parallax, floating accents.",
    );
    base.push(
      "For complex sequences, framer-motion is allowed; otherwise stick to Tailwind animate-* utilities.",
    );
  }
  base.push(
    "Use consistent animation hooks (data-animate, data-stagger, data-delay) so motion can be extended later.",
  );
  return base;
}

// ── Quality bar ───────────────────────────────────────────────────────────

export function resolveQualityBarGuidance(
  tone: string[],
  styleKeywords: string[],
  variant: "detailed" | "compact" = "detailed",
): string[] {
  const base = [...QUALITY_BAR_GUIDANCE[variant]];
  if (hasAny(styleKeywords, ["minimal", "clean", "simple"])) {
    return [
      "Aim for a clean, minimal look: generous whitespace, sharp typography, few decorative elements.",
      "Use simple layouts: single-column hero, clean card grid, focused CTAs.",
      "Avoid visual clutter; let content breathe with consistent spacing.",
    ];
  }
  if (hasAny(styleKeywords, ["bold", "dramatic", "intense", "maximal"])) {
    base.push("Go bold: oversized typography, full-bleed images, high-contrast sections.");
  }
  if (hasAny(tone, ["playful", "fun", "whimsical"])) {
    base.push("Add personality: custom illustrations, emoji accents, or quirky layout variations.");
  }
  return base;
}

// ── Domain structure & contract hints ─────────────────────────────────────

export function buildDomainStructureHints(domain: DomainProfile): string[] {
  switch (domain) {
    case "restaurant":
      return [
        "Treat this as a hospitality/restaurant website, not an online store.",
        "Strong default pages/sections: home, menu, about, contact, booking/reservation, opening hours, FAQ.",
        "Do not introduce cart, checkout, product catalog, inventory, or payment-provider flows unless the user explicitly asks for online ordering.",
        "Emphasize atmosphere, food/drink presentation, trust, practical visit information, and clear reservation/contact CTAs.",
      ];
    case "hotel":
      return [
        "Treat this as a hospitality/hotel website, not ecommerce.",
        "Strong default pages/sections: home, rooms, amenities/spa, about, contact, booking, FAQ.",
        "Focus on stay experience, location, rooms, amenities, and booking journey.",
      ];
    case "spa-salon":
      return [
        "Treat this as a service-booking website, not ecommerce.",
        "Strong default pages/sections: home, services/treatments, about/team, contact, booking, FAQ.",
        "Focus on treatments/services, trust, staff, ambience, and appointment booking CTAs.",
      ];
    case "clinic":
      return [
        "Treat this as a clinic/service website, not ecommerce.",
        "Strong default pages/sections: home, services, practitioners/team, about, contact, booking/request appointment, FAQ.",
        "Focus on trust, credentials, patient journey, and practical contact/booking information.",
      ];
    case "event-venue":
      return [
        "Treat this as a venue/hospitality website, not ecommerce.",
        "Strong default pages/sections: home, venue spaces, events/packages, gallery, contact, booking inquiry, FAQ.",
        "Focus on spaces, atmosphere, booking inquiry, logistics, and social proof.",
      ];
    case "ecommerce":
      return [
        "Treat this as a real online store/storefront.",
        "Strong default pages/sections: home, product/category pages, cart, checkout, trust/returns/shipping information.",
      ];
    case "portfolio":
      return [
        "Treat this as a portfolio/showcase site.",
        "Strong default pages/sections: home, selected work, about, services/contact, case studies or gallery.",
      ];
    case "saas":
      return [
        "Treat this as product/saas positioning or app-marketing.",
        "Strong default pages/sections: home, features, pricing, FAQ, contact/demo CTA.",
      ];
    case "agency":
      return [
        "Treat this as an agency/services website.",
        "Strong default pages/sections: home, services, about/team, case studies/portfolio, contact.",
      ];
    case "education":
      return [
        "Treat this as an education/course website.",
        "Strong default pages/sections: home, courses/programs, about, instructors/team, enrollment/contact, FAQ.",
      ];
    case "real-estate":
      return [
        "Treat this as a real estate/property website.",
        "Strong default pages/sections: home, listings/properties, about, agents/team, contact.",
      ];
    default:
      return [];
  }
}

export function buildDomainContractHints(domain: DomainProfile): string[] {
  switch (domain) {
    case "restaurant":
    case "hotel":
    case "spa-salon":
    case "clinic":
    case "event-venue":
      return [
        "Booking/contact keywords in hospitality or service domains do not automatically imply Stripe, checkout, carts, or persisted database contracts.",
        "If no real backend is explicitly requested, prefer static/reservation-request flows, contact forms, booking CTAs, or external-booking placeholders over local databases and payment providers.",
      ];
    case "ecommerce":
      return [
        "Ecommerce keywords do imply storefront/cart/checkout patterns and may justify payment/provider contracts.",
      ];
    default:
      return [];
  }
}

// ── Seasonal / thematic palette ───────────────────────────────────────────

export function resolveSeasonalPaletteGuidance(signal: string): string[] {
  if (!isSeasonalOrCulturalTopic(signal)) return [];
  return [
    "Use a subject-led palette instead of default SaaS blue. Seasonal/cultural themes should borrow color cues from the actual subject matter.",
    ...getSubjectPaletteGuidance(signal),
  ];
}

// ── Composite: all guidance blocks for a generation request ───────────────

export interface GuidanceBlocksInput {
  userPrompt: string;
  buildIntent: BuildIntent;
  tone: string[];
  styleKeywords: string[];
  briefPalette?: ColorPalette;
  themeOverride?: ThemeColors | null;
  topicSignal?: string;
  /** Brief-LLM-provided overrides (Cascade Level 1-2). When set, skip deterministic inference. */
  briefDomainProfile?: string;
  briefMotionLevel?: "minimal" | "moderate" | "lively";
  briefQualityBar?: "clean" | "premium" | "bold-dramatic";
  briefSeasonalHints?: string[];
}

export interface GuidanceBlocks {
  domainProfile: DomainProfile;
  domainStructureHints: string[];
  domainContractHints: string[];
  motionProfile: MotionProfile;
  motionGuidance: string[];
  qualityBarGuidance: string[];
  seasonalPaletteGuidance: string[];
}

function mapBriefMotionLevel(level: "minimal" | "moderate" | "lively"): MotionProfile {
  switch (level) {
    case "minimal": return "static";
    case "moderate": return "balanced";
    case "lively": return "lively";
  }
}

function resolveQualityBarFromBrief(
  bar: "clean" | "premium" | "bold-dramatic",
  tone: string[],
  styleKeywords: string[],
): string[] {
  switch (bar) {
    case "clean":
      return [
        "Aim for a clean, minimal look: generous whitespace, sharp typography, few decorative elements.",
        "Use simple layouts: single-column hero, clean card grid, focused CTAs.",
        "Avoid visual clutter; let content breathe with consistent spacing.",
      ];
    case "bold-dramatic": {
      const base = [...QUALITY_BAR_GUIDANCE["detailed"]];
      base.push("Go bold: oversized typography, full-bleed images, high-contrast sections.");
      if (hasAny(tone, ["playful", "fun", "whimsical"])) {
        base.push("Add personality: custom illustrations, emoji accents, or quirky layout variations.");
      }
      return base;
    }
    case "premium":
    default:
      return resolveQualityBarGuidance(tone, styleKeywords, "detailed");
  }
}

export function resolveGuidanceBlocks(input: GuidanceBlocksInput): GuidanceBlocks {
  const {
    userPrompt, buildIntent, tone, styleKeywords, topicSignal,
    briefDomainProfile, briefMotionLevel, briefQualityBar, briefSeasonalHints,
  } = input;

  // Domain: brief override (Level 1) > deterministic inference (Level 3)
  const domainProfile: DomainProfile = briefDomainProfile
    ? (briefDomainProfile as DomainProfile)
    : inferDomain(userPrompt);
  const domainStructureHints = buildDomainStructureHints(domainProfile);
  const domainContractHints = buildDomainContractHints(domainProfile);

  // Motion: brief override (Level 1) > deterministic inference (Level 3)
  const motionProfile: MotionProfile = briefMotionLevel
    ? mapBriefMotionLevel(briefMotionLevel)
    : inferMotionProfile({
        prompt: userPrompt,
        tone,
        styleKeywords,
        buildIntent,
        preferLively: true,
      });
  const motionGuidance = resolveMotionGuidance(tone, styleKeywords, "detailed", motionProfile);

  // Quality bar: brief override (Level 1) > deterministic inference (Level 3)
  const qualityBarGuidance = briefQualityBar
    ? resolveQualityBarFromBrief(briefQualityBar, tone, styleKeywords)
    : resolveQualityBarGuidance(tone, styleKeywords, "detailed");

  // Seasonal palette: brief override (Level 1) > deterministic inference (Level 3)
  const effectiveTopicSignal = topicSignal || userPrompt;
  const seasonalPaletteGuidance =
    briefSeasonalHints && briefSeasonalHints.length > 0
      ? [
          "Use a subject-led palette instead of default SaaS blue. Seasonal/cultural themes should borrow color cues from the actual subject matter.",
          `Seasonal themes detected from brief: ${briefSeasonalHints.join(", ")}.`,
        ]
      : resolveSeasonalPaletteGuidance(effectiveTopicSignal);

  return {
    domainProfile,
    domainStructureHints,
    domainContractHints,
    motionProfile,
    motionGuidance,
    qualityBarGuidance,
    seasonalPaletteGuidance,
  };
}
