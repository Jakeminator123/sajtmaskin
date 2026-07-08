/**
 * Shared, client-safe types + labels for the builder "Dossiers" panel.
 *
 * The server route `GET /api/engine/chats/[chatId]/dossiers` produces
 * `DossierOverviewResponse`; the client `PreviewPanelDossiers` component
 * consumes it. Keeping the contract here (no server imports) lets both sides
 * share it without pulling server-only code into the client bundle.
 */

export type DossierStatus =
  | "self-contained"
  | "not-built"
  | "built-needs-keys"
  | "built-ready";

export interface DossierOverviewEnvVar {
  key: string;
  required: boolean;
  enforcement: "build" | "feature-runtime" | "warn-only";
  purpose: string;
  /**
   * True when the user has stored a non-empty real value for this key
   * (`project_data.meta.projectEnvVars`). Lets the UI show "Ifylld" without a
   * second round-trip.
   */
  hasRealValue: boolean;
  /**
   * True when the key is covered by an auto-injected placeholder in F2
   * (`loadPlaceholderKeySet()`), so the preview boots without a real value.
   * Distinguishes "auto-stubbat i F2" from "du måste fylla i".
   */
  placeholderCovered: boolean;
}

export interface DossierOverviewEntry {
  id: string;
  label: string;
  class: "hard" | "soft";
  capability: string;
  summary: string;
  complexity: "simple" | "medium" | "advanced";
  requiresF3: boolean;
  configured: boolean;
  dependencies: string[];
  envVars: DossierOverviewEnvVar[];
  status: DossierStatus;
  /** Missing real env keys when status is "built-needs-keys". */
  missingKeys: string[];
  lastVerified: string;
}

export interface DossierOverviewResponse {
  success: true;
  /**
   * App-project id that owns the stored env vars, so the panel can write keys
   * via `POST /api/v0/projects/[projectId]/env-vars` without an extra lookup.
   * Null when the chat has no linked app project (keys cannot be stored yet).
   */
  projectId: string | null;
  versionId: string | null;
  lifecycleStage: "design" | "integrations";
  /** False when the version's files could not be read (build status unknown). */
  versionFilesAvailable: boolean;
  counts: {
    total: number;
    hard: number;
    soft: number;
    builtReady: number;
    builtNeedsKeys: number;
    notBuilt: number;
  };
  dossiers: DossierOverviewEntry[];
}

export interface DossierStatusDescriptor {
  label: string;
  /** Tone drives the badge colour in the UI. */
  tone: "neutral" | "success" | "warning" | "muted";
  hint: string;
}

/**
 * Human-facing status label + tone for a dossier row. Kept here (not in the
 * component) so the route's status enum and the UI copy stay in one place.
 */
export function describeDossierStatus(
  status: DossierStatus,
  lifecycleStage: "design" | "integrations",
): DossierStatusDescriptor {
  switch (status) {
    case "self-contained":
      return {
        label: "Inkopplad",
        tone: "neutral",
        hint: "Självförsörjande byggblock — inga externa nycklar behövs.",
      };
    case "built-ready":
      return {
        label: "Byggd",
        tone: "success",
        hint: "Integrationen är inkopplad i den aktiva versionen och har de nycklar den kräver.",
      };
    case "built-needs-keys":
      return {
        label: "Byggd — saknar nycklar",
        tone: "warning",
        hint: "Integrationen är inkopplad men saknar riktiga env-värden.",
      };
    case "not-built":
    default:
      return {
        label: lifecycleStage === "integrations" ? "Ej byggd" : "Planerad (F2-mockup)",
        tone: "muted",
        hint:
          lifecycleStage === "integrations"
            ? "Tung integration som ännu inte wire:ats in i versionen."
            : "Planerad integration — kräver F3 (\"Bygg integrationer\") och riktiga env-nycklar. Visas som mockup/infoskylt i F2-previewn tills den byggs.",
      };
  }
}

/**
 * Per-key value-state label + tone, shared so every surface that shows an env
 * key uses the same vocabulary. Precedence: a stored real value wins; then a
 * build-enforced key with no value is a hard requirement; then placeholder
 * coverage (auto-stubbed in F2); otherwise it is optional.
 */
export function describeEnvKeyValueState(
  env: Pick<DossierOverviewEnvVar, "enforcement" | "hasRealValue" | "placeholderCovered">,
): DossierStatusDescriptor {
  if (env.hasRealValue) {
    return {
      label: "Ifylld",
      tone: "success",
      hint: "Ett riktigt värde är sparat för den här nyckeln.",
    };
  }
  if (env.enforcement === "build") {
    return {
      label: "Kräver riktigt värde",
      tone: "warning",
      hint: "Nödvändig nyckel — integrationsbygget (F3) blockeras tills ett riktigt värde finns.",
    };
  }
  if (env.placeholderCovered) {
    return {
      label: "Auto-placeholder i F2",
      tone: "muted",
      hint: "Täcks av en automatisk platshållare i F2-previewn — inget riktigt värde krävs för att bygga.",
    };
  }
  return {
    label: "Valfri",
    tone: "muted",
    hint: "Funktionen aktiveras när ett värde fylls i, men krävs inte.",
  };
}
