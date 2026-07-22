import { beforeEach, describe, expect, it, vi } from "vitest";

const requireNotBot = vi.hoisted(() => vi.fn());
const getRequestUserId = vi.hoisted(() => vi.fn());
const errorLog = vi.hoisted(() => vi.fn());
const isShadcnDescribeEnabled = vi.hoisted(() => vi.fn());
const describeComponents = vi.hoisted(() => vi.fn());

vi.mock("@/lib/botProtection", () => ({ requireNotBot }));
vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/tenant", () => ({ getRequestUserId }));
vi.mock("@/lib/utils/debug", () => ({ errorLog }));
vi.mock("@/lib/shadcn/describe-feature", () => ({ isShadcnDescribeEnabled }));
vi.mock("@/lib/shadcn/describe", () => ({ describeComponents }));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/shadcn/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/shadcn/describe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNotBot.mockReturnValue(null);
    getRequestUserId.mockResolvedValue("user:123");
    isShadcnDescribeEnabled.mockReturnValue(true);
    describeComponents.mockResolvedValue({
      candidates: [
        {
          name: "login-03",
          registry: "@shadcn",
          addCommand: "npx shadcn@latest add login-03",
        },
      ],
      queries: ["login"],
      usedFallbackQueries: false,
      ranking: "heuristic",
    });
  });

  it("returns 404 and runs no discovery when the flag is off", async () => {
    isShadcnDescribeEnabled.mockReturnValue(false);

    const response = await POST(makeRequest({ description: "a login form" }));

    expect(response.status).toBe(404);
    expect(describeComponents).not.toHaveBeenCalled();
  });

  it("blocks bots before parsing or spending provider keys", async () => {
    requireNotBot.mockReturnValue(Response.json({ error: "Bot blocked" }, { status: 403 }));

    const response = await POST(makeRequest({ description: "a login form" }));

    expect(response.status).toBe(403);
    expect(describeComponents).not.toHaveBeenCalled();
  });

  it("rejects anonymous/guest sessions with 401", async () => {
    getRequestUserId.mockResolvedValue("guest:abc");

    const response = await POST(makeRequest({ description: "a login form" }));

    expect(response.status).toBe(401);
    expect(describeComponents).not.toHaveBeenCalled();
  });

  it("validates the request body", async () => {
    const response = await POST(makeRequest({ description: "" }));

    expect(response.status).toBe(400);
    expect(describeComponents).not.toHaveBeenCalled();
  });

  it("returns ranked candidates for a valid authenticated request", async () => {
    const response = await POST(
      makeRequest({ description: "a login form", limit: 5 }),
    );

    expect(response.status).toBe(200);
    expect(describeComponents).toHaveBeenCalledWith({
      description: "a login form",
      limit: 5,
      style: undefined,
    });
    const body = await response.json();
    expect(body.candidates[0].name).toBe("login-03");
    expect(body.ranking).toBe("heuristic");
    expect(response.headers.get("X-Describe-Ranking")).toBe("heuristic");
  });
});
