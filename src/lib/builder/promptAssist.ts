import type { BuildIntent } from "./build-intent";
import type { ThemeColors } from "./theme-presets";

// "gateway" refers to Vercel AI Gateway (same gateway API used by /api/ai/* routes).
// "v0" refers to the v0 Model API (openai-compat).
export type PromptAssistProvider = "gateway" | "v0";

export const GATEWAY_ASSIST_MODELS = [
  "openai/gpt-5.2",
  "openai/gpt-5.2-pro",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5",
] as const;

export const V0_ASSIST_MODELS = ["v0-1.5-md", "v0-1.5-lg"] as const;

export type GatewayAssistModel = (typeof GATEWAY_ASSIST_MODELS)[number];
export type V0AssistModel = (typeof V0_ASSIST_MODELS)[number];

export function normalizeAssistModel(rawModel: string): string {
  const raw = String(rawModel || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("v0-")) return raw;
  if (raw.includes("/")) return raw;
  return `openai/${raw}`;
}

export function isV0AssistModel(model: string): model is V0AssistModel {
  return V0_ASSIST_MODELS.includes(model as V0AssistModel);
}

export function isGatewayAssistModel(model: string): model is GatewayAssistModel {
  return GATEWAY_ASSIST_MODELS.includes(model as GatewayAssistModel);
}

export function isPromptAssistModelAllowed(model: string): boolean {
  return isGatewayAssistModel(model) || isV0AssistModel(model);
}

export function resolvePromptAssistProvider(model: string): PromptAssistProvider {
  return isV0AssistModel(model) ? "v0" : "gateway";
}

const SECTION_KEYWORDS = [
  "hero",
  "features",
  "pricing",
  "faq",
  "testimonials",
  "contact",
  "about",
  "footer",
  "cta",
  "gallery",
  "services",
  "team",
  "blog",
  "navbar",
] as const;

const STYLE_KEYWORDS = [
  "minimal",
  "modern",
  "clean",
  "bold",
  "playful",
  "professional",
  "luxury",
  "dark",
  "light",
  "retro",
  "corporate",
  "soft",
  "elegant",
  "futuristic",
] as const;

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

const BUILD_INTENT_GUIDANCE: Record<
  BuildIntent,
  { summary: string; instructionLines: string[] }
> = {
  template: {
    summary: "Template build: compact, reusable layout with minimal app logic.",
    instructionLines: [
      "Scope is compact: 1–2 pages max, reusable sections.",
      "Avoid heavy app logic, databases, or auth unless explicitly requested.",
      "Focus on layout, components, and clean content placeholders.",
    ],
  },
  website: {
    summary: "Website build: marketing/info content with clear structure.",
    instructionLines: [
      "Focus on content structure, marketing flow, and clear sections.",
      "Prefer static content with light interactivity; keep logic minimal.",
      "Match scope to the request: a short, simple prompt should yield a polished one-pager; a detailed prompt may produce multiple pages.",
      "Use shadcn/ui components (buttons, cards, forms, dialogs) for all interactive and structured UI elements.",
    ],
  },
  app: {
    summary: "App build: stateful UI with flows, data models, and auth where needed.",
    instructionLines: [
      "Include app flows, stateful UI, and data-backed views where relevant.",
      "Define key entities, empty states, and realistic data placeholders.",
      "Add auth, settings, and CRUD patterns when it fits the prompt.",
    ],
  },
};

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
  "Include images in hero + at least 2-3 additional sections where it adds value.",
  "Use consistent aspect ratios and professional cropping for visual harmony.",
];

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

const CONSTRAINT_MARKERS = [
  "must",
  "should",
  "avoid",
  "do not",
  "don't",
  "ska",
  "måste",
  "undvik",
  "inte",
  "utan",
] as const;

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

function extractConstraints(value: string): string[] {
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const picked: string[] = [];
  lines.forEach((line) => {
    const lower = line.toLowerCase();
    if (CONSTRAINT_MARKERS.some((marker) => lower.includes(marker))) {
      if (!picked.includes(line)) {
        picked.push(line);
      }
    }
  });
  return picked.slice(0, 6);
}

function extractUrls(value: string): string[] {
  const matches = Array.from(value.matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]);
  return Array.from(new Set(matches)).slice(0, 6);
}

function normalizeConstraintKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(sr-only ok\)/g, "")
    .replace(/[^a-z0-9åäö]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ACCESSIBILITY_REQUIREMENTS = [
  "Dialoger måste ha DialogTitle + DialogDescription (sr-only ok) eller korrekt aria-describedby.",
];

export function formatPromptForV0(prompt: string): string {
  if (!prompt) return "";
  const normalized = normalizeWhitespace(String(prompt));
  if (!normalized) return "";
  if (isStructuredPrompt(normalized)) return normalized;

  const sections = extractKeywordMatches(normalized, SECTION_KEYWORDS);
  const styles = extractKeywordMatches(normalized, STYLE_KEYWORDS);
  const accessibilityKeys = new Set(
    ACCESSIBILITY_REQUIREMENTS.map((line) => normalizeConstraintKey(line)),
  );
  const seenConstraintKeys = new Set<string>();
  const constraints = extractConstraints(normalized).filter((line) => {
    const key = normalizeConstraintKey(line);
    if (!key) return false;
    if (seenConstraintKeys.has(key)) return false;
    seenConstraintKeys.add(key);
    if (accessibilityKeys.has(key)) return false;
    return true;
  });
  const urls = extractUrls(normalized);
  const normalizedPromptKeys = new Set(
    normalized
      .split(/\n+/)
      .map((line) => normalizeConstraintKey(line))
      .filter(Boolean),
  );
  const accessibilityRequirements = ACCESSIBILITY_REQUIREMENTS.filter(
    (line) => !normalizedPromptKeys.has(normalizeConstraintKey(line)),
  );

  const parts: string[] = ["MÅL", normalized];

  if (sections.length) {
    parts.push("SEKTIONER", sections.join(", "));
  }
  if (styles.length) {
    parts.push("STIL", styles.join(", "));
  }
  if (constraints.length) {
    parts.push("CONSTRAINTS", constraints.map((line) => `- ${line}`).join("\n"));
  }
  if (urls.length) {
    parts.push("ASSETS/ATTACHMENTS", urls.map((url) => `- ${url}`).join("\n"));
  }
  if (accessibilityRequirements.length) {
    parts.push(
      "TILLGÄNGLIGHET",
      accessibilityRequirements.map((line) => `- ${line}`).join("\n"),
    );
  }

  return parts.join("\n\n");
}

export function buildV0RewriteSystemPrompt(params: {
  codeContext?: string | null;
  buildIntent?: BuildIntent;
} = {}): string {
  const intentLine = getBuildIntentIntro(params.buildIntent);
  const base =
    "You are a prompt engineer for v0 (a website/app builder). " +
    "Rewrite the user request into a single, concrete, high-quality build prompt for v0. " +
    "Keep it concise, include key requirements and UI details, and avoid extra commentary. " +
    `Output ONLY the rewritten prompt.\n\nBuild intent: ${intentLine}`;

  const codeContext = params.codeContext?.trim();
  if (!codeContext) return base;

  return (
    base +
    "\n\nYou also receive a summary of the existing codebase. " +
    "Use it to align the rewrite with the current structure and naming. " +
    "If the request implies edits, reference the most relevant files/components from the context. " +
    "Do not invent files or frameworks that are not in the context. " +
    "Do not output the context itself.\n\n" +
    `Codebase context:\n${codeContext}`
  );
}

export function buildV0PolishSystemPrompt(params: {
  buildIntent?: BuildIntent;
  forceEnglish?: boolean;
} = {}): string {
  const intentLine = getBuildIntentIntro(params.buildIntent);
  const languageRule = params.forceEnglish
    ? "Rewrite in English."
    : "Keep the original language. Only translate to English if the user explicitly asks for it.";
  return (
    "You are a meticulous copy editor for v0 prompts. " +
    "Polish the user's request with minimal changes: fix spelling, grammar, punctuation, and clarity. " +
    "Do NOT add new requirements, sections, or features. " +
    "Preserve meaning and keep length roughly the same. " +
    `${languageRule} ` +
    "Output ONLY the polished prompt.\n\n" +
    `Build intent: ${intentLine}`
  );
}

type Brief = any;

export function buildV0PromptFromBrief(params: {
  brief: Brief;
  originalPrompt: string;
  imageGenerations: boolean;
  buildIntent?: BuildIntent;
  themeOverride?: ThemeColors | null;
}): string {
  const { brief, originalPrompt, imageGenerations, buildIntent, themeOverride } = params;
  const resolvedIntent = resolveBuildIntent(buildIntent);
  const intentLine =
    resolvedIntent === "app"
      ? "Build a modern, production-ready web app using Next.js (App Router) + Tailwind CSS v4."
      : resolvedIntent === "template"
        ? "Build a reusable, production-ready template using Next.js (App Router) + Tailwind CSS v4."
        : "Build a beautiful, modern, production-ready website using Next.js (App Router) + Tailwind CSS v4.";

  const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const asStringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => asString(x)).filter(Boolean) : [];

  const projectTitle = asString(brief.projectTitle) || "Website";
  const brandName = asString(brief.brandName);
  const pitch = asString(brief.oneSentencePitch);
  const audience = asString(brief.targetAudience);
  const cta = asString(brief.primaryCallToAction);
  const tone = asStringList(brief.toneAndVoice);

  const styleKeywords = asStringList(brief?.visualDirection?.styleKeywords);
  const themeLocked = hasThemeOverride(themeOverride);
  const briefPalette = themeLocked ? {} : (brief?.visualDirection?.colorPalette || {});
  const palette = themeLocked ? toColorPalette(themeOverride) : briefPalette;
  const typography = brief?.visualDirection?.typography || {};

  const motionProfile = inferMotionProfile({
    prompt: originalPrompt,
    tone,
    styleKeywords,
    buildIntent,
    preferLively: true,
  });
  const motionGuidance = resolveMotionGuidance(tone, styleKeywords, "compact", motionProfile);
  const visualIdentityGuidance = resolveVisualIdentityGuidance(
    palette,
    styleKeywords,
    tone,
    "compact",
    { themeLocked },
  );
  const themeAccentLines = themeLocked ? buildThemeAccentLines(themeOverride) : [];
  const themeTokenLines = themeLocked ? buildThemeTokenLines(themeOverride) : [];
  const qualityGuidance = resolveQualityBarGuidance(tone, styleKeywords, "compact");
  const toBulletLine = (line: string) => (line.startsWith("-") ? line : `- ${line}`);

  const pages: any[] = Array.isArray(brief.pages) ? brief.pages : [];
  const pageLines = pages
    .slice(0, 10)
    .map((p) => {
      const name = asString(p?.name) || "Page";
      const path = asString(p?.path) || "/";
      const purpose = asString(p?.purpose);
      const sections: any[] = Array.isArray(p?.sections) ? p.sections : [];
      const sectionLines = sections.slice(0, 14).map((s) => {
        const type = asString(s?.type) || "section";
        const heading = asString(s?.heading);
        const bullets = asStringList(s?.bullets).slice(0, 8);
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
  const imageryStyle = asStringList(imagery?.styleKeywords);
  const imagerySubjects = asStringList(imagery?.suggestedSubjects);
  const altRules = asStringList(imagery?.altTextRules);

  const ui = brief?.uiNotes || {};
  const uiComponents = asStringList(ui?.components);
  const uiInteractions = asStringList(ui?.interactions);
  const uiA11y = asStringList(ui?.accessibility);

  const seo = brief?.seo || {};
  const seoTitle = asString(seo?.titleTemplate);
  const seoDesc = asString(seo?.metaDescription);
  const seoKeywords = asStringList(seo?.keywords);

  return [
    intentLine,
    `Build intent: ${getBuildIntentIntro(resolvedIntent)}`,
    `Project: ${projectTitle}${brandName ? ` (${brandName})` : ""}`,
    pitch ? `One-sentence pitch: ${pitch}` : null,
    audience ? `Target audience: ${audience}` : null,
    cta ? `Primary CTA: ${cta}` : null,
    tone.length ? `Tone: ${tone.join(", ")}` : null,
    "",
    "Pages and information architecture:",
    pageLines || "- Home (/): include a hero, features, and a CTA.",
    "",
    "Visual direction:",
    styleKeywords.length ? `- Style keywords: ${styleKeywords.join(", ")}` : null,
    !themeLocked && palette?.primary ? `- Color palette: primary ${String(palette.primary)}` : null,
    typography?.headings || typography?.body
      ? `- Typography: headings ${String(typography.headings || "Inter")}, body ${String(typography.body || "Inter")}`
      : null,
    "",
    "Design guidance:",
    ...motionGuidance.map((line) => `- ${line}`),
    ...visualIdentityGuidance.map((line) => `- ${line}`),
    ...themeAccentLines.map(toBulletLine),
    ...themeTokenLines.map(toBulletLine),
    ...qualityGuidance.map((line) => `- ${line}`),
    "",
    imageGenerations
      ? "Imagery: v0 image generation is enabled — use AI-generated images wherever they add value. Do NOT use placeholder services (unsplash, picsum, placehold.co) when image generation is available. Use next/image for sizing, always include descriptive alt text, and never use blob: or data: URIs."
      : "Imagery: image generation is disabled — use high-quality stock images from Unsplash or Picsum as placeholders. Prioritize layout, typography, and iconography. Always include descriptive alt text.",
    imageryStyle.length ? `- Image style keywords: ${imageryStyle.join(", ")}` : null,
    imagerySubjects.length ? `- Suggested image subjects: ${imagerySubjects.join(", ")}` : null,
    altRules.length ? `- Alt text rules: ${altRules.join(" | ")}` : null,
    "",
    "UX & UI:",
    uiComponents.length ? `- Components: ${uiComponents.join(", ")}` : null,
    uiInteractions.length ? `- Interactions: ${uiInteractions.join(", ")}` : null,
    uiA11y.length ? `- Accessibility: ${uiA11y.join(", ")}` : null,
    "",
    "SEO:",
    seoTitle ? `- Title template: ${seoTitle}` : null,
    seoDesc ? `- Meta description: ${seoDesc}` : null,
    seoKeywords.length ? `- Keywords: ${seoKeywords.join(", ")}` : null,
    "",
    "Requirements:",
    "- Mobile-first and fully responsive",
    "- Accessible (semantic HTML, keyboard navigation, proper labels/alt text)",
    "- Fast and clean UI with motion that matches the requested tone; avoid distracting gimmicks",
    "- Use consistent spacing, typography scale, and component styling",
    "",
    `Original request (for reference): ${originalPrompt}`,
  ]
    .filter(Boolean)
    .join("\n");
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

  const pages: any[] = Array.isArray(brief.pages) ? brief.pages : [];
  const isSinglePage = pages.length === 1 && asString(pages[0]?.path) === "/";
  const pageLines = pages
    .slice(0, 8)
    .map((p) => {
      const name = asString(p?.name) || "Page";
      const path = asString(p?.path) || "/";
      const purpose = asString(p?.purpose);
      const sections: any[] = Array.isArray(p?.sections) ? p.sections : [];
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

  // Extract visual direction fields for dynamic guidance
  const styleKeywords = asStringList(brief?.visualDirection?.styleKeywords);
  const themeLocked = hasThemeOverride(themeOverride);
  const briefPalette: ColorPalette = themeLocked ? {} : (brief?.visualDirection?.colorPalette || {});
  const colorPalette: ColorPalette = themeLocked ? toColorPalette(themeOverride) : briefPalette;
  const themeAccentLines = themeLocked ? buildThemeAccentLines(themeOverride) : [];
  const themeTokenLines = themeLocked ? buildThemeTokenLines(themeOverride) : [];

  // Dynamic guidance adapted to the brief's tone, style, and palette
  const motionProfile = inferMotionProfile({
    prompt: originalPrompt,
    tone,
    styleKeywords,
    buildIntent,
    preferLively: true,
  });
  const motionGuidance = resolveMotionGuidance(tone, styleKeywords, "detailed", motionProfile);
  const visualIdentityGuidance = resolveVisualIdentityGuidance(
    colorPalette,
    styleKeywords,
    tone,
    "detailed",
    { themeLocked },
  );
  const richnessGuidance = resolveQualityBarGuidance(tone, styleKeywords, "detailed");
  const imageDensityGuidance = IMAGE_DENSITY_GUIDANCE;

  const parts: string[] = [
    "## Build Intent",
    ...intentLines.map((line) => `- ${line}`),
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

  parts.push("## Interaction & Motion", ...motionGuidance, "");
  parts.push(
    "## Visual Identity",
    ...visualIdentityGuidance,
    ...themeAccentLines,
    ...themeTokenLines,
    "",
  );
  parts.push("## Quality Bar", ...richnessGuidance, "");

  parts.push(
    "## Imagery",
    imageGenerations
      ? "v0 image generation is enabled — rely on AI-generated images as the primary source. Do NOT use placeholder services (unsplash, picsum, placehold.co) when image generation is available. Never use blob: or data: URIs."
      : "Image generation is disabled — use high-quality stock images from Unsplash or Picsum as placeholders.",
    "Always add descriptive alt text and optimize aspect ratios.",
    ...imageDensityGuidance.map((line) => `- ${line}`),
    ...(imageryNotes.length ? imageryNotes.map((note) => `- ${note}`) : []),
    "",
  );

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
  const formatted = formatPromptForV0(originalPrompt);
  const imageryLine = imageGenerations
    ? "v0 image generation is enabled — use AI-generated images as the primary source. Do NOT use placeholder services (unsplash, picsum). Never use blob: or data: URIs. Always include alt text."
    : "Image generation is disabled — use high-quality stock images (Unsplash/Picsum) with descriptive alt text.";
  const intentLines = getBuildIntentInstructionLines(buildIntent);
  const themeLocked = hasThemeOverride(themeOverride);
  const colorPalette = themeLocked ? toColorPalette(themeOverride) : {};
  const themeAccentLines = themeLocked ? buildThemeAccentLines(themeOverride) : [];
  const themeTokenLines = themeLocked ? buildThemeTokenLines(themeOverride) : [];

  // Infer tone and style from the raw prompt for dynamic guidance
  const promptStyles = extractKeywordMatches(originalPrompt, STYLE_KEYWORDS);
  const promptTone = extractKeywordMatches(originalPrompt, [
    "playful", "fun", "professional", "corporate", "luxury",
    "elegant", "minimal", "dramatic", "lekfull", "energetic",
  ] as const);
  const motionProfile = inferMotionProfile({
    prompt: originalPrompt,
    tone: promptTone,
    styleKeywords: promptStyles,
    buildIntent,
    preferLively: true,
  });

  return [
    "## Build Intent",
    ...intentLines.map((line) => `- ${line}`),
    "",
    "## Project Context",
    formatted || originalPrompt.trim(),
    "",
    "## Interaction & Motion",
    ...resolveMotionGuidance(promptTone, promptStyles, "compact", motionProfile),
    "",
    "## Visual Identity",
    ...resolveVisualIdentityGuidance(colorPalette, promptStyles, promptTone, "compact", {
      themeLocked,
    }),
    ...themeAccentLines,
    ...themeTokenLines,
    "",
    "## Quality Bar",
    ...resolveQualityBarGuidance(promptTone, promptStyles, "compact"),
    "",
    "## Imagery",
    imageryLine,
    ...IMAGE_DENSITY_GUIDANCE,
  ].join("\n");
}
