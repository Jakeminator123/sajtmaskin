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
        label: lifecycleStage === "integrations" ? "Ej byggd" : "Ej byggd (F2)",
        tone: "muted",
        hint:
          lifecycleStage === "integrations"
            ? "Tung integration som ännu inte wire:ats in i versionen."
            : "Tung integration renderas som mockup i F2. Bygg den via 'Bygg integrationer'.",
      };
  }
}
