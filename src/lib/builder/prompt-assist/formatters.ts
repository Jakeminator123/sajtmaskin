/**
 * Prompt formatting + keyword extraction + build-intent helpers.
 *
 * Split out of `promptAssist.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { BuildIntent } from "../build-intent";
import { BUILD_INTENT_GUIDANCE } from "@/lib/gen/intent-guidance";

export function resolveBuildIntent(intent?: BuildIntent | null): BuildIntent {
  if (intent === "template" || intent === "app" || intent === "website") return intent;
  return "website";
}

export function getBuildIntentInstructionLines(intent?: BuildIntent | null): string[] {
  const resolved = resolveBuildIntent(intent);
  return BUILD_INTENT_GUIDANCE[resolved].instructionLines;
}

export function hasAny(list: readonly string[], keywords: readonly string[]): boolean {
  const lower = list.map((s) => s.toLowerCase());
  return keywords.some((k) => lower.some((l) => l.includes(k)));
}

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

export function extractKeywordMatches(value: string, keywords: readonly string[]): string[] {
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
