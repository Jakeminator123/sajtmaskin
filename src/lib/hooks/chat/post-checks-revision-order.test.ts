import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";

const runProjectSanityChecks = vi.hoisted(() => vi.fn());
const triggerImageMaterialization = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/validation/project-sanity", () => ({
  runProjectSanityChecks,
}));

vi.mock("./post-checks-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./post-checks-fetch")>();
  return { ...actual, triggerImageMaterialization };
});

import {
  abortPostChecksForChat,
  interpretValidateImagesHttp,
  runPostGenerationChecks,
  shouldHoldBeforeProductPostcheck,
} from "./post-checks";
import { runSerializedGenerationTail } from "./stream-handlers-post-stream";
import type { SetMessages } from "./types";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

const CURRENT_POSTCHECK_ATTESTATION = {
  previewSessionId: "ps_n",
  lifecycleToken: "life_n",
  filesRevision: "rev_n",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildHealthyFiles() {
  return [
    {
      name: "src/app/layout.tsx",
      content: "export default function RootLayout({ children }) { return children; }",
    },
    {
      name: "src/app/page.tsx",
      content: "export default function Page() { return <h1>Hello</h1>; }",
    },
  ];
}

function createMessageStore() {
  let messages: ChatMessage[] = [
    {
      id: "assistant_1",
      role: "assistant",
      content: "Generated site output ready for checks.",
      uiParts: [],
    },
  ];
  const setMessages: SetMessages = (next) => {
    messages = typeof next === "function" ? next(messages) : next;
  };
  return {
    setMessages,
    getAssistant() {
      return messages[0];
    },
  };
}

function getToolPart(toolName: string, store: ReturnType<typeof createMessageStore>) {
  return store
    .getAssistant()
    ?.uiParts?.find((part) => part.toolName === toolName) as Record<string, unknown> | undefined;
}

describe("L3 revision order", () => {
  let fetchCalls: FetchCall[];

  beforeEach(() => {
    fetchCalls = [];
    abortPostChecksForChat("chat_1");
    runProjectSanityChecks.mockReset();
    runProjectSanityChecks.mockReturnValue({ valid: true, issues: [] });
    triggerImageMaterialization.mockReset();
    triggerImageMaterialization.mockResolvedValue({
      attempted: true,
      strategy: "blob",
      replaced: 0,
      uploaded: 0,
      skipped: 0,
      warningCount: 0,
      persisted: true,
      filesRevision: "rev_n",
    });
  });

  function mockFetch(
    handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        return handler(url, init);
      }),
    );
  }

  it("(a) startar aldrig product-postcheck innan validate-images är klar", async () => {
    const store = createMessageStore();
    const files = buildHealthyFiles();
    let releaseValidate!: () => void;
    const blockedValidate = new Promise<Response>((resolve) => {
      releaseValidate = () =>
        resolve(jsonResponse({ replacedCount: 0, persisted: true, filesRevision: "rev_n" }));
    });

    mockFetch(async (url) => {
      if (url.includes("/versions")) {
        return jsonResponse({
          versions: [
            {
              id: "ver_1",
              versionId: "ver_1",
              lifecycleStage: "design",
              demoUrl: "https://preview.example/ver_1",
            },
          ],
        });
      }
      if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
      if (url.includes("/validate-images")) return blockedValidate;
      if (url.includes("/product-postcheck")) {
        return jsonResponse({
          skipped: true,
          skippedReason: "feature_disabled",
          warnings: [],
          attestation: null,
        });
      }
      if (url.includes("/error-log")) return jsonResponse({ ok: true });
      if (url.includes("/quality-gate")) {
        return jsonResponse({ error: "Preview host not configured" }, 501);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const runPromise = runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });

    await vi.waitFor(() => {
      expect(fetchCalls.some((call) => call.url.includes("/validate-images"))).toBe(true);
    });
    expect(fetchCalls.some((call) => call.url.includes("/product-postcheck"))).toBe(false);

    releaseValidate();
    await runPromise;

    const validateIdx = fetchCalls.findIndex((call) => call.url.includes("/validate-images"));
    const postcheckIdx = fetchCalls.findIndex((call) => call.url.includes("/product-postcheck"));
    expect(postcheckIdx).toBeGreaterThan(validateIdx);
  });

  it("(b) preview_superseded lämnar versionen pending utan attest eller quality-gate", async () => {
    const store = createMessageStore();
    const files = buildHealthyFiles();
    mockFetch(async (url) => {
      if (url.includes("/versions")) {
        return jsonResponse({
          versions: [
            {
              id: "ver_1",
              versionId: "ver_1",
              lifecycleStage: "design",
              demoUrl: "https://preview.example/ver_1",
            },
          ],
        });
      }
      if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
      if (url.includes("/validate-images")) {
        return jsonResponse({ replacedCount: 0, persisted: true, filesRevision: "rev_n" });
      }
      if (url.includes("/product-postcheck")) {
        return jsonResponse({
          skipped: true,
          skippedReason: "preview_superseded",
          warnings: [],
          attestation: null,
        });
      }
      if (url.includes("/error-log")) return jsonResponse({ ok: true });
      if (url.includes("/quality-gate")) {
        throw new Error("quality-gate must not start on preview_superseded");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });

    expect(fetchCalls.some((call) => call.url.includes("/quality-gate"))).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    expect((qualityGate?.output as { retryPending?: boolean }).retryPending).toBe(true);
    const errorLog = fetchCalls.find((call) => call.url.includes("/error-log"));
    if (errorLog) {
      const body = JSON.parse(String(errorLog.init?.body ?? "{}")) as {
        productPostcheckAttestation?: unknown;
        logs?: Array<{ category?: string }>;
      };
      expect(body.productPostcheckAttestation ?? null).toBeNull();
      expect(body.logs?.some((log) => log.category?.startsWith("product_postcheck."))).not.toBe(
        true,
      );
    }
  });

  it("(c) replaced utan persisted blockerar product-postcheck", async () => {
    const store = createMessageStore();
    const files = buildHealthyFiles();
    mockFetch(async (url) => {
      if (url.includes("/versions")) {
        return jsonResponse({
          versions: [{ id: "ver_1", versionId: "ver_1", lifecycleStage: "design" }],
        });
      }
      if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
      if (url.includes("/validate-images")) {
        return jsonResponse({
          replacedCount: 2,
          persisted: false,
          filesRevision: "rev_old",
          fixed: false,
        });
      }
      if (url.includes("/product-postcheck")) {
        throw new Error("product-postcheck must not start on unpersisted replacements");
      }
      if (url.includes("/error-log")) return jsonResponse({ ok: true });
      if (url.includes("/quality-gate")) {
        throw new Error("quality-gate must not start on unpersisted replacements");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });

    expect(fetchCalls.some((call) => call.url.includes("/product-postcheck"))).toBe(false);
    expect(fetchCalls.some((call) => call.url.includes("/quality-gate"))).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    expect((qualityGate?.output as { retryPending?: boolean }).retryPending).toBe(true);
  });

  it("(d) blockerare som inte kunde persisteras lämnar versionen pending", async () => {
    const store = createMessageStore();
    const files = buildHealthyFiles();
    mockFetch(async (url) => {
      if (url.includes("/error-log")) {
        return new Response(JSON.stringify({ code: "row_contention", retryable: true }), {
          status: 503,
          headers: { "Content-Type": "application/json", "Retry-After": "1" },
        });
      }
      if (url.includes("/versions")) {
        return jsonResponse({
          versions: [
            {
              id: "ver_1",
              versionId: "ver_1",
              lifecycleStage: "design",
              demoUrl: "https://preview.example/ver_1",
            },
          ],
        });
      }
      if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
      if (url.includes("/validate-images")) {
        return jsonResponse({ replacedCount: 0, persisted: true, filesRevision: "rev_n" });
      }
      if (url.includes("/product-postcheck")) {
        return jsonResponse({
          skipped: false,
          productBlocked: true,
          warnings: [{ code: "fake_form", message: "Formuläret är inte kopplat." }],
          attestation: CURRENT_POSTCHECK_ATTESTATION,
        });
      }
      if (url.includes("/quality-gate")) {
        throw new Error("quality-gate must not start when blocker persist failed");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.useFakeTimers();
    try {
      const runPromise = runPostGenerationChecks({
        chatId: "chat_1",
        versionId: "ver_1",
        demoUrl: "https://preview.example/ver_1",
        assistantMessageId: "assistant_1",
        setMessages: store.setMessages,
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await runPromise;
    } finally {
      vi.useRealTimers();
    }

    expect(fetchCalls.some((call) => call.url.includes("/quality-gate"))).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    const output = (qualityGate?.output ?? {}) as Record<string, unknown>;
    expect(output.retryPending).toBe(true);
    expect(output.blockerPersistFailed).toBe(true);
  });

  it("hämtar om filer och resynkar preview efter bekräftad persistens innan postcheck", async () => {
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const refreshedFiles = [...files, { name: "public/fixed.png", content: "replaced" }];
    let filesCalls = 0;

    mockFetch(async (url, init) => {
      if (url.includes("/versions")) {
        return jsonResponse({
          versions: [
            {
              id: "ver_1",
              versionId: "ver_1",
              lifecycleStage: "design",
              demoUrl: "https://preview.example/ver_1",
            },
          ],
        });
      }
      if (url.includes("/files?versionId=ver_1")) {
        filesCalls += 1;
        return jsonResponse({ files: filesCalls > 1 ? refreshedFiles : files });
      }
      if (url.includes("/validate-images")) {
        return jsonResponse({
          replacedCount: 1,
          persisted: true,
          filesRevision: "rev_after_images",
          fixed: true,
        });
      }
      if (url.includes("/preview-session") && init?.method === "POST") {
        return jsonResponse({ ok: true, previewUrl: "https://preview.example/ver_1?rev=after" });
      }
      if (url.includes("/product-postcheck")) {
        return jsonResponse({
          skipped: true,
          skippedReason: "feature_disabled",
          warnings: [],
        });
      }
      if (url.includes("/error-log")) return jsonResponse({ ok: true });
      if (url.includes("/quality-gate")) {
        return jsonResponse({ error: "Preview host not configured" }, 501);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });

    const validateIdx = fetchCalls.findIndex((call) => call.url.includes("/validate-images"));
    const resyncIdx = fetchCalls.findIndex((call) => call.url.includes("/preview-session"));
    const postcheckIdx = fetchCalls.findIndex((call) => call.url.includes("/product-postcheck"));
    expect(filesCalls).toBeGreaterThanOrEqual(2);
    expect(resyncIdx).toBeGreaterThan(validateIdx);
    expect(postcheckIdx).toBeGreaterThan(resyncIdx);
    const postcheckBody = JSON.parse(String(fetchCalls[postcheckIdx]?.init?.body ?? "{}")) as {
      filesRevision?: string;
    };
    expect(postcheckBody.filesRevision).toBe("rev_after_images");
  });

  async function runValidateImagesStatusCase(status: number, body: unknown) {
    const store = createMessageStore();
    const files = buildHealthyFiles();
    mockFetch(async (url) => {
      if (url.includes("/versions")) {
        return jsonResponse({
          versions: [
            {
              id: "ver_1",
              versionId: "ver_1",
              lifecycleStage: "design",
              demoUrl: "https://preview.example/ver_1",
            },
          ],
        });
      }
      if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
      if (url.includes("/validate-images")) return jsonResponse(body, status);
      if (url.includes("/product-postcheck")) {
        return jsonResponse({
          skipped: true,
          skippedReason: "feature_disabled",
          warnings: [],
        });
      }
      if (url.includes("/error-log")) return jsonResponse({ ok: true });
      if (url.includes("/quality-gate")) {
        return jsonResponse({ error: "Preview host not configured" }, 501);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });
    return store;
  }

  it("409 version_busy håller svansen med lease-text", async () => {
    const store = await runValidateImagesStatusCase(409, { error: "version_busy" });
    expect(fetchCalls.some((call) => call.url.includes("/product-postcheck"))).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    const output = qualityGate?.output as { retryPending?: boolean; reason?: string };
    expect(output.retryPending).toBe(true);
    expect(output.reason).toContain("409 version_busy");
    const errorLog = fetchCalls.find((call) => call.url.includes("/error-log"));
    const logged = JSON.parse(String(errorLog?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string }>;
    };
    expect(logged.logs?.some((log) => log.category === "post-check.image-validation-version-busy")).toBe(
      true,
    );
  });

  it("404 No files fortsätter utan bildvalideringshold", async () => {
    const store = await runValidateImagesStatusCase(404, { error: "No files" });
    expect(fetchCalls.some((call) => call.url.includes("/product-postcheck"))).toBe(true);
    const qualityGate = getToolPart("Quality gate", store);
    expect((qualityGate?.output as { retryPending?: boolean } | undefined)?.retryPending).not.toBe(
      true,
    );
    expect(getToolPart("Quality gate", store)?.output).not.toEqual(
      expect.objectContaining({ reason: expect.stringContaining("bildersättningar") }),
    );
  });

  it("500 håller svansen med HTTP-felorsak", async () => {
    const store = await runValidateImagesStatusCase(500, { error: "boom" });
    expect(fetchCalls.some((call) => call.url.includes("/product-postcheck"))).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    const output = qualityGate?.output as { retryPending?: boolean; reason?: string };
    expect(output.retryPending).toBe(true);
    expect(output.reason).toContain("HTTP 500");
    const errorLog = fetchCalls.find((call) => call.url.includes("/error-log"));
    const logged = JSON.parse(String(errorLog?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string }>;
    };
    expect(logged.logs?.some((log) => log.category === "post-check.image-validation-http-error")).toBe(
      true,
    );
  });

  it("holdBeforeChecks hoppar över mutate-steg och lämnar retryPending + onComplete", async () => {
    const store = createMessageStore();
    const onComplete = vi.fn();
    mockFetch(async (url) => {
      if (url.includes("/error-log")) return jsonResponse({ ok: true });
      if (url.includes("/validate-images") || url.includes("/product-postcheck")) {
        throw new Error("mutating checks must not start on holdBeforeChecks");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onComplete,
      holdBeforeChecks: {
        reason: "Bildmaterialiseringen nådde tidsgränsen innan persistens bekräftades — versionen lämnas pending.",
        category: "post-check.image-materialization-timeout",
        meta: { error: "timeout" },
      },
    });

    expect(fetchCalls.some((call) => call.url.includes("/validate-images"))).toBe(false);
    expect(fetchCalls.some((call) => call.url.includes("/product-postcheck"))).toBe(false);
    expect(fetchCalls.some((call) => call.url.includes("/error-log"))).toBe(true);
    const qualityGate = getToolPart("Quality gate", store);
    expect((qualityGate?.output as { retryPending?: boolean }).retryPending).toBe(true);
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("materialize-timeout sätter retryPending, error-log, onComplete och samma resume-kontrakt", async () => {
    const store = createMessageStore();
    const onComplete = vi.fn();
    triggerImageMaterialization.mockResolvedValue({
      attempted: true,
      strategy: "blob",
      replaced: 1,
      uploaded: 0,
      skipped: 0,
      warningCount: 0,
      persisted: false,
      filesRevision: null,
      error: "timeout",
    });
    mockFetch(async (url) => {
      if (url.includes("/error-log")) return jsonResponse({ ok: true });
      if (url.includes("/validate-images") || url.includes("/product-postcheck")) {
        throw new Error("mutating checks must not start after materialize timeout");
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runSerializedGenerationTail({
      chatId: "chat_1",
      versionId: "ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix: () => undefined,
      onComplete,
      enableImageMaterialization: true,
    });

    const qualityGate = getToolPart("Quality gate", store);
    const output = qualityGate?.output as { retryPending?: boolean; reason?: string };
    expect(output.retryPending).toBe(true);
    expect(output.reason).toContain("tidsgränsen");

    const errorLog = fetchCalls.find((call) => call.url.includes("/error-log"));
    expect(errorLog).toBeTruthy();
    const logged = JSON.parse(String(errorLog?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string }>;
    };
    expect(
      logged.logs?.some((log) => log.category === "post-check.image-materialization-timeout"),
    ).toBe(true);

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalled());

    expect(
      shouldHoldBeforeProductPostcheck({
        replacedCount: 2,
        persisted: false,
        filesRevision: null,
      }),
    ).toBe(true);
    expect(
      shouldHoldBeforeProductPostcheck({
        replacedCount: 1,
        persisted: true,
        filesRevision: "rev_resume",
      }),
    ).toBe(false);
    expect(shouldHoldBeforeProductPostcheck(interpretValidateImagesHttp(409, null))).toBe(true);
    expect(shouldHoldBeforeProductPostcheck(interpretValidateImagesHttp(404, null))).toBe(
      false,
    );
    expect(shouldHoldBeforeProductPostcheck(interpretValidateImagesHttp(500, null))).toBe(true);
  });
});
