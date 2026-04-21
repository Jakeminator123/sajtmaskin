import type { BuildIntent } from "./build-intent";
import type { ThemeColors } from "./theme-presets";
import { type DomainProfile, inferDomain } from "./domain-inference";
import { SECTION_KEYWORDS, STYLE_KEYWORDS } from "./prompt-heuristics";
import { getPromptAssistAllowedFromManifest } from "@/lib/ai-models/load-manifest";
import { BUILD_INTENT_GUIDANCE } from "@/lib/gen/intent-guidance";

// OpenAI-class assist models (loaded from manifest).
// "anthropic" refers to Anthropic direct API access via ANTHROPIC_API_KEY.
export type PromptAssistProvider = "openai" | "anthropic";

const promptAssistAllowed = getPromptAssistAllowedFromManifest();

// `ASSIST_MODELS` and `ANTHROPIC_ASSIST_MODELS` are kept for historical reasons —
// existing callers (and `manifest-parity.test.ts`) still read the split arrays.
// New callers should prefer the unified `promptAssistAllowed.models` accessor
// from `getPromptAssistAllowedFromManifest()`, which returns the union (provider
// is implicit in the model-id prefix: `openai/`, `anthropic/`, `anthropic-direct/`).
export const ASSIST_MODELS = Object.freeze([
  ...promptAssistAllowed.gatewayClassModels,
]);

export const ANTHROPIC_ASSIST_MODELS = Object.freeze([
  ...promptAssistAllowed.anthropicDirectModels,
]);

export function normalizeAssistModel(rawModel: string): string {
  const raw = String(rawModel || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("v0-")) return raw;
  if (raw.includes("/")) return raw;
  return `openai/${raw}`;
}

export function isOpenAIAssistModel(model: string): boolean {
  return ASSIST_MODELS.includes(model);
}

export function isAnthropicAssistModel(model: string): boolean {
  return ANTHROPIC_ASSIST_MODELS.includes(model);
}

export function isPromptAssistOff(model: string): boolean {
  return model === "off";
}

export function isPromptAssistModelAllowed(model: string): boolean {
  return (
    isPromptAssistOff(model) ||
    isOpenAIAssistModel(model) ||
    isAnthropicAssistModel(model)
  );
}

export function resolvePromptAssistProvider(model: string): PromptAssistProvider {
  if (isAnthropicAssistModel(model) || model.startsWith("anthropic/")) return "anthropic";
  return "openai";
}

// SECTION_KEYWORDS and STYLE_KEYWORDS imported from prompt-heuristics.ts

type MotionProfile = "static" | "balanced" | "lively";

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

function resolveBuildIntent(intent?: BuildIntent | null): BuildIntent {
  if (intent === "template" || intent === "app" || intent === "website") return intent;
  return "website";
}

function getBuildIntentIntro(intent?: BuildIntent | null): string {
  const resolved = resolveBuildIntent(intent);
  return BUILD_INTENT_GUIDANCE[resolved].summary;
}

function getBuildIntentInstructionLines(intent?: BuildIntent | null): string[] {
  const resolved = resolveBuildIntent(intent);
  return BUILD_INTENT_GUIDANCE[resolved].instructionLines;
}

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

const VISUAL_IDENTITY_GUIDANCE = {
  detailed: [
    "Never use flat pure-white backgrounds across the whole page.",
    "Use layered backgrounds: gradients, soft tints, and section bands to create depth.",
    "Ensure the hero uses a distinctive background (gradient or tinted panel).",
    "Pick a distinct font pairing (e.g., Inter + Space Grotesk, DM Sans + DM Mono).",
    "Create a cohesive color palette: primary, secondary, accent, with consistent application.",
  ],
  compact: [
    "Never use flat pure-white backgrounds across the whole page.",
    "Use layered backgrounds: gradients, soft tints, and section bands to create depth.",
    "Ensure the hero uses a distinctive background (gradient or tinted panel).",
    "Pick a distinct font pairing (e.g., Inter + Space Grotesk, DM Sans + DM Mono).",
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

const IMAGE_DENSITY_GUIDANCE = [
  "Images in hero + at least 2 additional sections.",
  "Consistent aspect ratios and professional cropping throughout.",
];

// Domain profile is now provided by domain-inference.ts (canonical source).
// buildDomainStructureHints / buildDomainContractHints remain here because
// they produce prompt text specific to the addendum format.

function buildDomainStructureHints(domain: DomainProfile): string[] {
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

function buildDomainContractHints(domain: DomainProfile): string[] {
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

function buildPromptAssistObservations(
  originalPrompt: string,
  domain: DomainProfile,
  sections: string[],
  styles: string[],
): string[] {
  const lines: string[] = [];
  if (domain !== "general") {
    lines.push(`- Domain profile inferred from the prompt: ${domain}.`);
  }
  if (sections.length > 0) {
    lines.push(`- Explicit section/page hints detected: ${sections.join(", ")}.`);
  }
  if (styles.length > 0) {
    lines.push(`- Style/tone hints detected: ${styles.join(", ")}.`);
  }
  if (!/\b(about|om oss|kontakt|contact|faq|pricing|menu|meny|book|booking|boka|services|tjänster)\b/i.test(originalPrompt)) {
    lines.push(
      "- Prompt is sparse; infer sensible default information architecture from the domain instead of keeping the site too generic.",
    );
  }
  return lines;
}

// ── Dynamic guidance resolvers ──────────────────────────────────────────
// These functions adapt the static guidance based on brief data (tone,
// style keywords, color palette) so that a playful pink site gets
// different instructions than a dark corporate one.

function hasAny(list: readonly string[], keywords: readonly string[]): boolean {
  const lower = list.map((s) => s.toLowerCase());
  return keywords.some((k) => lower.some((l) => l.includes(k)));
}

function inferMotionProfile(params: {
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

  if (hasAny(tone, ["playful", "fun", "energetic", "lively", "lekfull"])) {
    livelyScore += 1;
  }
  if (hasAny(tone, ["professional", "corporate", "minimal", "calm", "lugn", "serious", "formal"])) {
    staticScore += 1;
  }

  if (hasAny(styleKeywords, MOTION_LIVELY_STYLE_KEYWORDS)) livelyScore += 1;
  if (hasAny(styleKeywords, MOTION_STATIC_STYLE_KEYWORDS)) staticScore += 1;

  if (params.buildIntent === "template") {
    staticScore += 1;
  }

  if (livelyScore >= staticScore + 1) return "lively";
  if (staticScore >= livelyScore + 1) return "static";
  return preferLively ? "lively" : "balanced";
}

function resolveMotionGuidance(
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

interface ColorPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

function toColorPalette(themeOverride?: ThemeColors | null): ColorPalette {
  if (!themeOverride) return {};
  const palette: ColorPalette = {};
  if (themeOverride.primary) palette.primary = themeOverride.primary;
  if (themeOverride.secondary) palette.secondary = themeOverride.secondary;
  if (themeOverride.accent) palette.accent = themeOverride.accent;
  return palette;
}

function buildThemeAccentLines(themeOverride?: ThemeColors | null): string[] {
  if (!themeOverride) return [];
  const lines: string[] = [];
  if (themeOverride.secondary) {
    lines.push(
      `Use the secondary color (${themeOverride.secondary}) for supporting surfaces and secondary UI elements.`,
    );
  }
  if (themeOverride.accent) {
    lines.push(
      `Use the accent color (${themeOverride.accent}) for highlights, badges, and hover accents.`,
    );
  }
  return lines;
}

function buildThemeTokenLines(themeOverride?: ThemeColors | null): string[] {
  if (!themeOverride) return [];
  const tokens: string[] = [];
  if (themeOverride.primary) tokens.push(`- --primary: ${themeOverride.primary}`);
  if (themeOverride.secondary) tokens.push(`- --secondary: ${themeOverride.secondary}`);
  if (themeOverride.accent) tokens.push(`- --accent: ${themeOverride.accent}`);
  if (tokens.length === 0) return [];
  return [
    "Theme tokens (must match exactly):",
    ...tokens,
    "Do not change these values.",
  ];
}

function hasThemeOverride(themeOverride?: ThemeColors | null): boolean {
  return Boolean(
    themeOverride &&
      (themeOverride.primary || themeOverride.secondary || themeOverride.accent),
  );
}

function isDarkPalette(palette: ColorPalette): boolean {
  const bg = (palette.background || "").toLowerCase();
  return (
    bg.includes("#0") ||
    bg.includes("#1") ||
    bg.includes("#2") ||
    bg.includes("dark") ||
    bg.includes("black") ||
    bg.includes("oklch(0.")
  );
}

function resolveVisualIdentityGuidance(
  palette: ColorPalette,
  styleKeywords: string[],
  tone: string[],
  variant: "detailed" | "compact" = "detailed",
  options?: { themeLocked?: boolean },
): string[] {
  const base = [...VISUAL_IDENTITY_GUIDANCE[variant]];
  if (isDarkPalette(palette)) {
    // Replace "never flat white" with dark-specific guidance
    base[0] = "Use a rich dark background with subtle gradients or noise texture for depth.";
    base.push("Ensure sufficient contrast between text and dark backgrounds (WCAG AA+).");
  }
  if (options?.themeLocked) {
    const paletteIndex = base.findIndex((line) => line.toLowerCase().includes("color palette"));
    if (paletteIndex >= 0) {
      base[paletteIndex] = "Use the provided theme tokens; do not invent a new palette.";
    }
  }
  if (hasAny(styleKeywords, ["neon", "cyberpunk", "futuristic"])) {
    base.push("Use neon accent glows, high-contrast borders, and monospace or geometric fonts.");
  }
  if (hasAny(tone, ["luxury", "elegant", "premium"])) {
    base.push("Use generous whitespace, serif headings, and restrained accent color application.");
  }
  if (hasAny(tone, ["playful", "fun", "colorful", "lekfull"])) {
    base.push("Use vibrant accent colors, rounded shapes, and energetic color contrasts.");
  }
  if (palette.primary) {
    base.push(`Use the primary color (${palette.primary}) consistently for CTAs, links, and key accents.`);
  }
  return base;
}

function isSeasonalOrCulturalTopic(value: string): boolean {
  const lower = value.toLowerCase();
  return [
    "jul",
    "christmas",
    "holiday",
    "festive",
    "vinter",
    "winter",
    "gran",
    "granar",
    "tree",
    "trees",
    "tyskland",
    "germany",
    "julmarknad",
    "market",
    "skog",
    "forest",
  ].some((keyword) => lower.includes(keyword));
}

function getSubjectPaletteGuidance(value: string): string[] {
  const lower = value.toLowerCase();
  if (
    [
      "jul",
      "christmas",
      "festive",
      "holiday",
      "gran",
      "granar",
      "julmarknad",
      "snow",
      "snö",
      "winter",
      "vinter",
    ].some((keyword) => lower.includes(keyword))
  ) {
    return [
      "Suggested subject palette: evergreen/spruce green, deep Christmas red, snow white, bark brown, and warm gold.",
      "Use those colors in hero backgrounds, CTA accents, badges, borders, and decorative details instead of default SaaS blue.",
    ];
  }
  return [];
}

function resolveQualityBarGuidance(
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

// ── End dynamic guidance resolvers ──────────────────────────────────────

function normalizeWhitespace(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const trimmedLines = normalized.split("\n").map((line) => line.replace(/\s+$/g, ""));
  return trimmedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isStructuredPrompt(value: string): boolean {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const normalizedHeadings = new Set(
    lines.map((line) =>
      line
        .toLowerCase()
        .replace(/[^a-z0-9åäö#/_-]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  const headingCandidates = [
    "mal",
    "mål",
    "sektioner",
    "stil",
    "constraints",
    "tillganglighet",
    "tillgänglighet",
    "assets/attachments",
    "## build intent",
    "## project context",
    "## quality bar",
  ];
  const hitCount = headingCandidates.reduce(
    (count, candidate) => count + (normalizedHeadings.has(candidate) ? 1 : 0),
    0,
  );
  return hitCount >= 2;
}

function extractKeywordMatches(value: string, keywords: readonly string[]): string[] {
  const normalized = value.toLowerCase();
  const matches = keywords.filter((keyword) => normalized.includes(keyword));
  return Array.from(new Set(matches));
}

const ACCESSIBILITY_REQUIREMENTS = [
  "Dialoger måste ha DialogTitle + DialogDescription (sr-only ok) eller korrekt aria-describedby.",
];

export function formatPrompt(prompt: string): string {
  if (!prompt) return "";
  const normalized = normalizeWhitespace(String(prompt));
  if (!normalized) return "";
  if (isStructuredPrompt(normalized)) return normalized;

  return [
    "MÅL",
    normalized,
    "TILLGÄNGLIGHET",
    ACCESSIBILITY_REQUIREMENTS.map((line) => `- ${line}`).join("\n"),
  ].join("\n\n");
}

// Brief is intentionally loose (LLM JSON); narrow at use sites with helpers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
type Brief = any;

// `buildRewriteSystemPrompt`, `buildPolishSystemPrompt`, and
// `buildPromptFromBrief` were removed 2026-04-21 together with
// `usePromptRewrite.ts`. The Förbättra/Skriv om buttons that consumed them
// are gone from the builder UI; the hook had no other call-sites. The
// remaining brief-driven instruction addendum lives in
// `buildDynamicInstructionAddendumFromBrief()` below — that one IS active
// (used by `useInitBrief.ts` as fallback when the request misses a brief).

function buildSharedAddendumBlocks(params: {
  originalPrompt: string;
  buildIntent?: BuildIntent;
  tone: string[];
  styleKeywords: string[];
  imageGenerations: boolean;
  themeOverride?: ThemeColors | null;
  basePalette?: ColorPalette;
  domainSignal: string;
  topicSignal?: string;
  promptObservations?: string[];
  imageryNotes?: string[];
  guidanceVariant: "detailed" | "compact";
  imageDensityBullets?: boolean;
}): {
  domainBlock: string[];
  domainContractHints: string[];
  motionBlock: string[];
  themeBlock: string[];
  imageryBlock: string[];
} {
  const {
    originalPrompt,
    buildIntent,
    tone,
    styleKeywords,
    imageGenerations,
    themeOverride,
    basePalette,
    domainSignal,
    topicSignal,
    promptObservations,
    imageryNotes,
    guidanceVariant,
    imageDensityBullets = false,
  } = params;
  const themeLocked = hasThemeOverride(themeOverride);
  const colorPalette: ColorPalette = themeLocked ? toColorPalette(themeOverride) : (basePalette || {});
  const themeAccentLines = themeLocked ? buildThemeAccentLines(themeOverride) : [];
  const themeTokenLines = themeLocked ? buildThemeTokenLines(themeOverride) : [];

  const domainProfile = inferDomain(domainSignal);
  const domainStructureHints = buildDomainStructureHints(domainProfile);
  const domainContractHints = buildDomainContractHints(domainProfile);
  const domainInferenceLines =
    promptObservations && promptObservations.length > 0
      ? promptObservations
      : domainProfile !== "general"
        ? [`- Domain profile inferred from prompt + brief: ${domainProfile}.`]
        : [];
  const domainBlock: string[] = [];
  if (domainInferenceLines.length > 0) {
    domainBlock.push("## Domain Inference", ...domainInferenceLines, "");
  }
  if (domainStructureHints.length > 0) {
    domainBlock.push("## Structure Hints", ...domainStructureHints, "");
  }

  const motionProfile = inferMotionProfile({
    prompt: originalPrompt,
    tone,
    styleKeywords,
    buildIntent,
    preferLively: true,
  });
  const motionBlock = [
    "## Interaction & Motion",
    ...resolveMotionGuidance(tone, styleKeywords, guidanceVariant, motionProfile),
    "",
  ];

  const themeBlock = [
    "## Visual Identity",
    ...resolveVisualIdentityGuidance(colorPalette, styleKeywords, tone, guidanceVariant, {
      themeLocked,
    }),
    ...(isSeasonalOrCulturalTopic(topicSignal || originalPrompt)
      ? [
          "Use a subject-led palette instead of default SaaS blue. Seasonal/cultural themes should borrow color cues from the actual subject matter.",
          ...getSubjectPaletteGuidance(topicSignal || originalPrompt),
        ]
      : []),
    ...themeAccentLines,
    ...themeTokenLines,
    "",
  ];

  const imageryLine = imageGenerations
    ? "Image generation is enabled — use AI-generated images as the primary source. When no AI images are provided, use real Unsplash photos that directly depict the site topic (format: https://images.unsplash.com/photo-{ID}?w={W}&h={H}&fit=crop&q=80). Hero MUST have a prominent image. Never use blob: or data: URIs."
    : "Image generation is disabled — use /placeholder.svg?height=H&width=W for all images.";
  const imageryBlock = [
    "## Imagery",
    imageryLine,
    "Alt text required on all images. Use next/image with explicit dimensions.",
    "Every image must visually match its alt text and the actual page topic.",
    "Avoid generic office, laptop, startup, coworking, and meeting photos unless the request is actually about business/software/work.",
    ...(imageDensityBullets
      ? IMAGE_DENSITY_GUIDANCE.map((line) => `- ${line}`)
      : IMAGE_DENSITY_GUIDANCE),
    ...((imageryNotes || []).map((note) => `- ${note}`)),
    "",
  ];

  return {
    domainBlock,
    domainContractHints,
    motionBlock,
    themeBlock,
    imageryBlock,
  };
}

export function buildDynamicInstructionAddendumFromBrief(params: {
  brief: Brief;
  originalPrompt: string;
  imageGenerations: boolean;
  buildIntent?: BuildIntent;
  themeOverride?: ThemeColors | null;
}): string {
  const { brief, originalPrompt, imageGenerations, buildIntent, themeOverride } = params;
  const intentLines = getBuildIntentInstructionLines(buildIntent);
  const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const asStringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => asString(x)).filter(Boolean) : [];

  const projectTitle = asString(brief.projectTitle) || asString(brief.siteName) || "Website";
  const brandName = asString(brief.brandName);
  const pitch = asString(brief.oneSentencePitch) || asString(brief.tagline);
  const audience = asString(brief.targetAudience);
  const tone = asStringList(brief.toneAndVoice);

  const pages: Brief[] = Array.isArray(brief.pages) ? brief.pages : [];
  const isSinglePage = pages.length === 1 && asString(pages[0]?.path) === "/";
  const pageLines = pages
    .slice(0, 8)
    .map((p) => {
      const name = asString(p?.name) || "Page";
      const path = asString(p?.path) || "/";
      const purpose = asString(p?.purpose);
      const sections: Brief[] = Array.isArray(p?.sections) ? p.sections : [];
      const sectionLines = sections.slice(0, 12).map((s) => {
        const type = asString(s?.type) || "section";
        const heading = asString(s?.heading);
        const bullets = asStringList(s?.bullets).slice(0, 6);
        const bulletText = bullets.length ? ` — ${bullets.join("; ")}` : "";
        return `  - ${type}${heading ? `: ${heading}` : ""}${bulletText}`;
      });
      return [
        `- ${name} (${path})${purpose ? `: ${purpose}` : ""}`,
        ...(sectionLines.length ? ["  Sections:", ...sectionLines] : []),
      ].join("\n");
    })
    .join("\n");

  const imagery = brief?.imagery || {};
  const imageryNotes = [
    ...asStringList(imagery?.styleNotes),
    ...asStringList(imagery?.subjects),
    ...asStringList(imagery?.shotTypes),
  ].filter(Boolean);

  const mustHave = asStringList(brief.mustHave).slice(0, 10);
  const avoid = asStringList(brief.avoid).slice(0, 8);
  const styleKeywords = asStringList(brief?.visualDirection?.styleKeywords);
  const { domainBlock, domainContractHints, motionBlock, themeBlock, imageryBlock } =
    buildSharedAddendumBlocks({
      originalPrompt,
      buildIntent,
      tone,
      styleKeywords,
      imageGenerations,
      themeOverride,
      basePalette: brief?.visualDirection?.colorPalette || {},
      domainSignal: [projectTitle, brandName, pitch, audience, originalPrompt, pageLines]
        .filter(Boolean)
        .join(" "),
      topicSignal: [projectTitle, brandName, pitch, originalPrompt, imageryNotes.join(" ")].join(" "),
      imageryNotes,
      guidanceVariant: "detailed",
      imageDensityBullets: true,
    });
  const richnessGuidance = resolveQualityBarGuidance(tone, styleKeywords, "detailed");

  const parts: string[] = [
    "## Build Intent",
    ...intentLines.map((line) => `- ${line}`),
    "",
    "## Coding Direction",
    "- Output complete files in CodeProject format: ```tsx file=\"path/file.tsx\"",
    "- Route files like app/page.tsx and app/layout.tsx use default exports. Shared components may use named exports, but imports and exports must match exactly. Use kebab-case for filenames.",
    "- Import shadcn/ui from @/components/ui/* — never regenerate these components.",
    "- Import all icons from lucide-react — never use inline SVG or other icon libraries.",
    "- Use Tailwind semantic tokens (bg-primary, text-muted-foreground, etc.) — avoid hardcoded colors.",
    "- Use cn() from @/lib/utils for conditional class merging.",
    "- Use real, representative content — no lorem ipsum.",
    "",
    "## Project Context",
    `- Title: ${projectTitle}`,
    ...(brandName ? [`- Brand: ${brandName}`] : []),
    ...(pitch ? [`- Pitch: ${pitch}`] : []),
    ...(audience ? [`- Audience: ${audience}`] : []),
    ...(tone.length ? [`- Tone: ${tone.join(", ")}`] : []),
    ...(isSinglePage ? ["- Single-page layout: keep all content on /"] : []),
    "",
  ];

  if (pageLines) {
    parts.push("## Pages & Sections", pageLines, "");
  }

  if (domainBlock.length > 0) {
    parts.push(...domainBlock);
  }

  parts.push(...motionBlock);
  parts.push(...themeBlock);
  parts.push("## Quality Bar", ...richnessGuidance, "");

  if (domainContractHints.length > 0) {
    parts.push("## Contract & Backend Hints", ...domainContractHints, "");
  }

  parts.push(...imageryBlock);

  if (mustHave.length) {
    parts.push("## Must Have", ...mustHave.map((item) => `- ${item}`), "");
  }
  if (avoid.length) {
    parts.push("## Avoid", ...avoid.map((item) => `- ${item}`), "");
  }

  parts.push("## Original Request (for reference)", originalPrompt.trim());

  return parts.join("\n");
}

export function buildDynamicInstructionAddendumFromPrompt(params: {
  originalPrompt: string;
  imageGenerations: boolean;
  buildIntent?: BuildIntent;
  themeOverride?: ThemeColors | null;
}): string {
  const { originalPrompt, imageGenerations, buildIntent, themeOverride } = params;
  const formatted = formatPrompt(originalPrompt);
  const intentLines = getBuildIntentInstructionLines(buildIntent);

  // Infer tone and style from the raw prompt for dynamic guidance
  const promptStyles = extractKeywordMatches(originalPrompt, STYLE_KEYWORDS);
  const promptTone = extractKeywordMatches(originalPrompt, [
    "playful", "fun", "professional", "corporate", "luxury",
    "elegant", "minimal", "dramatic", "lekfull", "energetic",
  ] as const);
  const promptSections = extractKeywordMatches(originalPrompt, SECTION_KEYWORDS);
  const domainProfile = inferDomain(originalPrompt);
  const promptObservations = buildPromptAssistObservations(
    originalPrompt,
    domainProfile,
    promptSections,
    promptStyles,
  );
  const { domainBlock, domainContractHints, motionBlock, themeBlock, imageryBlock } =
    buildSharedAddendumBlocks({
      originalPrompt,
      buildIntent,
      tone: promptTone,
      styleKeywords: promptStyles,
      imageGenerations,
      themeOverride,
      domainSignal: originalPrompt,
      topicSignal: originalPrompt,
      promptObservations,
      guidanceVariant: "compact",
      imageDensityBullets: false,
  });

  return [
    "## Build Intent",
    ...intentLines.map((line) => `- ${line}`),
    "",
    "## Coding Direction",
    "- Output CodeProject format. Default exports, kebab-case filenames.",
    "- Import shadcn/ui from @/components/ui/*, icons from lucide-react.",
    "- Tailwind semantic tokens only — no hardcoded colors. Use cn() for class merging.",
    "",
    "## Project Context",
    formatted || originalPrompt.trim(),
    "",
    ...(domainBlock.length ? domainBlock : []),
    ...motionBlock,
    ...themeBlock,
    "## Quality Bar",
    ...resolveQualityBarGuidance(promptTone, promptStyles, "compact"),
    "",
    ...(domainContractHints.length
      ? ["## Contract & Backend Hints", ...domainContractHints, ""]
      : []),
    ...imageryBlock,
  ].join("\n");
}
