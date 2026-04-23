/**
 * `buildSharedAddendumBlocks` — the shared addendum skeleton used by both
 * brief-driven and prompt-driven instruction addendums.
 *
 * Split out of `promptAssist.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "../build-intent";
import type { ThemeColors } from "../theme-presets";
import { inferDomain } from "../domain-inference";
import {
  buildDomainContractHints,
  buildDomainStructureHints,
} from "./domain-hints";
import { inferMotionProfile, resolveMotionGuidance } from "./motion-guidance";
import {
  IMAGE_DENSITY_GUIDANCE,
  buildThemeAccentLines,
  buildThemeTokenLines,
  getSubjectPaletteGuidance,
  hasThemeOverride,
  isSeasonalOrCulturalTopic,
  resolveVisualIdentityGuidance,
  toColorPalette,
  type ColorPalette,
} from "./theme-guidance";

export function buildSharedAddendumBlocks(params: {
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
