import type { RoutePlan } from "./route-plan";
import type { PreflightIssueCategory, SandboxStartContract } from "@/lib/gen/stream/preflight-contract";

export type PreviewDiagnosticCode =
  | "preflight_preview_blocked"
  | "preflight_verification_blocked"
  | "preview_waiting_for_sandbox"
  | "render_route_version_not_found"
  | "render_route_chat_not_found"
  | "render_route_files_missing"
  | "render_route_no_renderable_component"
  | "preview_compile_error"
  | "preview_validation_error"
  | "preview_runtime_error"
  | "preview_react_render_error"
  | "preview_transport_error"
  | "preview_ready_timeout"
  | "preview_document_unavailable"
  | "preview_route_error"
  | "preview_missing_url"
  | "preview_unknown_error";

export type PreviewDiagnosticStage = "preflight" | "render-route" | "preview-script" | "iframe";
export type PreviewRenderOutcomeStatus = "success" | "failure" | null;
export type ScaffoldRetryState = {
  currentScaffoldId: string;
  currentScaffoldLabel: string;
  suggestedScaffoldId: string;
  suggestedScaffoldLabel: string;
  suggestedScaffoldFamily: string;
  failureType: string;
  reason: string;
  source: "heuristic" | "keyword" | "embedding";
  confidence: "medium" | "high";
};

export type PreviewPreflightState = {
  previewBlocked: boolean;
  verificationBlocked: boolean;
  previewBlockingReason: string | null;
  primaryPreviewTarget?: "sandbox" | "none";
  issueCategories?: PreflightIssueCategory[] | null;
  sandbox?: SandboxStartContract | null;
  scaffoldRetry?: ScaffoldRetryState | null;
  routePlan?: RoutePlan | null;
};
export type PreviewPreflightSummary = PreviewPreflightState & {
  issueCount: number;
  errorCount: number;
  warningCount: number;
};

export type PreviewRenderOutcomeState = {
  versionId: string | null;
  status: PreviewRenderOutcomeStatus;
};

export const INITIAL_PREVIEW_RENDER_OUTCOME_STATE: PreviewRenderOutcomeState = {
  versionId: null,
  status: null,
};

export function previewDiagnosticCodeFromKind(kind?: string | null): PreviewDiagnosticCode {
  switch ((kind ?? "").trim()) {
    case "compile":
      return "preview_compile_error";
    case "validation":
      return "preview_validation_error";
    case "react-render":
      return "preview_react_render_error";
    case "transport":
      return "preview_transport_error";
    case "route":
      return "preview_route_error";
    case "runtime":
      return "preview_runtime_error";
    default:
      return "preview_unknown_error";
  }
}

export function previewDiagnosticStageFromKind(kind?: string | null): PreviewDiagnosticStage {
  switch ((kind ?? "").trim()) {
    case "route":
      return "render-route";
    case "transport":
      return "iframe";
    case "compile":
    case "validation":
    case "react-render":
    case "runtime":
    default:
      return "preview-script";
  }
}

export function describePreviewDiagnosticCode(code?: string | null): string | null {
  switch ((code ?? "").trim()) {
    case "preflight_preview_blocked":
      return "Preview blockerades redan i preflight.";
    case "preflight_verification_blocked":
      return "Previewn ar tillganglig, men verifieringen hittade blockerande problem.";
    case "preview_waiting_for_sandbox":
      return "Live-preview byggs fortfarande i sandbox.";
    case "render_route_version_not_found":
      return "Preview-route kunde inte hitta versionen.";
    case "render_route_chat_not_found":
      return "Preview-route kunde inte verifiera chatten.";
    case "render_route_files_missing":
      return "Preview-route hittade inga genererade filer.";
    case "render_route_no_renderable_component":
      return "Preview-route hittade ingen renderbar komponent.";
    case "preview_compile_error":
      return "Previewn kunde inte kompilera genererad kod.";
    case "preview_validation_error":
      return "Previewn stoppades av valideringsfel.";
    case "preview_runtime_error":
      return "Previewn kraschade i runtime.";
    case "preview_react_render_error":
      return "Previewn misslyckades under React-rendering.";
    case "preview_transport_error":
      return "Preview-iframe kunde inte laddas.";
    case "preview_ready_timeout":
      return "Previewn laddade inte klart innan timeout.";
    case "preview_document_unavailable":
      return "Previewns iframe-dokument kunde inte lasas.";
    case "preview_route_error":
      return "Preview-route returnerade ett fel.";
    case "preview_missing_url":
      return "Preview-lank saknas for versionen.";
    case "preview_unknown_error":
      return "Previewn misslyckades av okand anledning.";
    default:
      return null;
  }
}

/**
 * Korta åtgärdsrader för preview-overlay och runbook — visas i UI när iframe-fel inträffar.
 * Full operativ text: `docs/architecture/preview-white-screen-runbook.md`.
 */
export function previewRunbookLinesForCode(code: string | null | undefined): string[] {
  const c = (code ?? "").trim();
  const docHint =
    "Utvecklare: full runbook finns i repot under docs/architecture/preview-white-screen-runbook.md.";
  switch (c) {
    case "preview_ready_timeout":
      return [
        "Shim-preview laddar React och Tailwind från CDN — öppna DevTools för iframe preview-iframe och kontrollera Network (unpkg, cdn.tailwindcss.com) att allt får 200.",
        "Om #root förblir tom: ofta blockerad CDN, eller genererad sida returnerar inget synligt DOM (null/ krasch).",
        "Om live-preview (sandbox) finns för versionen: byt till den — då körs riktig Next.js i stället för shim.",
        docHint,
      ];
    case "preview_document_unavailable":
      return [
        "Webbläsaren tillät inte läsning av iframe-dokumentet (cross-origin eller säkerhetsbegränsning). Prova Öppna i ny flik.",
        "Om det bara gäller inbäddad vy: ladda om sidan eller byt webbläsare.",
        docHint,
      ];
    case "preview_transport_error":
      return [
        "Iframe kunde inte ladda URL:en (nätverk eller ogiltig preview-URL). Kontrollera att versionen har demoUrl och att servern svarar.",
        docHint,
      ];
    case "preview_waiting_for_sandbox":
      return [
        "Sandbox är nu primär previewväg för den här versionen. Vänta på att npm install och dev-servern blir klara innan live-preview visas.",
        "Om det fastnar länge: kontrollera sandbox-loggar, npm install-fel och readiness-timeout enligt runbooken.",
        docHint,
      ];
    case "preview_compile_error":
    case "preview_validation_error":
      return [
        "Genererad kod uppfyller inte shim-transpilering eller validering. Använd agentlogg / Kodvy och Försök reparera preview om det finns.",
        docHint,
      ];
    case "preview_runtime_error":
    case "preview_react_render_error":
      return [
        "Fel inträffade när preview-skriptet körde. Öppna DevTools → Console i iframe och läs stacktrace.",
        docHint,
      ];
    default:
      return [
        "Kontrollera Agentloggen och versionsfel-logg (preview) för samma version.",
        "Skilj på shim (/api/preview-render) och sandbox — sandbox kräver Vercel Sandbox-credentials på servern.",
        docHint,
      ];
  }
}

export function readPreviewDiagnosticMeta(meta: unknown): {
  previewCode: string | null;
  previewStage: string | null;
  previewSource: string | null;
  previewKind: string | null;
  previewBlocked: boolean | null;
  verificationBlocked: boolean | null;
} {
  const data = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  return {
    previewCode: typeof data.previewCode === "string" ? data.previewCode : null,
    previewStage: typeof data.previewStage === "string" ? data.previewStage : null,
    previewSource:
      typeof data.previewSource === "string"
        ? data.previewSource
        : typeof data.source === "string"
          ? data.source
          : null,
    previewKind: typeof data.previewKind === "string" ? data.previewKind : null,
    previewBlocked: typeof data.previewBlocked === "boolean" ? data.previewBlocked : null,
    verificationBlocked:
      typeof data.verificationBlocked === "boolean" ? data.verificationBlocked : null,
  };
}

export function shouldReportPreviewOutcome(
  current: PreviewRenderOutcomeState,
  versionId: string,
  status: Exclude<PreviewRenderOutcomeStatus, null>,
): boolean {
  return current.versionId !== versionId || current.status !== status;
}

export function nextPreviewRenderOutcomeState(
  versionId: string,
  status: Exclude<PreviewRenderOutcomeStatus, null>,
): PreviewRenderOutcomeState {
  return {
    versionId,
    status,
  };
}

export function shouldAutoFixPreviewDiagnostic(code?: string | null): boolean {
  switch ((code ?? "").trim()) {
    case "preview_compile_error":
    case "preview_validation_error":
    case "preview_runtime_error":
    case "preview_react_render_error":
    case "preview_route_error":
    case "render_route_files_missing":
    case "render_route_no_renderable_component":
    case "preview_unknown_error":
      return true;
    case "render_route_version_not_found":
    case "render_route_chat_not_found":
    case "preview_transport_error":
    case "preview_ready_timeout":
    case "preview_document_unavailable":
    case "preflight_preview_blocked":
    case "preflight_verification_blocked":
    case "preview_waiting_for_sandbox":
    case "preview_missing_url":
    default:
      return false;
  }
}
