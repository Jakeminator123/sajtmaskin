import { afterEach, describe, expect, it, vi } from "vitest";

const getChat = vi.hoisted(() => vi.fn());
const readGrant = vi.hoisted(() => vi.fn());
const readGrantState = vi.hoisted(() => vi.fn());
const writeGrant = vi.hoisted(() => vi.fn());
const OPENCLAW = vi.hoisted(() => ({ editEnabled: true }));

vi.mock("@/lib/config", () => ({ OPENCLAW }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: async (_req: Request, _key: string, fn: () => Promise<Response>) => fn(),
}));
vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest: getChat,
}));
vi.mock("@/lib/db/services/live-review-grants", () => ({
  readLiveReviewGrant: readGrant,
  readLiveReviewGrantState: readGrantState,
  writeLiveReviewGrant: writeGrant,
}));

import { GET, POST } from "./route";

function req(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  OPENCLAW.editEnabled = true;
});

describe("GET /api/openclaw/powers", () => {
  it("404 när chatten inte ägs", async () => {
    getChat.mockResolvedValue(null);
    const res = await GET(req("http://localhost/api/openclaw/powers?chatId=x"));
    expect(res.status).toBe(404);
    expect(readGrant).not.toHaveBeenCalled();
    expect(readGrantState).not.toHaveBeenCalled();
  });

  it("skiljer «ingen grant» (persisted:false) från en persisterad av-grant (persisted:true)", async () => {
    getChat.mockResolvedValue({ id: "chat_1" });
    readGrantState.mockResolvedValueOnce({ status: "absent" });
    const absent = await (await GET(req("http://localhost/api/openclaw/powers?chatId=chat_1"))).json();
    expect(absent).toEqual({ powersOn: false, granted: [], persisted: false });

    readGrantState.mockResolvedValueOnce({
      status: "present",
      grant: { powersOn: false, granted: [] },
    });
    const off = await (await GET(req("http://localhost/api/openclaw/powers?chatId=chat_1"))).json();
    expect(off).toEqual({ powersOn: false, granted: [], persisted: true });
  });

  it("svarar 503 vid läsfel så klienten aldrig skriver defaults över ett okänt läge", async () => {
    getChat.mockResolvedValue({ id: "chat_1" });
    readGrantState.mockResolvedValueOnce({ status: "error" });
    const res = await GET(req("http://localhost/api/openclaw/powers?chatId=chat_1"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "grant_unavailable" });
  });
});

describe("POST /api/openclaw/powers", () => {
  it("ignorerar förfalskad grant mot en chatt som inte ägs", async () => {
    getChat.mockResolvedValue(null);
    const res = await POST(
      req("http://localhost/api/openclaw/powers", {
        chatId: "stolen",
        powersOn: true,
        granted: ["live_review"],
      }),
    );
    expect(res.status).toBe(404);
    expect(writeGrant).not.toHaveBeenCalled();
  });

  it("OC_EDIT av persisterar tom grant", async () => {
    OPENCLAW.editEnabled = false;
    getChat.mockResolvedValue({ id: "chat_1" });
    writeGrant.mockResolvedValue({ powersOn: false, granted: [] });
    const res = await POST(
      req("http://localhost/api/openclaw/powers", {
        chatId: "chat_1",
        powersOn: true,
        granted: ["live_review"],
      }),
    );
    expect(res.status).toBe(200);
    expect(writeGrant).toHaveBeenCalledWith({
      chatId: "chat_1",
      powersOn: false,
      granted: [],
    });
  });

  it("ljuger inte om en revoke när skrivningen misslyckas", async () => {
    getChat.mockResolvedValue({ id: "chat_1" });
    writeGrant.mockResolvedValue(null);
    const res = await POST(
      req("http://localhost/api/openclaw/powers", {
        chatId: "chat_1",
        powersOn: false,
        granted: [],
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.granted).toBeUndefined();
  });
});
