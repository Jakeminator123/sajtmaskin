import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const recordPageView = vi.hoisted(() => vi.fn(async () => undefined));
const ensureSessionIdFromRequest = vi.hoisted(() =>
  vi.fn<
    (request: Request) => {
      sessionId: string;
      setCookie: string | null;
      setCookies: string[];
    }
  >(() => ({ sessionId: "sess_1", setCookie: null, setCookies: [] })),
);
const createPromptHandoff = vi.hoisted(() =>
  vi.fn(async (params: { prompt: string; source?: string | null; projectId?: string | null }) => ({
    id: "prompt_1",
    prompt: params.prompt,
    source: params.source ?? null,
    project_id: params.projectId ?? null,
    user_id: null,
    session_id: "sess_1",
    created_at: new Date("2026-09-08T00:00:00Z"),
  })),
);

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest,
}));
vi.mock("@/lib/db/services/projects", () => ({ createPromptHandoff }));
vi.mock("@/lib/data/redis", () => ({ cachePromptHandoff: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/services/analytics", () => ({ recordPageView }));
// `after()` needs a request scope in Next; run the callback inline in tests.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb() };
});

import { POST } from "./route";

function promptRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/prompts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "10.0.0.1" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/prompts — kostnadsfri funnel", () => {
  it("returns both the __Host- session and parent-domain leftover expiry", async () => {
    const session = await vi.importActual<typeof import("@/lib/auth/session")>(
      "@/lib/auth/session",
    );
    ensureSessionIdFromRequest.mockImplementationOnce(
      session.ensureSessionIdFromRequest,
    );

    const res = await POST(
      new NextRequest("https://preview.sajtmaskin.se/api/prompts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie:
            "sajtmaskin_session=sess_ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb",
          host: "preview.sajtmaskin.se",
        },
        body: JSON.stringify({ prompt: "Bygg en sajt" }),
      }),
    );

    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(
      setCookies.some((header) =>
        header.startsWith("__Host-sajtmaskin_session=sess_"),
      ),
    ).toBe(true);
    expect(
      setCookies.some(
        (header) =>
          header.startsWith("sajtmaskin_session=;") &&
          header.includes("Domain=.sajtmaskin.se") &&
          header.includes("Max-Age=0"),
      ),
    ).toBe(true);
  });

  it("records `skapad` server-side when the kostnadsfri flow hands off", async () => {
    const res = await POST(
      promptRequest({ prompt: "Bygg en sajt", source: "kostnadsfri", kostnadsfriSlug: "ikea-ab" }),
    );

    expect(res.status).toBe(200);
    expect(recordPageView).toHaveBeenCalledWith(
      "/kostnadsfri/ikea-ab/skapad",
      "sess_1",
      undefined,
      "10.0.0.1",
      undefined,
    );
  });

  it("does not record anything for other sources or without a slug", async () => {
    await POST(
      promptRequest({ prompt: "Bygg en sajt", source: "category", kostnadsfriSlug: "ikea-ab" }),
    );
    await POST(promptRequest({ prompt: "Bygg en sajt", source: "kostnadsfri" }));

    expect(recordPageView).not.toHaveBeenCalled();
  });

  it("rejects a slug that is not slug-shaped", async () => {
    const res = await POST(
      promptRequest({
        prompt: "Bygg en sajt",
        source: "kostnadsfri",
        kostnadsfriSlug: "../x/skapad",
      }),
    );

    expect(res.status).toBe(400);
    expect(createPromptHandoff).not.toHaveBeenCalled();
  });
});
