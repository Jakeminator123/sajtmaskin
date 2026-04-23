/**
 * Motion profile inference + motion guidance resolver (with keyword banks).
 *
 * Split out of `promptAssist.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "../build-intent";
import { extractKeywordMatches, hasAny } from "./formatters";

export type MotionProfile = "static" | "balanced" | "lively";

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
