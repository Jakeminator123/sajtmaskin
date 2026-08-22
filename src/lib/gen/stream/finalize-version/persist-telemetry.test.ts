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
    filesJson: "[]",
    lineageHash: null,
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
    streamMs: 0,
    preflightFileCount: 3,
    scaffoldRetry: null,
    finalizePath: { runDeepPath: true, reason: "default" },
    finalizeStepTelemetry: {},
    autoFixFixCount: 0,
    autoFixWarningCount: 0,
    autoFixDependencyCount: 0,
    autoFixRisk: { safeFixCount: 0, riskyFixCount: 0, riskyFixerIds: [] },
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

describe("persistTelemetryRecord — per-fixer-utfall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGenerationTelemetryRecord.mockResolvedValue({ id: "tel_1" });
  });

  it("skriver meta.autofix.fixers så varje fixer går att följa upp i efterhand", async () => {
    await persistTelemetryRecord(
      makeParams({
        autoFixFixCount: 5,
        autoFixFixers: [
          {
            fixer: "react-import-fixer",
            category: "mechanical",
            lane: "mechanical",
            count: 3,
            files: ["app/page.tsx"],
          },
          { fixer: "llm-syntax-fixer", category: "llm", count: 2 },
        ],
      }),
    );

    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.autofix.fixers).toEqual([
      {
        fixer: "react-import-fixer",
        category: "mechanical",
        lane: "mechanical",
        count: 3,
        files: ["app/page.tsx"],
      },
      { fixer: "llm-syntax-fixer", category: "llm", count: 2 },
    ]);
    // Aggregatet ska finnas kvar — `fixers` kompletterar, ersätter inte.
    expect(arg.meta.autofix.fixCount).toBe(5);
  });

  it("utelämnar fixers när ingen fixer ingrep (håller meta jämförbart över tid)", async () => {
    await persistTelemetryRecord(makeParams({ autoFixFixers: [] }));
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.autofix).not.toHaveProperty("fixers");
  });

  it("utelämnar fixers när anroparen inte skickar med dem alls", async () => {
    await persistTelemetryRecord(makeParams());
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.autofix).not.toHaveProperty("fixers");
  });
});

describe("persistTelemetryRecord — variant_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGenerationTelemetryRecord.mockResolvedValue({ id: "tel_1" });
  });

  it("trådar orchestrationStreamMeta.variantId till telemetriraden", async () => {
    await persistTelemetryRecord(
      makeParams({ orchestrationStreamMeta: { variantId: "corporate-grid" } }),
    );
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.variantId).toBe("corporate-grid");
  });

  it("skriver null när meta saknar variantId (legacy-snapshot/eval)", async () => {
    await persistTelemetryRecord(makeParams({ orchestrationStreamMeta: null }));
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.variantId).toBeNull();
  });

  it("normaliserar tom/whitespace-variantId till null", async () => {
    await persistTelemetryRecord(makeParams({ orchestrationStreamMeta: { variantId: "   " } }));
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.variantId).toBeNull();
  });

  it("persists the finalized variant-template id in telemetry meta", async () => {
    await persistTelemetryRecord(
      makeParams({ orchestrationStreamMeta: { variantTemplateId: "template-42" } }),
    );

    const arg = createGenerationTelemetryRecord.mock.calls[0]?.[0];
    expect(arg.meta.variantTemplateId).toBe("template-42");
  });

  it("persisterar variantens beslut och det upplösta designkontraktet i meta", async () => {
    const variantSelection = {
      source: "brief-keyword",
      hintId: "corporate-grid",
      finalId: "editorial-lux",
      changedFromHint: true,
    };
    const resolvedDesign = { schemaVersion: 1, explicitAxes: ["style"] };
    await persistTelemetryRecord(
      makeParams({ orchestrationStreamMeta: { variantSelection, resolvedDesign } }),
    );

    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.variantSelection).toEqual(variantSelection);
    expect(arg.meta.resolvedDesign).toEqual(resolvedDesign);
  });

  it("binds a full sanitized orchestration snapshot to the exact version", async () => {
    await persistTelemetryRecord(
      makeParams({
        buildIntent: "website",
        orchestrationStreamMeta: {
          baseVersionId: "ver_old",
          scaffoldId: "landing-page",
          variantId: "editorial-lux",
          briefSummary: { projectTitle: "Historisk Brief" },
        },
      }),
    );

    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.orchestrationSnapshot).toMatchObject({
      lastVersionId: "ver_1",
      lastChatId: "chat_1",
      baseVersionId: "ver_old",
      scaffoldId: "landing-page",
      variantId: "editorial-lux",
      buildIntent: "website",
      briefSummary: { projectTitle: "Historisk Brief" },
    });
    expect(arg.meta.orchestrationSnapshot.capturedAt).toEqual(expect.any(String));
  });

  it("binds final post-merge dossier evidence to the historical version envelope", async () => {
    await persistTelemetryRecord(
      makeParams({
        filesJson: JSON.stringify([
          {
            path: "app/api/checkout-session/route.ts",
            content: "export async function POST() {}",
          },
        ]),
        orchestrationStreamMeta: {
          fileEvidenceCapabilities: [],
          fileEvidenceDossierIds: [],
        },
      }),
    );

    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.orchestrationSnapshot).toMatchObject({
      fileEvidenceCapabilities: ["payments"],
      fileEvidenceDossierIds: ["stripe-checkout"],
    });
  });

  it("binds finalize lineage to streaming envelopes and lets it override stale meta", async () => {
    await persistTelemetryRecord(
      makeParams({
        lineageHash: "lineage-stream-final",
        orchestrationStreamMeta: { lineageHash: "lineage-stale-meta" },
      }),
    );

    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.orchestrationSnapshot.lineageHash).toBe("lineage-stream-final");
  });

  it("preserves non-stream meta lineage when finalize has no separate hash", async () => {
    await persistTelemetryRecord(
      makeParams({
        lineageHash: null,
        orchestrationStreamMeta: { lineageHash: "lineage-nonstream" },
      }),
    );

    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.orchestrationSnapshot.lineageHash).toBe("lineage-nonstream");
  });

  it("does not invent lineage for legacy callers", async () => {
    await persistTelemetryRecord(makeParams({ lineageHash: null, orchestrationStreamMeta: null }));

    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.orchestrationSnapshot).not.toHaveProperty("lineageHash");
  });
});

describe("persistTelemetryRecord — streamMs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGenerationTelemetryRecord.mockResolvedValue({ id: "tel_1" });
  });

  it("skriver meta.streamMs från den direkta strömmätningen", async () => {
    await persistTelemetryRecord(makeParams({ streamMs: 45_600 }));
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.streamMs).toBe(45_600);
  });

  it("klamrar negativa värden till 0", async () => {
    await persistTelemetryRecord(makeParams({ streamMs: -12 }));
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.streamMs).toBe(0);
  });

  it("behåller postStreamSteps och övriga meta-nycklar (motprov)", async () => {
    await persistTelemetryRecord(
      makeParams({
        streamMs: 1_000,
        finalizeStepTelemetry: {
          autofix: { status: "done", durationMs: 40 },
        },
        selectedDossierIds: ["stripe-checkout"],
      }),
    );
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.streamMs).toBe(1_000);
    expect(arg.meta.postStreamSteps).toEqual({
      autofix: { durationMs: 40, status: "done" },
    });
    expect(arg.meta.selectedDossierIds).toEqual(["stripe-checkout"]);
    expect(arg.meta.finalizePath).toBe("full");
    expect(arg.meta.autofix.fixCount).toBe(0);
  });
});

describe("persistTelemetryRecord — källkvitto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createGenerationTelemetryRecord.mockResolvedValue({ id: "tel_1" });
  });

  it("skriver meta.sources när kvittot har rader", async () => {
    const sources = [
      {
        kind: "ui-recipe",
        id: "hero-01",
        origin: "shadcn-official",
        reason: "hero match; source-code",
        authority: "mönster",
        reachedPrompt: true,
      },
    ];
    await persistTelemetryRecord(makeParams({ orchestrationStreamMeta: { sources } }));
    const arg = createGenerationTelemetryRecord.mock.calls[0][0];
    expect(arg.meta.sources).toEqual(sources);
  });

  it("utelämnar nyckeln när sources är tom eller saknas", async () => {
    await persistTelemetryRecord(makeParams({ orchestrationStreamMeta: { sources: [] } }));
    expect(createGenerationTelemetryRecord.mock.calls[0][0].meta).not.toHaveProperty("sources");

    await persistTelemetryRecord(makeParams());
    expect(createGenerationTelemetryRecord.mock.calls[1][0].meta).not.toHaveProperty("sources");
  });
});
