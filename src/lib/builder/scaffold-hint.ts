import type { ScaffoldId } from "@/lib/gen/scaffolds/types";

export type ScaffoldSuperFamily = "website" | "app";

export interface ScaffoldHint {
  superFamily: ScaffoldSuperFamily;
  suggestedFamily?: ScaffoldId;
}

const LABEL_TO_SCAFFOLD_HINT: Record<string, ScaffoldHint> = {
  "Företag / Tjänster": { superFamily: "website", suggestedFamily: "content-site" },
  "Webshop / E-handel": { superFamily: "website", suggestedFamily: "ecommerce" },
  "Restaurang / Café":  { superFamily: "website", suggestedFamily: "content-site" },
  "Portfolio / CV":     { superFamily: "website", suggestedFamily: "portfolio" },
  "Landningssida":      { superFamily: "website", suggestedFamily: "landing-page" },
  "Blogg / Magasin":    { superFamily: "website", suggestedFamily: "blog" },
  "Konsult / Byrå":     { superFamily: "website", suggestedFamily: "content-site" },
  "Tech / Startup":     { superFamily: "website", suggestedFamily: "saas-landing" },
  "Vård / Klinik":      { superFamily: "website", suggestedFamily: "content-site" },
  "Salong / Skönhet":   { superFamily: "website", suggestedFamily: "content-site" },
  "Gym / Tränare":      { superFamily: "website", suggestedFamily: "content-site" },
  "Bygg / Hantverk":    { superFamily: "website", suggestedFamily: "content-site" },
  "Utbildning / Skola": { superFamily: "website", suggestedFamily: "content-site" },
  "Event / Bröllop":    { superFamily: "website", suggestedFamily: "landing-page" },
  "Förening / Ideell":  { superFamily: "website", suggestedFamily: "content-site" },
  "Musik / Artist":     { superFamily: "website", suggestedFamily: "portfolio" },
  "Hotell / Boende":    { superFamily: "website", suggestedFamily: "content-site" },
  "Juridik / Advokat":  { superFamily: "website", suggestedFamily: "content-site" },
  "Ekonomi / Redovisning": { superFamily: "website", suggestedFamily: "content-site" },
  "Bil / Motor":        { superFamily: "website", suggestedFamily: "content-site" },
  "Resa / Turism":      { superFamily: "website", suggestedFamily: "content-site" },
  "Mat / Catering":     { superFamily: "website", suggestedFamily: "content-site" },
  "Foto / Video":       { superFamily: "website", suggestedFamily: "portfolio" },
};

const DEFAULT_HINT: ScaffoldHint = { superFamily: "website" };

/**
 * Resolves a scaffold hint from wizard category labels (as stored in answers.siteType).
 * Uses the first label that matches.
 */
export function resolveScaffoldHintFromLabels(labels: string[]): ScaffoldHint {
  for (const label of labels) {
    const hint = LABEL_TO_SCAFFOLD_HINT[label];
    if (hint) return hint;
  }
  return DEFAULT_HINT;
}
