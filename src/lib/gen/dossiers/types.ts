/**
 * Dossier runtime types (v2).
 *
 * Source-of-truth: data/dossiers/{hard|soft}/<id>/manifest.json
 * Schema:          docs/schemas/strict/dossier.schema.json
 * Architecture:    docs/contracts/dossier-system.md
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

/**
 * Declares how a dossier makes its VISUAL surface work in F2/preview WITHOUT a
 * real key (env var missing OR a preview stub value). Drives the demo/mock
 * behavior baked into the dossier's own component code (the emitted user-site
 * code) plus the codegen prompt hint (`renderCompactDossierInstructions`).
 *
 * - `"canned"`: server route returns a believable fabricated response in demo
 *   mode — the chatbot streams a canned reply, image generation returns a
 *   deterministic placeholder image. Real path resumes once a real key is set.
 * - `"seed"`: the data layer falls back to shipped seed data when the
 *   connection string is missing/placeholder (DB dossiers render `seedData` +
 *   a discreet `<DbConfigNotice />`). Deliberately chosen OVER an in-preview
 *   SQLite: `better-sqlite3` needs a native build on the preview VM (fragile),
 *   whereas in-memory seed data gives the same visual result with zero native
 *   deps.
 * - `"success"`: mutation endpoints return a fake success + a demo notice
 *   (contact form, newsletter subscribe).
 * - `"visual"`: the interactive surface renders fully (checkout button, login
 *   controls, live widget) and the ACTION opens an honest demo notice/modal
 *   instead of performing the real operation — no fake sessions, no fake
 *   charges, no fake transport. The real backend activates when provider
 *   values are set (payments, auth, subscriptions, realtime).
 * - `"none"`: no meaningful demo surface at all → the UI shows a discreet
 *   demo/configuration banner (the `IntegrationConfigNotice` pattern) or
 *   self-disables (analytics/error-tracking).
 *
 * Omitted `mock` = `"none"` behavior (backwards compatible). Mock values are
 * F2/preview-only — never persisted to `projectEnvVars` and never shipped to a
 * real deploy.
 */
export type DossierMockMode = "canned" | "seed" | "success" | "visual" | "none";

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
  /**
   * Optional provider-specific keywords that mark an EXPLICIT ask for this
   * dossier when several dossiers share one capability (e.g. "mongodb" on
   * mongodb-atlas under `database`). A prompt hit overrides the
   * `defaultForCapability` pick — see `pickForCapability` in `select.ts`.
   */
  relevanceKeywords?: string[];
  /** 1-3 sentences describing the dossier (English — reaches the prompt). */
  summary: string;
  /**
   * Optional Swedish catalog description shown in user-facing UI (builder
   * Byggblock panel, backoffice). Never reaches the codegen prompt — the
   * English `summary` stays the prompt surface. Falls back to `summary`
   * when omitted.
   */
  summarySv?: string;
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
  /**
   * How the dossier renders its visual surface in F2/preview without a real
   * key. Omitted = `"none"` (discreet demo banner). See {@link DossierMockMode}.
   */
  mock?: DossierMockMode;
  /** Lazy-loaded from `instructions.md` by the registry on selection. */
  instructions?: string;
}

/** Output of `selectDossiersForRequest`. */
export interface SelectedDossier {
  entry: DossierEntry;
  /** Why this dossier was picked. */
  reason: "capability-match" | "default-fallback" | "relevance-keyword" | "dependency-pin";
  /**
   * True if all required envVars have a real stored value for the current
   * project (via `SelectDossiersOptions.configuredEnvKeys`). Soft dossiers (no
   * envVars) are always configured. Hard dossiers without configured envVars
   * are still injected, but the codegen LLM is told to render an
   * "unconfigured" placeholder UI. Prompt-only signal — not wired to any gate.
   *
   * Legacy fallback: when no `configuredEnvKeys` is supplied it reads the
   * platform `process.env`, which is wrong for user projects (deprecated).
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

/**
 * Canonical F2/F3 signal: does this dossier require F3 (a real integration)?
 * This is the SINGLE source of truth for "needs F3" — derived from the
 * dossier's own contract, not a hardcoded capability list. Two rules:
 *
 * 1. **Env contract:** any `enforcement: "build"` env var (the default when
 *    `enforcement` is omitted, per `DossierEnvVarEnforcement`) needs a real
 *    value before the F3 build can succeed.
 * 2. **Server surface:** any `files[].role === "server"` file. A dossier that
 *    ships backend wiring (API route, middleware, server config) is real
 *    integration glue that F2 must not emit — F2 is the visual-mockup stage,
 *    and those server files typically import tier-3 SDKs that the F2 deny-list
 *    (`config/integrations/tier3-sdk-deny.json`) strips, which would break the
 *    verbatim route. Example: `resend-contact-form`'s `/api/contact` route —
 *    all its env keys are `feature-runtime` (rule 1 is false), yet the
 *    integration itself belongs in F3; F2 renders the form as a mockup.
 *
 * `envVars: []` + client-only files (soft/self-contained dossiers, e.g.
 * `interactive-game-loop`, `three-fiber-canvas`) => fully F2-usable.
 * Extend the rule HERE if a future case needs it — never re-derive the
 * boundary in a separate hardcoded list.
 */
export function dossierRequiresF3(
  entry: Pick<DossierEntry, "envVars" | "files">,
): boolean {
  if ((entry.envVars ?? []).some((env) => (env.enforcement ?? "build") === "build")) {
    return true;
  }
  return (entry.files ?? []).some((file) => file.role === "server");
}
