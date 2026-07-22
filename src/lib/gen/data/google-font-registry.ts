/**
 * Google Font registry for code generation and autofix.
 *
 * Maps the `next/font/google` import name (PascalCase with underscores)
 * to metadata needed by the generation pipeline:
 *   - displayName: human-readable name (matches fontPairings in scaffold variants)
 *   - variable: default CSS variable name
 *   - category: sans-serif | serif | display | mono
 *
 * Keep this file as the single source of truth.
 * Scaffold variant fontPairings reference displayName;
 * autofix and prompt injection reference the import key.
 */

export interface GoogleFontEntry {
  displayName: string;
  variable: string;
  category: "sans-serif" | "serif" | "display" | "mono";
}

export const GOOGLE_FONT_REGISTRY: Record<string, GoogleFontEntry> = {
  // — Sans-serif —
  Inter: { displayName: "Inter", variable: "--font-sans", category: "sans-serif" },
  Geist: { displayName: "Geist", variable: "--font-sans", category: "sans-serif" },
  Roboto: { displayName: "Roboto", variable: "--font-sans", category: "sans-serif" },
  Open_Sans: { displayName: "Open Sans", variable: "--font-sans", category: "sans-serif" },
  Lato: { displayName: "Lato", variable: "--font-sans", category: "sans-serif" },
  Montserrat: { displayName: "Montserrat", variable: "--font-sans", category: "sans-serif" },
  Poppins: { displayName: "Poppins", variable: "--font-sans", category: "sans-serif" },
  Raleway: { displayName: "Raleway", variable: "--font-sans", category: "sans-serif" },
  Nunito: { displayName: "Nunito", variable: "--font-sans", category: "sans-serif" },
  Nunito_Sans: { displayName: "Nunito Sans", variable: "--font-sans", category: "sans-serif" },
  Oswald: { displayName: "Oswald", variable: "--font-sans", category: "sans-serif" },
  Quicksand: { displayName: "Quicksand", variable: "--font-sans", category: "sans-serif" },
  Ubuntu: { displayName: "Ubuntu", variable: "--font-sans", category: "sans-serif" },
  Rubik: { displayName: "Rubik", variable: "--font-sans", category: "sans-serif" },
  Work_Sans: { displayName: "Work Sans", variable: "--font-sans", category: "sans-serif" },
  Noto_Sans: { displayName: "Noto Sans", variable: "--font-sans", category: "sans-serif" },
  DM_Sans: { displayName: "DM Sans", variable: "--font-sans", category: "sans-serif" },
  Outfit: { displayName: "Outfit", variable: "--font-sans", category: "sans-serif" },
  Space_Grotesk: { displayName: "Space Grotesk", variable: "--font-sans", category: "sans-serif" },
  Sora: { displayName: "Sora", variable: "--font-sans", category: "sans-serif" },
  Manrope: { displayName: "Manrope", variable: "--font-sans", category: "sans-serif" },
  Plus_Jakarta_Sans: { displayName: "Plus Jakarta Sans", variable: "--font-sans", category: "sans-serif" },
  Figtree: { displayName: "Figtree", variable: "--font-sans", category: "sans-serif" },
  Instrument_Sans: { displayName: "Instrument Sans", variable: "--font-sans", category: "sans-serif" },
  IBM_Plex_Sans: { displayName: "IBM Plex Sans", variable: "--font-sans", category: "sans-serif" },
  Bricolage_Grotesque: { displayName: "Bricolage Grotesque", variable: "--font-sans", category: "sans-serif" },
  Albert_Sans: { displayName: "Albert Sans", variable: "--font-sans", category: "sans-serif" },
  Archivo: { displayName: "Archivo", variable: "--font-sans", category: "sans-serif" },
  Barlow: { displayName: "Barlow", variable: "--font-sans", category: "sans-serif" },
  Cabin: { displayName: "Cabin", variable: "--font-sans", category: "sans-serif" },
  Exo_2: { displayName: "Exo 2", variable: "--font-sans", category: "sans-serif" },
  Karla: { displayName: "Karla", variable: "--font-sans", category: "sans-serif" },
  Libre_Franklin: { displayName: "Libre Franklin", variable: "--font-sans", category: "sans-serif" },
  Mulish: { displayName: "Mulish", variable: "--font-sans", category: "sans-serif" },
  Overpass: { displayName: "Overpass", variable: "--font-sans", category: "sans-serif" },
  Red_Hat_Display: { displayName: "Red Hat Display", variable: "--font-sans", category: "sans-serif" },
  Urbanist: { displayName: "Urbanist", variable: "--font-sans", category: "sans-serif" },
  Source_Sans_3: { displayName: "Source Sans 3", variable: "--font-sans", category: "sans-serif" },

  // — Serif —
  Playfair_Display: { displayName: "Playfair Display", variable: "--font-display", category: "serif" },
  Merriweather: { displayName: "Merriweather", variable: "--font-serif", category: "serif" },
  Lora: { displayName: "Lora", variable: "--font-serif", category: "serif" },
  Source_Serif_4: { displayName: "Source Serif 4", variable: "--font-serif", category: "serif" },
  Cormorant_Garamond: { displayName: "Cormorant Garamond", variable: "--font-display", category: "serif" },
  Fraunces: { displayName: "Fraunces", variable: "--font-display", category: "serif" },
  DM_Serif_Display: { displayName: "DM Serif Display", variable: "--font-display", category: "display" },
  Libre_Baskerville: { displayName: "Libre Baskerville", variable: "--font-serif", category: "serif" },
  Crimson_Text: { displayName: "Crimson Text", variable: "--font-serif", category: "serif" },
  EB_Garamond: { displayName: "EB Garamond", variable: "--font-serif", category: "serif" },
  Instrument_Serif: { displayName: "Instrument Serif", variable: "--font-display", category: "serif" },

  // — Display —
  Bebas_Neue: { displayName: "Bebas Neue", variable: "--font-display", category: "display" },
  Tenor_Sans: { displayName: "Tenor Sans", variable: "--font-display", category: "display" },
  Orbitron: { displayName: "Orbitron", variable: "--font-display", category: "display" },

  // — Mono —
  Geist_Mono: { displayName: "Geist Mono", variable: "--font-mono", category: "mono" },
  JetBrains_Mono: { displayName: "JetBrains Mono", variable: "--font-mono", category: "mono" },
  Fira_Code: { displayName: "Fira Code", variable: "--font-mono", category: "mono" },
  Source_Code_Pro: { displayName: "Source Code Pro", variable: "--font-mono", category: "mono" },
  IBM_Plex_Mono: { displayName: "IBM Plex Mono", variable: "--font-mono", category: "mono" },
  Inconsolata: { displayName: "Inconsolata", variable: "--font-mono", category: "mono" },
  Space_Mono: { displayName: "Space Mono", variable: "--font-mono", category: "mono" },
};

const _displayNameIndex = new Map<string, string>();
for (const [importName, entry] of Object.entries(GOOGLE_FONT_REGISTRY)) {
  _displayNameIndex.set(entry.displayName.toLowerCase(), importName);
}

/** Resolve a human-readable font name (e.g. "JetBrains Mono") to its next/font/google import name. */
export function resolveGoogleFontImportName(displayName: string): string | undefined {
  return _displayNameIndex.get(displayName.toLowerCase());
}

/** Set of all known import names (for use in autofix whitelists). */
export const GOOGLE_FONT_IMPORT_NAMES = new Set(Object.keys(GOOGLE_FONT_REGISTRY));
