/**
 * Toasten när ett första bygge är sparat (V-04, 2026-11-11). `done` betyder
 * att versionen är sparad, inte att förhandsvisningen visar den: "Sajt
 * skapad!" kom 85 s innan sajten syntes. Förhandsvisningen säger själv när den
 * visar versionen (versionsindikatorn i preview-panelen).
 */
export const SITE_SAVED_TOAST_TITLE = "Sajten är sparad";

export const SITE_SAVED_TOAST_OPTIONS = {
  description: "Förhandsvisningen startar strax.",
  // Uppe till höger (Toasterns standard) täcker toasten headerns knappar.
  position: "bottom-right",
} as const;
