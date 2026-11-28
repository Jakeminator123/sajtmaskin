import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { forwardAlina } from "./alina-local";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess: mocks.admin }));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./alina-hosted", () => ({ hostedAlina: mocks.config }));

const upstream = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", upstream);
  mocks.config.mockReturnValue({ origin: "https://studio.example", token: "test-bridge" });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([401, 403, 503])("keeps hosted jobs and runtime behind the admin gate (%i)", async status => {
  mocks.admin.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status }) });
  expect((await forwardAlina(new NextRequest("https://site.example/api/alina/runtime"), "/api/alina/runtime")).status).toBe(status);
  expect(upstream).not.toHaveBeenCalled();
});

it("rejects a cross-origin write before it reaches the worker", async () => {
  const request = new NextRequest("https://site.example/api/alina/speech", {
    method: "POST", headers: { origin: "https://elsewhere.example" },
  });
  expect((await forwardAlina(request, "/api/alina/speech", {})).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("streams a private range for the authenticated account", async () => {
  mocks.admin.mockResolvedValue({ ok: true, user: { id: "7" } });
  upstream.mockResolvedValue(new Response("abcd", {status: 206, headers: {
    "content-range": "bytes 0-3/10", "set-cookie": "unwanted=1",
  }}));
  const route = "/api/alina/media/" + "a".repeat(32);
  const request = new NextRequest("https://site.example" + route, { headers: {
    range: "bytes=0-3", "x-alina-owner": "foreign", cookie: "session=private",
  } });
  const response = await forwardAlina(request, route, undefined, "foreign");
  const [url, init] = upstream.mock.calls[0];
  expect(url).toBe("https://studio.example" + route);
  expect(init.redirect).toBe("error");
  expect(init.headers.get("x-alina-owner")).toBe("account-7");
  expect(init.headers.get("x-alina-bridge")).toBe("test-bridge");
  expect(init.headers.get("cookie")).toBeNull();
  expect(init.headers.get("range")).toBe("bytes=0-3");
  expect(response.status).toBe(206);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).toBe("abcd");
});

it.each([
  ["/api/alina/jobs/" + "a".repeat(32) + "?wait=1", 25000],
  ["/api/alina/jobs/" + "a".repeat(32), 12000],
  ["/api/alina/media/" + "a".repeat(32) + "?wait=1", 12000],
  ["/api/alina/runtime?wait=1", 12000],
  ["/api/alina/diagnostics", 18000],
])("uses the long-poll timeout only for a waiting speech job: %s", async (route, timeoutMs) => {
  mocks.admin.mockResolvedValue({ok: true, user: {id: "7"}});
  upstream.mockResolvedValue(new Response("{}", {headers: {"content-type": "application/json"}}));
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
  await forwardAlina(new NextRequest("https://site.example" + route), route);
  expect(timeout).toHaveBeenCalledWith(timeoutMs);
  expect(upstream).toHaveBeenCalledTimes(1);
});
