import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";

const runProjectSanityChecks = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/validation/project-sanity", () => ({
  runProjectSanityChecks,
}));

import { runPostGenerationChecks } from "./post-checks";
import type { SetMessages } from "./types";

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
  let fetchCalls: FetchCall[];

  beforeEach(() => {
    fetchCalls = [];
    runProjectSanityChecks.mockReset();
    runProjectSanityChecks.mockReturnValue({ valid: true, issues: [] });
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
    expect((postCheck?.output as Record<string, unknown>).demoUrl).toBe("https://preview.example/ver_1");
    expect((postCheck?.output as Record<string, unknown>).warnings).toContain(
      "Preview är tillgänglig, men versionen har verifieringsblockerande preflightfel.",
    );
    expect(qualityGate?.state).toBe("output-available");
    expect(((qualityGate?.output as Record<string, unknown>).skipped as boolean) ?? false).toBe(true);
    expect(onAutoFix).not.toHaveBeenCalled();
  });

  it("queues autofix when sandbox quality gate fails after a clean post-check", async () => {
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
    expect(qualityGate?.state).toBe("output-available");
    expect(((qualityGate?.output as Record<string, unknown>).passed as boolean) ?? true).toBe(false);
    expect(onAutoFix).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: ["build failed"],
        meta: {
          qualityGate: {
            build: "Build failed: missing export",
          },
        },
      }),
    );
  });
});
