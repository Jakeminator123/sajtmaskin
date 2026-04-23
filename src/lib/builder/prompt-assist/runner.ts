/**
 * Top-level runners: `buildDynamicInstructionAddendumFromBrief` +
 * `buildDynamicInstructionAddendumFromPrompt`.
 *
 * Split out of `promptAssist.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "../build-intent";
import type { ThemeColors } from "../theme-presets";
import { inferDomain } from "../domain-inference";
import { SECTION_KEYWORDS, STYLE_KEYWORDS } from "../prompt-heuristics";
import {
  extractKeywordMatches,
  formatPrompt,
  getBuildIntentInstructionLines,
} from "./formatters";
import { resolveQualityBarGuidance } from "./theme-guidance";
import { buildPromptAssistObservations } from "./domain-hints";
import { buildSharedAddendumBlocks } from "./shared-addendum";

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
