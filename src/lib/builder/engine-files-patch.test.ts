import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patchEngineChatFile, quickEditChatFiles } from "./engine-files-patch";

type FetchCall = { url: string; method: string; body: Record<string, unknown> | null };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("engine-files-patch · Fast Edit Lane", () => {
  let calls: FetchCall[];

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Records every fetch and routes the response via `handler` (may throw to simulate a network error). */
  function stubFetch(handler: (call: FetchCall) => Response): void {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: FetchCall = {
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      };
      calls.push(call);
      return handler(call);
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  const calledQuickEdit = () => calls.some((c) => c.url.endsWith("/quick-edit"));
  const calledFilesPatch = () =>
    calls.some((c) => c.method === "PATCH" && c.url.endsWith("/files"));

  describe("FINDING #1 — stale-base signal threading", () => {
    it("forwards engineLatestKnownVersionId into the quick-edit request body", async () => {
      vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "1");
      stubFetch((call) => {
        if (call.url.endsWith("/quick-edit")) {
          return jsonResponse({ ok: true, versionId: "ver_3_1", changedFiles: ["app/page.tsx"] });
        }
        throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      });

      const result = await patchEngineChatFile({
        chatId: "chat_1",
        versionId: "ver_3",
        fileName: "app/page.tsx",
        content: "next",
        engineLatestKnownVersionId: "ver_3",
      });

      expect(result.ok).toBe(true);
      const quickEditCall = calls.find((c) => c.url.endsWith("/quick-edit"));
      expect(quickEditCall?.body).toMatchObject({
        baseVersionId: "ver_3",
        engineLatestKnownVersionId: "ver_3",
        ops: [{ kind: "replace_content", path: "app/page.tsx", content: "next" }],
      });
    });

    it("omits engineLatestKnownVersionId from the body when no caller provides one", async () => {
      stubFetch(() => jsonResponse({ ok: true, versionId: "v", changedFiles: [] }));

      const result = await quickEditChatFiles({
        chatId: "chat_1",
        baseVersionId: "ver_3",
        ops: [{ kind: "replace_content", path: "a.tsx", content: "x" }],
      });

      expect(result.ok).toBe(true);
      expect(calls[0]?.body).not.toHaveProperty("engineLatestKnownVersionId");
    });
  });

  describe("FINDING #5 — no silent in-place fallback on hard failures", () => {
    it("surfaces the 409 stale_base_version as a hard error without falling back to in-place PATCH", async () => {
      vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "1");
      stubFetch((call) => {
        if (call.url.endsWith("/quick-edit")) {
          return jsonResponse(
            { ok: false, error: "stale_base_version", serverPreferredVersionId: "ver_4" },
            409,
          );
        }
        throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      });

      const result = await patchEngineChatFile({
        chatId: "chat_1",
        versionId: "ver_3",
        fileName: "app/page.tsx",
        content: "next",
        engineLatestKnownVersionId: "ver_3",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("nyare version");
      expect(calledFilesPatch()).toBe(false);
    });

    it("surfaces a quick-edit decline (no_match) as a hard error without falling back", async () => {
      vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "1");
      stubFetch((call) => {
        if (call.url.endsWith("/quick-edit")) {
          return jsonResponse({ ok: false, reason: "no_match", error: "No match found." }, 422);
        }
        throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      });

      const result = await patchEngineChatFile({
        chatId: "chat_1",
        versionId: "ver_3",
        fileName: "app/page.tsx",
        content: "next",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("No match found.");
      expect(calledFilesPatch()).toBe(false);
    });

    it("surfaces a network error as a hard error without falling back", async () => {
      vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "1");
      stubFetch((call) => {
        if (call.url.endsWith("/quick-edit")) {
          throw new TypeError("Failed to fetch");
        }
        throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      });

      const result = await patchEngineChatFile({
        chatId: "chat_1",
        versionId: "ver_3",
        fileName: "app/page.tsx",
        content: "next",
      });

      expect(result.ok).toBe(false);
      expect(calls.filter((c) => c.url.endsWith("/quick-edit")).length).toBe(1);
      expect(calledFilesPatch()).toBe(false);
    });

    it("falls back to in-place PATCH ONLY when the base is an F3 integrations version", async () => {
      vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "1");
      stubFetch((call) => {
        if (call.url.endsWith("/quick-edit")) {
          return jsonResponse(
            {
              ok: false,
              reason: "integrations_base",
              error: "Quick edit is not supported on an F3/integrations version.",
            },
            422,
          );
        }
        if (call.url.endsWith("/files") && call.method === "PATCH") {
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      });

      const result = await patchEngineChatFile({
        chatId: "chat_1",
        versionId: "ver_f3",
        fileName: "app/page.tsx",
        content: "next",
      });

      expect(result.ok).toBe(true);
      const patchCall = calls.find((c) => c.method === "PATCH" && c.url.endsWith("/files"));
      expect(patchCall?.body).toMatchObject({
        versionId: "ver_f3",
        fileName: "app/page.tsx",
        content: "next",
      });
    });
  });

  describe("flag off / success", () => {
    it("goes straight to in-place PATCH and never calls /quick-edit when the lane is disabled", async () => {
      vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "");
      stubFetch((call) => {
        if (call.url.endsWith("/files") && call.method === "PATCH") {
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      });

      const result = await patchEngineChatFile({
        chatId: "chat_1",
        versionId: "ver_3",
        fileName: "app/page.tsx",
        content: "next",
        engineLatestKnownVersionId: "ver_3",
      });

      expect(result.ok).toBe(true);
      expect(calledQuickEdit()).toBe(false);
      expect(calledFilesPatch()).toBe(true);
    });

    it("returns the new minor versionId and preview metadata on quick-edit success", async () => {
      vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "1");
      stubFetch((call) => {
        if (call.url.endsWith("/quick-edit")) {
          return jsonResponse({
            ok: true,
            versionId: "ver_3_1",
            changedFiles: ["app/page.tsx"],
            previewUrl: "https://preview.example/ver_3_1",
            previewSessionId: "sess_1",
            previewMode: "patched",
          });
        }
        throw new Error(`Unexpected fetch: ${call.method} ${call.url}`);
      });

      const result = await patchEngineChatFile({
        chatId: "chat_1",
        versionId: "ver_3",
        fileName: "app/page.tsx",
        content: "next",
        engineLatestKnownVersionId: "ver_3",
      });

      expect(result).toMatchObject({
        ok: true,
        versionId: "ver_3_1",
        previewUrl: "https://preview.example/ver_3_1",
        previewSessionId: "sess_1",
        previewMode: "patched",
      });
      expect(calledFilesPatch()).toBe(false);
    });
  });
});
