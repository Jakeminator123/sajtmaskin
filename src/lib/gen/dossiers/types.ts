/**
 * Dossier runtime types — what the rest of the codebase sees.
 *
 * Dossier source-of-truth lives in data/dossiers/<id>/manifest.json.
 * Schema: docs/schemas/strict/dossier.schema.json
 * Format: docs/architecture/dossier-format.md
 */

export type DossierKind = "integration" | "ui-section";

export type DossierCategory =
  | "auth"
  | "payments"
  | "database"
  | "cms"
  | "realtime"
  | "bookings"
  | "email"
  | "analytics"
  | "ai"
  | "search"
  | "storage"
  | "ui-marketing"
  | "ui-content"
  | "ui-data"
  | "ui-navigation"
  | "ui-feedback";

export type DossierStatus = "active" | "draft";

export interface DossierProvider {
  name: string;
  url?: string;
}

export interface DossierEnvVar {
  key: string;
  required: boolean;
  purpose: string;
}

export interface DossierFile {
  path: string;
  role: "client" | "server" | "shared";
  kind: "component" | "api-route" | "hook" | "util" | "config" | "middleware";
}

export interface DossierExposes {
  name: string;
  type: "component" | "function" | "hook" | "constant";
  import: string;
}

export interface DossierScaffoldFit {
  primary: string[];
  compatible: string[];
}

export interface DossierEntry {
  id: string;
  kind: DossierKind;
  category: DossierCategory;
  label: string;
  description: string;
  summary: string;
  providers?: DossierProvider[];
  envVars?: DossierEnvVar[];
  dependencies: string[];
  files: DossierFile[];
  exposes?: DossierExposes[];
  scaffoldFit: DossierScaffoldFit;
  complexity: "simple" | "medium" | "advanced";
  qualityScore?: number;
  sourceTemplateUrl?: string;
  sourceRepoUrl?: string;
  lastVerified: string;
  tags: string[];
  _source: string;
  _status?: DossierStatus;
  /** Read from data/dossiers/<id>/instructions.md by registry on load. */
  instructions?: string;
}

/** Per-scaffold recommendation buckets. */
export interface ScaffoldRecommendationBucket {
  alwaysInclude: string[];
  primaryRecommended: string[];
  suggested: string[];
}

export interface ScaffoldRecommendationsFile {
  generatedAt: string;
  generationMode: "auto" | "merged" | "manual";
  scaffolds: Record<string, ScaffoldRecommendationBucket>;
  notes?: string;
}

export interface DossierEmbedding {
  id: string;
  kind: DossierKind;
  category: DossierCategory;
  embedding: number[];
}

export interface DossierEmbeddingsFile {
  _meta: {
    model: string;
    dimensions: number;
    generated: string;
    sourceMasterGenerated: string;
    count: number;
  };
  embeddings: DossierEmbedding[];
}

/** Output of `selectDossiersForRequest` — what gets injected into the prompt. */
export interface SelectedDossier {
  entry: DossierEntry;
  /** 0..1 — combined score: cosine similarity + recommendation boost. */
  score: number;
  /** Why this dossier was picked (for prompt-dump observability). */
  reason: "alwaysInclude" | "embedding" | "recommendation-only" | "embedding+boost";
}

export interface DossierSelectionResult {
  /** Selected dossiers, ordered high-score first. */
  selected: SelectedDossier[];
  /** Active pool size at time of selection. */
  poolSize: number;
  /** Embeddings used or skipped (no API key, no file). */
  embeddingsUsed: boolean;
  /** Embedding model + dim if used. */
  embeddingMeta?: { model: string; dimensions: number };
  /** Reason summary by category for logging. */
  byCategory: Record<string, string[]>;
}
