import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const isVercelConfigured = vi.hoisted(() => vi.fn());
const addZoneRecord = vi.hoisted(() => vi.fn());
const isLoopiaConfigured = vi.hoisted(() => vi.fn());
const resolveVercelProjectForChat = vi.hoisted(() => vi.fn());
const linkCustomerDomain = vi.hoisted(() => vi.fn());
const dnsInstructionRecords = vi.hoisted(() => vi.fn());
const dbSelect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: Request, _bucket: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("@/lib/vercel/vercel-client", () => ({
  addDomainToProject: vi.fn(),
  isVercelConfigured,
}));
vi.mock("@/lib/loopia/loopia-client", () => ({
  addZoneRecord,
  isLoopiaConfigured,
}));
vi.mock("@/lib/domains/resolve-vercel-project", () => ({ resolveVercelProjectForChat }));
vi.mock("@/lib/domains/customer-domain-flow", () => ({
  linkCustomerDomain,
  dnsInstructionRecords,
}));
vi.mock("@/lib/db/client", () => ({
  db: { select: dbSelect },
  dbConfigured: true,
}));

const { POST } = await import("./route");

function dbRows(rows: unknown[]) {
  return {
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  };
}

function linkRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/domains/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const SNAPSHOT = {
  primary: {
    domain: "site.example",
    records: [{ type: "A", host: "site.example", value: "192.0.2.44", purpose: "configuration" }],
    ownership: "pending",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  isVercelConfigured.mockReturnValue(true);
  isLoopiaConfigured.mockReturnValue(false);
  dbSelect.mockReturnValue(dbRows([]));
  resolveVercelProjectForChat.mockResolvedValue({
    ok: true,
    vercelProjectId: "vp_app",
    appProjectId: "proj_1",
    source: "app_project",
    chatId: "chat_1",
  });
  linkCustomerDomain.mockResolvedValue({ ok: true, snapshot: SNAPSHOT });
  dnsInstructionRecords.mockReturnValue([
    { type: "A", host: "site.example", value: "192.0.2.44", purpose: "configuration" },
  ]);
});

describe("POST /api/domains/link", () => {
  it("returns 404 for a chat the caller does not own", async () => {
    resolveVercelProjectForChat.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Chatten hittades inte.",
    });

    const res = await POST(linkRequest({ domain: "site.example", chatId: "someone_elses_chat" }));

    expect(res.status).toBe(404);
    expect(linkCustomerDomain).not.toHaveBeenCalled();
  });

  it("rejects a reserved platform hostname before linking", async () => {
    const res = await POST(linkRequest({ domain: "admin.sajtmaskin.se", chatId: "chat_1" }));
    expect(res.status).toBe(400);
    expect(linkCustomerDomain).not.toHaveBeenCalled();
  });

  it("links through the tenant-resolved hosting project and returns provider DNS values", async () => {
    const res = await POST(linkRequest({ domain: "site.example", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(linkCustomerDomain).toHaveBeenCalledWith({
      hosting: { vercelProjectId: "vp_app", appProjectId: "proj_1", chatId: "chat_1" },
      domain: "site.example",
    });
    expect(body.linked).toBe(true);
    expect(body.dnsInstructions.records[0].value).toBe("192.0.2.44");
    expect(JSON.stringify(body)).not.toContain("76.76.21.21");
    expect(JSON.stringify(body)).not.toContain("cname.vercel-dns.com");
  });

  it("skips Loopia when the caller has no registered domain_orders row", async () => {
    const res = await POST(linkRequest({ domain: "mittforetag.se", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(addZoneRecord).not.toHaveBeenCalled();
    expect(body.dnsSetup).toBeNull();
  });

  it("writes Loopia records from the observed values when the caller owns the name", async () => {
    dbSelect.mockReturnValue(dbRows([{ id: "ord_1" }]));
    isLoopiaConfigured.mockReturnValue(true);
    addZoneRecord.mockResolvedValue("OK");

    const res = await POST(linkRequest({ domain: "mittforetag.se", chatId: "chat_1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(addZoneRecord).toHaveBeenCalled();
    expect(body.dnsSetup).toMatchObject({ success: true, method: "loopia" });
  });
});
