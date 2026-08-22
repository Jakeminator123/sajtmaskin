/**
 * Consolidated sections:
 * - brief.ts
 * - visual-and-guidance.ts
 * - imagery-media-seo.ts
 *
 * Grouped during OMTAG-03 style refactor — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ThemeColors, ThemePalette } from "@/lib/builder/theme-presets";
import { isDomainProfile } from "@/lib/builder/domain-inference";
import { resolveGuidanceBlocks, type ColorPalette } from "../../guidance-resolvers";
import type { Brief, DesignReferenceAsset, MediaCatalogItem } from "../types";
import type { ShadcnUiRecipe } from "../../data/shadcn-ui-recipes";
import {
  isDesignAxisUnresolved,
  isDesignFieldUnresolved,
  type DesignExplicitField,
  type ResolvedDesignContract,
} from "../../design-contract";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

export function renderBriefBlocks(
  brief: Brief | null | undefined,
  resolvedDesign?: ResolvedDesignContract | null,
): string[] {
  if (!brief) return [];

  const parts: string[] = [];

  // ── Project Context (from brief) ────────────────────────────────────────
  const title = str(brief.projectTitle) || str(brief.siteName) || "Website";
  const brand = str(brief.brandName);
  const pitch = str(brief.oneSentencePitch) || str(brief.tagline);
  const audience = str(brief.targetAudience);
  const cta = str(brief.primaryCallToAction);
  const tone = resolvedDesign
    ? isDesignAxisUnresolved(resolvedDesign, "tone")
      ? []
      : resolvedDesign.toneAndVoice.value
    : strList(brief.toneAndVoice);

  const ctxLines: string[] = [`## Project Context`, "", `- **Title:** ${title}`];
  if (brand) ctxLines.push(`- **Brand:** ${brand}`);
  if (pitch) ctxLines.push(`- **Pitch:** ${pitch}`);
  if (audience) ctxLines.push(`- **Audience:** ${audience}`);
  if (cta) ctxLines.push(`- **Primary CTA:** ${cta}`);
  if (tone.length) ctxLines.push(`- **Tone:** ${tone.join(", ")}`);
  ctxLines.push("");

  parts.push(...ctxLines);

  // Pages & Sections — only when the brief carries section-level detail
  // that goes beyond what Route Plan already provides (path + name + intent).
  const pages = Array.isArray(brief.pages) ? brief.pages : [];
  const pagesWithSections = pages.filter(
    (p) => Array.isArray(p?.sections) && p.sections.length > 0,
  );
  if (pagesWithSections.length > 0) {
    parts.push("## Pages & Sections", "");
    for (const p of pagesWithSections.slice(0, 10)) {
      const name = str(p?.name) || "Page";
      const path = str(p?.path) || "/";
      const purpose = str(p?.purpose);
      parts.push(`- **${name}** (\`${path}\`)${purpose ? ` — ${purpose}` : ""}`);
      const sections = Array.isArray(p?.sections) ? p.sections : [];
      for (const s of sections.slice(0, 14)) {
        const type = str(s?.type) || "section";
        const heading = str(s?.heading);
        const bullets = strList(s?.bullets).slice(0, 8);
        const bulletText = bullets.length > 0 ? `: ${bullets.join("; ")}` : "";
        parts.push(`  - ${type}${heading ? ` — ${heading}` : ""}${bulletText}`);
      }
    }
    parts.push("");
  }

  // Must-have / avoid
  const mustHave = strList(brief.mustHave).slice(0, 10);
  const avoid = strList(brief.avoid).slice(0, 8);
  if (mustHave.length > 0) {
    parts.push("## Must Have", "", ...mustHave.map((m) => `- ${m}`), "");
  }
  if (avoid.length > 0) {
    parts.push("## Avoid", "", ...avoid.map((a) => `- ${a}`), "");
  }

  // UX & UI notes from brief
  const uiComponents = strList(brief.uiNotes?.components).slice(0, 16);
  const uiInteractions = strList(brief.uiNotes?.interactions).slice(0, 16);
  const uiAccessibility = strList(brief.uiNotes?.accessibility).slice(0, 16);
  if (uiComponents.length > 0 || uiInteractions.length > 0 || uiAccessibility.length > 0) {
    parts.push("## UX & UI Notes", "");
    if (uiComponents.length > 0) {
      parts.push("**Components:**", ...uiComponents.map((c) => `- ${c}`), "");
    }
    if (uiInteractions.length > 0) {
      parts.push("**Interactions:**", ...uiInteractions.map((i) => `- ${i}`), "");
    }
    if (uiAccessibility.length > 0) {
      parts.push("**Accessibility:**", ...uiAccessibility.map((a) => `- ${a}`), "");
    }
  }

  return parts;
}

export function renderBriefLockedDesignValuesBlock(params: {
  brief: Brief | null | undefined;
  themeOverride: ThemeColors | null | undefined;
}): string[] {
  const { brief, themeOverride } = params;
  if (!brief) return [];

  const styleKeywords = strList(brief.visualDirection?.styleKeywords).slice(0, 10);
  const tone = strList(brief.toneAndVoice).slice(0, 8);
  const qualityBar = str(brief.qualityBar);
  const motionLevel = str(brief.motionLevel);
  const palette = brief.visualDirection?.colorPalette;
  const typography = brief.visualDirection?.typography;
  const domainProfile = str(brief.domainProfile);
  const avoid = strList(brief.avoid).slice(0, 5);
  const mustHave = strList(brief.mustHave).slice(0, 5);
  const hasThemeOverride = Boolean(
    themeOverride?.primary || themeOverride?.secondary || themeOverride?.accent,
  );

  const hasBriefDesignSignal =
    styleKeywords.length > 0 ||
    tone.length > 0 ||
    qualityBar ||
    motionLevel ||
    palette?.primary ||
    palette?.secondary ||
    palette?.accent ||
    palette?.background ||
    palette?.text ||
    typography?.headings ||
    typography?.body ||
    domainProfile ||
    avoid.length > 0 ||
    mustHave.length > 0;

  if (!hasBriefDesignSignal) return [];

  const parts: string[] = [
    "## Brief-Locked Design Values",
    "",
    "These values are the highest design source for this generation after user-locked theme tokens. Use scaffold variant cues only as fallback or structural inspiration when they do not conflict.",
  ];

  if (hasThemeOverride) {
    parts.push(
      "- **User-locked theme tokens:** present; they override this block for exact color token values.",
    );
  }
  if (styleKeywords.length > 0) parts.push(`- **Visual direction:** ${styleKeywords.join(", ")}`);
  if (tone.length > 0) parts.push(`- **Tone:** ${tone.join(", ")}`);
  if (qualityBar) parts.push(`- **Quality bar:** ${qualityBar}`);
  if (motionLevel) parts.push(`- **Motion level:** ${motionLevel}`);
  if (palette) {
    const paletteParts = [
      palette.primary ? `primary ${palette.primary}` : null,
      palette.secondary ? `secondary ${palette.secondary}` : null,
      palette.accent ? `accent ${palette.accent}` : null,
      palette.background ? `background ${palette.background}` : null,
      palette.text ? `text ${palette.text}` : null,
    ].filter(Boolean);
    if (paletteParts.length > 0) parts.push(`- **Palette:** ${paletteParts.join(", ")}`);
  }
  if (typography?.headings || typography?.body) {
    parts.push(
      `- **Typography:** headings ${typography.headings || "system"}, body ${typography.body || "system"}`,
    );
  }
  if (domainProfile) parts.push(`- **Domain profile:** ${domainProfile}`);
  if (mustHave.length > 0) parts.push(`- **Must-have:** ${mustHave.join("; ")}`);
  if (avoid.length > 0) parts.push(`- **Avoid:** ${avoid.join("; ")}`);

  parts.push(
    "- **Rule:** Do not let scaffold variant theme tokens, font pairings, prompt hints, motifs, or anti-patterns weaken these values.",
    "- **Rule:** If the variant says dark/corporate/minimal but the brief says warm/editorial/lively/premium, follow the brief.",
    "",
  );
  return parts;
}

const RESOLVED_TOKEN_NAMES: Record<string, string> = {
  background: "--color-background",
  foreground: "--color-foreground",
  card: "--color-card",
  cardForeground: "--color-card-foreground",
  primary: "--color-primary",
  primaryForeground: "--color-primary-foreground",
  secondary: "--color-secondary",
  secondaryForeground: "--color-secondary-foreground",
  muted: "--color-muted",
  mutedForeground: "--color-muted-foreground",
  accent: "--color-accent",
  accentForeground: "--color-accent-foreground",
  border: "--color-border",
  ring: "--color-ring",
  radius: "--radius",
};

const UNRESOLVED_FIELD_TOKEN_KEYS: Record<DesignExplicitField, readonly string[]> = {
  "palette.primary": ["primary", "primaryForeground", "ring"],
  "palette.secondary": ["secondary", "secondaryForeground"],
  "palette.accent": ["accent", "accentForeground"],
  "palette.background": [
    "background",
    "card",
    "cardForeground",
    "muted",
    "mutedForeground",
    "border",
    "bodyBackgroundImage",
  ],
  "palette.text": [
    "foreground",
    "card",
    "cardForeground",
    "muted",
    "mutedForeground",
    "border",
    "primaryForeground",
    "secondaryForeground",
    "accentForeground",
  ],
  "typography.headings": [],
  "typography.body": [],
};

function unresolvedTokenKeys(design: ResolvedDesignContract): Set<string> {
  return new Set(
    (design.unresolvedFields ?? []).flatMap((field) => UNRESOLVED_FIELD_TOKEN_KEYS[field]),
  );
}

/** Render the canonical merge once; later blocks must not re-resolve precedence. */
export function renderResolvedDesignContractBlock(
  design: ResolvedDesignContract | null | undefined,
): string[] {
  if (!design) return [];
  const unresolved = new Set(design.unresolvedAxes ?? []);
  const source = (value: { source: string; locked: boolean }): string =>
    `${value.source}${value.locked ? ", locked" : ""}`;
  const parts = [
    "## Resolved Design Contract",
    "",
    "This is the final merged design authority for every resolved axis. Do not re-apply Brief/Variant precedence in later blocks.",
    `- **Variant:** ${design.variantId ? `\`${design.variantId}\`` : "none"}`,
    `- **Explicit user axes:** ${design.explicitAxes.length ? design.explicitAxes.join(", ") : "none"}`,
    `- **Explicit compound fields:** ${design.explicitFields.length ? design.explicitFields.join(", ") : "none"}`,
  ];
  if (unresolved.size > 0) {
    parts.push(
      `- **Current-request authority:** ${[...unresolved].join(", ")}. The current user message explicitly changes these axes; follow that message and the existing project files. Do not restore their cached values from this contract, Brief, or Variant.`,
    );
  }
  if ((design.unresolvedFields?.length ?? 0) > 0) {
    parts.push(
      `- **Current-request fields:** ${design.unresolvedFields!.join(", ")}. Their resulting values live in the current user message/project files; do not restore cached values for those fields or their derived companion tokens.`,
    );
  }
  if (!unresolved.has("style") && design.styleKeywords.value.length) {
    parts.push(
      `- **Visual direction** (${source(design.styleKeywords)}): ${design.styleKeywords.value.join(", ")}`,
    );
  }
  if (!unresolved.has("tone") && design.toneAndVoice.value.length) {
    parts.push(
      `- **Tone** (${source(design.toneAndVoice)}): ${design.toneAndVoice.value.join(", ")}`,
    );
  }
  if (!unresolved.has("color-mode") && design.colorMode.value) {
    parts.push(`- **Color mode** (${source(design.colorMode)}): ${design.colorMode.value}`);
  }
  if (!unresolved.has("typography")) {
    const typographyParts: string[] = [];
    if (
      !isDesignFieldUnresolved(design, "typography.headings") &&
      design.typography.heading.value
    ) {
      typographyParts.push(
        `heading ${design.typography.heading.value} (${source(design.typography.heading)})`,
      );
    }
    if (!isDesignFieldUnresolved(design, "typography.body") && design.typography.body.value) {
      typographyParts.push(
        `body ${design.typography.body.value} (${source(design.typography.body)})`,
      );
    }
    if (typographyParts.length > 0) parts.push(`- **Typography:** ${typographyParts.join("; ")}`);
  }
  if (!unresolved.has("motion") && design.motionLevel.value) {
    parts.push(`- **Motion** (${source(design.motionLevel)}): ${design.motionLevel.value}`);
  }
  if (!unresolved.has("quality") && design.qualityBar.value) {
    parts.push(`- **Quality** (${source(design.qualityBar)}): ${design.qualityBar.value}`);
  }
  if (design.domainProfile.value) {
    parts.push(
      `- **Domain profile** (${source(design.domainProfile)}): ${design.domainProfile.value}`,
    );
  }

  const delegatedTokenKeys = unresolvedTokenKeys(design);
  const tokenEntries = unresolved.has("palette")
    ? []
    : Object.entries(design.themeTokens).filter(
        ([key, value]) =>
          key !== "bodyBackgroundImage" && !delegatedTokenKeys.has(key) && Boolean(value?.value),
      );
  if (tokenEntries.length) {
    parts.push("- **Final theme tokens** (emit in `app/globals.css` inside `@theme inline`):");
    for (const [key, value] of tokenEntries) {
      if (!value) continue;
      parts.push(
        `  - **${RESOLVED_TOKEN_NAMES[key] ?? key}** (${source(value)}): \`${value.value}\``,
      );
    }
  }
  const bodyBackground = unresolved.has("palette")
    ? undefined
    : delegatedTokenKeys.has("bodyBackgroundImage")
      ? undefined
      : design.themeTokens.bodyBackgroundImage;
  if (bodyBackground?.value) {
    parts.push(
      `- **Body background recipe** (${source(bodyBackground)}; apply on \`body\`, outside \`@theme inline\`): \`${bodyBackground.value}\``,
    );
  }
  parts.push(
    "- **Rule:** Structural variant cues may shape composition, but may not replace a resolved value or an axis delegated to the current user message.",
    "",
  );
  return parts;
}

/**
 * Byggval "Färg": the chosen cluster's full surface palette, locked.
 *
 * Rendered as its own block rather than folded into Visual Identity because it
 * has to outrank a different source than that block does. Visual Identity locks
 * three brand colors; the scaffold variant meanwhile ships a complete
 * `themeTokens` set labelled "variant defaults", which is what previously
 * decided background, card and muted. Without an explicit supersede the user
 * could pick Tegelröd and still get the variant's neutral grey shell.
 */
export function renderLockedColorPaletteBlock(
  palette: ThemePalette | null | undefined,
  clusterLabel: string | null | undefined,
): string[] {
  if (!palette) return [];

  // Tailwind v4 `@theme inline` names color tokens `--color-*`, which is what
  // every scaffold's `app/globals.css` actually ships. Emitting the bare
  // `--background` form this block used to print would leave `bg-background` and
  // `text-foreground` unmapped, so a "locked" palette could silently not apply.
  const entries: Array<[string, string]> = [
    ["--color-background", palette.background],
    ["--color-foreground", palette.foreground],
    ["--color-card", palette.card],
    ["--color-card-foreground", palette.cardForeground],
    ["--color-primary", palette.primary],
    ["--color-primary-foreground", palette.primaryForeground],
    ["--color-secondary", palette.secondary],
    ["--color-secondary-foreground", palette.secondaryForeground],
    ["--color-muted", palette.muted],
    ["--color-muted-foreground", palette.mutedForeground],
    ["--color-accent", palette.accent],
    ["--color-accent-foreground", palette.accentForeground],
    ["--color-border", palette.border],
    ["--color-ring", palette.ring],
  ];

  return [
    "## Locked Color Palette",
    "",
    `The user picked this palette explicitly${clusterLabel ? ` (${clusterLabel})` : ""}. It is the highest color authority in this generation and **supersedes the Scaffold Variant theme tokens**.`,
    "",
    "- **Emit exactly these values in `app/globals.css` inside `@theme inline`:**",
    ...entries.map(([token, value]) => `  - ${token}: ${value}`),
    "",
    "- Keep the `--color-` prefix exactly as written: that is the Tailwind v4 form the scaffold uses, and it is what makes `bg-background`, `text-foreground` and `border-border` resolve.",
    "- Derive any additional shade from these values (e.g. `color-mix(in oklab, var(--color-primary) 12%, transparent)`) instead of introducing an unrelated hue.",
    "- Keep the variant's radius, typography, spacing rhythm and signature motifs — this block governs color only.",
    "- Do not fall back to a neutral grey surface: `--color-background` and `--color-card` above are the surface.",
    "",
  ];
}

export function renderVisualIdentityBlock(params: {
  themeOverride: ThemeColors | null | undefined;
  brief: Brief | null | undefined;
  designThemePreset: string | null | undefined;
  resolvedDesign?: ResolvedDesignContract | null;
}): string[] {
  const { themeOverride, brief, designThemePreset, resolvedDesign } = params;
  if (resolvedDesign) return [];
  const hasTheme =
    themeOverride && (themeOverride.primary || themeOverride.secondary || themeOverride.accent);
  const briefPalette = brief?.visualDirection?.colorPalette;
  const typography = brief?.visualDirection?.typography;
  const themePresetLabel = str(designThemePreset);

  if (!themePresetLabel && !hasTheme && !briefPalette && !typography) return [];

  const parts: string[] = ["## Visual Identity", ""];

  if (themePresetLabel) {
    parts.push(`- **Internal theme preset:** ${themePresetLabel}`);
  }

  if (hasTheme) {
    parts.push("- **Theme tokens (locked — use exactly these values):**");
    if (themeOverride!.primary) parts.push(`  - --primary: ${themeOverride!.primary}`);
    if (themeOverride!.secondary) parts.push(`  - --secondary: ${themeOverride!.secondary}`);
    if (themeOverride!.accent) parts.push(`  - --accent: ${themeOverride!.accent}`);
    parts.push(
      "- Apply these colors via Tailwind's semantic classes (`bg-primary`, `text-primary-foreground`, etc.).",
    );
  } else if (briefPalette?.primary) {
    parts.push(
      `- **Color palette:** primary ${briefPalette.primary}${briefPalette.secondary ? `, secondary ${briefPalette.secondary}` : ""}${briefPalette.accent ? `, accent ${briefPalette.accent}` : ""}`,
    );
  }

  if (typography?.headings || typography?.body) {
    parts.push(
      `- **Typography:** headings ${typography.headings || "system"}, body ${typography.body || "system"}`,
    );
  }

  parts.push("");
  return parts;
}

export function renderDesignReferencesBlock(
  designReferences: DesignReferenceAsset[] | undefined,
): string[] {
  if (!designReferences || designReferences.length === 0) return [];
  const parts: string[] = [
    "## Design References",
    "",
    "- Use attached design references as visual direction, not as an excuse to produce a flat screenshot clone.",
    "- Read references in this order: (1) structure and hierarchy, (2) spacing rhythm and alignment, (3) component vocabulary, (4) finishing details such as texture, glow, shadows, and gradients.",
    "- Preserve the strongest layout ideas from the references, but still produce clean React/Tailwind code with reusable sections and accessible markup.",
  ];
  for (const reference of designReferences.slice(0, 6)) {
    const note = reference.note ? ` — ${reference.note}` : "";
    parts.push(
      `- **${reference.kind === "figma" ? "Figma" : "Image"} reference:** ${reference.label}${note}`,
    );
  }
  parts.push("");
  return parts;
}

export function renderGuidanceBlocks(params: {
  userPrompt: string | undefined;
  intent: BuildIntent;
  brief: Brief | null | undefined;
  themeOverride: ThemeColors | null | undefined;
  toneKeywords: string[];
  styleKeywords: string[];
  resolvedDesign?: ResolvedDesignContract | null;
}): string[] {
  const { userPrompt, intent, brief, themeOverride, toneKeywords, styleKeywords, resolvedDesign } =
    params;
  // ── Guidance blocks (domain, motion, quality bar) ────────────────────────
  // Level 3 (INFERRED): guidance-resolvers provide deterministic heuristics.
  // Level 4 (DEFAULT): directive file text is used when resolvers have no signal.
  if (!userPrompt) return [];

  const briefPalette = resolvedDesign
    ? isDesignAxisUnresolved(resolvedDesign, "palette")
      ? null
      : {
          primary: isDesignFieldUnresolved(resolvedDesign, "palette.primary")
            ? undefined
            : resolvedDesign.themeTokens.primary?.value,
          secondary: isDesignFieldUnresolved(resolvedDesign, "palette.secondary")
            ? undefined
            : resolvedDesign.themeTokens.secondary?.value,
          accent: isDesignFieldUnresolved(resolvedDesign, "palette.accent")
            ? undefined
            : resolvedDesign.themeTokens.accent?.value,
          background: isDesignFieldUnresolved(resolvedDesign, "palette.background")
            ? undefined
            : resolvedDesign.themeTokens.background?.value,
          text: isDesignFieldUnresolved(resolvedDesign, "palette.text")
            ? undefined
            : resolvedDesign.themeTokens.foreground?.value,
        }
    : brief?.visualDirection?.colorPalette;
  const briefPaletteForGuidance: ColorPalette = briefPalette
    ? {
        primary: briefPalette.primary,
        secondary: briefPalette.secondary,
        accent: briefPalette.accent,
        background: briefPalette.background,
        text: briefPalette.text,
      }
    : {};
  const guidance = resolveGuidanceBlocks({
    userPrompt,
    buildIntent: intent,
    tone: toneKeywords,
    styleKeywords,
    briefPalette: briefPaletteForGuidance,
    themeOverride,
    topicSignal: [
      str(brief?.projectTitle),
      str(brief?.brandName),
      str(brief?.oneSentencePitch),
      userPrompt,
    ]
      .filter(Boolean)
      .join(" "),
    briefDomainProfile:
      resolvedDesign?.domainProfile.value ?? (str(brief?.domainProfile) || undefined),
    briefMotionLevel: resolvedDesign
      ? isDesignAxisUnresolved(resolvedDesign, "motion")
        ? undefined
        : (resolvedDesign.motionLevel.value ?? undefined)
      : brief?.motionLevel,
    briefQualityBar: resolvedDesign
      ? isDesignAxisUnresolved(resolvedDesign, "quality")
        ? undefined
        : (resolvedDesign.qualityBar.value ?? undefined)
      : brief?.qualityBar,
    briefSeasonalHints: brief?.seasonalHints?.filter(Boolean),
  });

  const parts: string[] = [];

  if (guidance.domainProfile !== "general") {
    const domainSource =
      brief?.domainProfile && isDomainProfile(brief.domainProfile)
        ? "from brief"
        : "inferred from prompt keywords";
    parts.push(
      "## Domain Inference",
      "",
      `- Domain profile (${domainSource}): **${guidance.domainProfile}**.`,
      "",
    );
  }
  if (guidance.domainStructureHints.length > 0) {
    parts.push("## Structure Hints", "", ...guidance.domainStructureHints.map((h) => `- ${h}`), "");
  }
  if (guidance.domainContractHints.length > 0) {
    parts.push(
      "## Contract & Backend Hints",
      "",
      ...guidance.domainContractHints.map((h) => `- ${h}`),
      "",
    );
  }
  parts.push("## Interaction & Motion", "", ...guidance.motionGuidance.map((g) => `- ${g}`), "");
  parts.push("## Quality Bar", "", ...guidance.qualityBarGuidance.map((g) => `- ${g}`), "");
  if (guidance.seasonalPaletteGuidance.length > 0) {
    parts.push(...guidance.seasonalPaletteGuidance.map((g) => `- ${g}`));
  }

  // ── Visual-design + content-voice live in static core ─────────────────
  // These were directive files (`config/prompt-directives/01-visual-design.md`
  // + `10-content-voice.md`) injected per-request via the now-removed
  // directive cascade. They never varied per request, so they are static
  // core fragments today (`config/prompt-core/03-visual-design.md` +
  // `04-coding-direction.md`) and load through `static-core-loader.ts`
  // alongside the behavioral and component contracts. Per-request signal
  // (brief, scaffold variant, guidance resolvers above) overrides them
  // through the `## Design Priority` hierarchy emitted earlier in the
  // dynamic context.

  return parts;
}

export function renderImageryBlock(params: {
  brief: Brief | null | undefined;
  styleKeywords: string[];
}): string[] {
  const { brief, styleKeywords } = params;
  // ── Imagery (brief-specific only) ──────────────────────────────────────
  // Exclude imagery.styleKeywords that already appear in visualDirection.styleKeywords
  // (those already feed Scaffold Variant selection). Keep only concrete image subjects/notes.
  if (!brief?.imagery) return [];
  const visualKwSet = new Set(styleKeywords.map((k) => k.toLowerCase()));
  const imgStyleKw = strList(brief.imagery.styleKeywords).filter(
    (k) => !visualKwSet.has(k.toLowerCase()),
  );
  const imgNotes = [
    ...imgStyleKw,
    ...strList(brief.imagery.suggestedSubjects),
    ...strList(brief.imagery.styleNotes),
  ].filter(Boolean);
  if (imgNotes.length === 0) return [];
  return ["## Imagery (from brief)", "", ...imgNotes.map((n) => `- ${n}`), ""];
}

export function renderMediaCatalogBlock(mediaCatalog: MediaCatalogItem[] | undefined): string[] {
  if (!mediaCatalog || mediaCatalog.length === 0) return [];
  const parts: string[] = [
    "## Media Catalog",
    "",
    "Use the following media assets by their alias. The aliases will be expanded to full URLs during post-processing.",
    "",
  ];
  for (const item of mediaCatalog.slice(0, 30)) {
    const altText = item.alt ? ` (${item.alt})` : "";
    parts.push(`- \`{{${item.alias}}}\`${altText}`);
  }
  parts.push("");
  return parts;
}

function summarizeImports(code: string): string[] {
  const imports = code
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("import "))
    .slice(0, 8);
  return imports.length > 0 ? imports : [];
}

function summarizeExports(code: string): string[] {
  return Array.from(
    new Set(
      Array.from(
        code.matchAll(/\bexport\s+(?:default\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g),
        (match) => match[1],
      ),
    ),
  ).slice(0, 8);
}

function excerptCode(code: string): string {
  const lines = code.split("\n");
  const clipLine = (line: string) =>
    line.length > 80 ? `${line.slice(0, 80)} // ... line truncated` : line;
  const importLines = lines
    .filter((line) => line.trim().startsWith("import "))
    .slice(0, 10)
    .map(clipLine);
  const bodyLines = lines
    .filter((line) => !line.trim().startsWith("import "))
    .slice(0, 32)
    .map(clipLine);
  const excerpt = [...importLines, "", ...bodyLines].join("\n").trim();
  return excerpt.length > 2_400 ? `${excerpt.slice(0, 2_400)}\n// ... truncated` : excerpt;
}

export function renderUiRecipesBlock(uiRecipes: ShadcnUiRecipe[] | undefined): string[] {
  if (!uiRecipes || uiRecipes.length === 0) return [];
  const parts: string[] = [
    "## UI Recipes",
    "",
    "Curated shadcn registry patterns for this request. Use them with `## Your Toolkit`: adapt the UX and imports to the generated project, but do not blindly paste entire blocks when a smaller composition is enough.",
    "",
  ];

  for (const recipe of uiRecipes.slice(0, 3)) {
    const deps = recipe.dependencies?.length ? recipe.dependencies.join(", ") : "";
    const registryDeps = recipe.registryDependencies?.length
      ? recipe.registryDependencies.join(", ")
      : "";
    const description = recipe.description ? ` — ${recipe.description}` : "";
    parts.push(
      `### ${recipe.title || recipe.name} (\`${recipe.name}\`)`,
      "",
      `- Source: ${recipe.source}; type: ${recipe.itemType}; reason: ${recipe.reason}.${description}`,
    );
    if (registryDeps) parts.push(`- Registry dependencies: ${registryDeps}.`);
    if (deps) parts.push(`- npm dependencies if used: ${deps}.`);

    const files = recipe.files.slice(0, 2);
    if (files.length > 0) {
      parts.push("- Useful file/API patterns:");
      for (const file of files) {
        const imports = summarizeImports(file.content);
        const exports = summarizeExports(file.content);
        const target = file.target ? ` → ${file.target}` : "";
        parts.push(`  - \`${file.path}\`${target}`);
        if (imports.length > 0) {
          parts.push(...imports.slice(0, 5).map((line) => `    - \`${line}\``));
        }
        if (exports.length > 0) {
          parts.push(`    - exports: ${exports.map((name) => `\`${name}\``).join(", ")}`);
        }
      }
      const primary = files[0];
      if (primary) {
        const fence = primary.path.endsWith(".json")
          ? "json"
          : primary.path.endsWith(".ts")
            ? "ts"
            : "tsx";
        parts.push("", `\`\`\`${fence} file="${primary.target || primary.path}"`);
        parts.push(excerptCode(primary.content));
        parts.push("```", "");
      }
    }
  }

  return parts;
}

export function renderSeoBlock(brief: Brief | null | undefined): string[] {
  if (!brief?.seo) return [];
  const seoTitle = str(brief.seo.titleTemplate);
  const seoDesc = str(brief.seo.metaDescription);
  const seoKw = strList(brief.seo.keywords);
  if (!seoTitle && !seoDesc && seoKw.length === 0) return [];
  const parts: string[] = ["## SEO", ""];
  if (seoTitle) parts.push(`- **Title template:** ${seoTitle}`);
  if (seoDesc) parts.push(`- **Meta description:** ${seoDesc}`);
  if (seoKw.length > 0) parts.push(`- **Keywords:** ${seoKw.join(", ")}`);
  parts.push("");
  return parts;
}
