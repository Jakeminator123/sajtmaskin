/**
 * Design theme presets for Sajtmaskin.
 *
 * Based on shadcn/ui official themes (https://ui.shadcn.com/themes).
 * Each preset provides primary, secondary and accent colors in OKLch format
 * which v0 uses natively for CSS variables.
 */

export type DesignTheme =
  | "blue"
  | "green"
  | "orange"
  | "red"
  | "rose"
  | "violet"
  | "yellow"
  | "custom"
  | "off";

export const DEFAULT_DESIGN_THEME: DesignTheme = "blue";

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
  green: {
    primary: "oklch(0.50 0.15 145)",
    secondary: "oklch(0.65 0.12 160)",
    accent: "oklch(0.70 0.14 180)",
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
  violet: {
    primary: "oklch(0.50 0.18 290)",
    secondary: "oklch(0.60 0.14 310)",
    accent: "oklch(0.68 0.12 270)",
  },
  yellow: {
    primary: "oklch(0.70 0.16 85)",
    secondary: "oklch(0.75 0.12 70)",
    accent: "oklch(0.80 0.10 100)",
  },
};

export const DESIGN_THEME_OPTIONS: Array<{
  value: DesignTheme;
  label: string;
}> = [
  { value: "blue", label: "Blue (standard)" },
  { value: "green", label: "Green" },
  { value: "orange", label: "Orange" },
  { value: "red", label: "Red" },
  { value: "rose", label: "Rose" },
  { value: "violet", label: "Violet" },
  { value: "yellow", label: "Yellow" },
  { value: "off", label: "Av" },
];

/** Get the color palette for a theme, or null if off/custom */
export function getThemeColors(theme: DesignTheme): ThemeColors | null {
  if (theme === "off" || theme === "custom") return null;
  return THEME_PRESETS[theme] ?? null;
}

/** Check if a design theme is active (not "off") */
export function isDesignThemeActive(theme: DesignTheme): boolean {
  return theme !== "off";
}

export function normalizeDesignTheme(raw?: string | null): DesignTheme {
  const value = String(raw || "").toLowerCase();
  if (DESIGN_THEME_OPTIONS.some((opt) => opt.value === value)) {
    return value as DesignTheme;
  }
  return DEFAULT_DESIGN_THEME;
}
