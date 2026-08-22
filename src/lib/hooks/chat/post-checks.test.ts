import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";

const runProjectSanityChecks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/validation/project-sanity", () => ({
  runProjectSanityChecks,
}));

import { buildProductPostcheckLogItems, runPostGenerationChecks } from "./post-checks";
import type { SetMessages } from "./types";
import {
  acceptClientErrorReport,
  resetClientErrorReportGateForTests,
} from "@/lib/builder/preview-client-error-report";

type FetchCall = {
  url: string;
  init?: RequestInit;
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
  return store.getAssistant()?.uiParts?.find((part) => part.toolName === toolName) as
    Record<string, unknown> | undefined;
}

describe("runPostGenerationChecks", () => {
  let fetchCalls: FetchCall[];

  beforeEach(() => {
    fetchCalls = [];
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
          return jsonResponse({ skipped: true, warnings: [] });
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
      "Efterkontrollerar filer och preview.",
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
    expect(
      ((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>)
        .failures,
    ).toContain("preflight_preview_blocked");
    expect(qualityGate?.state).toBe("output-available");
    expect(((qualityGate?.output as Record<string, unknown>).skipped as boolean) ?? false).toBe(
      true,
    );

    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat_1",
        versionId: "ver_1",
        reasons: expect.arrayContaining(["preview blockerad i preflight"]),
      }),
    );

    const errorLogCall = fetchCalls.find((call) => call.url.includes("/error-log"));
    const body = JSON.parse(String(errorLogCall?.init?.body)) as {
      logs: Array<{ meta?: Record<string, unknown> }>;
    };
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
        if (url.includes("/error-log")) return delayedPersistence;
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

    await runPromise;
    expect(mutateVersions).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    settlePersistence();
    await vi.waitFor(() => {
      expect(mutateVersions).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(order).toEqual(["persistence-settled", "versions-refreshed", "status-refreshed"]);
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
        acceptClientErrorReport("ver_1", "Hydration failed", "2026-08-15T10:00:00.000Z"),
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
          return jsonResponse({ skipped: true, warnings: [] });
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
    expect(order).toEqual(["versions-refreshed", "quality-gate-settled", "versions-refreshed"]);
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
    expect(
      ((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>)
        .failures,
    ).toContain("missing_preview_url");
    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: expect.arrayContaining(["preview saknas"]),
      }),
    );

    const errorLogCall = fetchCalls.find((call) => call.url.includes("/error-log"));
    const body = JSON.parse(String(errorLogCall?.init?.body)) as {
      logs: Array<{ meta?: Record<string, unknown> }>;
    };
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
        previewBlockingReason:
          "Automatic preflight could not build a renderable own-engine preview entrypoint.",
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
    expect(
      ((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>)
        .failures,
    ).not.toContain("missing_preview_url");
    expect(
      ((postCheck?.output as Record<string, unknown>).qualityGate as Record<string, unknown>)
        .failures,
    ).not.toContain("preflight_preview_blocked");
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
    expect((postCheck?.output as Record<string, unknown>).demoUrl).toBe(
      "https://preview.example/ver_1",
    );
    expect((postCheck?.output as Record<string, unknown>).warnings).toContain(
      "Preview är tillgänglig, men versionen har verifieringsblockerande preflightfel.",
    );
    expect(qualityGate?.state).toBe("output-available");
    expect(((qualityGate?.output as Record<string, unknown>).skipped as boolean) ?? false).toBe(
      true,
    );
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
    expect(((qualityGate?.output as Record<string, unknown>).passed as boolean) ?? true).toBe(
      false,
    );
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
        expect.stringContaining("lint: Varning"),
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
        expect.stringContaining("typecheck: Varning"),
        expect.stringContaining("Designläge:"),
      ]),
    );
    expect(steps.some((step) => step.includes("typecheck: Underkänd"))).toBe(false);
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
    expect(steps).toEqual(expect.arrayContaining([expect.stringContaining("typecheck: Varning")]));
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
      expect.arrayContaining([expect.stringContaining("lint: Underkänd (exit 2")]),
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
        "build: Underkänd (exit 1, 1.8s)",
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
    const persistedLogs = JSON.parse(String(errorLogCall?.init?.body ?? "{}")) as {
      logs?: Array<{ category?: string }>;
    };
    expect(persistedLogs.logs?.some((log) => /seo/i.test(log.category ?? ""))).toBe(false);
    expect(
      persistedLogs.logs?.some((log) => log.category === "product_postcheck.live_review"),
    ).toBe(true);

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
                message:
                  "Mobilmeny kunde inte verifieras: hamburger_button_did_not_change_dom_or_aria",
              },
            ],
            warningCount: 1,
            productBlocked: true,
            durationMs: 123,
            checkedUrl: "https://vm-fly-jakem.fly.dev/chat_1",
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
      expect.objectContaining({ productBlocked: true }),
    );
    expect(
      body.logs?.find((log) => log.category === "product_postcheck.mobile_menu_failed")?.meta,
    ).toEqual(expect.objectContaining({ code: "mobile_menu_failed" }));
    const postCheck = getToolPart("Post-check", store);
    expect(
      (postCheck?.output as { summary?: { productBlocked?: boolean } }).summary?.productBlocked,
    ).toBe(true);
    expect(
      (postCheck?.output as { productPostcheck?: { productBlocked?: boolean } }).productPostcheck
        ?.productBlocked,
    ).toBe(true);
    expect((postCheck?.output as { warnings?: string[] }).warnings).toEqual(
      expect.arrayContaining([
        "Product: Mobilmeny kunde inte verifieras: hamburger_button_did_not_change_dom_or_aria",
      ]),
    );
    expect(store.getAssistant()?.content).toContain(
      "Produktkontroll: blockerande problem hittades",
    );
    expect(onAutoFix).not.toHaveBeenCalled();
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
            routesChecked: 0,
            liveReview: { status: "skipped", reason: "preview_not_ready" },
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
    expect(
      body.logs?.find((log) => log.category === "product_postcheck.live_review"),
    ).toBeDefined();
    expect(getToolPart("Live-granskning", store)).toMatchObject({
      type: "tool:live-review",
      output: {
        liveReview: { status: "skipped", reason: "preview_not_ready" },
      },
    });
    // Befintlig readiness-logik kan fortfarande köa autofix för "preview saknas".
    // Product Postcheck ska däremot fail-open och bara lägga en skipped-logg.
  });

  it("adds a visible live-review step even when access policy skips it", async () => {
    const store = createMessageStore();
    const files = buildHealthyFiles();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
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
            skippedReason: null,
            warnings: [],
            warningCount: 0,
            productBlocked: false,
            durationMs: 10,
            checkedUrl: "https://preview.example",
            routesChecked: 1,
            screenshots: null,
            liveReview: { status: "skipped", reason: "flag_off" },
          });
        }
        if (url.includes("/error-log")) return jsonResponse({ ok: true });
        if (url.includes("/quality-gate")) {
          return jsonResponse({ error: "Sandbox not configured" }, 501);
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    await runPostGenerationChecks({
      chatId: "chat_1",
      versionId: "ver_1",
      demoUrl: "https://preview.example",
      assistantMessageId: "assistant_1",
      setMessages: store.setMessages,
    });

    expect(getToolPart("Live-granskning", store)).toMatchObject({
      type: "tool:live-review",
      state: "output-available",
      output: {
        liveReview: { status: "skipped", reason: "flag_off" },
        screenshots: null,
      },
    });
  });
});

describe("buildProductPostcheckLogItems live review", () => {
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
    });
    expect(logs.find((log) => log.category === "product_postcheck.live_review")?.message).toBe(
      "Live review skipped: no_screenshots.",
    );
  });

  it("persists a dedicated live-review notice even when Product Postcheck was skipped", () => {
    const logs = buildProductPostcheckLogItems({
      ok: true,
      skipped: true,
      skippedReason: "missing_preview_url",
      warnings: [],
      warningCount: 0,
      productBlocked: false,
      durationMs: 0,
      checkedUrl: null,
      routesChecked: 0,
      liveReview: { status: "skipped", reason: "preview_not_ready" },
    });

    expect(logs.map((log) => log.category)).toEqual([
      "product_postcheck.skipped",
      "product_postcheck.live_review",
    ]);
    expect(logs[1]?.message).toBe("Live review skipped: preview_not_ready.");
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
    });
    expect(logs.find((log) => log.category === "product_postcheck.live_review")?.message).toBe(
      "Live review: pass.",
    );
  });
});
