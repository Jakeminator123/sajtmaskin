/**
 * Shared, client-safe types for the builder Byggblock-panelens katalog-tab
 * ("Bläddra katalog").
 *
 * Unlike `dossier-overview.ts` (which reports WIRED dossiers for a specific
 * chat/version), this describes the FULL static catalog from the
 * server-side registry (`src/lib/gen/dossiers/registry.ts`), grouped by the
 * same presentation-only `dossier-groups.ts` buckets used elsewhere in the
 * panel. Produced by `GET /api/dossiers/catalog` — no auth-sensitive data,
 * cache-friendly (static filesystem data).
 */

export interface DossierCatalogEntry {
  id: string;
  label: string;
  capability: string;
  class: "hard" | "soft";
  summary: string;
  /** Swedish catalog description (manifest `summarySv`); fallback: `summary`. */
  summarySv?: string;
  envVarCount: number;
  groupId: string;
  groupLabel: string;
}

export interface DossierCatalogGroup {
  id: string;
  label: string;
  dossiers: DossierCatalogEntry[];
}

export interface DossierCatalogResponse {
  success: true;
  total: number;
  groups: DossierCatalogGroup[];
}
