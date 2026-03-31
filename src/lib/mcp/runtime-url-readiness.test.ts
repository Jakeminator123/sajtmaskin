import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SandboxReadinessTimeoutError,
  sandboxDevServerResponseLooksReady,
  waitForSandboxDevServerReady,
} from "./runtime-url";

describe("sandboxDevServerResponseLooksReady", () => {
  it("accepts 200 text/html", () => {
    const res = new Response("<!doctype html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    expect(sandboxDevServerResponseLooksReady(res)).toBe(true);
  });

  it("rejects 404 even if content-type is html", () => {
    const res = new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
    expect(sandboxDevServerResponseLooksReady(res)).toBe(false);
  });

  it("rejects 200 application/json", () => {
    const res = new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    expect(sandboxDevServerResponseLooksReady(res)).toBe(false);
  });
});

describe("waitForSandboxDevServerReady", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("polls until 200 html then returns", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        n++;
        if (n < 3) {
          return Promise.resolve(
            new Response("nope", { status: 404, headers: { "Content-Type": "text/html" } }),
          );
        }
        return Promise.resolve(
          new Response("<html></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
        );
      }),
    );
    const r = await waitForSandboxDevServerReady("http://example.test", {
      maxMs: 10_000,
      intervalMs: 1,
    });
    expect(n).toBeGreaterThanOrEqual(3);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("throws SandboxReadinessTimeoutError when never ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("bad gateway", { status: 502, headers: { "Content-Type": "text/html" } }),
      ),
    );
    await expect(
      waitForSandboxDevServerReady("http://example.test", { maxMs: 80, intervalMs: 10 }),
    ).rejects.toBeInstanceOf(SandboxReadinessTimeoutError);
  });
});
