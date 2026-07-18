import { beforeEach, describe, expect, it, vi } from "vitest";

const requireNotBot = vi.hoisted(() => vi.fn());
const prepareCredits = vi.hoisted(() => vi.fn());
const debugLog = vi.hoisted(() => vi.fn());
const braveWebSearch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/botProtection", () => ({ requireNotBot }));
vi.mock("@/lib/rateLimit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/credits/server", () => ({ prepareCredits }));
vi.mock("@/lib/utils/debug", () => ({ debugLog }));
vi.mock("@/lib/brave-search", () => ({ braveWebSearch }));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/wizard/company-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/wizard/company-lookup", () => {
  const commit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    requireNotBot.mockReturnValue(null);
    prepareCredits.mockResolvedValue({ ok: true, commit });
  });

  it("fails before parsing or charging when bot protection blocks", async () => {
    requireNotBot.mockReturnValue(Response.json({ error: "Bot blocked" }, { status: 403 }));

    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(403);
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("rejects invalid requests before reserving credits", async () => {
    const response = await POST(makeRequest({ companyName: "" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      found: false,
      source: "none",
    });
    expect(prepareCredits).not.toHaveBeenCalled();
  });

  it("forwards a credit rejection without invoking lookup providers", async () => {
    prepareCredits.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Insufficient credits" }, { status: 402 }),
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(braveWebSearch).not.toHaveBeenCalled();
  });

  it("parses an allabolag result and commits the reserved credit", async () => {
    const company = {
      name: "Sajtstudio AB",
      orgnr: "5590123456",
      companyType: { name: "Aktiebolag" },
      visitorAddress: {
        addressLine: "Testgatan 1",
        zipCode: "123 45",
        postPlace: "Stockholm",
      },
      contactPerson: { name: "Ada Lovelace", role: "VD" },
      industries: [{ name: "Dataprogrammering" }],
      revenue: 1234,
      employees: 7,
      homePage: "https://sajtstudio.se",
      purpose: "Utvecklar webbplatser.",
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          '<a href="/foretag/sajtstudio-ab/stockholm/dataprogrammering/ABC123">Bolag</a>',
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: { pageProps: { company } },
          })}</script>`,
        ),
      );

    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      found: true,
      companyName: "Sajtstudio AB",
      orgNr: "559012-3456",
      city: "Stockholm",
      industries: ["Dataprogrammering"],
      employees: 7,
      source: "allabolag",
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(braveWebSearch).not.toHaveBeenCalled();
  });
});
