import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const resolveVercelProjectForChat = vi.hoisted(() => vi.fn());
const verifyCustomerDomain = vi.hoisted(() => vi.fn());
const setProjectVerifiedCustomDomain = vi.hoisted(() => vi.fn());
const clearProjectCustomDomainVerification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/domains/resolve-vercel-project", () => ({ resolveVercelProjectForChat }));
vi.mock("@/lib/domains/customer-domain-flow", () => ({ verifyCustomerDomain }));
vi.mock("@/lib/db/services/projects", () => ({
  setProjectVerifiedCustomDomain,
  clearProjectCustomDomainVerification,
}));

const { POST } = await import("./route");

function verifyRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/domains/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  resolveVercelProjectForChat.mockResolvedValue({
    ok: true,
    vercelProjectId: "vp_app",
    appProjectId: "proj_1",
    source: "app_project",
    chatId: "chat_1",
  });
  verifyCustomerDomain.mockResolvedValue({
    ok: true,
    snapshot: {
      primary: {
        connection: "connected",
        ownership: "verified",
        dns: "valid",
        https: "valid",
        status: "live",
        statusLabel: "Live",
      },
    },
  });
});

describe("POST /api/domains/verify", () => {
  it("returns 404 for a chat the caller does not own", async () => {
    resolveVercelProjectForChat.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Chatten hittades inte.",
    });

    const res = await POST(verifyRequest({ domain: "site.example", chatId: "someone_elses_chat" }));

    expect(res.status).toBe(404);
    expect(verifyCustomerDomain).not.toHaveBeenCalled();
  });

  it("rejects a reserved hostname before verify", async () => {
    const res = await POST(verifyRequest({ domain: "preview.sajtmaskin.se", chatId: "chat_1" }));
    expect(res.status).toBe(400);
    expect(verifyCustomerDomain).not.toHaveBeenCalled();
  });

  it("returns the three separate checks and never a provider project id", async () => {
    const res = await POST(verifyRequest({ domain: "site.example", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(verifyCustomerDomain).toHaveBeenCalledWith({
      hosting: { vercelProjectId: "vp_app", appProjectId: "proj_1", chatId: "chat_1" },
      domain: "site.example",
    });
    expect(body).toMatchObject({
      verified: true,
      ownership: "verified",
      dns: "valid",
      https: "valid",
      statusLabel: "Live",
    });
    expect(JSON.stringify(body)).not.toContain("vp_app");
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
  });

  it("does not treat an unknown snapshot as unverified-and-revoked", async () => {
    verifyCustomerDomain.mockResolvedValue({
      ok: true,
      snapshot: {
        primary: {
          connection: "unknown",
          ownership: "unknown",
          dns: "unknown",
          https: "unknown",
          status: "unknown",
          statusLabel: "Okänd status",
        },
      },
    });

    const res = await POST(verifyRequest({ domain: "site.example", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.verified).toBe(false);
    expect(body.status).toBe("unknown");
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
  });
});
