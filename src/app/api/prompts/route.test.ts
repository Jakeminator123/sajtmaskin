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
const getCurrentUser = vi.hoisted(() => vi.fn(async () => null as { id: string } | null));

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({
  ensureSessionIdFromRequest,
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
  getCurrentUser.mockResolvedValue(null);
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

  it("rejects a guest kostnadsfri handoff even with a verified receipt", async () => {
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

    expect(res.status).toBe(401);
    expect(createPromptHandoff).not.toHaveBeenCalled();
    expect(recordPageView).not.toHaveBeenCalled();
  });

  it("records `skapad` server-side when the kostnadsfri flow hands off", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
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
      "user_1",
      "10.0.0.1",
      undefined,
    );
  });

  it("rejects client-provided source and slug without a verified receipt", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
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

  it("stores a validated audit payload and rejects unknown top-level keys", async () => {
    const accepted = await POST(
      promptRequest({
        prompt: "Bygg en förbättrad sajt för granit.se",
        source: "audit",
        payload: { domain: "granit.se", url: "https://granit.se" },
      }),
    );
    expect(accepted.status).toBe(200);
    expect(createPromptHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "audit",
        payload: { domain: "granit.se", url: "https://granit.se" },
      }),
    );

    const rejected = await POST(
      promptRequest({
        prompt: "Bygg en förbättrad sajt för granit.se",
        source: "audit",
        payload: {
          domain: "granit.se",
          technical_architecture: { stack: "next" },
        },
      }),
    );
    expect(rejected.status).toBe(400);
    expect(createPromptHandoff).toHaveBeenCalledTimes(1);
  });

  it("stores a sanitized wizard snapshot on the kostnadsfri handoff payload", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    const res = await POST(
      promptRequest(
        {
          prompt: "Bygg en sajt",
          source: "kostnadsfri",
          kostnadsfriSlug: "ikea-ab",
          projectId: "project_1",
          wizardSnapshot: {
            industryId: "restaurant",
            followupOverrodeIndustry: true,
            resolvedIndustryId: "restaurant",
            descriptionHash: "a".repeat(64),
            uspHash: null,
            descriptionPreview: "Ring ada@acme.se om lotteri",
            email: "ada@acme.se",
          },
        },
        true,
      ),
    );

    expect(res.status).toBe(200);
    expect(createPromptHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "kostnadsfri",
        payload: {
          wizardSnapshot: {
            industryId: "restaurant",
            followupOverrodeIndustry: true,
            resolvedIndustryId: "restaurant",
            descriptionHash: "a".repeat(64),
            uspHash: null,
            descriptionPreview: "Ring om lotteri",
            uspPreview: null,
          },
        },
      }),
    );
  });

  it("rejects a compiled restaurant+lottery prompt before handoff", async () => {
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    const res = await POST(
      promptRequest(
        {
          prompt:
            'Build a professional website for "ImpactWin Group AB", a Restaurang/Bar company based in Stockholm.\n' +
            "About the company: Utvecklar digitala plattformar för lotteriförsäljning.",
          source: "kostnadsfri",
          kostnadsfriSlug: "ikea-ab",
          projectId: "project_1",
        },
        true,
      ),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "kostnadsfri_industry_conflict",
    });
    expect(createPromptHandoff).not.toHaveBeenCalled();
  });

  it("drops payload unless source is audit", async () => {
    const stored = await POST(
      promptRequest({
        prompt: "Bygg en sajt",
        source: "wizard",
        payload: { domain: "granit.se", url: "https://granit.se" },
      }),
    );
    expect(stored.status).toBe(200);
    expect(createPromptHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "wizard",
        payload: null,
      }),
    );
  });
});
