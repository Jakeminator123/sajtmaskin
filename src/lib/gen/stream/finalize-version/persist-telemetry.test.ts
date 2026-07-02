import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinalizeSyntaxResult } from "./types";

// Fas 0: verifierar att persistTelemetryRecord skriver dossier-valen i
// `meta.selectedDossierIds` (endast när minst en dossier valdes) och att
// tomma/utelämnade listor inte förorenar meta.
const createGenerationTelemetryRecord = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/generation-telemetry", () => ({
  createGenerationTelemetryRecord,
}));

const { persistTelemetryRecord } = await import("./persist-telemetry");

type PersistParams = Parameters<typeof persistTelemetryRecord>[0];

function makeParams(overrides: Partial<PersistParams> = {}): PersistParams {
  return {
    chatId: "chat_1",
    versionId: "ver_1",
    resolvedScaffold: null,
    scaffoldSelection: null,
    model: "claude-opus-4-8",
    buildIntent: undefined,
    repairPassIndex: 0,
    runAutofix: true,
    syntaxResult: { fixerUsed: false } as unknown as FinalizeSyntaxResult,
    preflightErrors: [],
    preflightWarnings: [],
    hasPreviewBlockingPreflightErrors: false,
    hasVerificationBlockingErrors: false,
    previewBlockingReason: null,
    startedAt: Date.now(),
    preflightFileCount: 3,
    scaffoldRetry: null,
    finalizePath: { runDeepPath: true, reason: "default" },
    finalizeStepTelemetry: {},
    autoFixFixCount: 0,
    autoFixWarningCount: 0,
    autoFixDependencyCount: 0,
    autoFixHeavyLoad: false,
    verifierBlocked: false,
    verifierBlockingFindings: [],
    preflightIssueCount: 0,
    finalizedPreviewFileCount: 3,
    unresolvedImportFallbackUsed: false,
    orchestrationStreamMeta: null,
    ...overrides,
  };
}

describe("persistTelemetryRecord — dossier-val (Fas 0)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGenerationTelemetryRecord.mockResolvedValue({ id: "tel_1" });
  });

  it("skriver meta.selectedDossierIds när dossiers valdes", async () => {
    await persistTelemetryRecord(
      makeParams({ selectedDossierIds: ["stripe-checkout", "clerk-auth"] }),
    );
    expect(createGenerationTelemetryRecord).toHaveBeenCalledTimes(1);
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.selectedDossierIds).toEqual(["stripe-checkout", "clerk-auth"]);
  });

  it("utelämnar nyckeln helt när inga dossiers valdes (tom lista)", async () => {
    await persistTelemetryRecord(makeParams({ selectedDossierIds: [] }));
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta).not.toHaveProperty("selectedDossierIds");
  });

  it("utelämnar nyckeln när selectedDossierIds saknas", async () => {
    await persistTelemetryRecord(makeParams());
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta).not.toHaveProperty("selectedDossierIds");
  });
});
