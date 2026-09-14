import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const recordPageView = vi.hoisted(() => vi.fn(async () => undefined));
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
const getProjectByIdForOwner = vi.hoisted(() =>
  vi.fn(async (id: string) => ({ id, user_id: null, session_id: "sess_1" })),
);
const bindVerifiedKostnadsfriCampaign = vi.hoisted(() =>
  vi.fn(async (input: { receipt: string | null }) =>
    input.receipt === "verified-receipt"
      ? { entitlementId: "campaign_1", phase: "initial" as const }
      : null,
  ),
);

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser: vi.fn(async () => null) }));
vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest: () => ({ sessionId: "sess_1", setCookie: null }),
}));
vi.mock("@/lib/db/services/projects", () => ({ createPromptHandoff, getProjectByIdForOwner }));
vi.mock("@/lib/db/services/kostnadsfri-campaign", () => ({
  bindVerifiedKostnadsfriCampaign,
}));
vi.mock("@/lib/data/redis", () => ({ cachePromptHandoff: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/services/analytics", () => ({ recordPageView }));
// `after()` needs a request scope in Next; run the callback inline in tests.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb() };
});

import { POST } from "./route";

function promptRequest(body: Record<string, unknown>, verified = false) {
  return new NextRequest("http://localhost/api/prompts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "10.0.0.1",
      ...(verified ? { cookie: "sajtmaskin_kostnadsfri_campaign=verified-receipt" } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/prompts — kostnadsfri funnel", () => {
  it("records `skapad` server-side when the kostnadsfri flow hands off", async () => {
    const res = await POST(
      promptRequest(
        {
          prompt: "Bygg en sajt",
          source: "kostnadsfri",
          kostnadsfriSlug: "ikea-ab",
          projectId: "project_1",
        },
        true,
      ),
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

  it("rejects client-provided source and slug without a verified receipt", async () => {
    const res = await POST(
      promptRequest({
        prompt: "Bygg en sajt",
        source: "kostnadsfri",
        kostnadsfriSlug: "ikea-ab",
        projectId: "project_1",
      }),
    );

    expect(res.status).toBe(403);
    expect(bindVerifiedKostnadsfriCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ receipt: null, invitationSlug: "ikea-ab" }),
    );
    expect(createPromptHandoff).not.toHaveBeenCalled();
    expect(recordPageView).not.toHaveBeenCalled();
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
