import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCacheForTests } from "@/lib/env";

const generateObject = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => ({ id: "mock-model" })));
const getWorkloadDefaultModelFromManifest = vi.hoisted(() => vi.fn(() => "gpt-4o"));
const uploadBlob = vi.hoisted(() => vi.fn());
const getPreviousLiveReviewScreenshots = vi.hoisted(() => vi.fn());
const getLatestEngineVersionErrorLogForCategory = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel }));
vi.mock("@/lib/ai-models/load-manifest", () => ({
  getWorkloadDefaultModelFromManifest,
  getWorkloadFallbackModelsFromManifest: () => ["gpt-5.5"],
}));
vi.mock("@/lib/vercel/blob-service", () => ({ uploadBlob }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage: vi.fn() }));
vi.mock("@/lib/db/services/live-review-runs", () => ({ getPreviousLiveReviewScreenshots }));
vi.mock("@/lib/db/services/version-errors", () => ({
  getLatestEngineVersionErrorLogForCategory,
}));

import { recordLlmUsage } from "@/lib/observability/llm-usage";
import {
  LIVE_REVIEW_ATTEMPT_TIMEOUT_MS,
  LIVE_REVIEW_TOTAL_TIMEOUT_MS,
  liveReviewJpegFilename,
  assembleReviewBundle,
  hasCurrentScreenshots,
  isAttachableScreenshotUrl,
  isChatFollowUpVersion,
  isLiveReviewEnabled,
  listChangedFiles,
  maybeAttachLiveReview,
  parseReviewDecision,
  persistLiveReviewJpeg,
  pickPreviousVersionInChat,
  pickUserRequest,
  pickUserRequestForVersion,
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
        isFollowUp: false,
      }).run,
    ).toBe(false);
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: true,
        findings: [],
        isFollowUp: false,
      }).reason,
    ).toBe("postcheck_skipped");
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [{ code: "preview_boot_page", message: "boot" }],
        isFollowUp: false,
      }).reason,
    ).toBe("preview_not_ready");
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [{ code: "runtime_crash", message: "boom" }],
        isFollowUp: false,
      }).reason,
    ).toBe("runtime_crash");
  });

  it("hoppar över oläsbar preview även när postchecken inte blockerade", () => {
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [{ code: "preview_probe_unreadable", message: "tom sida" }],
        isFollowUp: false,
      }).reason,
    ).toBe("preview_unreadable");
  });

  it("kör varje läsbar init och follow-up; sensorlarm är evidens, inte en kostnadsspärr", () => {
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [],
        isFollowUp: true,
      }).run,
    ).toBe(true);
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [],
        isFollowUp: false,
      }).run,
    ).toBe(true);
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [{ code: "console_error", message: "x" }],
        isFollowUp: true,
      }).run,
    ).toBe(true);
  });
});

describe("follow-up signal", () => {
  it("treats version_number > 1 as a chat follow-up, not parent_version_id", () => {
    expect(isChatFollowUpVersion(1)).toBe(false);
    expect(isChatFollowUpVersion(2)).toBe(true);
    expect(isChatFollowUpVersion(null)).toBe(false);
  });

  it("picks the latest earlier version in the chat by version_number", () => {
    const previous = pickPreviousVersionInChat(
      [
        { id: "v3", version_number: 3 },
        { id: "v2", version_number: 2 },
        { id: "v1", version_number: 1 },
      ],
      { id: "v3", version_number: 3 },
    );
    expect(previous?.id).toBe("v2");
    expect(
      pickPreviousVersionInChat([{ id: "v1", version_number: 1 }], {
        id: "v1",
        version_number: 1,
      }),
    ).toBeNull();
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

  it("binder reviewkravet till versionens assistantmeddelande, inte senaste user-turn", () => {
    expect(
      pickUserRequestForVersion(
        [
          { id: "u1", role: "user", content: "Gör headern blå" },
          { id: "a1", role: "assistant", content: "Version 2 klar" },
          { id: "u2", role: "user", content: "Ta bort footern" },
          { id: "a2", role: "assistant", content: "Version 3 klar" },
        ],
        "a1",
      ),
    ).toBe("Gör headern blå");
    expect(
      pickUserRequestForVersion(
        [{ id: "u2", role: "user", content: "Ta bort footern" }],
        "missing-assistant",
      ),
    ).toBe("");
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

  it("granskar previewn mot det slutliga designkontraktet, inte råa brief-defaults", () => {
    const summary = summarizeBrief({
      briefSummary: {
        projectTitle: "Nova",
        styleKeywords: ["clean"],
        colorPalette: { primary: "#3b82f6", background: "#ffffff" },
      },
      variantId: "stale-hint",
      resolvedDesign: {
        schemaVersion: 1,
        variantId: "editorial-lux",
        explicitAxes: ["palette"],
        explicitFields: ["palette.accent"],
        styleKeywords: { value: ["editorial", "luxury"], source: "variant", locked: false },
        toneAndVoice: { value: ["confident"], source: "brief-inferred", locked: false },
        colorMode: { value: "dark", source: "variant", locked: false },
        themeTokens: {
          primary: { value: "#b45309", source: "variant", locked: false },
          secondary: { value: "#334155", source: "user-locked", locked: true },
          accent: { value: "#ff006e", source: "brief-explicit", locked: true },
          background: { value: "#111111", source: "variant", locked: false },
          foreground: { value: "#f5f5f5", source: "variant", locked: false },
        },
        typography: {
          heading: { value: "Fraunces", source: "brief-explicit", locked: true },
          body: { value: "Source Sans 3", source: "variant", locked: false },
        },
        motionLevel: { value: null, source: "default", locked: false },
        qualityBar: { value: null, source: "default", locked: false },
        domainProfile: { value: null, source: "default", locked: false },
      },
    });

    expect(summary).toContain("stil: editorial, luxury");
    expect(summary).toContain("primär #b45309");
    expect(summary).toContain("sekundär #334155 [user-locked/locked]");
    expect(summary).toContain("accent #ff006e [brief-explicit/locked]");
    expect(summary).toContain("explicit fields: palette.accent");
    expect(summary).toContain(
      "typografi: rubrik Fraunces [brief-explicit/locked] / brödtext Source Sans 3 [variant]",
    );
    expect(summary).toContain("variant: editorial-lux");
    expect(summary).not.toContain("#3b82f6");
    expect(summary).not.toContain("stale-hint");
  });

  it("does not tell the critic to restore a cached axis owned by the current follow-up", () => {
    const summary = summarizeBrief({
      resolvedDesign: {
        schemaVersion: 1,
        variantId: "editorial-lux",
        explicitAxes: [],
        explicitFields: [],
        unresolvedAxes: ["palette", "typography"],
        styleKeywords: { value: ["editorial"], source: "variant", locked: false },
        toneAndVoice: { value: [], source: "default", locked: false },
        colorMode: { value: "dark", source: "variant", locked: false },
        themeTokens: {
          background: { value: "#111111", source: "variant", locked: false },
          accent: { value: "#ff006e", source: "variant", locked: false },
        },
        typography: {
          heading: { value: "Fraunces", source: "variant", locked: false },
          body: { value: "Inter", source: "variant", locked: false },
        },
        motionLevel: { value: null, source: "default", locked: false },
        qualityBar: { value: null, source: "default", locked: false },
        domainProfile: { value: null, source: "default", locked: false },
      },
    });

    expect(summary).toContain("current request owns: palette, typography");
    expect(summary).not.toContain("#111111");
    expect(summary).not.toContain("Fraunces");
  });

  it("keeps typography and variant after a complete token-level acceptance target", () => {
    const tokenKeys = [
      "background",
      "foreground",
      "card",
      "cardForeground",
      "primary",
      "primaryForeground",
      "secondary",
      "secondaryForeground",
      "accent",
      "accentForeground",
      "muted",
      "mutedForeground",
      "border",
      "ring",
    ];
    const themeTokens = Object.fromEntries(
      tokenKeys.map((key) => [
        key,
        {
          value: `var(--resolved-${key}-${"x".repeat(36)})`,
          source: "brief-explicit",
          locked: true,
        },
      ]),
    );
    const summary = summarizeBrief({
      resolvedDesign: {
        schemaVersion: 1,
        variantId: "editorial-lux",
        explicitAxes: ["palette", "typography"],
        explicitFields: ["palette.accent", "typography.headings"],
        styleKeywords: { value: ["editorial"], source: "variant", locked: false },
        toneAndVoice: { value: ["confident"], source: "variant", locked: false },
        colorMode: { value: "dark", source: "brief-explicit", locked: true },
        themeTokens,
        typography: {
          heading: { value: "Fraunces", source: "brief-explicit", locked: true },
          body: { value: "Source Sans 3", source: "variant", locked: false },
        },
        motionLevel: { value: null, source: "default", locked: false },
        qualityBar: { value: null, source: "default", locked: false },
        domainProfile: { value: null, source: "default", locked: false },
      },
    });

    expect(summary.length).toBeGreaterThan(1200);
    expect(summary).toContain("typografi: rubrik Fraunces");
    expect(summary).toContain("variant: editorial-lux");
  });

  it("falls back to the Brief when a legacy resolvedDesign object is malformed", () => {
    const summary = summarizeBrief({
      briefSummary: {
        projectTitle: "Nova",
        styleKeywords: ["warm", "editorial"],
        colorPalette: { primary: "#ff6600" },
      },
      resolvedDesign: {
        styleKeywords: { value: ["stale-corporate"] },
      },
    });

    expect(summary).toContain("stil: warm, editorial");
    expect(summary).toContain("primär #ff6600");
    expect(summary).not.toContain("stale-corporate");
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
  it("använder stabil nyckel per viewport + filesRevision", () => {
    expect(
      liveReviewJpegFilename({
        viewport: "desktop",
        versionId: "v1",
        filesRevision: "rev_a",
      }),
    ).toBe("live-review-desktop-rev_a.jpg");
  });

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

describe("review timeouts", () => {
  it("uses a 45s per-attempt budget and a 90s chain cap", () => {
    expect(LIVE_REVIEW_ATTEMPT_TIMEOUT_MS).toBe(45_000);
    expect(LIVE_REVIEW_TOTAL_TIMEOUT_MS).toBe(90_000);
  });
});

describe("runLiveReview", () => {
  beforeEach(() => {
    generateObject.mockReset();
    createDirectModel.mockReset();
    createDirectModel.mockImplementation(() => ({ id: "mock-model" }));
    vi.mocked(recordLlmUsage).mockClear();
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
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
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

  it("en riktig advisory-dom med confidence 0 och inga issues completar", async () => {
    // Samma form som SAFE_FALLBACK_DECISION men schema-giltig äkta output —
    // får inte formmatchas till invalid_model_output.
    generateObject.mockResolvedValue({
      object: {
        verdict: "advisory",
        confidence: 0,
        rationale: "Sidan ser rimlig ut men jag är osäker.",
        reasoning: "",
        issues: [],
      },
      usage: {},
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.decision.verdict).toBe("advisory");
      expect(result.decision.confidence).toBe(0);
    }
  });

  it("degraderar trasig modelloutput till skipped/invalid", async () => {
    generateObject.mockResolvedValue({
      object: { nope: true },
      usage: { inputTokens: 10, outputTokens: 4 },
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "invalid_model_output" });
    expect(vi.mocked(recordLlmUsage)).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        errorCode: "invalid_model_output",
        workload: "live_review",
      }),
    );
  });

  it("loggar createDirectModel-fel som ok:false även utan tokens", async () => {
    createDirectModel.mockImplementation(() => {
      throw new Error("OPENAI_API_KEY is required for OpenAI models.");
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "model_unavailable" });
    expect(vi.mocked(recordLlmUsage)).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        errorCode: "model_unavailable",
        usage: null,
      }),
    );
  });

  it("anropar inte modellen när bara relativa fallback-URL:er finns", async () => {
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: "/api/blob/d.jpg", mobileUrl: "blob:local" },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "no_screenshots" });
    expect(generateObject).not.toHaveBeenCalled();
    expect(createDirectModel).not.toHaveBeenCalled();
  });

  it("provar fallback-modellen när default kastar vid createDirectModel", async () => {
    createDirectModel.mockImplementationOnce(() => {
      throw new Error("OPENAI_API_KEY is required for OpenAI models.");
    });
    generateObject.mockResolvedValue({
      object: {
        verdict: "pass",
        confidence: 0.8,
        rationale: "Sajten följer briefen.",
        reasoning: "",
        issues: [],
      },
      usage: {},
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(createDirectModel).toHaveBeenCalledWith("gpt-4o");
    expect(createDirectModel).toHaveBeenCalledWith("gpt-5.5");
    expect(result).toMatchObject({ status: "completed", modelId: "gpt-5.5" });
  });

  it("provar fallback-modellen när generateObject på default misslyckas", async () => {
    generateObject.mockRejectedValueOnce(new Error("model overloaded")).mockResolvedValueOnce({
      object: {
        verdict: "advisory",
        confidence: 0.4,
        rationale: "Fallback såg sidan.",
        reasoning: "",
        issues: [],
      },
      usage: {},
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "completed", modelId: "gpt-5.5" });
  });

  it("degraderar när alla modeller saknar nyckel", async () => {
    createDirectModel.mockImplementation(() => {
      throw new Error("OPENAI_API_KEY is required for OpenAI models.");
    });
    const result = await runLiveReview(
      assembleReviewBundle({
        versionId: "v1",
        parentVersionId: null,
        userRequest: "x",
        briefSummary: "",
        changedFiles: [],
        screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
        findings: [],
        domSummary: null,
      }),
    );
    expect(result).toMatchObject({ status: "skipped", reason: "model_unavailable" });
  });
});

describe("hasCurrentScreenshots", () => {
  it("kräver http(s), inte relativ fallback", () => {
    expect(isAttachableScreenshotUrl("https://blob.example/d.jpg")).toBe(true);
    expect(isAttachableScreenshotUrl("http://localhost/d.jpg")).toBe(true);
    expect(isAttachableScreenshotUrl("/api/blob/d.jpg")).toBe(false);
    expect(isAttachableScreenshotUrl("not a url")).toBe(false);
    expect(hasCurrentScreenshots({ desktopUrl: "/rel.jpg", mobileUrl: null })).toBe(false);
    expect(
      hasCurrentScreenshots({ desktopUrl: "https://blob.example/d.jpg", mobileUrl: null }),
    ).toBe(true);
  });
});

describe("maybeAttachLiveReview", () => {
  beforeEach(() => {
    generateObject.mockReset();
    createDirectModel.mockReset();
    createDirectModel.mockImplementation(() => ({ id: "mock-model" }));
    getPreviousLiveReviewScreenshots.mockReset();
    getPreviousLiveReviewScreenshots.mockResolvedValue({
      desktopUrl: null,
      mobileUrl: null,
      hasStoredRun: false,
    });
    getLatestEngineVersionErrorLogForCategory.mockReset();
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue(null);
    vi.mocked(recordLlmUsage).mockClear();
  });

  it("skippar när båda skärmbilderna saknas", async () => {
    const result = await maybeAttachLiveReview({
      enabled: true,
      skipped: false,
      findings: [],
      screenshots: { desktopUrl: null, mobileUrl: null },
      domSummary: null,
      versionId: "v1",
      versionNumber: 1,
      filesJson: "[]",
      userRequest: "mörk sajt",
      briefSummary: "mörk",
    });
    expect(result).toMatchObject({ status: "skipped", reason: "no_screenshots" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("skippar relativ fallback-URL som inte kan bli bilddel", async () => {
    const result = await maybeAttachLiveReview({
      enabled: true,
      skipped: false,
      findings: [],
      screenshots: { desktopUrl: "/live-review/d.jpg", mobileUrl: null },
      domSummary: null,
      versionId: "v1",
      versionNumber: 1,
      filesJson: "[]",
      userRequest: "mörk sajt",
      briefSummary: "mörk",
    });
    expect(result).toMatchObject({ status: "skipped", reason: "no_screenshots" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("återupplivar inte raderade parent-JPEG:er från äldre loggmetadata", async () => {
    getPreviousLiveReviewScreenshots.mockResolvedValue({
      desktopUrl: null,
      mobileUrl: null,
      hasStoredRun: true,
    });
    getLatestEngineVersionErrorLogForCategory.mockResolvedValue({
      meta: {
        screenshots: {
          desktopUrl: "https://blob.example/deleted-parent.jpg",
          mobileUrl: null,
        },
      },
    });
    generateObject.mockResolvedValue({
      object: {
        verdict: "pass",
        confidence: 0.9,
        rationale: "Den aktuella previewen följer briefen.",
        reasoning: "",
        issues: [],
      },
      usage: {},
    });

    const result = await maybeAttachLiveReview({
      enabled: true,
      skipped: false,
      findings: [],
      screenshots: { desktopUrl: "https://blob.example/current.jpg", mobileUrl: null },
      domSummary: null,
      versionId: "v2",
      versionNumber: 2,
      previousVersionId: "v1",
      chatId: "chat_1",
      parentFilesJson: "[]",
      filesJson: "[]",
      filesRevision: "rev_2",
      userRequest: "gör hero tydligare",
      briefSummary: "varm redaktionell stil",
    });

    expect(result.status).toBe("completed");
    expect(getLatestEngineVersionErrorLogForCategory).not.toHaveBeenCalled();
    const content = generateObject.mock.calls[0]?.[0]?.messages?.[0]?.content ?? [];
    const imageUrls = content
      .filter((part: { type?: string }) => part.type === "image")
      .map((part: { image?: URL }) => part.image?.toString());
    expect(imageUrls).toEqual(["https://blob.example/current.jpg"]);
  });
});
