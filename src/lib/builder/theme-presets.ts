/**
 * Design theme presets for Sajtmaskin — the "Färg" control in Byggval.
 *
 * Based on shadcn/ui official themes (https://ui.shadcn.com/themes), in OKLch
 * because that is what the generated `@theme inline` block uses natively.
 *
 * Two layers, on purpose:
 *
 * - `THEME_PRESETS` is the legacy three-color contract (primary/secondary/accent)
 *   that `ThemeColors` and the persisted `designTheme` meta field already speak.
 * - `THEME_CLUSTERS` is the full palette per hue and per light/dark mode. Three
 *   colors could not describe a surface, so the model filled in background, card
 *   and muted itself and a "red" site still came out on a neutral grey shell.
 *
 * The cluster deliberately owns COLOR only — no `radius`, no background image.
 * Those belong to the scaffold variant, and a color choice must not silently
 * restyle geometry. See `docs/architecture/glossary.md` § Färg och theme tokens
 * for the Swedish 1:1 mapping of every token name below.
 */

export type DesignTheme =
  | "blue"
  | "cyan"
  | "teal"
  | "green"
  | "lime"
  | "yellow"
  | "orange"
  | "red"
  | "rose"
  | "fuchsia"
  | "violet"
  | "indigo"
  | "slate"
  | "custom"
  | "off";

export const DEFAULT_DESIGN_THEME: DesignTheme = "off";

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
}

export const THEME_PRESETS: Record<Exclude<DesignTheme, "custom" | "off">, ThemeColors> = {
  blue: {
    primary: "oklch(0.45 0.15 240)",
    secondary: "oklch(0.68 0.12 200)",
    accent: "oklch(0.75 0.14 280)",
  },
  cyan: {
    primary: "oklch(0.55 0.13 210)",
    secondary: "oklch(0.68 0.11 205)",
    accent: "oklch(0.75 0.12 225)",
  },
  teal: {
    primary: "oklch(0.52 0.11 180)",
    secondary: "oklch(0.66 0.10 185)",
    accent: "oklch(0.73 0.10 165)",
  },
  green: {
    primary: "oklch(0.50 0.15 145)",
    secondary: "oklch(0.65 0.12 160)",
    accent: "oklch(0.70 0.14 180)",
  },
  lime: {
    primary: "oklch(0.55 0.16 130)",
    secondary: "oklch(0.68 0.14 125)",
    accent: "oklch(0.76 0.15 115)",
  },
  yellow: {
    primary: "oklch(0.70 0.16 85)",
    secondary: "oklch(0.75 0.12 70)",
    accent: "oklch(0.80 0.10 100)",
  },
  orange: {
    primary: "oklch(0.60 0.18 60)",
    secondary: "oklch(0.65 0.14 45)",
    accent: "oklch(0.72 0.12 80)",
  },
  red: {
    primary: "oklch(0.50 0.20 25)",
    secondary: "oklch(0.60 0.16 10)",
    accent: "oklch(0.65 0.14 40)",
  },
  rose: {
    primary: "oklch(0.55 0.18 350)",
    secondary: "oklch(0.65 0.14 340)",
    accent: "oklch(0.70 0.12 0)",
  },
  fuchsia: {
    primary: "oklch(0.55 0.22 330)",
    secondary: "oklch(0.64 0.17 340)",
    accent: "oklch(0.70 0.16 315)",
  },
  violet: {
    primary: "oklch(0.50 0.18 290)",
    secondary: "oklch(0.60 0.14 310)",
    accent: "oklch(0.68 0.12 270)",
  },
  indigo: {
    primary: "oklch(0.46 0.17 275)",
    secondary: "oklch(0.58 0.14 270)",
    accent: "oklch(0.70 0.13 285)",
  },
  slate: {
    primary: "oklch(0.45 0.03 260)",
    secondary: "oklch(0.60 0.02 260)",
    accent: "oklch(0.70 0.02 260)",
  },
};

// Ordered as a spectrum so the swatch row reads as a calm rainbow instead of an
// arbitrary list. `off` stays last and is labelled "Auto" (not "Av"): leaving
// Färg unset means the variant/brief keeps deciding the color — i.e. the same
// "no preference" semantics every other Byggval row spells "Auto". See the
// glossary § Färg och theme tokens for the Swedish 1:1 token mapping.
export const DESIGN_THEME_OPTIONS: Array<{
  value: DesignTheme;
  label: string;
}> = [
  { value: "blue", label: "Havsblå" },
  { value: "cyan", label: "Isblå" },
  { value: "teal", label: "Lagun" },
  { value: "green", label: "Skogsgrön" },
  { value: "lime", label: "Äng" },
  { value: "yellow", label: "Senap" },
  { value: "orange", label: "Bärnsten" },
  { value: "red", label: "Tegelröd" },
  { value: "rose", label: "Blomster" },
  { value: "fuchsia", label: "Orkidé" },
  { value: "violet", label: "Plommon" },
  { value: "indigo", label: "Midnatt" },
  { value: "slate", label: "Skiffer" },
  { value: "off", label: "Auto" },
];

export type ThemeClusterId = Exclude<DesignTheme, "custom" | "off">;

/** Full surface palette for one cluster in one color mode. */
export interface ThemePalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  ring: string;
}

/**
 * Per-cluster brand colors plus the hue used to tint the neutrals.
 *
 * `onPrimary` / `onAccent` are explicit rather than derived: a near-white
 * foreground works on `blue` at lightness 0.45 but fails WCAG on `yellow` at
 * 0.70, and getting that wrong ships unreadable buttons.
 */
const THEME_CLUSTER_SEEDS: Record<
  ThemeClusterId,
  { hue: number; colors: ThemeColors; onPrimary: "light" | "dark"; onAccent: "light" | "dark" }
> = {
  blue: { hue: 240, colors: THEME_PRESETS.blue, onPrimary: "light", onAccent: "dark" },
  cyan: { hue: 210, colors: THEME_PRESETS.cyan, onPrimary: "light", onAccent: "dark" },
  teal: { hue: 180, colors: THEME_PRESETS.teal, onPrimary: "light", onAccent: "dark" },
  green: { hue: 150, colors: THEME_PRESETS.green, onPrimary: "light", onAccent: "dark" },
  lime: { hue: 130, colors: THEME_PRESETS.lime, onPrimary: "light", onAccent: "dark" },
  yellow: { hue: 85, colors: THEME_PRESETS.yellow, onPrimary: "dark", onAccent: "dark" },
  orange: { hue: 60, colors: THEME_PRESETS.orange, onPrimary: "dark", onAccent: "dark" },
  red: { hue: 25, colors: THEME_PRESETS.red, onPrimary: "light", onAccent: "dark" },
  rose: { hue: 350, colors: THEME_PRESETS.rose, onPrimary: "light", onAccent: "dark" },
  fuchsia: { hue: 330, colors: THEME_PRESETS.fuchsia, onPrimary: "light", onAccent: "dark" },
  violet: { hue: 290, colors: THEME_PRESETS.violet, onPrimary: "light", onAccent: "dark" },
  indigo: { hue: 275, colors: THEME_PRESETS.indigo, onPrimary: "light", onAccent: "dark" },
  slate: { hue: 260, colors: THEME_PRESETS.slate, onPrimary: "light", onAccent: "dark" },
};

function buildPalette(
  seed: (typeof THEME_CLUSTER_SEEDS)[ThemeClusterId],
  mode: "light" | "dark",
): ThemePalette {
  const { hue, colors } = seed;
  const ink = mode === "light" ? `oklch(0.22 0.02 ${hue})` : `oklch(0.96 0.01 ${hue})`;
  const paper = mode === "light" ? `oklch(0.99 0.004 ${hue})` : `oklch(0.17 0.02 ${hue})`;
  const onPrimary =
    seed.onPrimary === "light" ? `oklch(0.99 0.005 ${hue})` : `oklch(0.20 0.03 ${hue})`;
  const onAccent =
    seed.onAccent === "light" ? `oklch(0.99 0.005 ${hue})` : `oklch(0.20 0.03 ${hue})`;

  return {
    background: paper,
    foreground: ink,
    card: mode === "light" ? `oklch(1 0 0)` : `oklch(0.21 0.02 ${hue})`,
    cardForeground: ink,
    primary: colors.primary,
    primaryForeground: onPrimary,
    secondary: colors.secondary,
    secondaryForeground: mode === "light" ? `oklch(0.22 0.02 ${hue})` : `oklch(0.20 0.03 ${hue})`,
    muted: mode === "light" ? `oklch(0.96 0.008 ${hue})` : `oklch(0.25 0.02 ${hue})`,
    mutedForeground: mode === "light" ? `oklch(0.52 0.02 ${hue})` : `oklch(0.72 0.02 ${hue})`,
    accent: colors.accent,
    accentForeground: onAccent,
    border: mode === "light" ? `oklch(0.91 0.01 ${hue})` : `oklch(0.30 0.02 ${hue})`,
    ring: colors.primary,
  };
}

export const THEME_CLUSTERS: Record<
  ThemeClusterId,
  { label: string; light: ThemePalette; dark: ThemePalette }
> = Object.fromEntries(
  (Object.keys(THEME_CLUSTER_SEEDS) as ThemeClusterId[]).map((id) => {
    const seed = THEME_CLUSTER_SEEDS[id];
    return [
      id,
      {
        label: DESIGN_THEME_OPTIONS.find((option) => option.value === id)?.label ?? id,
        light: buildPalette(seed, "light"),
        dark: buildPalette(seed, "dark"),
      },
    ];
  }),
) as Record<ThemeClusterId, { label: string; light: ThemePalette; dark: ThemePalette }>;

/**
 * The full palette for a theme choice, or `null` when the user left Färg off (or
 * on a custom palette) and the variant/brief should keep deciding.
 *
 * `colorMode` is the Byggval Färgläge choice. On `auto`, prefer the resolved
 * variant's light/dark mode when one exists; otherwise light (safer default for
 * marketing sites). Explicit light/dark always wins over the variant.
 */
export function resolveThemePalette(
  theme: DesignTheme,
  colorMode: "auto" | "light" | "dark",
  options?: { variantColorMode?: "light" | "dark" | "either" | null },
): ThemePalette | null {
  if (theme === "off" || theme === "custom") return null;
  const cluster = THEME_CLUSTERS[theme];
  if (!cluster) return null;
  const resolvedMode: "light" | "dark" =
    colorMode === "auto"
      ? options?.variantColorMode === "dark"
        ? "dark"
        : "light"
      : colorMode;
  return resolvedMode === "dark" ? cluster.dark : cluster.light;
}

/** Get the color palette for a theme, or null if off/custom */
export function getThemeColors(theme: DesignTheme): ThemeColors | null {
  if (theme === "off" || theme === "custom") return null;
  return THEME_PRESETS[theme] ?? null;
}

export function normalizeDesignTheme(raw?: string | null): DesignTheme {
  const value = String(raw || "").toLowerCase();
  if (DESIGN_THEME_OPTIONS.some((opt) => opt.value === value)) {
    return value as DesignTheme;
  }
  return DEFAULT_DESIGN_THEME;
}
