import fs from "node:fs";
import path from "node:path";

import { getScaffoldIds } from "../scaffolds";
import type { ScaffoldId } from "../scaffolds/types";
import type {
  FontPairing,
  ScaffoldVariant,
  ScaffoldVariantSignaturePatterns,
  ScaffoldVariantThemeTokens,
} from "./types";

const VARIANTS_ROOT = path.join(process.cwd(), "config", "scaffold-variants");

let cachedVariants: ScaffoldVariant[] | null = null;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

function readFontPairings(value: unknown): FontPairing[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const entry = item as { heading?: unknown; body?: unknown };
      const heading = readString(entry?.heading);
      const body = readString(entry?.body);
      if (!heading || !body) return null;
      return { heading, body };
    })
    .filter((item): item is FontPairing => Boolean(item));
}

function readSignaturePatterns(
  value: unknown,
): ScaffoldVariantSignaturePatterns | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const layouts = readStringArray(raw.layouts);
  const motifs = readStringArray(raw.motifs);
  const antiPatterns = readStringArray(raw.antiPatterns);
  if (layouts.length === 0 && motifs.length === 0 && antiPatterns.length === 0) {
    return undefined;
  }
  return { layouts, motifs, antiPatterns };
}

function readThemeTokens(value: unknown): ScaffoldVariantThemeTokens | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const parsed: ScaffoldVariantThemeTokens = {};
  for (const key of [
    "background",
    "foreground",
    "card",
    "cardForeground",
    "primary",
    "primaryForeground",
    "secondary",
    "secondaryForeground",
    "muted",
    "mutedForeground",
    "accent",
    "accentForeground",
    "border",
    "ring",
    "radius",
    "bodyBackgroundImage",
  ] as const) {
    const value = readString(raw[key]);
    if (value) {
      parsed[key] = value;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseVariant(filePath: string, expectedScaffoldId: ScaffoldId): ScaffoldVariant {
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`[scaffold-variants] Could not parse ${filePath}: ${reason}`);
  }

  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    throw new Error(`[scaffold-variants] ${filePath} must contain a JSON object.`);
  }

  const raw = rawJson as Record<string, unknown>;
  const id = readString(raw.id);
  const scaffoldId = readString(raw.scaffoldId) as ScaffoldId | null;
  const label = readString(raw.label);
  const signatureMotif = readString(raw.signatureMotif);
  const colorMode = readString(raw.colorMode);

  if (!id || !label || !scaffoldId || !signatureMotif || !colorMode) {
    throw new Error(
      `[scaffold-variants] ${filePath} is missing one of: id, scaffoldId, label, signatureMotif, colorMode.`,
    );
  }

  if (scaffoldId !== expectedScaffoldId) {
    throw new Error(
      `[scaffold-variants] ${filePath} scaffoldId=${scaffoldId} does not match directory ${expectedScaffoldId}.`,
    );
  }

  if (!["light", "dark", "either"].includes(colorMode)) {
    throw new Error(
      `[scaffold-variants] ${filePath} colorMode must be "light", "dark", or "either".`,
    );
  }

  return {
    id,
    scaffoldId,
    label,
    description: readString(raw.description) ?? undefined,
    keywords: readStringArray(raw.keywords),
    fontPairings: readFontPairings(raw.fontPairings),
    signatureMotif,
    colorMode: colorMode as ScaffoldVariant["colorMode"],
    promptHints: readStringArray(raw.promptHints),
    signaturePatterns: readSignaturePatterns(raw.signaturePatterns),
    themeTokens: readThemeTokens(raw.themeTokens),
    sourceTemplateIds: readStringArray(raw.sourceTemplateIds),
    default: Boolean(raw.default),
  };
}

function loadVariants(): ScaffoldVariant[] {
  if (cachedVariants) return cachedVariants;
  if (!fs.existsSync(VARIANTS_ROOT)) {
    cachedVariants = [];
    return cachedVariants;
  }

  const scaffoldIds = new Set(getScaffoldIds());
  const variants: ScaffoldVariant[] = [];

  for (const scaffoldEntry of fs.readdirSync(VARIANTS_ROOT, { withFileTypes: true })) {
    if (!scaffoldEntry.isDirectory()) continue;
    if (!scaffoldIds.has(scaffoldEntry.name as ScaffoldId)) continue;
    const scaffoldId = scaffoldEntry.name as ScaffoldId;
    const scaffoldDir = path.join(VARIANTS_ROOT, scaffoldId);
    const files = fs
      .readdirSync(scaffoldDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    for (const fileName of files) {
      variants.push(parseVariant(path.join(scaffoldDir, fileName), scaffoldId));
    }
  }

  cachedVariants = variants;
  return cachedVariants;
}

export function getVariantsForScaffold(scaffoldId: ScaffoldId | null | undefined): ScaffoldVariant[] {
  if (!scaffoldId) return [];
  return loadVariants().filter((variant) => variant.scaffoldId === scaffoldId);
}

export function getVariantById(
  scaffoldId: ScaffoldId | null | undefined,
  variantId: string | null | undefined,
): ScaffoldVariant | null {
  if (!scaffoldId || !variantId) return null;
  return (
    loadVariants().find(
      (variant) => variant.scaffoldId === scaffoldId && variant.id === variantId,
    ) ?? null
  );
}

/**
 * Plan 11 / open-question #8: deterministic fallback variant when a
 * follow-up has lost its `priorVariantId` (snapshot persisted before
 * variant tracking landed, or stale snapshot merged with `null`).
 *
 * Returns:
 *   1. The variant flagged `default: true` for the scaffold, if any.
 *   2. Otherwise, the first variant in registry-sorted order (alphabetic
 *      filename) — guarantees a stable pick across requests.
 *   3. `null` only when the scaffold has zero variants registered.
 *
 * Used by {@link lockedVariantForFollowUp} to avoid releasing the
 * matcher into a fresh embedding pick on follow-ups, which used to
 * flip `corporate-grid → warm-local` mid-chat.
 */
export function getDefaultVariantForScaffold(
  scaffoldId: ScaffoldId | null | undefined,
): ScaffoldVariant | null {
  if (!scaffoldId) return null;
  const variants = getVariantsForScaffold(scaffoldId);
  if (variants.length === 0) return null;
  const explicit = variants.find((variant) => variant.default === true);
  if (explicit) return explicit;
  return variants[0]!;
}

