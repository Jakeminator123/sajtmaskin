/**
 * Shared, client-safe types + labels for the builder "Dossiers" panel.
 *
 * The server route `GET /api/engine/chats/[chatId]/dossiers` produces
 * `DossierOverviewResponse`; the client `PreviewPanelDossiers` component
 * consumes it. Keeping the contract here (no server imports) lets both sides
 * share it without pulling server-only code into the client bundle.
 */

import type { DossierMockMode, SelectedDossier } from "@/lib/gen/dossiers/types";
import type { DossierLifecycleOverviewStatus } from "@/lib/gen/dossiers/lifecycle";

/**
 * Hard-dossier status model (PR 1 av Byggblock-ägarbeslutet 2026-07-13).
 *
 * - `self-contained` — no separate integration build is required; this can
 *   apply to either class (for example keyless, client-only analytics).
 * - `planned` — requested but its real integration code is not in the
 *   version yet (F2 renders the mock/demo surface). Missing manifest keys
 *   surface as per-key badges, never as blocked-build — the finalize gate
 *   only validates detected integrations (+ pending approved providers).
 * - `blocked-build` — the readiness gate reports a `build`-enforced key
 *   without either a real value or an approved placeholder for a DETECTED
 *   integration. "Bygg integrationer" would 412 before credits (#517).
 * - `built-demo` — real integration code is in the version but at least one
 *   `feature-runtime` key lacks a real value → the shipped demo fallback
 *   (canned/seed/success) is what actually runs. Also the cap (M#li1) when
 *   the block lacks server-side file evidence in the version (manifest
 *   server file or an API route referencing its env keys) — filled keys
 *   alone never make a client-side mock "live".
 * - `built-live` — code is in the version, every build/feature-runtime key
 *   has a stored real value, AND the server side is evidenced in the
 *   version's files.
 */
export type DossierStatus = DossierLifecycleOverviewStatus;

export interface DossierOverviewEnvVar {
  key: string;
  required: boolean;
  enforcement: "build" | "feature-runtime" | "warn-only";
  purpose: string;
  setupUrl?: string;
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
  /** Swedish catalog description (manifest `summarySv`); fallback: `summary`. */
  summarySv?: string;
  complexity: "simple" | "medium" | "advanced";
  requiresF3: boolean;
  /**
   * Manifest `mock` — how the surface behaves in F2 without live configuration.
   * Omitted = `none`, same as runtime. Independent of both `class` and
   * `requiresF3`; see `dossier-axes.ts`.
   */
  mock?: DossierMockMode;
  configured: boolean;
  dependencies: string[];
  envVars: DossierOverviewEnvVar[];
  status: DossierStatus;
  /**
   * BUILD-enforced env keys lacking both a real value and placeholder coverage
   * (the F3-blocking set — same scope as the 412 gate's
   * `missingByIntegration`). Non-empty ⇒ `blocked-build`.
   */
  missingKeys: string[];
  /**
   * Missing `feature-runtime` real env keys ("lägg till för livefunktion").
   * They never block F3; non-empty on a built dossier ⇒ `built-demo`.
   */
  missingLiveKeys: string[];
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
    builtLive: number;
    builtDemo: number;
    blockedBuild: number;
    planned: number;
  };
  dossiers: DossierOverviewEntry[];
}

/**
 * Rebuild the minimal {@link SelectedDossier} shape the integration detector
 * needs (`entry.envVars` per-key enforcement) from a dossiers-overview
 * response. Lets a client surface (the F3 env panel) scope
 * `detectIntegrationsFromVersionFiles` to the SAME dossier set the readiness
 * route uses — so a detected integration WITHOUT a matching selected dossier
 * downgrades to warn-only instead of demanding every env key it references.
 *
 * The detector reads only `entry.envVars`; the remaining `DossierEntry` fields
 * are filled with harmless, valid placeholders (they never influence detection)
 * so the result is a well-typed `SelectedDossier` without a cast.
 */
export function selectedDossiersFromOverview(dossiers: DossierOverviewEntry[]): SelectedDossier[] {
  return dossiers.map((dossier) => ({
    entry: {
      class: dossier.class,
      id: dossier.id,
      label: dossier.label,
      capability: dossier.capability,
      codeFidelity: "rewritable",
      complexity: dossier.complexity,
      defaultForCapability: false,
      summary: dossier.summary,
      dependencies: dossier.dependencies,
      envVars: dossier.envVars.map((env) => ({
        key: env.key,
        required: env.required,
        purpose: env.purpose,
        setupUrl: env.setupUrl,
        enforcement: env.enforcement,
      })),
      lastVerified: dossier.lastVerified,
    },
    reason: "capability-match",
    configured: dossier.configured,
  }));
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
 *
 * `dossierClass` is optional but matters for `self-contained`: the route sets
 * that status from `!requiresF3`, which a KOPPLAD (hard) dossier can also
 * reach (e.g. vercel-analytics — `envVars: []`, client-only, self-disables
 * without a hosting token). A hard dossier can still have optional keys, so
 * its wording stays neutral about configuration and live behavior.
 */
export function describeDossierStatus(
  status: DossierStatus,
  lifecycleStage: "design" | "integrations",
  dossierClass?: "hard" | "soft",
): DossierStatusDescriptor {
  switch (status) {
    case "self-contained":
      return {
        label: "Klar",
        tone: "neutral",
        hint:
          dossierClass === "hard"
            ? "Providerkopplingen kräver inget separat integrationsbygge. Konfiguration och livebeteende avgörs separat."
            : "Fungerar direkt — ingen deklarerad integrationsprovider eller hemlig nyckel behövs.",
      };
    case "built-live":
      return {
        label: "Live",
        tone: "success",
        hint: "Funktionen använder den externa tjänsten och kör på riktigt.",
      };
    case "built-demo":
      return {
        label: "Demo",
        tone: "warning",
        // Two causes share this status (M#li1): a missing runtime key, or
        // filled keys WITHOUT server-side file evidence in the version — the
        // copy must not claim the code is wired when the cap was evidence.
        hint: "Funktionen kör i demo-läge — en runtime-nyckel saknas, eller så är integrationens serverkod inte påvisad i den här versionen ännu.",
      };
    case "blocked-build":
      return {
        label: "Nyckel krävs",
        tone: "warning",
        hint: "Lägg till den saknade nyckeln innan du kör \u201dBygg integrationer\u201d.",
      };
    case "planned":
    default:
      return {
        label: "Inte byggd än",
        tone: "muted",
        hint:
          lifecycleStage === "integrations"
            ? "Funktionen blev inte färdig i integrationsbygget. Kör \u201dBygg integrationer\u201d igen."
            : "Ytan kan visas som demo. Kör \u201dBygg integrationer\u201d för riktig funktion.",
      };
  }
}

/**
 * Per-key value-state label + tone, shared so every surface that shows an env
 * key uses the same vocabulary. Precedence: a stored real value wins; then a
 * build-enforced key with no value is a hard requirement; then a
 * feature-runtime key with no value is "add for live" (the demo fallback is
 * what actually runs — placeholder coverage only keeps the preview booting,
 * it never makes the function live); then placeholder coverage; otherwise
 * the key is optional (warn-only self-disables).
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
      label: "Lägg till före bygge",
      tone: "warning",
      hint: "Integrationsbygget väntar tills ett riktigt värde finns.",
    };
  }
  if (env.enforcement === "feature-runtime") {
    return {
      label: "Lägg till för att gå live",
      tone: "warning",
      hint: "Blockerar inte bygget — funktionen kör i demo-läge tills du sparar ett riktigt värde.",
    };
  }
  if (env.placeholderCovered) {
    return {
      label: "Demo-värde används",
      tone: "muted",
      hint: "Previewn använder ett ofarligt demo-värde. Inget riktigt värde krävs för att bygga.",
    };
  }
  return {
    label: "Valfri",
    tone: "muted",
    hint: "Valfri nyckel — funktionen inaktiverar sig själv tyst utan värde.",
  };
}
