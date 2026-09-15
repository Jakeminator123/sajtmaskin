import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCacheForTests } from "@/lib/env";

const generateObject = vi.hoisted(() => vi.fn());
const createDirectModel = vi.hoisted(() => vi.fn(() => ({ id: "mock-model" })));
const getWorkloadDefaultModelFromManifest = vi.hoisted(() => vi.fn(() => "gpt-5.6-terra"));
const uploadBlob = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel }));
vi.mock("@/lib/ai-models/load-manifest", () => ({
  getAiModelsManifest: () => ({
    workloads: [
      {
        id: "live_review",
        defaultModel: "gpt-5.6-terra",
        fallbackModels: ["gpt-5.6-luna"],
        visionModels: ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"],
      },
    ],
  }),
  getWorkloadDefaultModelFromManifest,
  getWorkloadFallbackModelsFromManifest: () => ["gpt-5.6-luna"],
}));
vi.mock("@/lib/vercel/blob-service", () => ({ uploadBlob }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage: vi.fn() }));

import { recordLlmUsage } from "@/lib/observability/llm-usage";
import {
  LIVE_REVIEW_ATTEMPT_TIMEOUT_MS,
  LIVE_REVIEW_TOTAL_TIMEOUT_MS,
  liveReviewJpegFilename,
  assembleReviewBundle,
  describeScreenshotCoverage,
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
  resolveLiveReviewModelIds,
  resolveUserRequestForVersion,
  reviewScreenshotContentParts,
  runLiveReview,
  screenshotViewportCoverage,
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

  it("hoppar över follow-up utan sensorlarm men kör init och larmat follow-up", () => {
    expect(
      shouldRunLiveReview({
        enabled: true,
        skipped: false,
        findings: [],
        isFollowUp: true,
      }).reason,
    ).toBe("followup_no_sensor");
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
});

describe("resolveUserRequestForVersion", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const chat_5efde3c4 = [
    {
      id: "u1",
      role: "user",
      content: "Bygg en mörk sajt för Jakob & Johan Stays",
      created_at: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "a1",
      role: "assistant",
      content: "v1 klar",
      created_at: "2026-09-01T10:01:00.000Z",
    },
    {
      id: "u2",
      role: "user",
      content: "Prissektionen är otydlig — gör den mer konkret",
      created_at: "2026-09-01T11:00:00.000Z",
    },
    {
      id: "a2",
      role: "assistant",
      content: "v2 klar",
      created_at: "2026-09-01T11:01:00.000Z",
    },
  ];

  it("dömer sen resume av v1 mot v1:s user-turn, inte uppföljningens priskritik", () => {
    const picked = resolveUserRequestForVersion({
      messages: chat_5efde3c4,
      versionMessageId: "a1",
      versionCreatedAt: "2026-09-01T10:01:00.000Z",
      versionId: "v1",
    });
    expect(picked).toEqual({
      text: "Bygg en mörk sajt för Jakob & Johan Stays",
      source: "version_message_id",
    });
    expect(picked.text).not.toMatch(/[Pp]ris/);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("pinnar v2 till uppföljningens user-turn", () => {
    const picked = resolveUserRequestForVersion({
      messages: chat_5efde3c4,
      versionMessageId: "a2",
      versionCreatedAt: "2026-09-01T11:01:00.000Z",
      versionId: "v2",
    });
    expect(picked.source).toBe("version_message_id");
    expect(picked.text).toBe("Prissektionen är otydlig — gör den mer konkret");
  });

  it("faller till created_at när message_id saknas i listan", () => {
    const picked = resolveUserRequestForVersion({
      messages: chat_5efde3c4,
      versionMessageId: "missing-assistant",
      versionCreatedAt: "2026-09-01T10:01:00.000Z",
      versionId: "v1",
    });
    expect(picked).toEqual({
      text: "Bygg en mörk sajt för Jakob & Johan Stays",
      source: "version_created_at",
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("hoppar över AUTO-FIX även när den ligger före versionens assistant", () => {
    const picked = resolveUserRequestForVersion({
      messages: [
        { id: "u1", role: "user", content: "Bygg en mörk sajt", created_at: "2026-09-01T10:00:00Z" },
        {
          id: "u-fix",
          role: "user",
          content: "AUTO-FIX REQUEST\nfixa overlay",
          created_at: "2026-09-01T10:02:00Z",
        },
        { id: "a1", role: "assistant", content: "reparerad", created_at: "2026-09-01T10:03:00Z" },
      ],
      versionMessageId: "a1",
      versionCreatedAt: "2026-09-01T10:03:00Z",
      versionId: "v1",
    });
    expect(picked.text).toBe("Bygg en mörk sajt");
    expect(picked.source).toBe("version_message_id");
  });

  it("markerar latest-user-fallback synligt när versionsspärr saknas", () => {
    const picked = resolveUserRequestForVersion({
      messages: chat_5efde3c4,
      versionMessageId: null,
      versionCreatedAt: null,
      versionId: "v1",
    });
    expect(picked).toEqual({
      text: "Prissektionen är otydlig — gör den mer konkret",
      source: "latest_user_fallback",
      reason: "missing_version_pin",
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[live-review] userRequest fallback to latest user prompt",
      expect.objectContaining({ versionId: "v1", reason: "missing_version_pin" }),
    );
  });
});

describe("bundle helpers (files/brief)", () => {

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
        { code: "hydration_dom_loss", message: "CTA försvann efter hydrering" },
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
    expect(bundle.consoleErrors).toEqual([
      "Hydration failed",
      "CTA försvann efter hydrering",
    ]);
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

describe("resolveLiveReviewModelIds", () => {
  it("reads default + fallback and keeps only visionModels", () => {
    expect(resolveLiveReviewModelIds()).toEqual(["gpt-5.6-terra", "gpt-5.6-luna"]);
    expect(resolveLiveReviewModelIds("gpt-5.6-sol")).toEqual(["gpt-5.6-sol"]);
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
      expect(result.modelId).toBe("gpt-5.6-terra");
    }
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openai: { strictJsonSchema: false } },
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text" }),
              expect.objectContaining({ type: "image", image: expect.any(URL) }),
            ]),
          }),
        ],
      }),
    );
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
    expect(createDirectModel).toHaveBeenCalledWith("gpt-5.6-terra");
    expect(createDirectModel).toHaveBeenCalledWith("gpt-5.6-luna");
    expect(result).toMatchObject({ status: "completed", modelId: "gpt-5.6-luna" });
  });

  it("provar fallback-modellen när generateObject på default misslyckas", async () => {
    generateObject
      .mockRejectedValueOnce(new Error("model overloaded"))
      .mockResolvedValueOnce({
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
    expect(result).toMatchObject({ status: "completed", modelId: "gpt-5.6-luna" });
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

  it("behandlar enbart mobil som ofullständig — inte båda viewportarna", () => {
    const mobileOnly = {
      desktopUrl: null,
      mobileUrl: "https://blob.example/m.jpg",
    };
    expect(hasCurrentScreenshots(mobileOnly)).toBe(true);
    expect(screenshotViewportCoverage(mobileOnly)).toEqual({
      hasDesktop: false,
      hasMobile: true,
      complete: false,
    });
    expect(describeScreenshotCoverage(mobileOnly)).toBe("mobile_only");
    expect(describeScreenshotCoverage({
      desktopUrl: "https://blob.example/d.jpg",
      mobileUrl: "https://blob.example/m.jpg",
    })).toBe("desktop+mobile");
  });

  it("labelar mobil-only så första bilden inte kan tas för desktop", () => {
    const parts = reviewScreenshotContentParts({
      desktopUrl: null,
      mobileUrl: "https://blob.example/m.jpg",
    });
    const texts = parts.filter((part) => part.type === "text").map((part) => part.text);
    expect(texts.some((text) => /desktop screenshot: MISSING/i.test(text))).toBe(true);
    expect(texts.some((text) => /^Current mobile screenshot:$/i.test(text))).toBe(true);
    const firstImageIndex = parts.findIndex((part) => part.type === "image");
    expect(firstImageIndex).toBeGreaterThan(0);
    expect(parts[firstImageIndex - 1]).toEqual({
      type: "text",
      text: "Current mobile screenshot:",
    });
    expect(parts.some((part) => part.type === "text" && /^Current desktop screenshot:$/.test(part.text))).toBe(
      false,
    );
  });
});

describe("maybeAttachLiveReview", () => {
  beforeEach(() => {
    generateObject.mockReset();
    createDirectModel.mockReset();
    createDirectModel.mockImplementation(() => ({ id: "mock-model" }));
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

  it("kör advisory live review på enbart mobil men påstår inte båda viewportarna", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    generateObject.mockResolvedValue({
      object: {
        verdict: "advisory",
        confidence: 0.4,
        rationale: "Bara mobilskottet fanns.",
        reasoning: "",
        issues: [],
      },
      usage: {},
    });
    const result = await maybeAttachLiveReview({
      enabled: true,
      skipped: false,
      findings: [],
      screenshots: { desktopUrl: null, mobileUrl: "https://blob.example/m.jpg" },
      domSummary: null,
      versionId: "v1",
      versionNumber: 1,
      filesJson: "[]",
      userRequest: "mörk sajt",
      briefSummary: "mörk",
    });
    expect(result.status).toBe("completed");
    expect(warnSpy).toHaveBeenCalledWith(
      "[live-review] desktop screenshot missing; continuing as incomplete viewport set",
      expect.objectContaining({ versionId: "v1", coverage: "mobile_only" }),
    );
    const content = generateObject.mock.calls[0]?.[0]?.messages?.[0]?.content as Array<{
      type: string;
      text?: string;
    }>;
    const prompt = content.find((part) => part.type === "text")?.text ?? "";
    expect(prompt).toMatch(/screenshotCoverage: mobile_only/);
    expect(prompt).toMatch(/incomplete; do not treat this as both viewports/);
    expect(content.some((part) => /desktop screenshot: MISSING/i.test(part.text ?? ""))).toBe(
      true,
    );
    warnSpy.mockRestore();
  });
});
