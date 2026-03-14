import { describe, expect, it } from "vitest";

import {
  INITIAL_PREVIEW_RENDER_OUTCOME_STATE,
  describePreviewDiagnosticCode,
  nextPreviewRenderOutcomeState,
  previewDiagnosticCodeFromKind,
  previewDiagnosticStageFromKind,
  readPreviewDiagnosticMeta,
  shouldAutoFixPreviewDiagnostic,
  shouldReportPreviewOutcome,
} from "./preview-diagnostics";

describe("preview diagnostics helpers", () => {
  it("maps iframe preview kinds to stable diagnostic codes and stages", () => {
    expect(previewDiagnosticCodeFromKind("compile")).toBe("preview_compile_error");
    expect(previewDiagnosticCodeFromKind("validation")).toBe("preview_validation_error");
    expect(previewDiagnosticCodeFromKind("route")).toBe("preview_route_error");
    expect(previewDiagnosticCodeFromKind("transport")).toBe("preview_transport_error");

    expect(previewDiagnosticStageFromKind("route")).toBe("render-route");
    expect(previewDiagnosticStageFromKind("transport")).toBe("iframe");
    expect(previewDiagnosticStageFromKind("runtime")).toBe("preview-script");
  });

  it("describes stable preview codes with user-facing summaries", () => {
    expect(describePreviewDiagnosticCode("render_route_no_renderable_component")).toBe(
      "Preview-route hittade ingen renderbar komponent.",
    );
    expect(describePreviewDiagnosticCode("preflight_preview_blocked")).toBe(
      "Preview blockerades redan i preflight.",
    );
    expect(describePreviewDiagnosticCode("preview_missing_url")).toBe(
      "Preview-lank saknas for versionen.",
    );
    expect(describePreviewDiagnosticCode("preview_ready_timeout")).toBe(
      "Previewn laddade inte klart innan timeout.",
    );
    expect(describePreviewDiagnosticCode("preview_document_unavailable")).toBe(
      "Previewns iframe-dokument kunde inte lasas.",
    );
  });

  it("extracts normalized preview diagnostic metadata from persisted logs", () => {
    expect(
      readPreviewDiagnosticMeta({
        previewCode: "preview_runtime_error",
        previewStage: "preview-script",
        previewSource: "own-engine-preview",
        previewKind: "runtime",
        previewBlocked: false,
        verificationBlocked: true,
      }),
    ).toEqual({
      previewCode: "preview_runtime_error",
      previewStage: "preview-script",
      previewSource: "own-engine-preview",
      previewKind: "runtime",
      previewBlocked: false,
      verificationBlocked: true,
    });
  });

  it("allows preview outcome transitions between failure and success for the same version", () => {
    expect(shouldReportPreviewOutcome(INITIAL_PREVIEW_RENDER_OUTCOME_STATE, "ver_1", "failure")).toBe(
      true,
    );

    const failureState = nextPreviewRenderOutcomeState("ver_1", "failure");
    expect(shouldReportPreviewOutcome(failureState, "ver_1", "failure")).toBe(false);
    expect(shouldReportPreviewOutcome(failureState, "ver_1", "success")).toBe(true);

    const successState = nextPreviewRenderOutcomeState("ver_1", "success");
    expect(shouldReportPreviewOutcome(successState, "ver_1", "success")).toBe(false);
    expect(shouldReportPreviewOutcome(successState, "ver_1", "failure")).toBe(true);
  });

  it("auto-fixes only code-like preview diagnostics, not transport-like ones", () => {
    expect(shouldAutoFixPreviewDiagnostic("preview_compile_error")).toBe(true);
    expect(shouldAutoFixPreviewDiagnostic("preview_runtime_error")).toBe(true);
    expect(shouldAutoFixPreviewDiagnostic("render_route_no_renderable_component")).toBe(true);

    expect(shouldAutoFixPreviewDiagnostic("preview_transport_error")).toBe(false);
    expect(shouldAutoFixPreviewDiagnostic("preview_ready_timeout")).toBe(false);
    expect(shouldAutoFixPreviewDiagnostic("preview_document_unavailable")).toBe(false);
    expect(shouldAutoFixPreviewDiagnostic("render_route_chat_not_found")).toBe(false);
  });
});
