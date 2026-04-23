import type { ScaffoldId } from "@/lib/gen/scaffolds/types";

export type ScaffoldSuperFamily = "website" | "app";

export interface ScaffoldHint {
  superFamily: ScaffoldSuperFamily;
  suggestedFamily?: ScaffoldId;
}

const LABEL_TO_SCAFFOLD_HINT: Record<string, ScaffoldHint> = {
  "Företag / Tjänster":    { superFamily: "website", suggestedFamily: "landing-page" },
  "Webshop / E-handel":    { superFamily: "website", suggestedFamily: "ecommerce" },
  "Restaurang / Café":     { superFamily: "website", suggestedFamily: "landing-page" },
  "Portfolio / CV":        { superFamily: "website", suggestedFamily: "portfolio" },
  "Landningssida":         { superFamily: "website", suggestedFamily: "landing-page" },
  "Blogg / Magasin":       { superFamily: "website", suggestedFamily: "blog" },
  "Konsult / Byrå":        { superFamily: "website", suggestedFamily: "landing-page" },
  "Tech / Startup":        { superFamily: "website", suggestedFamily: "saas-landing" },
  "Vård / Klinik":         { superFamily: "website", suggestedFamily: "landing-page" },
  "Fastighet / Mäklare":   { superFamily: "website", suggestedFamily: "landing-page" },
  "Salong / Skönhet":      { superFamily: "website", suggestedFamily: "landing-page" },
  "Gym / Tränare":         { superFamily: "website", suggestedFamily: "landing-page" },
  "Bygg / Hantverk":       { superFamily: "website", suggestedFamily: "landing-page" },
  "Utbildning / Skola":    { superFamily: "website", suggestedFamily: "landing-page" },
  "Event / Bröllop":       { superFamily: "website", suggestedFamily: "landing-page" },
  "Förening / Ideell":     { superFamily: "website", suggestedFamily: "landing-page" },
  "Musik / Artist":        { superFamily: "website", suggestedFamily: "portfolio" },
  "Hotell / Boende":       { superFamily: "website", suggestedFamily: "landing-page" },
  "Juridik / Advokat":     { superFamily: "website", suggestedFamily: "landing-page" },
  "Ekonomi / Redovisning": { superFamily: "website", suggestedFamily: "landing-page" },
  "Bil / Motor":           { superFamily: "website", suggestedFamily: "landing-page" },
  "Resa / Turism":         { superFamily: "website", suggestedFamily: "landing-page" },
  "Mat / Catering":        { superFamily: "website", suggestedFamily: "landing-page" },
  "Foto / Video":          { superFamily: "website", suggestedFamily: "portfolio" },
  "Annat":                 { superFamily: "website" },
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
