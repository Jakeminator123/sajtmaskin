import { beforeEach, describe, expect, it, vi } from "vitest";

const requireNotBot = vi.hoisted(() => vi.fn());
const authorizeWizardRun = vi.hoisted(() => vi.fn());
const debugLog = vi.hoisted(() => vi.fn());
const braveWebSearch = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() => vi.fn());
const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bot-protection", () => ({ requireNotBot }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_request: Request, _bucket: string, handler: () => Promise<Response>) =>
    handler(),
}));
vi.mock("@/lib/wizard/authorize-wizard-run", () => ({ authorizeWizardRun }));
vi.mock("@/lib/utils/debug", () => ({ debugLog }));
vi.mock("@/lib/brave-search", () => ({ braveWebSearch }));
vi.mock("ai", () => ({ generateText }));
vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return { ...actual, safeFetch };
});

const { POST } = await import("./route");

const WIZARD_RUN_ID = "11111111-1111-4111-8111-111111111111";
const ATTACKER_ALLABOLAG_URL = "https://evil.example/allabolag.se/foretag/acme";

function makeRequest(body: unknown): Request {
  const payload = {
    wizardRunId: WIZARD_RUN_ID,
    ...(body as Record<string, unknown>),
  };
  return new Request("http://localhost/api/wizard/company-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function fetchedUrls(): string[] {
  return safeFetch.mock.calls.map((call) => String(call[0]));
}

describe("POST /api/wizard/company-lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNotBot.mockReturnValue(null);
    authorizeWizardRun.mockResolvedValue({
      ok: true,
      user: { id: "user_1" },
      run: { id: WIZARD_RUN_ID },
    });
    braveWebSearch.mockResolvedValue([]);
    generateText.mockResolvedValue({ text: '{"found":false}' });
  });

  it("fails before parsing or authorizing when bot protection blocks", async () => {
    requireNotBot.mockReturnValue(Response.json({ error: "Bot blocked" }, { status: 403 }));

    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(403);
    expect(authorizeWizardRun).not.toHaveBeenCalled();
  });

  it("rejects invalid requests before authorizing the run", async () => {
    const response = await POST(makeRequest({ companyName: "" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Validation failed",
      found: false,
      source: "none",
    });
    expect(authorizeWizardRun).not.toHaveBeenCalled();
  });

  it("forwards a run rejection without invoking lookup providers", async () => {
    authorizeWizardRun.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Ogiltig wizard-körning." }, { status: 403 }),
    });

    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(403);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(braveWebSearch).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("parses an allabolag result without charging again", async () => {
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
    safeFetch
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
    expect(authorizeWizardRun).toHaveBeenCalledWith(expect.any(Request), WIZARD_RUN_ID);
    expect(safeFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("https://www.allabolag.se/bransch-sok"),
      expect.objectContaining({ timeoutMs: 8000, maxBodyBytes: 1_500_000 }),
    );
    expect(safeFetch).toHaveBeenNthCalledWith(
      2,
      "https://www.allabolag.se/foretag/sajtstudio-ab/stockholm/dataprogrammering/ABC123",
      expect.objectContaining({ timeoutMs: 8000, maxBodyBytes: 1_500_000 }),
    );
    expect(braveWebSearch).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not fetch substring-spoofed allabolag company pages", async () => {
    safeFetch.mockResolvedValueOnce(
      new Response(`<a href="${ATTACKER_ALLABOLAG_URL}">Bolag</a>`),
    );
    braveWebSearch.mockResolvedValue([
      {
        title: "Spoof",
        url: ATTACKER_ALLABOLAG_URL,
        description: "",
      },
    ]);

    const response = await POST(makeRequest({ companyName: "Sajtstudio" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ found: false, source: "none" });
    expect(authorizeWizardRun).toHaveBeenCalledWith(expect.any(Request), WIZARD_RUN_ID);
    expect(fetchedUrls()).toEqual([
      expect.stringContaining("https://www.allabolag.se/bransch-sok"),
    ]);
    expect(fetchedUrls().some((url) => url.includes("evil.example"))).toBe(false);
    expect(generateText).toHaveBeenCalled();
  });
});
