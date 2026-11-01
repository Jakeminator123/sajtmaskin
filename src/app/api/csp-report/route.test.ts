import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

import { POST } from "./route";

describe("POST /api/csp-report", () => {
  it("silently drops an oversized report", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(
      new Request("https://example.com/api/csp-report", {
        method: "POST",
        body: "{}",
        headers: { "content-length": "65537" },
      }),
    );

    expect(response.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("silences production report-only eval noise", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(
      new Request("https://example.com/api/csp-report", {
        method: "POST",
        body: JSON.stringify({
          "csp-report": {
            disposition: "report",
            "effective-directive": "script-src",
            "blocked-uri": "eval",
          },
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("keeps warning for non-eval production reports", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(
      new Request("https://example.com/api/csp-report", {
        method: "POST",
        body: JSON.stringify({
          "csp-report": {
            disposition: "report",
            "effective-directive": "frame-src",
            "blocked-uri": "https://bad.example",
          },
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[1]).toContain("directive=frame-src");
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("sanitizes and bounds client-controlled log fields", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await POST(
      new Request("https://example.com/api/csp-report", {
        method: "POST",
        body: JSON.stringify({
          "csp-report": {
            "effective-directive": "img-src\nforged-entry",
            "blocked-uri": `https://bad.example/${"x".repeat(1_000)}`,
            "document-uri": "https://example.com/page\r\nsecond-entry",
          },
        }),
      }),
    );

    const summary = String(warnSpy.mock.calls[0]?.[1]);
    expect(summary).not.toMatch(/[\r\n]/);
    expect(summary).toContain("directive=img-src forged-entry");
    expect(summary.length).toBeLessThan(1_100);
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});
