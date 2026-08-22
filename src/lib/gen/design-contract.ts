import type { ScaffoldVariantThemeTokens } from "./scaffold-variants/types";

export const DESIGN_EXPLICIT_AXES = [
  "style",
  "tone",
  "color-mode",
  "palette",
  "typography",
  "motion",
  "quality",
] as const;

export type DesignExplicitAxis = (typeof DESIGN_EXPLICIT_AXES)[number];

/**
 * Compound Brief axes need field-level provenance because the structured
 * schema always fills every sibling value. Without this list, an explicit
 * accent request would incorrectly promote the Brief's invented primary,
 * background and typography defaults to user authority too.
 */
export const DESIGN_EXPLICIT_FIELDS = [
  "palette.primary",
  "palette.secondary",
  "palette.accent",
  "palette.background",
  "palette.text",
  "typography.headings",
  "typography.body",
] as const;

export type DesignExplicitField = (typeof DESIGN_EXPLICIT_FIELDS)[number];

export type ResolvedDesignSource =
  "user-locked" | "brief-explicit" | "brief-inferred" | "variant" | "default";

export interface ResolvedDesignValue<T> {
  value: T;
  source: ResolvedDesignSource;
  locked: boolean;
}

export type ResolvedThemeTokens = {
  [K in keyof ScaffoldVariantThemeTokens]?: ResolvedDesignValue<string>;
};

export const RESOLVED_THEME_TOKEN_KEYS = [
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
] as const satisfies readonly (keyof ScaffoldVariantThemeTokens)[];

/**
 * The single, already-merged design contract consumed by prompt rendering and
 * deterministic post-processing. Consumers must not re-apply Brief/Variant
 * precedence after this point.
 */
export interface ResolvedDesignContract {
  schemaVersion: 1;
  variantId: string | null;
  explicitAxes: DesignExplicitAxis[];
  /** Exact compound values constrained by the raw current user request. */
  explicitFields: DesignExplicitField[];
  /**
   * Axes explicitly changed by a follow-up whose exact resulting value lives
   * in the current user message/project files rather than in this snapshot.
   * Cached values remain for lineage only and must not be rendered as final.
   */
  unresolvedAxes?: DesignExplicitAxis[];
  /** Exact compound values delegated to current/project-file authority. */
  unresolvedFields?: DesignExplicitField[];
  styleKeywords: ResolvedDesignValue<string[]>;
  toneAndVoice: ResolvedDesignValue<string[]>;
  colorMode: ResolvedDesignValue<"light" | "dark" | "either" | null>;
  themeTokens: ResolvedThemeTokens;
  typography: {
    heading: ResolvedDesignValue<string | null>;
    body: ResolvedDesignValue<string | null>;
  };
  motionLevel: ResolvedDesignValue<"minimal" | "moderate" | "lively" | null>;
  qualityBar: ResolvedDesignValue<"clean" | "premium" | "bold-dramatic" | null>;
  domainProfile: ResolvedDesignValue<string | null>;
}

const RESOLVED_DESIGN_SOURCES = new Set<ResolvedDesignSource>([
  "user-locked",
  "brief-explicit",
  "brief-inferred",
  "variant",
  "default",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

type ParsedValue<T> = { ok: true; value: T } | { ok: false };

function parseResolvedValue<T>(
  input: unknown,
  parseValue: (value: unknown) => ParsedValue<T>,
): ResolvedDesignValue<T> | null {
  const raw = record(input);
  if (!raw || !RESOLVED_DESIGN_SOURCES.has(raw.source as ResolvedDesignSource)) return null;
  if (typeof raw.locked !== "boolean") return null;
  const parsed = parseValue(raw.value);
  if (!parsed.ok) return null;
  return {
    value: parsed.value,
    source: raw.source as ResolvedDesignSource,
    locked: raw.locked,
  };
}

const parsedString = (value: unknown): ParsedValue<string> =>
  typeof value === "string" ? { ok: true, value } : { ok: false };
const parsedStringArray = (value: unknown): ParsedValue<string[]> =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? { ok: true, value: [...value] }
    : { ok: false };
const parsedNullableString = (value: unknown): ParsedValue<string | null> =>
  value === null || typeof value === "string" ? { ok: true, value } : { ok: false };

function parsedNullableEnum<T extends string>(
  values: readonly T[],
): (value: unknown) => ParsedValue<T | null> {
  return (value) =>
    value === null || (typeof value === "string" && values.includes(value as T))
      ? { ok: true, value: value as T | null }
      : { ok: false };
}

/**
 * Parse the persisted wire shape without trusting an arbitrary DB snapshot.
 * Returns a defensive copy so follow-up resolution cannot mutate the prior
 * generation's in-memory snapshot.
 */
export function parseResolvedDesignContract(input: unknown): ResolvedDesignContract | null {
  const raw = record(input);
  if (!raw || raw.schemaVersion !== 1) return null;
  if (raw.variantId !== null && typeof raw.variantId !== "string") return null;
  if (
    !Array.isArray(raw.explicitAxes) ||
    !raw.explicitAxes.every(
      (axis) =>
        typeof axis === "string" && DESIGN_EXPLICIT_AXES.includes(axis as DesignExplicitAxis),
    )
  ) {
    return null;
  }
  if (
    raw.explicitFields !== undefined &&
    (!Array.isArray(raw.explicitFields) ||
      !raw.explicitFields.every(
        (field) =>
          typeof field === "string" &&
          DESIGN_EXPLICIT_FIELDS.includes(field as DesignExplicitField),
      ))
  ) {
    return null;
  }
  if (
    raw.unresolvedAxes !== undefined &&
    (!Array.isArray(raw.unresolvedAxes) ||
      !raw.unresolvedAxes.every(
        (axis) =>
          typeof axis === "string" && DESIGN_EXPLICIT_AXES.includes(axis as DesignExplicitAxis),
      ))
  ) {
    return null;
  }
  if (
    raw.unresolvedFields !== undefined &&
    (!Array.isArray(raw.unresolvedFields) ||
      !raw.unresolvedFields.every(
        (field) =>
          typeof field === "string" &&
          DESIGN_EXPLICIT_FIELDS.includes(field as DesignExplicitField),
      ))
  ) {
    return null;
  }

  const styleKeywords = parseResolvedValue(raw.styleKeywords, parsedStringArray);
  const toneAndVoice = parseResolvedValue(raw.toneAndVoice, parsedStringArray);
  const colorMode = parseResolvedValue(
    raw.colorMode,
    parsedNullableEnum(["light", "dark", "either"] as const),
  );
  const motionLevel = parseResolvedValue(
    raw.motionLevel,
    parsedNullableEnum(["minimal", "moderate", "lively"] as const),
  );
  const qualityBar = parseResolvedValue(
    raw.qualityBar,
    parsedNullableEnum(["clean", "premium", "bold-dramatic"] as const),
  );
  const domainProfile = parseResolvedValue(raw.domainProfile, parsedNullableString);
  const rawTypography = record(raw.typography);
  const heading = parseResolvedValue(rawTypography?.heading, parsedNullableString);
  const body = parseResolvedValue(rawTypography?.body, parsedNullableString);
  const rawTokens = record(raw.themeTokens);
  if (
    !styleKeywords ||
    !toneAndVoice ||
    !colorMode ||
    !motionLevel ||
    !qualityBar ||
    !domainProfile ||
    !rawTypography ||
    !heading ||
    !body ||
    !rawTokens
  ) {
    return null;
  }

  const themeTokens: ResolvedThemeTokens = {};
  for (const key of RESOLVED_THEME_TOKEN_KEYS) {
    if (!(key in rawTokens)) continue;
    const token = parseResolvedValue(rawTokens[key], parsedString);
    if (!token) return null;
    themeTokens[key] = token;
  }

  return {
    schemaVersion: 1,
    variantId: raw.variantId as string | null,
    explicitAxes: [...raw.explicitAxes] as DesignExplicitAxis[],
    explicitFields: Array.isArray(raw.explicitFields)
      ? ([...raw.explicitFields] as DesignExplicitField[])
      : [],
    ...(Array.isArray(raw.unresolvedAxes)
      ? { unresolvedAxes: [...raw.unresolvedAxes] as DesignExplicitAxis[] }
      : {}),
    ...(Array.isArray(raw.unresolvedFields)
      ? { unresolvedFields: [...raw.unresolvedFields] as DesignExplicitField[] }
      : {}),
    styleKeywords,
    toneAndVoice,
    colorMode,
    themeTokens,
    typography: { heading, body },
    motionLevel,
    qualityBar,
    domainProfile,
  };
}

export function isDesignAxisUnresolved(
  design: ResolvedDesignContract | null | undefined,
  axis: DesignExplicitAxis,
): boolean {
  return design?.unresolvedAxes?.includes(axis) === true;
}

export function isDesignFieldUnresolved(
  design: ResolvedDesignContract | null | undefined,
  field: DesignExplicitField,
): boolean {
  return design?.unresolvedFields?.includes(field) === true;
}
