import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
}));

vi.mock("@/lib/ssrf-guard", () => ({
  safeFetch: safeFetchMock,
}));

import { appendHydratedTextAttachmentExcerpts } from "./attachment-text-hydrate";

describe("appendHydratedTextAttachmentExcerpts", () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
  });

  it("uses the SSRF-safe bounded fetch for user supplied attachment URLs", async () => {
    safeFetchMock.mockResolvedValue(new Response("hello", { status: 200 }));

    const result = await appendHydratedTextAttachmentExcerpts(
      "prompt",
      [{ url: "https://files.example/note.txt", filename: "note.txt" }],
      { maxPerFileChars: 1_000, fetchTimeoutMs: 2_500 },
    );

    expect(safeFetchMock).toHaveBeenCalledWith(
      "https://files.example/note.txt",
      expect.objectContaining({
        timeoutMs: 2_500,
        maxBodyBytes: 4 * 1024 * 1024,
      }),
    );
    expect(result).toContain("hello");
  });

  it("excerpts a valid document larger than the prompt budget", async () => {
    const text = "document contents ".repeat(4_000);
    safeFetchMock.mockImplementation(async (_url, init) =>
      Buffer.byteLength(text) > init.maxBodyBytes
        ? new Response(null, { status: 413 })
        : new Response(text),
    );

    const result = await appendHydratedTextAttachmentExcerpts(
      "prompt",
      [{ url: "https://files.example/report.txt", filename: "report.txt" }],
      { maxPerFileChars: 1_000 },
    );

    expect(result).toContain(text.slice(0, 1_000));
    expect(result).toContain("… (truncated)");
    expect(result).not.toContain("Fetch failed");
    expect(result.length).toBeLessThan(1_300);
  });

  it("does not include a body when the SSRF guard blocks the target", async () => {
    safeFetchMock.mockResolvedValue(new Response("Request blocked", { status: 403 }));

    const result = await appendHydratedTextAttachmentExcerpts("prompt", [
      { url: "http://127.0.0.1/private.txt", filename: "private.txt" },
    ]);

    expect(result).toContain("_Fetch failed (403)_");
    expect(result).not.toContain("Request blocked");
  });
});
