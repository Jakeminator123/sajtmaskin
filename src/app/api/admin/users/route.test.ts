import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminAccess = vi.hoisted(() => vi.fn());
const services = vi.hoisted(() => ({
  createAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
  grantAdminCredits: vi.fn(),
  listAdminUsers: vi.fn(),
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));
vi.mock("@/lib/db/services/admin-users", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...services,
}));
vi.mock("@/lib/auth/auth", () => ({ hashPassword: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
import { GET, POST, PATCH, DELETE } from "./route";

const input = { email: "person@example.test", password: "test-secret", credits: 100 };
function request(method: string, body?: unknown) {
  return new NextRequest("https://sajtmaskin.se/api/admin/users", {
    method,
    ...(body
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAccess.mockResolvedValue({ ok: true, user: { id: "operator" } });
  services.listAdminUsers.mockResolvedValue({ users: [], offset: 0, hasMore: false });
  services.createAdminUser.mockResolvedValue({ id: "person", email: input.email, credits: 100 });
  services.grantAdminCredits.mockResolvedValue({ balance_after: 100 });
});

describe("admin users API", () => {
  it.each([GET, POST, PATCH, DELETE])(
    "requires an authenticated administrator",
    async (handler) => {
      requireAdminAccess.mockResolvedValue({
        ok: false,
        response: NextResponse.json({ success: false }, { status: 403 }),
      });
      expect((await handler(request("POST", input))).status).toBe(403);
      Object.values(services).forEach((service) => expect(service).not.toHaveBeenCalled());
    },
  );

  it("creates a user and keeps the actor server-owned", async () => {
    const response = await POST(request("POST", input));
    expect(response.status).toBe(201);
    expect(services.createAdminUser).toHaveBeenCalledWith(input, "operator");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    { ...input, password: "short" },
    { ...input, credits: -100 },
    { ...input, role: "admin" },
  ])("rejects invalid creation input before any write", async (body) => {
    expect((await POST(request("POST", body))).status).toBe(400);
    expect(services.createAdminUser).not.toHaveBeenCalled();
  });

  it("reports a duplicate account without changing its existing password or credits", async () => {
    services.createAdminUser.mockRejectedValueOnce({ cause: { code: "23505", detail: "private" } });
    const response = await POST(request("POST", input));
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });

  it("requires a grant idempotency key and a typed deletion identity", async () => {
    expect((await PATCH(request("PATCH", { userId: "person", amount: 100 }))).status).toBe(400);
    expect((await DELETE(request("DELETE", { userId: "person" }))).status).toBe(400);
    expect(services.grantAdminCredits).not.toHaveBeenCalled();
    expect(services.deleteAdminUser).not.toHaveBeenCalled();
  });

  it("rejects invalid pagination", async () => {
    const response = await GET(new NextRequest("https://sajtmaskin.se/api/admin/users?offset=-1"));
    expect(response.status).toBe(400);
    expect(services.listAdminUsers).not.toHaveBeenCalled();
  });
});
