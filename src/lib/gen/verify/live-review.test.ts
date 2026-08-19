import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCacheForTests } from "@/lib/env";

const generateObject = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => ({ id: "mock-model" })));
const getWorkloadDefaultModelFromManifest = vi.hoisted(() => vi.fn(() => "gpt-4o"));
const uploadBlob = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel }));
vi.mock("@/lib/ai-models/load-manifest", () => ({
  getWorkloadDefaultModelFromManifest,
  getWorkloadFallbackModelsFromManifest: () => ["gpt-5.5"],
}));
vi.mock("@/lib/vercel/blob-service", () => ({ uploadBlob }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage: vi.fn() }));

import {
  assembleReviewBundle,
  isLiveReviewEnabled,
  listChangedFiles,
  parseReviewDecision,
  persistLiveReviewJpeg,
  pickUserRequest,
  runLiveReview,
  shouldRunLiveReview,
  summarizeBrief,
} from "./live-review";

describe("isLiveReviewEnabled", () => {
  beforeEach(() => {
    resetServerEnvCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvCacheForTests();
  });

  it("är av som default", () => {
    vi.stubEnv("SAJTMASKIN_LIVE_REVIEW", "");
    resetServerEnvCacheForTests();
    expect(isLiveReviewEnabled()).toBe(false);
  });

  it("slås på av 1 eller true", () => {
    vi.stubEnv("SAJTMASKIN_LIVE_REVIEW", "1");
    resetServerEnvCacheForTests();
    expect(isLiveReviewEnabled()).toBe(true);
  });
});

describe("parseReviewDecision", () => {
  it("accepterar giltig modelloutput", () => {
    const decision = parseReviewDecision({
      verdict: "micro_fix",
      confidence: 0.7,
      rationale: "Hero är ljus trots att briefen bad om mörkt.",
      reasoning: "Skärmbilden visar vit bakgrund.",
      issues: [
        {
          severity: "high",
          evidence: "Desktop-skärmbilden är ljus.",
          target: "app/globals.css",
          suggestedOperation: "Byt till mörk bakgrund i hero.",
        },
      ],
    });
    expect(decision.verdict).toBe("micro_fix");
    expect(decision.issues).toHaveLength(1);
  });

  it("faller säkert vid trasig modelloutput", () => {
    expect(parseReviewDecision(null).verdict).toBe("advisory");
    expect(parseReviewDecision({ verdict: "explode" }).verdict).toBe("advisory");
    expect(parseReviewDecision({ verdict: "pass" }).confidence).toBe(0);
    expect(parseReviewDecision("not-json").issues).toEqual([]);
  });
});

describe("shouldRunLiveReview", () => {
  it("kör inte när flaggan är av, postcheck skippades eller preview inte bootade", () => {
    expect(
      shouldRunLiveReview({
        enabled: false,
        skipped: false,
        findings: [],
        parentVersionId: null,
      }).run,
    ).toBe(false);
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: true,
        findings: [],
        parentVersionId: null,
      }).reason,
    ).toBe("postcheck_skipped");
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [{ code: "preview_boot_page", message: "boot" }],
        parentVersionId: null,
      }).reason,
    ).toBe("preview_not_ready");
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [{ code: "runtime_crash", message: "boom" }],
        parentVersionId: null,
      }).reason,
    ).toBe("runtime_crash");
  });

  it("hoppar över follow-up utan sensorlarm men kör init och larmat follow-up", () => {
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [],
        parentVersionId: "ver_parent",
      }).reason,
    ).toBe("followup_no_sensor");
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [],
        parentVersionId: null,
      }).run,
    ).toBe(true);
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [{ code: "console_error", message: "x" }],
        parentVersionId: "ver_parent",
      }).run,
    ).toBe(true);
  });
});

describe("bundle helpers", () => {
  it("plockar senaste riktiga användarprompten", () => {
    expect(
      pickUserRequest([
        { role: "user", content: "Bygg en mörk sajt" },
        { role: "assistant", content: "klart" },
        { role: "user", content: "AUTO-FIX REQUEST\nfixa" },
      ]),
    ).toBe("Bygg en mörk sajt");
  });

  it("listar ändrade filer mot föräldern", () => {
    const current = JSON.stringify([
      { path: "app/page.tsx", content: "new" },
      { path: "app/layout.tsx", content: "same" },
    ]);
    const parent = JSON.stringify([
      { path: "app/page.tsx", content: "old" },
      { path: "app/layout.tsx", content: "same" },
      { path: "app/old.tsx", content: "gone" },
    ]);
    expect(listChangedFiles(current, parent).sort()).toEqual(["- app/old.tsx", "~ app/page.tsx"]);
  });

  it("sammanfattar briefen utan att kräva hela objektet", () => {
    expect(
      summarizeBrief({
        briefSummary: {
          projectTitle: "Nova",
          styleKeywords: ["mörk", "futuristisk"],
        },
        variantId: "dark-luxe",
      }),
    ).toContain("Nova");
  });

  it("sätter ihop ReviewBundle med felklasser", () => {
    const bundle = assembleReviewBundle({
      versionId: "v2",
      parentVersionId: "v1",
      userRequest: "gör den mörk",
      briefSummary: "mörk",
      changedFiles: ["~ app/page.tsx"],
      screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
      findings: [
        { code: "console_error", message: "Hydration failed" },
        { code: "request_failed", message: "GET /x failed" },
        { code: "runtime_crash", message: "Next.js-felöverlägg visas." },
      ],
      domSummary: {
        title: "Nova",
        headings: ["Hero"],
        ctaLabels: ["Boka"],
        imageCount: 1,
        formCount: 0,
      },
    });
    expect(bundle.consoleErrors).toEqual(["Hydration failed"]);
    expect(bundle.failedRequests).toEqual(["GET /x failed"]);
    expect(bundle.nextOverlayErrors).toEqual(["Next.js-felöverlägg visas."]);
  });
});

describe("persistLiveReviewJpeg", () => {
  it("returnerar null när blob-uppladdning misslyckas", async () => {
    uploadBlob.mockRejectedValueOnce(new Error("nope"));
    await expect(
      persistLiveReviewJpeg({
        buffer: Buffer.from("jpg"),
        chatId: "chat_1",
        versionId: "v1",
        viewport: "desktop",
      }),
    ).resolves.toBeNull();
  });
});

describe("runLiveReview", () => {
  beforeEach(() => {
    generateObject.mockReset();
    createDirectModel.mockClear();
  });

  it("returnerar completed vid giltigt generateObject-svar", async () => {
    generateObject.mockResolvedValue({
      object: {
        verdict: "pass",
        confidence: 0.9,
        rationale: "Sajten följer briefen.",
        reasoning: "Mörk hero, samma CTA.",
        issues: [],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "mörk sajt",
        briefSummary: "mörk",
        changedFiles: [],
        screenshots: { desktopUrl: null, mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.decision.verdict).toBe("pass");
      expect(result.modelId).toBe("gpt-4o");
    }
  });

  it("degraderar trasig modelloutput till skipped/invalid", async () => {
    generateObject.mockResolvedValue({
      object: { nope: true },
      usage: {},
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: null, mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "invalid_model_output" });
  });

  it("degraderar saknad API-nyckel till skipped", async () => {
    createDirectModel.mockImplementationOnce(() => {
      throw new Error("OPENAI_API_KEY is required for OpenAI models.");
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: null, mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "model_unavailable" });
  });
});
