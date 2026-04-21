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

export type DossierStatus =
  | "active"
  | "draft"
  /** GitHub repo is archived. Excluded from runtime selection. */
  | "source-archived"
  /** GitHub repo last pushed > 18 months ago. Excluded from runtime selection. */
  | "source-stale"
  /** GitHub repo URL is dead (404, parse error, network). Excluded from runtime selection. */
  | "source-unreachable";

/** Optional manifest fields used for deprecation tracking. */
export interface DossierDeprecationFields {
  /** Human-readable note about why the dossier was flagged. */
  _deprecationReason?: string;
  /** Replacement repo URL when the original source has been sunset. */
  _replacementUrl?: string;
}

export interface DossierProvider {
  name: string;
  url?: string;
}

export interface DossierEnvVar {
  key: string;
  required: boolean;
  purpose: string;
}

/** How a dossier file should reach the user's output project. */
export type DossierFileInjectionMode =
  /**
   * LLM sees the file content as reference in the prompt and may rewrite it.
   * Default for components/UI files where adaptation is desirable.
   */
  | "inline"
  /**
   * LLM must emit the file unchanged in its CodeProject output. Used for
   * integration glue (api-routes, middleware, lib helpers) where deviating
   * from the dossier's pattern is risky (e.g. Stripe webhook signing).
   */
  | "verbatim";

export interface DossierFile {
  path: string;
  role: "client" | "server" | "shared";
  kind: "component" | "api-route" | "hook" | "util" | "config" | "middleware";
  /** Defaults to "inline" if omitted. See DossierFileInjectionMode for semantics. */
  injectionMode?: DossierFileInjectionMode;
}

/**
 * Default injection mode by file kind for integration dossiers.
 *
 * SAFETY: `config` defaults to `inline` (was `verbatim`) because dossier
 * `config` files are sometimes `app/layout.tsx` — emitting that verbatim
 * collides with the scaffold's own layout (path-based merge would replace
 * the scaffold layout with the dossier's, losing fonts/providers/metadata).
 * Force verbatim per-file when truly needed.
 */
export function defaultInjectionMode(
  kind: DossierFile["kind"],
  dossierKind: DossierKind,
): DossierFileInjectionMode {
  if (dossierKind !== "integration") return "inline";
  // Integration glue that is risky to paraphrase — Stripe webhooks, auth
  // middleware, SDK init helpers — defaults to verbatim.
  if (kind === "api-route" || kind === "middleware") return "verbatim";
  if (kind === "util") return "verbatim";
  return "inline";
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
