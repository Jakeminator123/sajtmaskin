import type { ThemeColors, ThemePalette } from "@/lib/builder/theme-presets";
import {
  DESIGN_EXPLICIT_AXES,
  DESIGN_EXPLICIT_FIELDS,
  parseResolvedDesignContract,
} from "../design-contract";
import type {
  DesignExplicitAxis,
  DesignExplicitField,
  ResolvedDesignContract,
  ResolvedDesignSource,
  ResolvedDesignValue,
  ResolvedThemeTokens,
} from "../design-contract";
import type { ScaffoldVariant, ScaffoldVariantThemeTokens } from "../scaffold-variants";
import type { Brief } from "../system-prompt";
import { resolveVariantBodyBackgroundImage } from "../system-prompt/theme-token";

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolved<T>(
  value: T,
  source: ResolvedDesignSource,
  locked = source === "user-locked" || source === "brief-explicit",
): ResolvedDesignValue<T> {
  return { value, source, locked };
}

function isMotionLevel(value: unknown): value is "minimal" | "moderate" | "lively" {
  return value === "minimal" || value === "moderate" || value === "lively";
}

function isQualityBar(value: unknown): value is "clean" | "premium" | "bold-dramatic" {
  return value === "clean" || value === "premium" || value === "bold-dramatic";
}

function isColorMode(value: unknown): value is "light" | "dark" | "either" {
  return value === "light" || value === "dark" || value === "either";
}

function copyVariantTokens(variant: ScaffoldVariant | null): ResolvedThemeTokens {
  const result: ResolvedThemeTokens = {};
  if (!variant?.themeTokens) return result;
  for (const [key, value] of Object.entries(variant.themeTokens) as Array<
    [keyof ScaffoldVariantThemeTokens, string | undefined]
  >) {
    const normalized = stringValue(value);
    if (normalized) result[key] = resolved(normalized, "variant");
  }
  if (!result.bodyBackgroundImage) {
    const backgroundImage = resolveVariantBodyBackgroundImage(variant);
    if (backgroundImage) result.bodyBackgroundImage = resolved(backgroundImage, "variant");
  }
  return result;
}

function applyToken(
  tokens: ResolvedThemeTokens,
  key: keyof ScaffoldVariantThemeTokens,
  value: unknown,
  source: ResolvedDesignSource,
  allowOverride: boolean,
): void {
  const normalized = stringValue(value);
  if (!normalized || (!allowOverride && tokens[key])) return;
  tokens[key] = resolved(normalized, source);
}

function applyThemePalette(tokens: ResolvedThemeTokens, palette: ThemePalette): void {
  for (const [key, value] of Object.entries(palette) as Array<[keyof ThemePalette, string]>) {
    tokens[key] = resolved(value, "user-locked");
  }
}

function relativeLuminanceChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** Parse the common CSS forms emitted by Brief. OKLCH L is a safe polarity proxy. */
function cssLightness(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "black") return 0;
  if (normalized === "white") return 1;

  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((char) => char + char).join("") : hex;
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    return (
      0.2126 * relativeLuminanceChannel(red) +
      0.7152 * relativeLuminanceChannel(green) +
      0.0722 * relativeLuminanceChannel(blue)
    );
  }

  const rgb = normalized.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/,
  );
  if (rgb) {
    const red = Math.min(255, Number(rgb[1]));
    const green = Math.min(255, Number(rgb[2]));
    const blue = Math.min(255, Number(rgb[3]));
    return (
      0.2126 * relativeLuminanceChannel(red) +
      0.7152 * relativeLuminanceChannel(green) +
      0.0722 * relativeLuminanceChannel(blue)
    );
  }

  const oklch = normalized.match(/^oklch\(\s*(\d+(?:\.\d+)?)(%?)/);
  if (oklch) {
    const lightness = Number(oklch[1]);
    return oklch[2] === "%" ? lightness / 100 : lightness;
  }
  return null;
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Deterministic high-contrast companion for an explicitly replaced base color. */
function readableForeground(base: string, preferred: string | null): string {
  const baseLightness = cssLightness(base);
  if (baseLightness === null) return preferred ?? "#ffffff";
  const preferredLightness = preferred ? cssLightness(preferred) : null;
  if (
    preferred &&
    preferredLightness !== null &&
    contrastRatio(baseLightness, preferredLightness) >= 4.5
  ) {
    return preferred;
  }
  const light = 1;
  const dark = cssLightness("#111111")!;
  return contrastRatio(baseLightness, light) >= contrastRatio(baseLightness, dark)
    ? "#ffffff"
    : "#111111";
}

function refreshColorCompanion(
  tokens: ResolvedThemeTokens,
  baseKey: "primary" | "secondary" | "accent",
  foregroundKey: "primaryForeground" | "secondaryForeground" | "accentForeground",
  source: ResolvedDesignSource,
): void {
  const base = tokens[baseKey]?.value;
  if (!base) return;
  tokens[foregroundKey] = resolved(
    readableForeground(base, tokens.foreground?.value ?? null),
    source,
  );
}

function refreshSurfaceTokens(tokens: ResolvedThemeTokens, source: ResolvedDesignSource): void {
  const background = tokens.background?.value;
  const foreground = tokens.foreground?.value;
  if (!background || !foreground) return;
  tokens.card = resolved(background, source);
  tokens.cardForeground = resolved(foreground, source);
  tokens.muted = resolved(`color-mix(in oklab, ${background} 92%, ${foreground})`, source);
  tokens.mutedForeground = resolved(
    `color-mix(in oklab, ${foreground} 68%, ${background})`,
    source,
  );
  tokens.border = resolved(`color-mix(in oklab, ${foreground} 18%, ${background})`, source);
}

function applyBrandColorOverrides(
  tokens: ResolvedThemeTokens,
  colors: ThemeColors,
  source: ResolvedDesignSource,
): void {
  applyToken(tokens, "primary", colors.primary, source, true);
  applyToken(tokens, "secondary", colors.secondary, source, true);
  applyToken(tokens, "accent", colors.accent, source, true);
  refreshColorCompanion(tokens, "primary", "primaryForeground", source);
  refreshColorCompanion(tokens, "secondary", "secondaryForeground", source);
  refreshColorCompanion(tokens, "accent", "accentForeground", source);
  if (tokens.primary?.value) tokens.ring = resolved(tokens.primary.value, source);
}

export interface ResolveDesignContractInput {
  brief: Brief | null | undefined;
  variant: ScaffoldVariant | null;
  /** Frozen canonical baseline from an accepted follow-up parent version. */
  priorResolvedDesign?: ResolvedDesignContract | null;
  /** Axes the raw current follow-up explicitly asks to change. */
  currentRequestAxes?: DesignExplicitAxis[];
  /** Exact compound fields the raw follow-up asks to change. */
  currentRequestFields?: DesignExplicitField[];
  themeOverride?: ThemeColors | null;
  lockedColorPalette?: ThemePalette | null;
  colorModeHint?: "light" | "dark" | null;
  styleKeywordsHint?: string[];
  toneKeywordsHint?: string[];
}

const FOLLOW_UP_AXIS_PATTERNS: ReadonlyArray<{
  axes: readonly DesignExplicitAxis[];
  pattern: RegExp;
}> = [
  {
    axes: ["color-mode", "palette"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:gör|make)\s+(?:(?:hela\s+)?(?:sajten|sidan|designen|utseendet)|den|det|it|the\s+(?:site|page|design|look))\s+(?:mörk(?:are)?|ljus(?:are)?|dark(?:er)?|light(?:er)?)(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["color-mode", "palette"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:dark\s+(?:mode|theme)|light\s+(?:mode|theme)|mörk(?:t|are)?\s+(?:läge|tema|design)|ljus(?:t|are)?\s+(?:läge|tema|design))(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["palette"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:färg(?:en|er|erna)?|kulör(?:en|er)?|palett(?:en)?|bakgrund(?:en|sfärg)?|primärfärg|sekundärfärg|accent(?:en|färg)?|color|colour|palette|background(?:\s+color)?|foreground|primary\s+color|secondary\s+color|accent\s+color|#[0-9a-f]{3,8}|oklch|rgba?)(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["typography"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:typsnitt(?:et)?|typografi(?:n)?|rubrikfont(?:en)?|brödtextfont(?:en)?|font(?:en|er|erna)?|font\s+family|typeface|typography)(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["style", "palette"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:(?:gör|ge|ändra|make)\s+(?:sajten|sidan|designen|utseendet|den|det|it|the\s+(?:site|page|design|look))\s+(?:mer|more)?\s*(?:varm(?:are)?|warmer))(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["style"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:stil(?:en)?|designspråk(?:et)?|visuellt\s+uttryck|style|look\s+and\s+feel|visual\s+direction)(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["style"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:(?:gör|ge|ändra|make)\s+(?:sajten|sidan|designen|utseendet|den|det|the\s+(?:site|page|design|look))\s+(?:mer|more)?\s*(?:minimalistisk(?:t)?|lekfull(?:t)?|varm(?:are)?|modern(?:are)?|redaktionell(?:t)?|brutalistisk(?:t)?|futuristisk(?:t)?|lyxig(?:t)?|elegant|organisk(?:t)?|minimal|playful|warmer|editorial|brutalist|futuristic|luxurious|organic))(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["tone"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:ton(?:en|läge)?|copyröst(?:en)?|tilltal(?:et)?|tone|voice|brand\s+voice)(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["motion"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:animation(?:er|en)?|animer(?:a|ad|ing)|rörelse(?:r|n)?|parallax|motion|transition(?:s)?)(?![\p{L}\p{N}_])/iu,
  },
  {
    axes: ["quality"],
    pattern:
      /(?<![\p{L}\p{N}_])(?:kvalitet(?:en)?|premium|polerad|världsklass|cinematisk|quality|world[ -]?class|cinematic)(?![\p{L}\p{N}_])/iu,
  },
];

/** Deterministic ownership detector; it identifies axes, never invents values. */
export function detectFollowUpDesignAxes(prompt: string | null | undefined): DesignExplicitAxis[] {
  const text = stringValue(prompt);
  if (!text) return [];
  return dedupe(
    FOLLOW_UP_AXIS_PATTERNS.flatMap(({ axes, pattern }) => (pattern.test(text) ? [...axes] : [])),
  ) as DesignExplicitAxis[];
}

const FOLLOW_UP_FIELD_PATTERNS: ReadonlyArray<{
  field: DesignExplicitField;
  pattern: RegExp;
}> = [
  {
    field: "palette.primary",
    pattern:
      /(?<![\p{L}\p{N}_])(?:primärfärg(?:en)?|primary\s+(?:color|colour))(?![\p{L}\p{N}_])/iu,
  },
  {
    field: "palette.secondary",
    pattern:
      /(?<![\p{L}\p{N}_])(?:sekundärfärg(?:en)?|secondary\s+(?:color|colour))(?![\p{L}\p{N}_])/iu,
  },
  {
    field: "palette.accent",
    pattern:
      /(?<![\p{L}\p{N}_])(?:accent(?:en|färg(?:en)?)?|accent\s+(?:color|colour))(?![\p{L}\p{N}_])/iu,
  },
  {
    field: "palette.background",
    pattern:
      /(?<![\p{L}\p{N}_])(?:bakgrund(?:en|sfärg(?:en)?)?|background(?:\s+(?:color|colour))?)(?![\p{L}\p{N}_])/iu,
  },
  {
    field: "palette.text",
    pattern:
      /(?<![\p{L}\p{N}_])(?:textfärg(?:en)?|förgrund(?:en|sfärg(?:en)?)?|text\s+(?:color|colour)|foreground)(?![\p{L}\p{N}_])/iu,
  },
  {
    field: "typography.headings",
    pattern:
      /(?<![\p{L}\p{N}_])(?:rubrik(?:font|typsnitt)(?:en|et)?|heading(?:s)?\s+(?:font|typeface)|(?:använd|use|byt\s+till|switch\s+to)\s+["']?[\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+)?["']?\s+(?:i|för|på|in|for)\s+(?:rubrik(?:en|er|erna)?|headings?))(?![\p{L}\p{N}_])/iu,
  },
  {
    field: "typography.body",
    pattern:
      /(?<![\p{L}\p{N}_])(?:brödtext(?:font|typsnitt)(?:en|et)?|body\s+(?:font|typeface)|(?:använd|use|byt\s+till|switch\s+to)\s+["']?[\p{L}\p{N}-]+(?:\s+[\p{L}\p{N}-]+)?["']?\s+(?:i|för|på|in|for)\s+(?:brödtext(?:en)?|body\s+(?:copy|text)))(?![\p{L}\p{N}_])/iu,
  },
];

/** Deterministic exact-field detector; broad palette/font requests return no field. */
export function detectFollowUpDesignFields(
  prompt: string | null | undefined,
): DesignExplicitField[] {
  const text = stringValue(prompt);
  if (!text) return [];
  return FOLLOW_UP_FIELD_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ field }) => field,
  );
}

/**
 * Resolve overlapping Brief/Variant fields once. New briefs only override a
 * complete variant on axes marked explicit; old snapshots keep their historical
 * brief-first behavior so a deploy cannot restyle existing follow-ups.
 */
export function resolveDesignContract(input: ResolveDesignContractInput): ResolvedDesignContract {
  const { brief, variant } = input;
  const priorResolvedDesign = parseResolvedDesignContract(input.priorResolvedDesign);
  if (priorResolvedDesign) {
    const themeTokens = { ...priorResolvedDesign.themeTokens };
    if (input.themeOverride) {
      applyBrandColorOverrides(themeTokens, input.themeOverride, "user-locked");
    }
    if (input.lockedColorPalette) applyThemePalette(themeTokens, input.lockedColorPalette);

    const styleHints = stringList(input.styleKeywordsHint);
    const toneHints = stringList(input.toneKeywordsHint);
    const resolvedByStructuredInput = new Set<DesignExplicitAxis>();
    const resolvedByStructuredField = new Set<DesignExplicitField>();
    if (styleHints.length) resolvedByStructuredInput.add("style");
    if (toneHints.length) resolvedByStructuredInput.add("tone");
    if (input.colorModeHint) resolvedByStructuredInput.add("color-mode");
    if (input.themeOverride) {
      for (const field of ["palette.primary", "palette.secondary", "palette.accent"] as const) {
        resolvedByStructuredField.add(field);
      }
    }
    if (input.lockedColorPalette) {
      resolvedByStructuredInput.add("palette");
      for (const field of DESIGN_EXPLICIT_FIELDS) {
        if (field.startsWith("palette.")) resolvedByStructuredField.add(field);
      }
    }
    const currentRequestFields = dedupe(input.currentRequestFields ?? []) as DesignExplicitField[];
    const exactCompoundAxes = new Set<DesignExplicitAxis>();
    if (currentRequestFields.some((field) => field.startsWith("palette."))) {
      exactCompoundAxes.add("palette");
    }
    if (currentRequestFields.some((field) => field.startsWith("typography."))) {
      exactCompoundAxes.add("typography");
    }
    const unresolvedAxes = dedupe([
      ...(priorResolvedDesign.unresolvedAxes ?? []),
      ...(input.currentRequestAxes ?? []).filter((axis) => !exactCompoundAxes.has(axis)),
    ]).filter(
      (axis) => !resolvedByStructuredInput.has(axis as DesignExplicitAxis),
    ) as DesignExplicitAxis[];
    const unresolvedFields = dedupe([
      ...(priorResolvedDesign.unresolvedFields ?? []),
      ...currentRequestFields,
    ]).filter(
      (field) => !resolvedByStructuredField.has(field as DesignExplicitField),
    ) as DesignExplicitField[];
    return {
      ...priorResolvedDesign,
      variantId: variant?.id ?? priorResolvedDesign.variantId,
      unresolvedAxes,
      unresolvedFields,
      styleKeywords: styleHints.length
        ? resolved(dedupe(styleHints), "user-locked")
        : priorResolvedDesign.styleKeywords,
      toneAndVoice: toneHints.length
        ? resolved(dedupe(toneHints), "user-locked")
        : priorResolvedDesign.toneAndVoice,
      colorMode: input.colorModeHint
        ? resolved(input.colorModeHint, "user-locked")
        : priorResolvedDesign.colorMode,
      themeTokens,
    };
  }
  const hasProvenance = Array.isArray(brief?.designIntent?.explicitAxes);
  const explicitAxes = dedupe(
    (brief?.designIntent?.explicitAxes ?? []).filter(
      (axis): axis is DesignExplicitAxis =>
        typeof axis === "string" && DESIGN_EXPLICIT_AXES.includes(axis as DesignExplicitAxis),
    ),
  ) as DesignExplicitAxis[];
  const explicit = new Set<DesignExplicitAxis>(explicitAxes);
  const legacyBrief = Boolean(brief) && !hasProvenance;
  const hasFieldProvenance = Array.isArray(brief?.designIntent?.explicitFields);
  const declaredExplicitFields = dedupe(
    (brief?.designIntent?.explicitFields ?? []).filter(
      (field): field is DesignExplicitField =>
        typeof field === "string" && DESIGN_EXPLICIT_FIELDS.includes(field as DesignExplicitField),
    ),
  ) as DesignExplicitField[];
  // Axis-only snapshots from the short migration window retain their old
  // behavior. New Deep Briefs always emit `explicitFields`, including `[]`.
  const explicitFields = new Set<DesignExplicitField>(declaredExplicitFields);
  if (!hasFieldProvenance && explicit.has("palette")) {
    for (const field of DESIGN_EXPLICIT_FIELDS) {
      if (field.startsWith("palette.")) explicitFields.add(field);
    }
  }
  if (!hasFieldProvenance && explicit.has("typography")) {
    explicitFields.add("typography.headings");
    explicitFields.add("typography.body");
  }
  const compoundAxis = (field: DesignExplicitField): "palette" | "typography" =>
    field.startsWith("palette.") ? "palette" : "typography";
  const hasTargetedFieldForAxis = (axis: "palette" | "typography"): boolean =>
    [...explicitFields].some((field) => compoundAxis(field) === axis);
  // A broad request ("varm jordnära palett", "seriftypografi") owns the
  // complete compound axis even though it names no exact sibling field. Once
  // at least one exact field is named, ownership stays field-granular.
  const isBriefFieldExplicit = (field: DesignExplicitField): boolean => {
    if (explicitFields.has(field) || legacyBrief) return true;
    const axis = compoundAxis(field);
    return explicit.has(axis) && !hasTargetedFieldForAxis(axis);
  };
  const briefSource = (axis: DesignExplicitAxis): ResolvedDesignSource =>
    explicit.has(axis) || legacyBrief ? "brief-explicit" : "brief-inferred";
  const briefMayOverrideVariant = (axis: DesignExplicitAxis): boolean =>
    explicit.has(axis) || legacyBrief || !variant;
  const briefFieldSource = (field: DesignExplicitField): ResolvedDesignSource =>
    isBriefFieldExplicit(field) ? "brief-explicit" : "brief-inferred";
  const briefFieldMayOverrideVariant = (field: DesignExplicitField): boolean =>
    isBriefFieldExplicit(field) || !variant;

  const briefStyles = stringList(brief?.visualDirection?.styleKeywords);
  const styleHints = stringList(input.styleKeywordsHint);
  const variantStyles = stringList(variant?.keywords).slice(0, 8);
  const briefStylesWin = briefStyles.length > 0 && briefMayOverrideVariant("style");
  const finalStyles =
    styleHints.length > 0
      ? dedupe(styleHints)
      : briefStylesWin
        ? dedupe(briefStyles)
        : variantStyles.length > 0
          ? dedupe(variantStyles)
          : dedupe(briefStyles);
  const styleSource: ResolvedDesignSource = styleHints.length
    ? "user-locked"
    : briefStylesWin || (briefStyles.length > 0 && variantStyles.length === 0)
      ? briefSource("style")
      : variantStyles.length > 0
        ? "variant"
        : "default";

  const briefTones = stringList(brief?.toneAndVoice);
  const toneHints = stringList(input.toneKeywordsHint);
  const finalTones = dedupe(toneHints.length > 0 ? toneHints : briefTones);
  const toneSource: ResolvedDesignSource =
    toneHints.length > 0 ? "user-locked" : briefTones.length > 0 ? briefSource("tone") : "default";

  const tokens = copyVariantTokens(variant);
  const briefPalette = brief?.visualDirection?.colorPalette;
  if (briefPalette) {
    const paletteFields: Array<{
      field: DesignExplicitField;
      token: keyof ScaffoldVariantThemeTokens;
      value: unknown;
    }> = [
      { field: "palette.primary", token: "primary", value: briefPalette.primary },
      { field: "palette.secondary", token: "secondary", value: briefPalette.secondary },
      { field: "palette.accent", token: "accent", value: briefPalette.accent },
      { field: "palette.background", token: "background", value: briefPalette.background },
      { field: "palette.text", token: "foreground", value: briefPalette.text },
    ];
    for (const entry of paletteFields) {
      applyToken(
        tokens,
        entry.token,
        entry.value,
        briefFieldSource(entry.field),
        briefFieldMayOverrideVariant(entry.field),
      );
    }

    const primarySource = briefFieldSource("palette.primary");
    const secondarySource = briefFieldSource("palette.secondary");
    const accentSource = briefFieldSource("palette.accent");
    if (briefFieldMayOverrideVariant("palette.primary")) {
      refreshColorCompanion(tokens, "primary", "primaryForeground", primarySource);
      if (tokens.primary?.value) tokens.ring = resolved(tokens.primary.value, primarySource);
    }
    if (briefFieldMayOverrideVariant("palette.secondary")) {
      refreshColorCompanion(tokens, "secondary", "secondaryForeground", secondarySource);
    }
    if (briefFieldMayOverrideVariant("palette.accent")) {
      refreshColorCompanion(tokens, "accent", "accentForeground", accentSource);
    }
    if (
      briefFieldMayOverrideVariant("palette.background") ||
      briefFieldMayOverrideVariant("palette.text")
    ) {
      const surfaceSource = explicitFields.has("palette.background")
        ? briefFieldSource("palette.background")
        : briefFieldSource("palette.text");
      refreshSurfaceTokens(tokens, surfaceSource);
      // Surface/text changes can invalidate every existing on-color token.
      refreshColorCompanion(tokens, "primary", "primaryForeground", surfaceSource);
      refreshColorCompanion(tokens, "secondary", "secondaryForeground", surfaceSource);
      refreshColorCompanion(tokens, "accent", "accentForeground", surfaceSource);
    }
  }
  if (input.themeOverride) {
    applyBrandColorOverrides(tokens, input.themeOverride, "user-locked");
  }
  if (input.lockedColorPalette) applyThemePalette(tokens, input.lockedColorPalette);

  const variantPair = variant?.fontPairings[0];
  const briefTypography = brief?.visualDirection?.typography;
  const headingCanOverride = briefFieldMayOverrideVariant("typography.headings");
  const bodyCanOverride = briefFieldMayOverrideVariant("typography.body");
  const heading =
    headingCanOverride && stringValue(briefTypography?.headings)
      ? resolved(stringValue(briefTypography?.headings)!, briefFieldSource("typography.headings"))
      : variantPair?.heading
        ? resolved(variantPair.heading, "variant")
        : stringValue(briefTypography?.headings)
          ? resolved(
              stringValue(briefTypography?.headings)!,
              briefFieldSource("typography.headings"),
            )
          : resolved<string | null>("Inter", "default");
  const body =
    bodyCanOverride && stringValue(briefTypography?.body)
      ? resolved(stringValue(briefTypography?.body)!, briefFieldSource("typography.body"))
      : variantPair?.body
        ? resolved(variantPair.body, "variant")
        : stringValue(briefTypography?.body)
          ? resolved(stringValue(briefTypography?.body)!, briefFieldSource("typography.body"))
          : resolved<string | null>("Inter", "default");

  const briefColorMode = brief?.visualDirection?.colorMode;
  const colorMode = input.colorModeHint
    ? resolved<"light" | "dark" | "either" | null>(input.colorModeHint, "user-locked")
    : isColorMode(briefColorMode) &&
        (briefMayOverrideVariant("color-mode") || variant?.colorMode === "either")
      ? resolved<"light" | "dark" | "either" | null>(briefColorMode, briefSource("color-mode"))
      : variant
        ? resolved<"light" | "dark" | "either" | null>(variant.colorMode, "variant")
        : resolved<"light" | "dark" | "either" | null>(null, "default");

  const motionLevel = isMotionLevel(brief?.motionLevel)
    ? resolved(brief.motionLevel, briefSource("motion"))
    : resolved<"minimal" | "moderate" | "lively" | null>(null, "default");
  const qualityBar = isQualityBar(brief?.qualityBar)
    ? resolved(brief.qualityBar, briefSource("quality"))
    : resolved<"clean" | "premium" | "bold-dramatic" | null>(null, "default");
  const domainProfileValue = stringValue(brief?.domainProfile);

  return {
    schemaVersion: 1,
    variantId: variant?.id ?? null,
    explicitAxes,
    explicitFields: [...explicitFields],
    styleKeywords: resolved(finalStyles, styleSource),
    toneAndVoice: resolved(finalTones, toneSource),
    colorMode,
    themeTokens: tokens,
    typography: { heading, body },
    motionLevel,
    qualityBar,
    domainProfile: domainProfileValue
      ? resolved(domainProfileValue, "brief-inferred")
      : resolved<string | null>(null, "default"),
  };
}
