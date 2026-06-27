/**
 * Dossier runtime types (v2).
 *
 * Source-of-truth: data/dossiers/{hard|soft}/<id>/manifest.json
 * Schema:          docs/schemas/strict/dossier.schema.json
 * Architecture:    docs/architecture/dossier-system.md
 *
 * Two classes (encoded in folder path):
 *   - hard: needs external secrets (Stripe, Auth.js, OpenAI). Preflight checks envVars.
 *   - soft: self-contained (UI sections, R3F 3D, animation patterns).
 *
 * Two code-fidelities (per-dossier default, per-file override):
 *   - verbatim:   LLM emits files unchanged (auth glue, webhooks, SDK init).
 *   - rewritable: LLM may paraphrase (UI components, layout patterns).
 */

export type DossierClass = "hard" | "soft";

export type CodeFidelity = "verbatim" | "rewritable";

export type DossierComplexity = "simple" | "medium" | "advanced";

/**
 * Controls how much of `instructions.md` reaches the codegen prompt.
 * - `"compact"` (default): manifest-derived summary lines only.
 * - `"selected-sections"`: the "When to use" / "How to integrate" / "Avoid"
 *   H1 sections of instructions.md, capped — so do/don't rules reach runtime
 *   without bloating the prompt.
 * - `"full"`: the entire instructions.md verbatim.
 */
export type PromptInstructionMode = "compact" | "selected-sections" | "full";

/**
 * A capability is an abstract intent the brief declares the site needs.
 * Examples: "payments", "auth", "ai-chat", "image-gen", "pricing-section".
 * Free-form by design — keep `data/dossiers/_index/capability-map.json` clean.
 */
export type Capability = string;

/**
 * How strictly the F3 readiness gate enforces a given env var.
 *
 * - `"build"` (default when omitted): real value required before F3
 *   ("Bygg integrationer") build can succeed at runtime. Stripe secrets,
 *   Supabase URLs, database connections — anything where a placeholder
 *   value crashes the deploy.
 * - `"feature-runtime"`: the SDK is imported but the dossier's UI mounts a
 *   configuration banner / popup at runtime when the value is missing or
 *   placeholder. F3 reports this as a warning, not a blocker. The
 *   "Klarna-button-with-popup" pattern.
 * - `"warn-only"`: dossier code self-disables on empty value (e.g. the
 *   component returns `null`). Not even a warning — info only.
 *
 * Read by `tier3-build-spec.ts` to partition `requiredRealEnvKeys` into
 * blocking vs informational buckets.
 */
export type DossierEnvVarEnforcement = "build" | "feature-runtime" | "warn-only";

export interface DossierEnvVar {
  key: string;
  required: boolean;
  purpose: string;
  /** Defaults to `"build"` when omitted. */
  enforcement?: DossierEnvVarEnforcement;
}

export interface DossierFile {
  /** Path relative to the dossier directory. Usually under "components/". */
  path: string;
  role: "client" | "server" | "shared";
  /** Per-file override of the dossier's `codeFidelity` default. */
  injectionMode?: CodeFidelity;
}

export interface DossierExposes {
  name: string;
  type: "component" | "function" | "hook" | "constant";
  import: string;
}

export interface DossierEntry {
  /** Folder path encodes class. Set by registry, not by manifest. */
  class: DossierClass;
  /** Kebab-case unique id; matches the directory name. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Abstract capability matched against `brief.requestedCapabilities`. */
  capability: Capability;
  /** Default injection mode for files in this dossier. */
  codeFidelity: CodeFidelity;
  complexity: DossierComplexity;
  /** Tie-breaker when two dossiers share the same capability. */
  defaultForCapability: boolean;
  /** 1-3 sentences describing the dossier. */
  summary: string;
  envVars?: DossierEnvVar[];
  dependencies?: string[];
  files?: DossierFile[];
  exposes?: DossierExposes[];
  /** ISO date YYYY-MM-DD when a human last validated the dossier. */
  lastVerified: string;
  sourceRepoUrl?: string;
  notes?: string;
  /** How much of instructions.md reaches the prompt. Default "compact". */
  promptInstructionMode?: PromptInstructionMode;
  /** Lazy-loaded from `instructions.md` by the registry on selection. */
  instructions?: string;
}

/** Output of `selectDossiersForRequest`. */
export interface SelectedDossier {
  entry: DossierEntry;
  /** Why this dossier was picked. */
  reason: "capability-match" | "default-fallback";
  /**
   * True if all required envVars are present in `process.env`.
   * Soft dossiers (no envVars) are always configured.
   * Hard dossiers without configured envVars are still injected, but the
   * codegen LLM is told to render an "unconfigured" placeholder UI.
   */
  configured: boolean;
}

export interface DossierSelectionResult {
  /** Selected dossiers in the order capabilities appear in the brief. */
  selected: SelectedDossier[];
  /** Total number of dossiers in the active pool. */
  poolSize: number;
  /** capability → list of selected dossier ids (for logging). */
  byCapability: Record<string, string[]>;
}

/**
 * Default file injection mode resolution.
 * Manifests can omit `files[].injectionMode`; this falls back to the
 * dossier-level `codeFidelity`.
 */
export function defaultInjectionMode(file: DossierFile, entry: DossierEntry): CodeFidelity {
  return file.injectionMode ?? entry.codeFidelity;
}
