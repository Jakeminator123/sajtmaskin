import type { BuildIntent } from "./build-intent";
import type { ThemeColors } from "./theme-presets";
import { type DomainProfile, inferDomain } from "./domain-inference";
import { SECTION_KEYWORDS, STYLE_KEYWORDS } from "./prompt-heuristics";
import { BUILD_INTENT_GUIDANCE } from "@/lib/gen/intent-guidance";
import {
  buildDomainContractHints,
  buildDomainStructureHints,
  inferMotionProfile,
  resolveMotionGuidance,
  resolveQualityBarGuidance,
} from "@/lib/gen/guidance-resolvers";

// Re-exported so existing callers keep working. Canonical source:
// `./prompt-assist-models.ts`.
export {
  ANTHROPIC_ASSIST_MODELS,
  ASSIST_MODELS,
  isAnthropicAssistModel,
  isOpenAIAssistModel,
  isPromptAssistModelAllowed,
  isPromptAssistOff,
  normalizeAssistModel,
  resolvePromptAssistProvider,
  type PromptAssistProvider,
} from "./prompt-assist-models";

// SECTION_KEYWORDS and STYLE_KEYWORDS imported from prompt-heuristics.ts
// Motion keyword banks (static/lively/strict) and MotionProfile type live in
// guidance-resolvers.ts — guidance helpers are imported at the top.

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

const IMAGE_DENSITY_GUIDANCE = [
  "Images in hero + at least 2 additional sections.",
  "Consistent aspect ratios and professional cropping throughout.",
];

// Domain profile is now provided by domain-inference.ts (canonical source).
// buildDomainStructureHints / buildDomainContractHints remain here because
// they produce prompt text specific to the addendum format.

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

export function buildRewriteSystemPrompt(params: {
  codeContext?: string | null;
  buildIntent?: BuildIntent;
} = {}): string {
  const intentLine = getBuildIntentIntro(params.buildIntent);
  const base =
    "You are a prompt engineer for a code generation engine that builds Next.js + React + Tailwind CSS websites and apps. " +
    "Rewrite the user request into a single, concrete, high-quality build prompt. " +
    "Be specific about layout, sections, components, and visual direction. " +
    "Keep it concise and avoid extra commentary. " +
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

export function buildPolishSystemPrompt(params: {
  buildIntent?: BuildIntent;
  forceEnglish?: boolean;
} = {}): string {
  const intentLine = getBuildIntentIntro(params.buildIntent);
  const languageRule = params.forceEnglish
    ? "Rewrite in English."
    : "Keep the original language. Only translate to English if the user explicitly asks for it.";
  return (
    "You are a meticulous copy editor for code generation prompts. " +
    "Polish the user's request with minimal changes: fix spelling, grammar, punctuation, and clarity. " +
    "Do NOT add new requirements, sections, or features. " +
    "Preserve meaning and keep length roughly the same. " +
    `${languageRule} ` +
    "Output ONLY the polished prompt.\n\n" +
    `Build intent: ${intentLine}`
  );
}

// Brief is intentionally loose (LLM JSON); narrow at use sites with helpers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
type Brief = any;

export function buildPromptFromBrief(params: {
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

  const pages: Brief[] = Array.isArray(brief.pages) ? brief.pages : [];
  const pageLines = pages
    .slice(0, 10)
    .map((p) => {
      const name = asString(p?.name) || "Page";
      const path = asString(p?.path) || "/";
      const purpose = asString(p?.purpose);
      const sections: Brief[] = Array.isArray(p?.sections) ? p.sections : [];
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
      ? "Imagery: image generation is enabled — use AI-generated images wherever they add value. When no AI images are provided, use real Unsplash photos that directly depict the site topic (format: https://images.unsplash.com/photo-{ID}?w={W}&h={H}&fit=crop&q=80). Hero MUST have a large image. NEVER use generic stock photos. Use next/image for sizing, always include descriptive alt text, and never use blob: or data: URIs."
      : "Imagery: image generation is disabled — use /placeholder.svg?height=H&width=W for all images. Prioritize layout, typography, and iconography. Always include descriptive alt text.",
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
    "- Mobile-first, fully responsive (sm/md/lg/xl breakpoints)",
    "- Accessible: semantic HTML, keyboard nav, proper labels/alt text, WCAG AA contrast",
    "- Clean UI with motion matching the requested tone — no distracting gimmicks",
    "- Consistent spacing, typography scale, and component styling across all pages",
    "- Complete, deployable code — no placeholders, TODOs, or broken references",
    "",
    `Original request (for reference): ${originalPrompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

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
