import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const clerk = vi.hoisted(() => ({ protect: vi.fn(), construct: vi.fn() }));

// Drive the dossier's real callback. The general SDK stub deliberately ignores
// that callback, so it cannot prove the configured middleware calls protect().
vi.mock("@clerk/nextjs/server", () => ({
  createRouteMatcher: (patterns: string[]) => (request: NextRequest) =>
    patterns.some((pattern) => request.nextUrl.pathname.startsWith(pattern.replace("(.*)", ""))),
  clerkMiddleware: (handler: (auth: { protect: typeof clerk.protect }, req: NextRequest) => Promise<void>) => {
    clerk.construct();
    return async (request: NextRequest) => {
      await handler({ protect: clerk.protect }, request);
      return NextResponse.next();
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  clerk.protect.mockReset().mockResolvedValue(undefined);
  clerk.construct.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

async function loadMiddleware(configured: boolean) {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", configured
    ? `pk_test_${btoa("synthetic.clerk.example$")}`
    : "pk_test_placeholder");
  vi.stubEnv("CLERK_SECRET_KEY", configured ? ["sk", "test", "synthetic"].join("_") : "");
  return (await import("../../../../data/dossiers/hard/clerk-auth/components/middleware")).default;
}

describe("Clerk dossier middleware acceptance (mock SDK, no real data)", () => {
  it.each(["/dashboard", "/app", "/medlem", "/account", "/api/protected/private"])(
    "blocks the configured signed-out callback on %s",
    async (pathname) => {
      const middleware = await loadMiddleware(true);
      clerk.protect.mockRejectedValue(new Error("SYNTHETIC_SIGNED_OUT"));

      await expect(middleware(new NextRequest(`http://localhost${pathname}`), {} as never))
        .rejects.toThrow("SYNTHETIC_SIGNED_OUT");
      expect(clerk.protect).toHaveBeenCalledOnce();
    },
  );

  it("keeps a configured public page open without invoking the protected guard", async () => {
    const middleware = await loadMiddleware(true);
    const response = await middleware(new NextRequest("http://localhost/"), {} as never);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(clerk.protect).not.toHaveBeenCalled();
  });

  it("delegates a configured authenticated route to protect before proceeding", async () => {
    const middleware = await loadMiddleware(true);
    const response = await middleware(new NextRequest("http://localhost/dashboard"), {} as never);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(clerk.protect).toHaveBeenCalledOnce();
  });

  it("retains keyless demo pass-through without constructing the Clerk handler", async () => {
    const middleware = await loadMiddleware(false);
    const response = await middleware(new NextRequest("http://localhost/api/protected/demo"), {} as never);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(clerk.construct).not.toHaveBeenCalled();
    expect(clerk.protect).not.toHaveBeenCalled();
  });
});
