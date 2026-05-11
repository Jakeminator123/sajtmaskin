import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));

import { POST } from "./route";

describe("POST /api/csp-report", () => {
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
});
