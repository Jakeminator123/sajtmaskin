import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const { alinaUser, forwardAlina, requireAdminAccess } = vi.hoisted(() => ({
  alinaUser: vi.fn(),
  forwardAlina: vi.fn(),
  requireAdminAccess: vi.fn(),
}));
vi.mock("@/lib/avatar/alina-local", () => ({
  alinaUser,
  forwardAlina,
  alinaAvailable: () => true,
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));

function post(body: object, route = "speech") {
  const request = new NextRequest("http://localhost:3000/api/alina/" + route, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ path: [route] }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  forwardAlina.mockResolvedValue(NextResponse.json({ status: "ready" }));
});

it("waits for a speech job with its visitor identity and keeps media requests immediate", async () => {
  alinaUser.mockResolvedValue({ owner: "account-123" });
  const id = "a".repeat(32);
  for (const path of ["jobs", "media"]) {
    const request = new NextRequest(`http://localhost:3000/api/alina/${path}/${id}?wait=1`);
    await GET(request, { params: Promise.resolve({ path: [path, id] }) });
    const url = `/api/alina/${path}/${id}` + (path === "jobs" ? "?wait=1" : "");
    expect(forwardAlina).toHaveBeenCalledWith(request, url, undefined, "account-123");
  }
});

it("welcomes the signed-in visitor with the name from their own account", async () => {
  alinaUser.mockResolvedValue({ owner: "account-123", name: "Anna-Lisa Lind" });
  await post({ kind: "welcome", name: "Annan person" });
  expect(forwardAlina).toHaveBeenCalledWith(
    expect.anything(),
    "/api/alina/speech",
    { kind: "welcome", name: "Anna-Lisa Lind" },
    "account-123",
  );
});

it("uses a neutral welcome for guests", async () => {
  alinaUser.mockResolvedValue({ owner: undefined, name: "" });
  await post({ kind: "welcome" });
  expect(forwardAlina).toHaveBeenCalledWith(
    expect.anything(),
    "/api/alina/speech",
    { kind: "welcome", name: "" },
    undefined,
  );
});

it("passes only the elapsed time for activity and rejects future activity", async () => {
  await post({ idleForMs: 1100, text: "private draft" }, "activity");
  expect(forwardAlina).toHaveBeenCalledWith(expect.anything(), "/api/alina/activity", {
    idleForMs: 1100,
  });
  expect(alinaUser).not.toHaveBeenCalled();
  expect((await post({ idleForMs: -1 }, "activity")).status).toBe(400);
  expect(forwardAlina).toHaveBeenCalledTimes(1);
});

it("keeps the editor recording fixed across methods and rejects invalid tempo", async () => {
  alinaUser.mockResolvedValue({ owner: undefined, name: "" });
  const body = {kind: "reply", text: "Hej.", method: "visemes", voice: "sanna", tempo: 1.25};
  await post(body, "audition");
  expect(forwardAlina).toHaveBeenCalledWith(expect.anything(), "/api/alina/audition", body, undefined);
  expect((await post({...body, tempo: 2}, "audition")).status).toBe(400);
  expect(forwardAlina).toHaveBeenCalledTimes(1);
});

it("only an administrator can override a real session with a preview name", async () => {
  alinaUser.mockResolvedValue({ owner: "account-123", name: "Anna-Lisa Lind" });
  requireAdminAccess.mockResolvedValue({
    ok: false,
    response: NextResponse.json({}, { status: 403 }),
  });
  expect((await post({ kind: "welcome", testName: "Bo" })).status).toBe(403);
  expect(forwardAlina).not.toHaveBeenCalled();
});
