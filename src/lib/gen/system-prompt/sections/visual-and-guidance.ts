/**
 * Visual Identity + Design References + guidance blocks (domain, motion,
 * quality, seasonal).
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import { resolveGuidanceBlocks, type ColorPalette } from "../../guidance-resolvers";
import type { Brief, DesignReferenceAsset } from "../types";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}

export function renderVisualIdentityBlock(params: {
  themeOverride: ThemeColors | null | undefined;
  brief: Brief | null | undefined;
  designThemePreset: string | null | undefined;
}): string[] {
  const { themeOverride, brief, designThemePreset } = params;
  const hasTheme = themeOverride && (themeOverride.primary || themeOverride.secondary || themeOverride.accent);
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
    parts.push("- Apply these colors via Tailwind's semantic classes (`bg-primary`, `text-primary-foreground`, etc.).");
  } else if (briefPalette?.primary) {
    parts.push(`- **Color palette:** primary ${briefPalette.primary}${briefPalette.secondary ? `, secondary ${briefPalette.secondary}` : ""}${briefPalette.accent ? `, accent ${briefPalette.accent}` : ""}`);
  }

  if (typography?.headings || typography?.body) {
    parts.push(`- **Typography:** headings ${typography.headings || "system"}, body ${typography.body || "system"}`);
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
    parts.push(`- **${reference.kind === "figma" ? "Figma" : "Image"} reference:** ${reference.label}${note}`);
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
}): string[] {
  const { userPrompt, intent, brief, themeOverride, toneKeywords, styleKeywords } = params;
  // ── Guidance blocks (domain, motion, quality bar) ────────────────────────
  // Level 3 (INFERRED): guidance-resolvers provide deterministic heuristics.
  // Level 4 (DEFAULT): directive file text is used when resolvers have no signal.
  if (!userPrompt) return [];

  const briefPalette = brief?.visualDirection?.colorPalette;
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
    briefDomainProfile: str(brief?.domainProfile) || undefined,
    briefMotionLevel: brief?.motionLevel,
    briefQualityBar: brief?.qualityBar,
    briefSeasonalHints: brief?.seasonalHints?.filter(Boolean),
  });

  const parts: string[] = [];

  if (guidance.domainProfile !== "general") {
    const domainSource = brief?.domainProfile
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
    parts.push(
      "## Structure Hints",
      "",
      ...guidance.domainStructureHints.map((h) => `- ${h}`),
      "",
    );
  }
  if (guidance.domainContractHints.length > 0) {
    parts.push(
      "## Contract & Backend Hints",
      "",
      ...guidance.domainContractHints.map((h) => `- ${h}`),
      "",
    );
  }
  parts.push(
    "## Interaction & Motion",
    "",
    ...guidance.motionGuidance.map((g) => `- ${g}`),
    "",
  );
  parts.push(
    "## Quality Bar",
    "",
    ...guidance.qualityBarGuidance.map((g) => `- ${g}`),
    "",
  );
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
