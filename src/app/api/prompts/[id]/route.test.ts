import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const consumePromptHandoffForOwner = vi.hoisted(() => vi.fn());
const getPromptHandoffByIdForOwner = vi.hoisted(() => vi.fn());
const getCachedPromptHandoff = vi.hoisted(() => vi.fn());
const deletePromptHandoffCache = vi.hoisted(() => vi.fn(async () => undefined));
const getCurrentUser = vi.hoisted(() => vi.fn(async () => ({ id: "user_1" })));
const ensureSessionIdFromRequest = vi.hoisted(() =>
  vi.fn(() => ({ sessionId: "sess_1", setCookie: null, setCookies: [] })),
);

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/session", () => ({ ensureSessionIdFromRequest }));
vi.mock("@/lib/data/redis", () => ({
  getCachedPromptHandoff,
  deletePromptHandoffCache,
}));
vi.mock("@/lib/db/services/projects", () => ({
  consumePromptHandoffForOwner,
  getPromptHandoffByIdForOwner,
}));

import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost/api/prompts/handoff_1");
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "handoff_1",
    prompt: "Bygg en förbättrad sajt för granit.se",
    source: "audit",
    project_id: null,
    payload: {
      domain: "granit.se",
    },
    consumed_at: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/prompts/[id]", () => {
  it("returns payloadKind and domain but never the stored payload", async () => {
    consumePromptHandoffForOwner.mockResolvedValue(
      row({ consumed_at: new Date("2026-09-15T00:00:00Z") }),
    );
    getCachedPromptHandoff.mockResolvedValue(null);

    const res = await GET(request(), { params: Promise.resolve({ id: "handoff_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.prompt).toBe("Bygg en förbättrad sajt för granit.se");
    expect(body.source).toBe("audit");
    expect(body.payloadKind).toBe("audit");
    expect(body.domain).toBe("granit.se");
    expect(body.alreadyConsumed).toBe(false);
    expect(body).not.toHaveProperty("payload");
  });

  it("still reads a consumed row via owner-scope without exposing payload", async () => {
    consumePromptHandoffForOwner.mockResolvedValue(null);
    getPromptHandoffByIdForOwner.mockResolvedValue(
      row({ consumed_at: new Date("2026-09-14T12:00:00Z") }),
    );
    getCachedPromptHandoff.mockResolvedValue(null);

    const res = await GET(request(), { params: Promise.resolve({ id: "handoff_1" }) });
    expect(res.status).toBe(200);
    expect(getPromptHandoffByIdForOwner).toHaveBeenCalledWith("handoff_1", {
      userId: "user_1",
      sessionId: "sess_1",
    });
    const body = await res.json();
    expect(body.alreadyConsumed).toBe(true);
    expect(body.payloadKind).toBe("audit");
    expect(body.domain).toBe("granit.se");
    expect(body).not.toHaveProperty("payload");
  });
});
