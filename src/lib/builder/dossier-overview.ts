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
 * - `self-contained` — soft dossier, no external keys.
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
   * Manifest `mock` — how the surface behaves in F2 without a real key.
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
 * reach (e.g. the analytics dossiers — warn-only keys, no server file). Saying
 * "inga externa nycklar behövs" about a dossier that does have keys is simply
 * false, so the hard variant gets its own honest wording.
 */
export function describeDossierStatus(
  status: DossierStatus,
  lifecycleStage: "design" | "integrations",
  dossierClass?: "hard" | "soft",
): DossierStatusDescriptor {
  switch (status) {
    case "self-contained":
      return {
        label: "Inkopplad",
        tone: "neutral",
        hint:
          dossierClass === "hard"
            ? "Kräver ingen \u201dBygg integrationer\u201d-runda. Nycklarna är valfria — utan dem stänger funktionen av sig själv."
            : "Självförsörjande byggblock — inga externa nycklar behövs.",
      };
    case "built-live":
      return {
        label: "Byggd — live",
        tone: "success",
        hint: "Integrationskoden är inkopplad och alla nycklar har riktiga värden — funktionen kör på riktigt.",
      };
    case "built-demo":
      return {
        label: "Byggd — demo aktiv",
        tone: "warning",
        // Two causes share this status (M#li1): a missing runtime key, or
        // filled keys WITHOUT server-side file evidence in the version — the
        // copy must not claim the code is wired when the cap was evidence.
        hint: "Funktionen kör i demo-läge — en runtime-nyckel saknas, eller så är integrationens serverkod inte påvisad i den här versionen ännu.",
      };
    case "blocked-build":
      return {
        label: "Blockerad — nyckel krävs",
        tone: "warning",
        hint: "En byggnödvändig nyckel saknar riktigt värde. \u201dBygg integrationer\u201d stoppas (utan kostnad) tills den fyllts i.",
      };
    case "planned":
    default:
      return {
        label:
          lifecycleStage === "integrations"
            ? "Planerad — ej byggd"
            : "Planerad — kopplas in i nästa steg",
        tone: "muted",
        hint:
          lifecycleStage === "integrations"
            ? "Integrationens riktiga kod är ännu inte inkopplad i versionen."
            : "Designsteget ritar bara ytan — knappen eller formuläret syns, men ingen tjänst är inkopplad ännu. Det sker vid \u201dBygg integrationer\u201d.",
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
      label: "Kräver riktigt värde",
      tone: "warning",
      hint: "Nödvändig nyckel — integrationsbygget (F3) blockeras tills ett riktigt värde finns.",
    };
  }
  if (env.enforcement === "feature-runtime") {
    return {
      label: "Lägg till för livefunktion",
      tone: "warning",
      hint: "Blockerar inte bygget — funktionen kör i demo-läge tills du sparar ett riktigt värde.",
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
    hint: "Valfri nyckel — funktionen inaktiverar sig själv tyst utan värde.",
  };
}
