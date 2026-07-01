import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";

// Mutable gateway config so a single test can flip URL/token.
const config = vi.hoisted(() => ({
  gatewayUrl: "https://gw.example",
  gatewayToken: "tok",
}));

vi.mock("@/lib/config", () => ({
  OPENCLAW: {
    get gatewayUrl() {
      return config.gatewayUrl;
    },
    get gatewayToken() {
      return config.gatewayToken;
    },
  },
}));

import { requestQuickEditOps } from "./gateway";

const FILES: CodeFile[] = [
  { path: "app/globals.css", content: ":root{--brand:pink}", language: "css" },
];

const fetchMock = vi.fn();

/** Minimal Response-like for a JSON completion body. */
function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

/** An OpenAI-compatible chat completion wrapping `content`. */
function completion(content: string, status = 200): Response {
  return jsonResponse({ choices: [{ message: { content } }] }, status);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  config.gatewayUrl = "https://gw.example";
  config.gatewayToken = "tok";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestQuickEditOps", () => {
  it("happy path: valid JSON ops → ok:true with includedPaths", async () => {
    fetchMock.mockResolvedValue(
      completion(
        '{"ops":[{"kind":"replace_text","path":"app/globals.css","find":"pink","replace":"blue"}],"summary":"byt rosa mot blå"}',
      ),
    );

    const result = await requestQuickEditOps({ instruction: "gör den blå", files: FILES });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]).toMatchObject({ kind: "replace_text", path: "app/globals.css" });
    expect(result.summary).toBe("byt rosa mot blå");
    expect(result.includedPaths).toEqual(["app/globals.css"]);
    expect(result.truncated).toBe(false);
    // Calls the OpenAI-compatible endpoint with the bearer token.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gw.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("non-2xx status → ok:false carrying the status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

    const result = await requestQuickEditOps({ instruction: "x", files: FILES });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.status).toBe(500);
    expect(result.error).toContain("500");
  });

  it("non-JSON body → error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "<html>nope</html>",
    } as unknown as Response);

    const result = await requestQuickEditOps({ instruction: "x", files: FILES });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("Gateway returned a non-JSON response.");
  });

  it("empty completion → error", async () => {
    fetchMock.mockResolvedValue(completion(""));

    const result = await requestQuickEditOps({ instruction: "x", files: FILES });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("Gateway returned an empty completion.");
  });

  it("empty ops array → ok:false decline surfacing the model's reason", async () => {
    fetchMock.mockResolvedValue(
      completion('{"ops":[],"summary":"Det går inte med de visade filerna."}'),
    );

    const result = await requestQuickEditOps({ instruction: "x", files: FILES });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("Det går inte");
  });
});
