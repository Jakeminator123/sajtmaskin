import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";

const runProjectSanityChecks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/validation/project-sanity", () => ({
  runProjectSanityChecks,
}));

import {
  abortPostChecksForChat,
  buildProductPostcheckLogItems,
  hasActivePostCheck,
  productPostcheckResultFromUnavailableHttp,
  runPostGenerationChecks,
} from "./post-checks";
import type { SetMessages } from "./types";
import { MAX_SCOPED_IMAGE_URLS } from "@/lib/utils/validate-images-limit";
import {
  acceptClientErrorReport,
  resetClientErrorReportGateForTests,
} from "@/lib/builder/preview-client-error-report";

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

function featureDisabledProductPostcheckResponse() {
  return jsonResponse({
    ok: true,
    skipped: true,
    skippedReason: "feature_disabled",
    warnings: [],
    productBlocked: false,
  });
}

function buildHealthyFiles() {
  return [
    {
      name: "src/app/layout.tsx",
      content: [
        "export const metadata = {",
        "  title: 'Test site',",
        "  description: 'A healthy test site',",
        "  openGraph: { title: 'Test site' },",
        "  twitter: { card: 'summary_large_image' },",
        "};",
        "",
        "export default function RootLayout({ children }: { children: React.ReactNode }) {",
        "  return <html><body>{children}</body></html>;",
        "}",
      ].join("\n"),
    },
    {
      name: "src/app/page.tsx",
      content: [
        "export default function Page() {",
        "  return (",
        "    <main>",
        "      <h1>Hello</h1>",
        '      <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org" })}</script>',
        "    </main>",
        "  );",
        "}",
      ].join("\n"),
    },
    {
      name: "src/app/robots.ts",
      content: "export default function robots() { return { rules: [] }; }",
    },
    {
      name: "src/app/sitemap.ts",
      content: "export default function sitemap() { return []; }",
    },
    {
      name: "src/app/globals.css",
      content: "@theme { --color-background: #fff; }",
    },
  ];
}

function buildSeoIssueFiles() {
  return buildHealthyFiles()
    .filter((file) => !["src/app/robots.ts", "src/app/sitemap.ts"].includes(file.name))
    .map((file) =>
      file.name === "src/app/layout.tsx"
        ? {
            ...file,
            content: [
              "export const metadata = {",
              "  title: 'Test site',",
              "};",
              "",
              "export default function RootLayout({ children }: { children: React.ReactNode }) {",
              "  return <html><body>{children}</body></html>;",
              "}",
            ].join("\n"),
          }
        : file,
    );
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

describe("runPostGenerationChecks", () => {
  it("persists transport_error when the outer flow fails before postcheck returns", async () => {
    const store = createMessageStore();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions/") && url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/versions")) throw new Error("versions transport failed");
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files: buildHealthyFiles() });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLogCall = fetchCalls.find(
      (call) => call.url.includes("/error-log") && call.init?.method === "POST",
    );
    const body = JSON.parse(String(errorLogCall?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string; meta?: { skippedReason?: string } }>;
    };
    expect(body.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
            category: "post-check.product-postcheck-transport",
          meta: expect.objectContaining({ skippedReason: "transport_error" }),
        }),
      ]),
    );
    expect(fetchCalls.some((call) => call.url.includes("/quality-gate"))).toBe(false);
  });

  let fetchCalls: FetchCall[];

  beforeEach(() => {
    fetchCalls = [];
    abortPostChecksForChat("chat_1");
    resetClientErrorReportGateForTests();
    runProjectSanityChecks.mockReset();
    runProjectSanityChecks.mockReturnValue({ valid: true, issues: [] });
  });

  it("publishes an active post-check row before waiting for file and preview checks", async () => {
    const store = createMessageStore();
    const files = buildHealthyFiles();
    let releaseFiles!: () => void;
    const blockedFiles = new Promise<Response>((resolve) => {
      releaseFiles = () => resolve(jsonResponse({ files }));
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/files?versionId=ver_1")) return blockedFiles;
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", lifecycleStage: "design" }],
          });
        }
        if (url.includes("/validate-images")) return jsonResponse({});
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
      }),
    );

    const runPromise = runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });

    const pendingPostCheck = getToolPart("Post-check", store);
    expect(pendingPostCheck?.state).toBe("input-streaming");
    expect((pendingPostCheck?.output as { steps?: unknown }).steps).toEqual([
      "Efterkontrollerar filer och preview",
    ]);

    releaseFiles();
    await runPromise;

    expect(getToolPart("Post-check", store)?.state).toBe("output-available");
  });

  it("classifies preview-blocked runs as preflight preview failures", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      preflight: {
        previewBlocked: true,
        verificationBlocked: true,
        previewBlockingReason: "Own preview entrypoint could not be prepared.",
      },
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    const postCheck = getToolPart("Post-check", store);
    const qualityGate = getToolPart("Quality gate", store);
    expect(postCheck?.state).toBe("output-available");
    expect((postCheck?.output as Record<string, unknown>).demoUrl).toBeNull();
    expect(((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>).failures).toContain(
      "preflight_preview_blocked",
    );
    expect(qualityGate?.state).toBe("output-available");
    expect(((qualityGate?.output as Record<string, unknown>).skipped as boolean) ?? false).toBe(true);

    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        reasons: expect.arrayContaining(["preview blockerad i preflight"]),
      }),
    );

    const errorLogCall = fetchCalls.find((call) => call.url.includes("/error-log"));
    const body = JSON.parse(String(errorLogCall?.init?.body)) as { logs: Array<{ meta?: Record<string, unknown> }> };
    expect(body.logs[0]?.meta?.previewCode).toBe("preflight_preview_blocked");
    expect(fetchCalls.some((call) => call.url.includes("/quality-gate"))).toBe(false);
  });

  it("skips verify-lane AND autofix for degenerate output (terminal server fail)", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      preflight: {
        previewBlocked: true,
        verificationBlocked: true,
        previewBlockingReason:
          "Degenerate output blocked: file components/credential-deck.tsx exceeds 768KB",
      },
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    // The degeneracy guard terminally failed the version server-side (M#dgc):
    // no client autofix is queued AND the VM verify-lane must not start —
    // `autoFixReasons === []` alone is not a verify-pending signal here.
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(fetchCalls.some((call) => call.url.includes("/quality-gate"))).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    expect(qualityGate?.state).toBe("output-available");
    const output = (qualityGate?.output ?? {}) as Record<string, unknown>;
    expect(output.skipped).toBe(true);
    expect(output.autoFixQueued).toBe(false);
  });

  // Regression (2026-07 preview-lifecycle simplification, punkt 5): the
  // server post-finalize lane is the single ReleaseGate owner for F3 —
  // the client post-check must NOT POST /quality-gate for an
  // `integrations` version (it used to race the server for the same
  // version lease → 409 version_busy noise + duplicated VM work).
  it("skips the client quality-gate lane for F3 (integrations) versions — server owns the ReleaseGate", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_f3",
                versionId: "ver_f3",
                demoUrl: "https://preview.example/ver_f3",
                lifecycleStage: "integrations",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_f3")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          throw new Error("client must not POST /quality-gate for an F3 version");
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_f3",
      demoUrl: "https://preview.example/ver_f3",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchCalls.some((call) => call.url.includes("/quality-gate"))).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    expect(qualityGate?.state).toBe("output-available");
    const output = (qualityGate?.output ?? {}) as Record<string, unknown>;
    expect(output.skipped).toBe(true);
    expect(output.serverOwned).toBe(true);
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  // Regression (punkt 7): a superseded gate response is terminal-neutral —
  // no rose failure card, no repair/autofix against the abandoned version.
  it("renders a neutral card and never repairs when the quality gate reports superseded", async () => {
    const onAutoFix = vi.fn();
    const mutateVersions = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    expect(acceptClientErrorReport("ver_1", "Hydration failed", null)).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            superseded: true,
            // Defense-in-depth: even a contradictory marker must not move a
            // terminal-neutral superseded response into promoted phase.
            promoted: true,
            checks: [],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      mutateVersions,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    expect(qualityGate?.state).toBe("output-available");
    const output = (qualityGate?.output ?? {}) as Record<string, unknown>;
    expect(output.superseded).toBe(true);
    expect(output.skipped).toBe(true);
    // `passed: false` from the response must NOT leak into the card output.
    expect(output.passed).toBeUndefined();
    expect(acceptClientErrorReport("ver_1", "Hydration failed", null)).toBe(false);
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(fetchCalls.some((call) => call.url.endsWith("/repair"))).toBe(false);
  });

  it("revalidates both status surfaces once on completion (mutateVersions + onComplete)", async () => {
    const mutateVersions = vi.fn();
    const onComplete = vi.fn();
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      // Preflight-blocked → autofix path: reaches the `finally` cleanly
      // without the quality-gate lane (which can call mutateVersions itself).
      preflight: {
        previewBlocked: true,
        verificationBlocked: true,
        previewBlockingReason: "Own preview entrypoint could not be prepared.",
      },
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      mutateVersions,
      onAutoFix,
      onComplete,
    });

    // Deterministic completion refresh (Codex P2, område 6-3): both the
    // versions list (VersionHistory `busStatus`) and the preview badge
    // (`useVersionStatus` via `refreshNonce`) must refetch exactly once
    // after the postcheck so the two surfaces never disagree. Without the
    // `finally` revalidation, mutateVersions is not called on this path.
    await vi.waitFor(() => {
      expect(mutateVersions).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("waits for the product-postcheck log persistence before refreshing status surfaces", async () => {
    const order: string[] = [];
    const mutateVersions = vi.fn(() => order.push("versions-refreshed"));
    const onComplete = vi.fn(() => order.push("status-refreshed"));
    const store = createMessageStore();
    const files = buildHealthyFiles();
    let settlePersistence!: () => void;
    let persistStarted = false;
    const delayedPersistence = new Promise<Response>((resolve) => {
      settlePersistence = () => {
        order.push("persistence-settled");
        resolve(jsonResponse({ ok: true }));
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) {
          persistStarted = true;
          return delayedPersistence;
        }
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            skipped: false,
            productBlocked: true,
            warnings: [{ code: "fake_form", message: "Formuläret är inte kopplat." }],
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const runPromise = runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      preflight: {
        previewBlocked: true,
        verificationBlocked: true,
        previewBlockingReason: "Own preview entrypoint could not be prepared.",
      },
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      mutateVersions,
      onComplete,
    });

    // Persist is now on the generation-tail critical path (awaited before
    // the quality-gate decision). Join only after the write is in flight
    // so this still proves refresh cannot outrun the error-log POST.
    await vi.waitFor(() => expect(persistStarted).toBe(true));
    expect(mutateVersions).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    settlePersistence();
    await runPromise;
    await vi.waitFor(() => {
      expect(mutateVersions).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(order).toEqual([
      "persistence-settled",
      "versions-refreshed",
      "status-refreshed",
    ]);
  });

  it("revalidates versions after a successful tier-2 promotion settles", async () => {
    const order: string[] = [];
    const phaseResults: boolean[] = [];
    let qualityGateSettled = false;
    const mutateVersions = vi.fn(() => {
      order.push("versions-refreshed");
      if (!qualityGateSettled) return;
      // This callback runs before the SWR commit, so promotedAt is still null.
      phaseResults.push(acceptClientErrorReport("ver_1", "Hydration failed", null));
      phaseResults.push(acceptClientErrorReport("ver_1", "Hydration failed", null));
      // The eventual server timestamp belongs to the same binary phase.
      phaseResults.push(
        acceptClientErrorReport(
          "ver_1",
          "Hydration failed",
          "2026-08-15T10:00:00.000Z",
        ),
      );
    });
    const store = createMessageStore();
    const files = buildHealthyFiles();
    let settleQualityGate!: () => void;
    const delayedQualityGate = new Promise<Response>((resolve) => {
      settleQualityGate = () => {
        order.push("quality-gate-settled");
        qualityGateSettled = true;
        resolve(
          jsonResponse({
            passed: true,
            promoted: true,
            checks: [{ check: "typecheck", passed: true, exitCode: 0, output: "" }],
          }),
        );
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/error-log")) return jsonResponse({ ok: true });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                lifecycleStage: "design",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            skipped: true,
            skippedReason: "feature_disabled",
            warnings: [],
          });
        }
        if (url.includes("/quality-gate")) return delayedQualityGate;
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      mutateVersions,
    });

    expect(acceptClientErrorReport("ver_1", "Hydration failed", null)).toBe(true);
    expect(acceptClientErrorReport("ver_1", "Hydration failed", null)).toBe(false);

    await vi.waitFor(() => expect(mutateVersions).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["versions-refreshed"]);

    settleQualityGate();
    await vi.waitFor(() => expect(mutateVersions).toHaveBeenCalledTimes(2));
    expect(order).toEqual([
      "versions-refreshed",
      "quality-gate-settled",
      "versions-refreshed",
    ]);
    expect(phaseResults).toEqual([true, false, false]);
  });

  it("falls back to preview-missing diagnostics when no preflight state exists", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    const postCheck = getToolPart("Post-check", store);
    expect((postCheck?.output as Record<string, unknown>).demoUrl).toBeNull();
    expect(((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>).failures).toContain(
      "missing_preview_url",
    );
    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: expect.arrayContaining(["preview saknas"]),
      }),
    );

    const errorLogCall = fetchCalls.find((call) => call.url.includes("/error-log"));
    const body = JSON.parse(String(errorLogCall?.init?.body)) as { logs: Array<{ meta?: Record<string, unknown> }> };
    expect(body.logs[0]?.meta?.previewCode).toBe("preview_missing_url");
  });

  it("does not queue autofix while live-preview is still starting in sandbox", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({ error: "Sandbox not configured" }, 501);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      preflight: {
        previewBlocked: false,
        verificationBlocked: false,
        previewBlockingReason: "Automatic preflight could not build a renderable own-engine preview entrypoint.",
        primaryPreviewTarget: "preview",
        previewStart: {
          canStartPreview: true,
          primaryPreviewTarget: "preview",
          shimBlocked: true,
          requiresEnvConfig: false,
          hasCriticalInstallRisk: false,
          hasCriticalCodeFailure: false,
          compatibilityPreviewAllowed: true,
          issueCounts: {
            code_structure_failure: 0,
            dependency_install_failure: 0,
            env_config_missing: 0,
            shim_preview_failure: 1,
            non_blocking_quality_warning: 0,
          },
          blockingCategories: [],
        },
      },
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    const postCheck = getToolPart("Post-check", store);
    expect((postCheck?.output as Record<string, unknown>).demoUrl).toBeNull();
    expect(((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>).failures).not.toContain(
      "missing_preview_url",
    );
    expect(((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>).failures).not.toContain(
      "preflight_preview_blocked",
    );
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("keeps preview available when only verification is blocked", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({ error: "Sandbox not configured" }, 501);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      preflight: {
        previewBlocked: false,
        verificationBlocked: true,
        previewBlockingReason: null,
      },
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const postCheck = getToolPart("Post-check", store);
    const qualityGate = getToolPart("Quality gate", store);
    expect((postCheck?.output as Record<string, unknown>).demoUrl).toBe("https://preview.example/ver_1");
    expect((postCheck?.output as Record<string, unknown>).warnings).toContain(
      "Preview är tillgänglig, men versionen har verifieringsblockerande preflightfel.",
    );
    expect(qualityGate?.state).toBe("output-available");
    expect(((qualityGate?.output as Record<string, unknown>).skipped as boolean) ?? false).toBe(true);
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("queues existing autofix when VM lint returns a hard code error", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            checks: [
              {
                check: "lint",
                passed: false,
                repairable: true,
                failureKind: "code",
                exitCode: 1,
                output: "ESLint error: react-hooks/rules-of-hooks",
                durationMs: 1800,
              },
            ],
            verifyLaneDurationMs: 3200,
            firstFailureCheck: "lint",
            jobStartedAt: "2026-04-03T12:00:00.000Z",
            jobFinishedAt: "2026-04-03T12:00:03.200Z",
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    expect(qualityGate?.state).toBe("output-available");
    expect(((qualityGate?.output as Record<string, unknown>).passed as boolean) ?? true).toBe(false);
    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: ["lint failed"],
        repair: {
          qualityGate: [
            {
              check: "lint",
              exitCode: 1,
              output: "ESLint error: react-hooks/rules-of-hooks",
              durationMs: 1800,
            },
          ],
          qualityGateMeta: {
            verifyLaneDurationMs: 3200,
            firstFailureCheck: "lint",
            jobStartedAt: "2026-04-03T12:00:00.000Z",
            jobFinishedAt: "2026-04-03T12:00:03.200Z",
          },
        },
      }),
    );
  });

  it("kör om product-postcheck exakt en gång vid infrastruktur-skip (SM-072)", async () => {
    // Prod 2026-09-01 (chat 3b9ca137, v2): första postchecken dog med
    // `playwright_unavailable` på en /tmp-förgiftad instans; en omkörning
    // sekunder senare landade friskt och fångade riktiga produktfynd
    // (productBlocked). Lanen ska själv göra EN omkörning och använda det
    // omkörda resultatet — inte förlita sig på att resume-lanen råkar dubblera.
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    let postcheckCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          postcheckCalls += 1;
          if (postcheckCalls === 1) {
            return jsonResponse({
              ok: true,
              skipped: true,
              skippedReason: "playwright_unavailable",
              warnings: [],
              productBlocked: false,
              attestation: CURRENT_POSTCHECK_ATTESTATION,
            });
          }
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              { code: "cta_no_handler", message: "CTA-knapp saknar tydlig handling." },
            ],
            productBlocked: true,
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    vi.useFakeTimers();
    try {
      const runPromise = runPostGenerationChecks({
        chatId: "chat_1",
        versionId: "ver_1",
        demoUrl: "https://preview.example/ver_1",
        assistantMessageId: "assistant_1",
        setMessages: store.setMessages,
        onAutoFix,
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await runPromise;
    } finally {
      vi.useRealTimers();
    }

    expect(postcheckCalls).toBe(2);
    // Det omkörda (produktbärande) resultatet är det lanen adopterar — inte
    // den första infra-skipen.
    const postCheck = getToolPart("Post-check", store);
    expect(
      (postCheck?.output as { productPostcheck?: { productBlocked?: boolean } })
        .productPostcheck?.productBlocked,
    ).toBe(true);
    expect((postCheck?.output as { warnings?: string[] }).warnings).toEqual(
      expect.arrayContaining(["Product: CTA-knapp saknar tydlig handling."]),
    );
  });

  it("retries retryable 503 from /quality-gate before surfacing (F2-lane parity with F3)", async () => {
    // Granska-svärm F5 på #504: /quality-gate svarar 503 `lease_unavailable`/
    // `quality_gate_unavailable` när leasen/verify-lanen är tillfälligt nere.
    // F3-vägarna retryar; F2-lanen ska också göra det i stället för att
    // behandla ett övergående 503 som ett generiskt fel.
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    let qualityGateCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          qualityGateCalls += 1;
          if (qualityGateCalls <= 2) {
            return jsonResponse(
              { error: "Version lease unavailable", code: "lease_unavailable", retryable: true },
              503,
            );
          }
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    vi.useFakeTimers();
    try {
      const runPromise = runPostGenerationChecks({
        chatId: "chat_1",
        versionId: "ver_1",
        demoUrl: "https://preview.example/ver_1",
        assistantMessageId: "assistant_1",
        setMessages: store.setMessages,
        onAutoFix,
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await runPromise;
    } finally {
      vi.useRealTimers();
    }

    expect(qualityGateCalls).toBe(3);
    const qualityGate = getToolPart("Quality gate", store);
    expect(qualityGate?.state).toBe("output-available");
    expect((qualityGate?.output as Record<string, unknown>).passed).toBe(true);
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("surfaces a persistent 503 from /quality-gate after bounded retries", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    let qualityGateCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          qualityGateCalls += 1;
          return jsonResponse(
            { error: "Verify lane unavailable", code: "quality_gate_unavailable", retryable: true },
            503,
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    vi.useFakeTimers();
    try {
      const runPromise = runPostGenerationChecks({
        chatId: "chat_1",
        versionId: "ver_1",
        demoUrl: "https://preview.example/ver_1",
        assistantMessageId: "assistant_1",
        setMessages: store.setMessages,
        onAutoFix,
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await runPromise;
    } finally {
      vi.useRealTimers();
    }

    // 1 originalanrop + 2 bounded retries, sedan vanlig felhantering.
    expect(qualityGateCalls).toBe(3);
    const qualityGate = getToolPart("Quality gate", store);
    expect(qualityGate?.state).toBe("output-error");
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("shows lint warnings as advisory and never queues repair", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            qualityGateAdvisory: true,
            advisoryChecks: ["lint"],
            checks: [
              {
                check: "lint",
                passed: true,
                advisory: true,
                repairable: false,
                warningCount: 2,
                errorCount: 0,
                exitCode: 0,
                output: "2 warnings",
                durationMs: 400,
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    const output = (qualityGate?.output as Record<string, unknown>) ?? {};
    const steps = Array.isArray(output.steps) ? output.steps.map(String) : [];
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Lint: Varning"),
        expect.stringContaining("ingen automatisk reparation"),
      ]),
    );
    expect(output.qualityGateAdvisory).toBe(true);
    expect(output.advisoryChecks).toEqual(["lint"]);
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(fetchCalls.some((call) => call.url.includes("/repair"))).toBe(false);
  });

  it("shows F2 typecheck advisory as Varning and never queues repair", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            vmGatePassed: false,
            designAdvisory: true,
            advisoryChecks: ["typecheck"],
            checks: [
              {
                check: "typecheck",
                passed: false,
                advisory: true,
                exitCode: 2,
                output: "TS2339",
                durationMs: 12,
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    const output = (qualityGate?.output as Record<string, unknown>) ?? {};
    const steps = Array.isArray(output.steps) ? output.steps.map(String) : [];
    expect(qualityGate?.state).toBe("output-available");
    expect(output.passed).toBe(true);
    expect(output.designAdvisory).toBe(true);
    expect(steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Typecheck: Varning"),
        expect.stringContaining("Designläge:"),
      ]),
    );
    expect(steps.some((step) => step.includes("Typecheck: Underkänd"))).toBe(false);
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(fetchCalls.some((call) => call.url.includes("/repair"))).toBe(false);
  });

  it("treats F2 typecheck as Varning from designAdvisory when the check omits advisory", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            vmGatePassed: false,
            designAdvisory: true,
            advisoryChecks: ["typecheck"],
            checks: [
              {
                check: "typecheck",
                passed: false,
                exitCode: 2,
                output: "TS2339",
                durationMs: 12,
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    const output = (qualityGate?.output as Record<string, unknown>) ?? {};
    const steps = Array.isArray(output.steps) ? output.steps.map(String) : [];
    expect(output.passed).toBe(true);
    expect(output.designAdvisory).toBe(true);
    expect(steps).toEqual(
      expect.arrayContaining([expect.stringContaining("Typecheck: Varning")]),
    );
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  // Bugbot medium på fas 1-diffen: superseded-grenen returnerar stämplade
  // checks utan designAdvisory-envelopen. Advisory-stämpeln ensam måste
  // räcka för att typecheck aldrig hamnar i failedChecks → ingen repair.
  it("does not queue repair for an advisory-stamped check even without designAdvisory", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({ files });
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({ ok: true, skipped: true, skippedReason: "feature_disabled" });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            vmGatePassed: false,
            checks: [
              {
                check: "typecheck",
                passed: false,
                advisory: true,
                exitCode: 2,
                output: "TS2339",
                durationMs: 12,
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onAutoFix).not.toHaveBeenCalled();
    expect(fetchCalls.some((call) => call.url.includes("/repair"))).toBe(false);
  });

  it("does not send lint tooling/config failures to code repair", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            checks: [
              {
                check: "lint",
                passed: false,
                repairable: false,
                failureKind: "tooling",
                exitCode: 2,
                output: "missing project-local ESLint config",
                durationMs: 0,
              },
            ],
            firstFailureCheck: "lint",
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    const output = (qualityGate?.output as Record<string, unknown>) ?? {};
    const steps = Array.isArray(output.steps) ? output.steps.map(String) : [];
    expect(steps).toEqual(
      expect.arrayContaining([expect.stringContaining("Lint: Underkänd (exit 2")]),
    );
    expect(output.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "lint",
          passed: false,
          repairable: false,
          failureKind: "tooling",
          output: "missing project-local ESLint config",
        }),
      ]),
    );
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(fetchCalls.some((call) => call.url.includes("/repair"))).toBe(false);
  });

  it("keeps repairable code failures but excludes tooling failures from mixed repair context", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            checks: [
              {
                check: "typecheck",
                passed: false,
                repairable: true,
                failureKind: "code",
                exitCode: 2,
                output: "TS2307: Cannot find module '@/components/Hero'",
                durationMs: 500,
              },
              {
                check: "lint",
                passed: false,
                repairable: false,
                failureKind: "tooling",
                exitCode: 2,
                output: "missing project-local ESLint config",
                durationMs: 0,
              },
            ],
            firstFailureCheck: "typecheck",
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: ["typecheck failed"],
        repair: expect.objectContaining({
          qualityGate: [
            {
              check: "typecheck",
              exitCode: 2,
              output: "TS2307: Cannot find module '@/components/Hero'",
              durationMs: 500,
            },
          ],
        }),
      }),
    );
  });

  it("keeps install-only diagnostics for client autofix while sending no noncanonical server checks", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const installOutput = `npm ERR! Could not resolve dependency @acme/widgets@2\n${"x".repeat(4500)}`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            checks: [
              {
                check: "install",
                passed: false,
                repairable: true,
                failureKind: "code",
                exitCode: 1,
                output: installOutput,
                errorCount: 3,
                durationMs: 725,
              },
            ],
            verifyLaneDurationMs: 725,
            firstFailureCheck: "install",
            jobStartedAt: "2026-08-22T10:00:00.000Z",
            jobFinishedAt: "2026-08-22T10:00:00.725Z",
          });
        }
        if (url.endsWith("/repair")) {
          return jsonResponse({ repaired: false, deterministic: false });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const repairCall = fetchCalls.find((call) => call.url.endsWith("/repair"));
    const repairBody = JSON.parse(String(repairCall?.init?.body)) as {
      repairContext?: {
        qualityGate?: Array<Record<string, unknown>>;
        qualityGateMeta?: Record<string, unknown>;
      };
    };
    expect(repairBody.repairContext?.qualityGate).toEqual([]);
    expect(repairBody.repairContext?.qualityGateMeta).toEqual({
      verifyLaneDurationMs: 725,
      firstFailureCheck: "install",
      jobStartedAt: "2026-08-22T10:00:00.000Z",
      jobFinishedAt: "2026-08-22T10:00:00.725Z",
    });

    expect(onAutoFix).toHaveBeenCalledTimes(1);
    const autoFixRepair = onAutoFix.mock.calls[0]?.[0]?.repair;
    expect(autoFixRepair?.qualityGate).toHaveLength(1);
    expect(autoFixRepair?.qualityGate?.[0]).toEqual({
      check: "install",
      exitCode: 1,
      output: installOutput.slice(0, 4000),
      errorCount: 3,
      durationMs: 725,
    });
    expect(autoFixRepair?.qualityGateMeta).toEqual({
      verifyLaneDurationMs: 725,
      firstFailureCheck: "install",
      jobStartedAt: "2026-08-22T10:00:00.000Z",
      jobFinishedAt: "2026-08-22T10:00:00.725Z",
    });
  });

  it("includes verify-lane timing metadata in quality gate steps", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            checks: [
              {
                check: "build",
                passed: false,
                exitCode: 1,
                output: "Build failed: missing export",
                durationMs: 1800,
              },
            ],
            verifyLaneDurationMs: 3200,
            firstFailureCheck: "build",
            jobStartedAt: "2026-04-03T12:00:00.000Z",
            jobFinishedAt: "2026-04-03T12:00:03.200Z",
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    const output = (qualityGate?.output as Record<string, unknown>) ?? {};
    const steps = Array.isArray(output.steps) ? output.steps.map((step) => String(step)) : [];

    expect(steps).toEqual(
      expect.arrayContaining([
        "Build: Underkänd (exit 1, 1.8s)",
        "Tid: 3.2s",
        "Start: 12:00:00Z",
        "Slut: 12:00:03Z",
        "Första fel: build",
      ]),
    );
  });

  it("preserves visual QA data in quality gate tool output", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              {
                check: "build",
                passed: true,
                exitCode: 0,
                output: "",
                durationMs: 1800,
              },
            ],
            verifyLaneDurationMs: 3200,
            visualQA: {
              overallScore: 74,
              passed: false,
              checks: [
                {
                  check: "hero-balance",
                  passed: false,
                  score: 74,
                  detail: "Hero layout feels uneven.",
                },
              ],
            },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const qualityGate = getToolPart("Quality gate", store);
    const output = (qualityGate?.output as Record<string, unknown>) ?? {};
    expect(output.visualQA).toEqual({
      overallScore: 74,
      passed: false,
      checks: [
        {
          check: "hero-balance",
          passed: false,
          score: 74,
          detail: "Hero layout feels uneven.",
        },
      ],
    });
    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: ["Visual QA score 74/100 below threshold"],
      }),
    );
  });

  it("surfaces failed server-repair attempt before falling back to autofix", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            checks: [
              {
                check: "build",
                passed: false,
                exitCode: 1,
                output: "Build failed: missing export",
                durationMs: 1800,
              },
            ],
            verifyLaneDurationMs: 3200,
            firstFailureCheck: "build",
            jobStartedAt: "2026-04-03T12:00:00.000Z",
            jobFinishedAt: "2026-04-03T12:00:03.200Z",
          });
        }
        if (url.endsWith("/repair")) {
          return jsonResponse({
            repaired: false,
            deterministic: false,
            remainingErrors: 3,
            improvedSyntax: true,
            earlyStopReason: "no_improvement",
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const serverRepair = getToolPart("Server repair", store);
    expect(serverRepair?.state).toBe("output-available");
    expect(serverRepair?.output).toEqual({
      repaired: false,
      method: "llm",
      newVersionId: undefined,
      remainingErrors: 3,
      improvedSyntax: true,
      earlyStopReason: "no_improvement",
      status: "completed",
      reason: null,
    });

    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: ["build failed"],
      }),
    );
  });

  it("surfaces request-failed server-repair attempts before autofix fallback", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        fetchCalls.push({ url });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: false,
            checks: [
              {
                check: "build",
                passed: false,
                exitCode: 1,
                output: "Build failed: missing export",
                durationMs: 1800,
              },
            ],
            verifyLaneDurationMs: 3200,
            firstFailureCheck: "build",
            jobStartedAt: "2026-04-03T12:00:00.000Z",
            jobFinishedAt: "2026-04-03T12:00:03.200Z",
          });
        }
        if (url.endsWith("/repair")) {
          return new Response("boom", { status: 500 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const serverRepair = getToolPart("Server repair", store);
    expect(serverRepair?.state).toBe("output-available");
    expect(serverRepair?.output).toEqual({
      repaired: false,
      method: null,
      newVersionId: undefined,
      remainingErrors: null,
      improvedSyntax: null,
      earlyStopReason: null,
      status: "request_failed",
      reason: "Repair request failed (HTTP 500)",
    });

    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: ["build failed"],
      }),
    );
  });

  it("leaves SEO polish to publishing and emits no per-version SEO diagnostics", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildSeoIssueFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [
              {
                id: "ver_1",
                versionId: "ver_1",
                demoUrl: "https://preview.example/ver_1",
                createdAt: "2026-03-14T10:00:00.000Z",
              },
            ],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return featureDisabledProductPostcheckResponse();
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({ error: "Sandbox not configured" }, 501);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example/ver_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // SEO-polish belongs to the existing Publicera opt-in. Ordinary version
    // postchecks keep runtime/sanity signals but emit no SEO review row.
    const postCheck = getToolPart("Post-check", store);
    const output = postCheck?.output as Record<string, unknown>;
    expect(output.seoSummary).toBeUndefined();
    expect(output.analyticsSummary).toBeUndefined();
    expect(output.editorialSummary).toBeUndefined();
    expect(output.businessWorkflowSummary).toBeUndefined();
    const steps = Array.isArray(output.steps) ? (output.steps as string[]) : [];
    expect(steps.some((step) => step.startsWith("SEO:"))).toBe(false);

    const errorLogCall = fetchCalls.find(
      (call) => call.url.includes("/error-log") && call.init?.method === "POST",
    );
    const errorLogBody = JSON.parse(String(errorLogCall?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string; meta?: { verdict?: string } }>;
    };
    expect(errorLogBody.logs).toEqual([
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "allowed_skip",
          skippedReason: "feature_disabled",
        }),
      }),
    ]);
    expect(
      errorLogBody.logs?.some((log) => log.category?.toLowerCase().includes("seo")),
    ).toBe(false);

    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("persists Product Postcheck blockers as product_postcheck logs and output", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "mobile_menu_failed",
                message: "Mobilmeny kunde inte verifieras: hamburger_button_did_not_change_dom_or_aria",
              },
            ],
            warningCount: 1,
            productBlocked: true,
            durationMs: 123,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({ error: "Sandbox not configured" }, 501);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLogCall = fetchCalls.find((call) => call.url.includes("/error-log"));
    const body = JSON.parse(String(errorLogCall?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string; meta?: Record<string, unknown> }>;
    };
    expect(body.logs?.map((log) => log.category)).toEqual(
      expect.arrayContaining(["product_postcheck.summary", "product_postcheck.mobile_menu_failed"]),
    );
    expect(body.logs?.find((log) => log.category === "product_postcheck.summary")?.meta).toEqual(
      expect.objectContaining({ productBlocked: true, verdict: "blocked" }),
    );
    expect(body.logs?.find((log) => log.category === "product_postcheck.mobile_menu_failed")?.meta).toEqual(
      expect.objectContaining({ code: "mobile_menu_failed" }),
    );
    const postCheck = getToolPart("Post-check", store);
    expect(((postCheck?.output as { summary?: { productBlocked?: boolean } }).summary)?.productBlocked).toBe(true);
    expect((postCheck?.output as { productPostcheck?: { productBlocked?: boolean } }).productPostcheck?.productBlocked).toBe(true);
    expect((postCheck?.output as { warnings?: string[] }).warnings).toEqual(
      expect.arrayContaining(["Product: Mobilmeny kunde inte verifieras: hamburger_button_did_not_change_dom_or_aria"]),
    );
    expect(store.getAssistant()?.content).toContain("Produktkontroll: blockerande problem hittades");
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("skickar productBlocked-fynd till auto-fix när gaten passerar (ägarbeslut 2026-09-01)", async () => {
    // Prod 2026-09-01 (chat 3b9ca137, v2): Degraderad med 4 döda CTA-knappar
    // och trasig mobilmeny stannade vid en badge. Fynden är strukturerade och
    // ska gå till samma riktade auto-fix-runda som Visual QA.
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "cta_no_handler",
                message: "CTA-knapp saknar tydlig handling.",
                selector: "button",
                text: "09:00",
              },
              {
                code: "mobile_menu_failed",
                message: "Mobilmeny kunde inte verifieras: hamburger_button_did_not_change_dom_or_aria",
              },
            ],
            warningCount: 2,
            productBlocked: true,
            durationMs: 123,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onAutoFix).toHaveBeenCalledTimes(1);
    const payload = onAutoFix.mock.calls[0][0] as {
      reasons: string[];
      repair?: { productFindings?: Array<{ code: string; selector?: string; text?: string }> };
    };
    expect(payload.reasons[0]).toContain("Product Postcheck");
    expect(payload.repair?.productFindings).toEqual([
      expect.objectContaining({ code: "cta_no_handler", selector: "button", text: "09:00" }),
      expect.objectContaining({ code: "mobile_menu_failed" }),
    ]);
  });

  it("batchar advisory-fynd och live-review in i samma auto-fix efter gate-pass", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const brokenSrc = "https://images.unsplash.com/photo-dead?w=800";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "broken_image",
                message: `Bilden laddade inte: ${brokenSrc}`,
                src: brokenSrc,
              },
              {
                code: "cta_no_handler",
                message: "CTA-knapp saknar tydlig handling.",
                selector: "button",
                text: "Boka",
              },
            ],
            warningCount: 2,
            productBlocked: false,
            durationMs: 80,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
            liveReview: {
              status: "completed",
              durationMs: 12,
              modelId: "live-review-test",
              decision: {
                verdict: "micro_fix",
                confidence: 0.7,
                rationale: "Hero-bilden är död.",
                reasoning: "Skärmdumpen visar en bruten bild.",
                issues: [
                  {
                    severity: "medium",
                    evidence: "Trasig hero",
                    target: "img[alt='Bullar']",
                    suggestedOperation: "Byt hero-bilden mot en levande Unsplash-URL",
                  },
                ],
              },
            },
          });
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const scopedImageCall = fetchCalls.find((call) => {
      if (!call.url.includes("/validate-images")) return false;
      const body = JSON.parse(String(call.init?.body ?? "{}")) as { urls?: string[] };
      return body.urls?.includes(brokenSrc) === true;
    });
    expect(scopedImageCall).toBeTruthy();

    expect(onAutoFix).toHaveBeenCalledTimes(1);
    const payload = onAutoFix.mock.calls[0][0] as {
      reasons: string[];
      repair?: { productFindings?: Array<{ code: string; selector?: string; text?: string }> };
    };
    expect(payload.reasons.some((reason) => reason.includes("advisory-fynd"))).toBe(true);
    expect(payload.reasons).toContain("Live review: micro_fix");
    expect(payload.repair?.productFindings).toEqual([
      expect.objectContaining({ code: "cta_no_handler", text: "Boka" }),
      expect.objectContaining({
        code: "live_review_micro_fix",
        selector: "img[alt='Bullar']",
      }),
    ]);
    expect(payload.repair?.productFindings?.some((finding) => finding.code === "broken_image")).toBe(
      false,
    );
  });

  // Trasiga bilder sänker ofta Visual QA. En exklusiv `else if` gjorde att den
  // deterministiska URL-fixen hoppades över i exakt det läget. Bildfixen ska
  // köras ändå — men turen får fortfarande bara EN LLM-runda (Visual QA:s).
  it("kör den skopade bildfixen även när Visual QA underkänns, med en enda LLM-runda", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const brokenSrc = "https://images.unsplash.com/photo-dead-visualqa?w=800";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "broken_image",
                message: `Bilden laddade inte: ${brokenSrc}`,
                src: brokenSrc,
              },
            ],
            warningCount: 1,
            productBlocked: false,
            durationMs: 80,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) return jsonResponse({ ok: true });
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
            visualQA: {
              overallScore: 61,
              passed: false,
              checks: [
                { check: "hero-balance", passed: false, score: 61, detail: "Trasig hero." },
              ],
            },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const scopedImageCall = fetchCalls.find((call) => {
      if (!call.url.includes("/validate-images")) return false;
      const body = JSON.parse(String(call.init?.body ?? "{}")) as { urls?: string[] };
      return body.urls?.includes(brokenSrc) === true;
    });
    expect(scopedImageCall).toBeTruthy();

    expect(onAutoFix).toHaveBeenCalledTimes(1);
    const payload = onAutoFix.mock.calls[0][0] as { reasons: string[] };
    expect(payload.reasons.some((reason) => reason.includes("Visual QA"))).toBe(true);
    expect(payload.reasons.some((reason) => reason.includes("Product Postcheck"))).toBe(false);
  });

  // Samma takkonstant som routens Zod-schema. En okapad lista gav 400 på hela
  // requesten, så klienten hoppade över ALLA ersättningar. Kapa, och låt
  // överskottet — som annars filtrerades bort från LLM-vägen också — gå vidare
  // till auto-fix. Om taket driver isär mot routen blir det rött här och i
  // validate-images/route.test.ts.
  it("kapar broken_image-URL:erna till routens tak och lämnar överskottet till LLM", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const overflow = 4;
    const brokenSrcs = Array.from(
      { length: MAX_SCOPED_IMAGE_URLS + overflow },
      (_, index) => `https://images.unsplash.com/photo-dead-${index}?w=800`,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) return jsonResponse({});
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: brokenSrcs.map((src) => ({
              code: "broken_image",
              message: `Bilden laddade inte: ${src}`,
              src,
            })),
            warningCount: brokenSrcs.length,
            productBlocked: false,
            durationMs: 80,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) return jsonResponse({ ok: true });
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const scopedImageCall = fetchCalls.find((call) => {
      if (!call.url.includes("/validate-images")) return false;
      const body = JSON.parse(String(call.init?.body ?? "{}")) as { urls?: string[] };
      return Array.isArray(body.urls) && body.urls.length > 0;
    });
    const scopedBody = JSON.parse(String(scopedImageCall?.init?.body ?? "{}")) as {
      urls?: string[];
    };
    expect(scopedBody.urls).toHaveLength(MAX_SCOPED_IMAGE_URLS);
    expect(scopedBody.urls).toEqual(brokenSrcs.slice(0, MAX_SCOPED_IMAGE_URLS));

    expect(onAutoFix).toHaveBeenCalledTimes(1);
    const payload = onAutoFix.mock.calls[0][0] as {
      repair?: { productFindings?: Array<{ code: string; src?: string }> };
    };
    const findings = payload.repair?.productFindings ?? [];
    expect(findings).toHaveLength(overflow);
    expect(findings.map((finding) => finding.src)).toEqual(
      brokenSrcs.slice(MAX_SCOPED_IMAGE_URLS),
    );
  });

  it("kör bara URL-skopad bildersättning när advisory-fyndet är broken_image", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const brokenSrc = "https://images.unsplash.com/photo-dead-only?w=800";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "broken_image",
                message: `Bilden laddade inte: ${brokenSrc}`,
                src: brokenSrc,
              },
            ],
            warningCount: 1,
            productBlocked: false,
            durationMs: 40,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      fetchCalls.some((call) => {
        if (!call.url.includes("/validate-images")) return false;
        const body = JSON.parse(String(call.init?.body ?? "{}")) as { urls?: string[] };
        return body.urls?.includes(brokenSrc) === true;
      }),
    ).toBe(true);
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("startar en ny quality-gate när den skopade bildfixen faktiskt skrev en ersättning", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const brokenSrc = "https://images.unsplash.com/photo-dead-rewritten?w=800";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { urls?: string[] };
          if (body.urls?.includes(brokenSrc)) {
            return jsonResponse({ fixed: true, replacedCount: 1 });
          }
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "broken_image",
                message: `Bilden laddade inte: ${brokenSrc}`,
                src: brokenSrc,
              },
            ],
            warningCount: 1,
            productBlocked: false,
            durationMs: 40,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) return jsonResponse({ ok: true });
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await vi.waitFor(() => {
      expect(fetchCalls.filter((call) => call.url.includes("/quality-gate"))).toHaveLength(2);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchCalls.filter((call) => call.url.includes("/quality-gate"))).toHaveLength(2);

    const scopedImageCalls = fetchCalls.filter((call) => {
      if (!call.url.includes("/validate-images")) return false;
      const body = JSON.parse(String(call.init?.body ?? "{}")) as { urls?: string[] };
      return body.urls?.includes(brokenSrc) === true;
    });
    expect(scopedImageCalls.length).toBeGreaterThanOrEqual(1);
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(hasActivePostCheck("chat_1")).toBe(false);
    const qualityGate = getToolPart("Quality gate", store);
    expect(qualityGate?.state).not.toBe("output-error");
  });

  it("startar ingen ny quality-gate när den skopade bildfixen inte skrev något", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const brokenSrc = "https://images.unsplash.com/photo-dead-noop?w=800";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { urls?: string[] };
          if (body.urls?.includes(brokenSrc)) {
            return jsonResponse({ fixed: false, replacedCount: 0 });
          }
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "broken_image",
                message: `Bilden laddade inte: ${brokenSrc}`,
                src: brokenSrc,
              },
            ],
            warningCount: 1,
            productBlocked: false,
            durationMs: 40,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) return jsonResponse({ ok: true });
        if (url.includes("/quality-gate")) {
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchCalls.filter((call) => call.url.includes("/quality-gate"))).toHaveLength(1);
    expect(
      fetchCalls.some((call) => {
        if (!call.url.includes("/validate-images")) return false;
        const body = JSON.parse(String(call.init?.body ?? "{}")) as { urls?: string[] };
        return body.urls?.includes(brokenSrc) === true;
      }),
    ).toBe(true);
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(hasActivePostCheck("chat_1")).toBe(false);
  });

  it("tillåter bara en follow-up-verify per gate-pass även om bildfixen fortsätter rapportera fixed", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();
    const brokenSrc = "https://images.unsplash.com/photo-dead-loop?w=800";
    let qualityGateCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) return jsonResponse({ files });
        if (url.includes("/validate-images")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { urls?: string[] };
          if (Array.isArray(body.urls) && body.urls.length > 0) {
            return jsonResponse({ fixed: true, replacedCount: 1 });
          }
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: false,
            warnings: [
              {
                code: "broken_image",
                message: `Bilden laddade inte: ${brokenSrc}`,
                src: brokenSrc,
              },
            ],
            warningCount: 1,
            productBlocked: false,
            durationMs: 40,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) return jsonResponse({ ok: true });
        if (url.includes("/quality-gate")) {
          qualityGateCalls += 1;
          if (qualityGateCalls > 5) {
            throw new Error("infinite scoped-image reverify loop");
          }
          return jsonResponse({
            passed: true,
            checks: [
              { check: "typecheck", passed: true, exitCode: 0, output: "", durationMs: 900 },
            ],
            verifyLaneDurationMs: 1200,
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://vm-fly-jakem.fly.dev/chat_1",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await vi.waitFor(() => {
      expect(fetchCalls.filter((call) => call.url.includes("/quality-gate"))).toHaveLength(2);
    });

    const scopedImageCalls = fetchCalls.filter((call) => {
      if (!call.url.includes("/validate-images")) return false;
      const body = JSON.parse(String(call.init?.body ?? "{}")) as { urls?: string[] };
      return Array.isArray(body.urls) && body.urls.length > 0;
    });
    expect(scopedImageCalls).toHaveLength(2);
    expect(qualityGateCalls).toBe(2);
    expect(onAutoFix).not.toHaveBeenCalled();
    expect(hasActivePostCheck("chat_1")).toBe(false);
  });

  it("persists Product Postcheck skipped status without warning or autofix", async () => {
    const onAutoFix = vi.fn();
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, init });
        if (url.includes("/versions")) {
          return jsonResponse({
            versions: [{ id: "ver_1", versionId: "ver_1", createdAt: "2026-03-14T10:00:00.000Z" }],
          });
        }
        if (url.includes("/files?versionId=ver_1")) {
          return jsonResponse({ files });
        }
        if (url.includes("/validate-images")) {
          return jsonResponse({});
        }
        if (url.includes("/product-postcheck")) {
          return jsonResponse({
            ok: true,
            skipped: true,
            skippedReason: "missing_preview_url",
            warnings: [],
            warningCount: 0,
            productBlocked: false,
            durationMs: 0,
            checkedUrl: null,
            attestation: CURRENT_POSTCHECK_ATTESTATION,
          });
        }
        if (url.includes("/error-log")) {
          return jsonResponse({ ok: true });
        }
        if (url.includes("/quality-gate")) {
          return jsonResponse({ error: "Sandbox not configured" }, 501);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: null,
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
      onAutoFix,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLogCall = fetchCalls.find((call) => call.url.includes("/error-log"));
    const body = JSON.parse(String(errorLogCall?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string; meta?: Record<string, unknown> }>;
    };
    expect(body.logs?.find((log) => log.category === "product_postcheck.skipped")?.meta).toEqual(
      expect.objectContaining({ skippedReason: "missing_preview_url" }),
    );
    // Befintlig readiness-logik kan fortfarande köa autofix för "preview saknas".
    // Product Postcheck ska däremot fail-open och bara lägga en skipped-logg.
  });
});

describe("buildProductPostcheckLogItems live review", () => {
  it("persists a transport failure when the postcheck API returned no result", () => {
    expect(buildProductPostcheckLogItems(null)).toEqual([
      expect.objectContaining({
        level: "warning",
        category: "post-check.product-postcheck-transport",
        meta: expect.objectContaining({ skippedReason: "transport_error" }),
      }),
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "pending",
          skippedReason: "transport_error",
        }),
      }),
    ]);
  });

  it("skriver skip-orsaken i stället för 'screenshots captured'", () => {
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      screenshots: { desktopUrl: null, mobileUrl: null },
      liveReview: { status: "skipped", reason: "no_screenshots" },
      attestation: CURRENT_POSTCHECK_ATTESTATION,
    });
    expect(logs.find((log) => log.category === "product_postcheck.live_review")?.message).toBe(
      "Live review skipped: no_screenshots.",
    );
  });

  it("bär postcheck-attesteringen i varje durabel loggrad", () => {
    const attestation = {
      previewSessionId: "preview_n",
      lifecycleToken: null,
      filesRevision: "rev_n",
    };
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [{ code: "console_error", message: "boom" }],
      warningCount: 1,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
      liveReview: { status: "skipped", reason: "no_screenshots" },
      attestation,
    });

    expect(logs.length).toBeGreaterThan(1);
    for (const log of logs) {
      expect(log.meta).toEqual(
        expect.objectContaining({
          attestedPreviewSessionId: "preview_n",
          attestedLifecycleToken: null,
          attestedFilesRevision: "rev_n",
        }),
      );
    }
  });

  it("binder run-id till varje rad och redovisar reported vs persisted antal", () => {
    // OpenClaw 2026-09-01: "9 varningar rapporterade, 7 redovisade" gick inte
    // att utreda utan körnings-id + separata räknare i summaryn.
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [
        { code: "cta_no_handler", message: "CTA-knapp saknar tydlig handling." },
        { code: "broken_image", message: "Bilden laddade inte: x", src: "https://x" },
      ],
      warningCount: 9,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      attestation: CURRENT_POSTCHECK_ATTESTATION,
      verificationRunId: "run_abc",
    });

    for (const log of logs) {
      expect(log.meta).toEqual(expect.objectContaining({ verificationRunId: "run_abc" }));
    }
    const summary = logs.find((log) => log.category === "product_postcheck.summary");
    expect(summary?.meta).toEqual(
      expect.objectContaining({
        reportedWarningCount: 9,
        persistedWarningCount: 2,
        warningCount: 2,
        verdict: "passed",
      }),
    );
  });

  it("behåller verdikten när review är completed", () => {
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: false,
      skippedReason: null,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 1,
      screenshots: { desktopUrl: "https://blob.example/d.jpg", mobileUrl: null },
      liveReview: {
        status: "completed",
        decision: {
          verdict: "pass",
          confidence: 0.8,
          rationale: "Sajten följer briefen.",
          reasoning: "",
          issues: [],
        },
        durationMs: 9,
        modelId: "gpt-4o",
      },
      attestation: CURRENT_POSTCHECK_ATTESTATION,
    });
    expect(logs.find((log) => log.category === "product_postcheck.live_review")?.message).toBe(
      "Live review: pass.",
    );
  });

  it("persists superseded as an explicit non-release verdict, never a legacy skip", () => {
    expect(
      buildProductPostcheckLogItems({
        ok: true,
        skipped: true,
        skippedReason: "preview_superseded",
        warnings: [],
        warningCount: 0,
        productBlocked: false,
        durationMs: 1,
        checkedUrl: "https://preview.example",
        routesChecked: 1,
        attestation: null,
      }),
    ).toEqual([
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "superseded",
          skippedReason: "preview_superseded",
        }),
      }),
    ]);
  });

  it("attesterad skip skriver bara skipped — ingen ny summary som kan radera blocked", () => {
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: true,
      skippedReason: "browser_crashed",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 12,
      checkedUrl: "https://preview.example",
      routesChecked: 0,
      attestation: CURRENT_POSTCHECK_ATTESTATION,
    });
    expect(logs.map((log) => log.category)).toEqual(["product_postcheck.skipped"]);
    expect(logs[0]?.meta).toEqual(
      expect.objectContaining({
        verdict: "allowed_skip",
        skippedReason: "browser_crashed",
      }),
    );
  });

  it("oattesterad skip persisteras som pending; feature_disabled som allowed_skip", () => {
    expect(
      buildProductPostcheckLogItems({
        ok: true,
        skipped: true,
        skippedReason: "browser_crashed",
        warnings: [],
        warningCount: 0,
        productBlocked: false,
        durationMs: 1,
        checkedUrl: "https://preview.example",
        routesChecked: 0,
        attestation: null,
      }),
    ).toEqual([
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "pending",
          skippedReason: "browser_crashed",
        }),
      }),
    ]);
    expect(
      buildProductPostcheckLogItems({
        ok: true,
        skipped: true,
        skippedReason: "feature_disabled",
        warnings: [],
        warningCount: 0,
        productBlocked: false,
        durationMs: 1,
        checkedUrl: null,
        routesChecked: 0,
        attestation: null,
      }),
    ).toEqual([
      expect.objectContaining({
        category: "product_postcheck.summary",
        meta: expect.objectContaining({
          verdict: "allowed_skip",
          skippedReason: "feature_disabled",
        }),
      }),
    ]);
  });

  it("L7: oattesterad preview_not_ready/preview_not_running lämnar ingen durabel skip", () => {
    const pending = {
      ok: true as const,
      skipped: true,
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 1,
      checkedUrl: "https://preview.example",
      routesChecked: 0,
      attestation: null,
    };
    expect(
      buildProductPostcheckLogItems({ ...pending, skippedReason: "preview_not_ready" }),
    ).toEqual([]);
    expect(
      buildProductPostcheckLogItems({ ...pending, skippedReason: "preview_not_running" }),
    ).toEqual([]);
  });
});

describe("productPostcheckResultFromUnavailableHttp", () => {
  it("mappar 503 claim_unavailable till retrybar infra-skip", () => {
    const result = productPostcheckResultFromUnavailableHttp({
      status: 503,
      code: "claim_unavailable",
    });
    expect(result?.skippedReason).toBe("claim_unavailable");
    expect(result?.attestation).toBeNull();
  });

  it("mappar 503 lease_unavailable till retrybar infra-skip", () => {
    const result = productPostcheckResultFromUnavailableHttp({
      status: 503,
      code: "lease_unavailable",
    });
    expect(result?.skippedReason).toBe("lease_unavailable");
  });

  it("lämnar 500 och okänd 503 som transport (null)", () => {
    expect(productPostcheckResultFromUnavailableHttp({ status: 500, code: "claim_unavailable" })).toBeNull();
    expect(productPostcheckResultFromUnavailableHttp({ status: 503, code: "row_contention" })).toBeNull();
  });
});
