import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getKostnadsfriPageBySlug = vi.hoisted(() => vi.fn());
const backfillKostnadsfriPageProfile = vi.hoisted(() => vi.fn(async () => true));
const markKostnadsfriProfileLookupSettled = vi.hoisted(() => vi.fn(async () => true));
const recordPageView = vi.hoisted(() => vi.fn(async () => undefined));
const verifyPassword = vi.hoisted(() => vi.fn(() => false));
const isKostnadsfriLookupConfigured = vi.hoisted(() => vi.fn(() => false));
const lookupKostnadsfriProfile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  getKostnadsfriPageBySlug,
  backfillKostnadsfriPageProfile,
  markKostnadsfriProfileLookupSettled,
}));

vi.mock("@/lib/db/services/analytics", () => ({
  recordPageView,
}));

vi.mock("@/lib/auth/auth", () => ({
  verifyPassword,
}));

vi.mock("@/lib/kostnadsfri/profile-lookup", () => ({
  isKostnadsfriLookupConfigured,
  lookupKostnadsfriProfile,
}));

// `after()` needs a request scope in Next; run the callback inline in tests.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb() };
});

import { POST } from "./route";
import { generatePassword } from "@/lib/kostnadsfri";
import {
  buildKostnadsfriProfileFallback,
  KOSTNADSFRI_PROFILE_FALLBACK_MISS_TTL_MS,
} from "@/lib/kostnadsfri/company-profile";

const SESSION_ID = "sess_ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb";

afterEach(() => {
  vi.clearAllMocks();
  verifyPassword.mockReturnValue(false);
  isKostnadsfriLookupConfigured.mockReturnValue(false);
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
  delete process.env.KOSTNADSFRI_API_KEY;
});

function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "zax-2-0-ab",
    password_hash: "hash",
    company_name: "Zax 2.0 AB",
    industry: null,
    website: null,
    contact_email: null,
    contact_name: null,
    extra_data: null,
    status: "active",
    created_at: new Date("2026-09-01T00:00:00Z"),
    updated_at: new Date("2026-09-01T00:00:00Z"),
    expires_at: null,
    consumed_at: null,
    sent_at: null,
    source: null,
    ...overrides,
  };
}

const LOOKUP_HIT = {
  status: "hit" as const,
  companyName: "Zax 2.0 Aktiebolag",
  contactEmail: "info@zax.example",
  profile: { city: "Kista", businessDescription: "Bolaget skall bedriva frisörverksamhet." },
};

function verifyRequest(slug: string, password: string, forwardedFor?: string) {
  return new NextRequest(`http://localhost/api/kostnadsfri/${slug}/verify`, {
    method: "POST",
    body: JSON.stringify({ password }),
    headers: {
      "content-type": "application/json",
      "x-real-ip": "10.0.0.1",
      // Rate-limitern nycklar på x-forwarded-for + slug (5/timme, in-memory).
      // Tester som delar slug måste därför skilja sig här.
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      cookie: `sajtmaskin_session=${SESSION_ID}`,
    },
  });
}

describe("kostnadsfri verify route", () => {
  it("returns a generic 503 when deterministic verification is not configured", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);

    const res = await POST(verifyRequest("acme", "secret"), {
      params: Promise.resolve({ slug: "acme" }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: "Länkverifiering är inte konfigurerad.",
    });
    expect(recordPageView).not.toHaveBeenCalled();
  });

  it("records a `verifierad` event only when the deterministic password matches", async () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
    getKostnadsfriPageBySlug.mockResolvedValue(null);
    const slug = "jakobs-foretag-ab";
    const params = { params: Promise.resolve({ slug }) };
    // Härlett ur testseeden ovan — inget riktigt lösenord (GitGuardian på #1306
    // flaggade den tidigare inline-raden som "Generic Password").
    const derived = generatePassword(slug);

    const wrong = await POST(verifyRequest(slug, "fel"), params);
    expect(wrong.status).toBe(401);
    expect(recordPageView).not.toHaveBeenCalled();

    const ok = await POST(verifyRequest(slug, derived), params);
    const body = await ok.json();

    expect(ok.status).toBe(200);
    expect(body.companyData.companyName).toBe("Jakobs Foretag AB");
    expect(ok.headers.get("set-cookie")).toContain("sajtmaskin_kostnadsfri_campaign=");
    expect(ok.headers.get("set-cookie")).toContain("HttpOnly");
    expect(recordPageView).toHaveBeenCalledWith(
      "/kostnadsfri/jakobs-foretag-ab/verifierad",
      SESSION_ID,
      undefined,
      "10.0.0.1",
      undefined,
    );
  });

  it("returns the host session and expires an HTTPS parent-domain leftover", async () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
    getKostnadsfriPageBySlug.mockResolvedValue(null);
    const slug = "legacy-cookie-company";
    const request = new NextRequest(
      `https://preview.sajtmaskin.se/api/kostnadsfri/${slug}/verify`,
      {
        method: "POST",
        body: JSON.stringify({ password: generatePassword(slug) }),
        headers: {
          "content-type": "application/json",
          "x-real-ip": "10.0.0.2",
          host: "preview.sajtmaskin.se",
          cookie: `sajtmaskin_session=${SESSION_ID}`,
        },
      },
    );

    const response = await POST(request, { params: Promise.resolve({ slug }) });

    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(3);
    expect(setCookies.some((header) => header.startsWith("__Host-sajtmaskin_session=sess_"))).toBe(
      true,
    );
    expect(
      setCookies.some(
        (header) =>
          header.startsWith("sajtmaskin_session=;") &&
          header.includes("Domain=.sajtmaskin.se") &&
          header.includes("Max-Age=0"),
      ),
    ).toBe(true);
  });
});

// Profilfallbacken (beslutsrad 2026-09-15 «Kostnadsfri / bolagsdata», vänd):
// bara efter korrekt lösenord, bara när profilen saknas, aldrig ett fel.
describe("kostnadsfri verify route — profilfallback", () => {
  const params = { params: Promise.resolve({ slug: "zax-2-0-ab" }) };

  it("frågar inte dashen när raden redan bär en profil", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(
      pageRow({ extra_data: { profile: { city: "Kista" } } }),
    );

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.1"), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.companyData.profile).toEqual({ city: "Kista" });
    expect(lookupKostnadsfriProfile).not.toHaveBeenCalled();
    expect(backfillKostnadsfriPageProfile).not.toHaveBeenCalled();
  });

  it("frågar inte dashen alls när fallbacken inte är konfigurerad", async () => {
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(pageRow());

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.2"), params);

    expect(res.status).toBe(200);
    expect(lookupKostnadsfriProfile).not.toHaveBeenCalled();
  });

  it("frågar inte dashen vid fel lösenord", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(pageRow());

    const res = await POST(verifyRequest("zax-2-0-ab", "fel", "10.9.0.3"), params);

    expect(res.status).toBe(401);
    expect(lookupKostnadsfriProfile).not.toHaveBeenCalled();
  });

  it("fyller profilen från dashen och skriver tillbaka den till raden", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(pageRow());
    lookupKostnadsfriProfile.mockResolvedValue(LOOKUP_HIT);

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.4"), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(lookupKostnadsfriProfile).toHaveBeenCalledWith("zax-2-0-ab");
    expect(body.companyData.profile).toEqual(LOOKUP_HIT.profile);
    // Raden äger namnet — dashens variant skriver inte över det.
    expect(body.companyData.companyName).toBe("Zax 2.0 AB");
    expect(backfillKostnadsfriPageProfile).toHaveBeenCalledWith("zax-2-0-ab", LOOKUP_HIT.profile);
  });

  it("tar registrets namn utan DB-rad, men skriver inte tillbaka något", async () => {
    process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(null);
    lookupKostnadsfriProfile.mockResolvedValue(LOOKUP_HIT);
    // Härlett ur testseeden, i egen variabel — samma skäl som i det första
    // deterministiska fallet ovan (GitGuardian flaggar inline-formen).
    const slug = "zax-2-0-ab";
    const derived = generatePassword(slug);

    const res = await POST(verifyRequest(slug, derived, "10.9.0.5"), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.companyData.companyName).toBe("Zax 2.0 Aktiebolag");
    expect(body.companyData.profile).toEqual(LOOKUP_HIT.profile);
    expect(backfillKostnadsfriPageProfile).not.toHaveBeenCalled();
  });

  it("degraderar till dagens svar när dashen inte svarar", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(pageRow());
    lookupKostnadsfriProfile.mockResolvedValue({ status: "unavailable", reason: "timeout" });

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.6"), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.companyData.profile).toBeNull();
    expect(body.companyData.companyName).toBe("Zax 2.0 AB");
    expect(backfillKostnadsfriPageProfile).not.toHaveBeenCalled();
    expect(markKostnadsfriProfileLookupSettled).not.toHaveBeenCalled();
  });

  it("skriver inte tillbaka en träff utan profil men sätter negativ sentinel", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(pageRow());
    lookupKostnadsfriProfile.mockResolvedValue({ ...LOOKUP_HIT, profile: null });

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.7"), params);

    expect(res.status).toBe(200);
    expect(backfillKostnadsfriPageProfile).not.toHaveBeenCalled();
    expect(markKostnadsfriProfileLookupSettled).toHaveBeenCalledWith("zax-2-0-ab", "empty");
  });

  it("sätter negativ sentinel vid miss så nästa verify inte frågar dashen igen", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(pageRow());
    lookupKostnadsfriProfile.mockResolvedValue({ status: "miss" });

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.8"), params);

    expect(res.status).toBe(200);
    expect(markKostnadsfriProfileLookupSettled).toHaveBeenCalledWith("zax-2-0-ab", "miss");
    expect(backfillKostnadsfriPageProfile).not.toHaveBeenCalled();
  });

  it("frågar inte dashen när negativ sentinel fortfarande gäller", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(
      pageRow({ extra_data: { profileFallback: buildKostnadsfriProfileFallback("miss") } }),
    );

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.9"), params);

    expect(res.status).toBe(200);
    expect(lookupKostnadsfriProfile).not.toHaveBeenCalled();
    expect(backfillKostnadsfriPageProfile).not.toHaveBeenCalled();
  });

  it("frågar dashen igen när miss-sentinel har passerat 24 h", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(
      pageRow({
        extra_data: {
          profileFallback: buildKostnadsfriProfileFallback(
            "miss",
            new Date(Date.now() - KOSTNADSFRI_PROFILE_FALLBACK_MISS_TTL_MS),
          ),
        },
      }),
    );
    lookupKostnadsfriProfile.mockResolvedValue(LOOKUP_HIT);

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.11"), params);

    expect(res.status).toBe(200);
    expect(lookupKostnadsfriProfile).toHaveBeenCalledWith("zax-2-0-ab");
    expect(backfillKostnadsfriPageProfile).toHaveBeenCalledWith("zax-2-0-ab", LOOKUP_HIT.profile);
  });

  it("frågar dashen när profilnyckeln är JSON-null — slotten är tom, inte en giltig push", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(pageRow({ extra_data: { profile: null } }));
    lookupKostnadsfriProfile.mockResolvedValue(LOOKUP_HIT);

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.10"), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(lookupKostnadsfriProfile).toHaveBeenCalledWith("zax-2-0-ab");
    expect(body.companyData.profile).toEqual(LOOKUP_HIT.profile);
    expect(backfillKostnadsfriPageProfile).toHaveBeenCalledWith("zax-2-0-ab", LOOKUP_HIT.profile);
  });

  it("skriver fallback när legacy-profilen inte överlever normalisering", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(
      pageRow({
        extra_data: { profile: { personer: [{ namn: "X" }], aktiekapital: "25.000 SEK" } },
      }),
    );
    lookupKostnadsfriProfile.mockResolvedValue(LOOKUP_HIT);

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.12"), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(lookupKostnadsfriProfile).toHaveBeenCalledWith("zax-2-0-ab");
    expect(body.companyData.profile).toEqual(LOOKUP_HIT.profile);
    expect(backfillKostnadsfriPageProfile).toHaveBeenCalledWith("zax-2-0-ab", LOOKUP_HIT.profile);
  });

  it("låter giltig push vinna — ingen lookup och ingen overwrite", async () => {
    isKostnadsfriLookupConfigured.mockReturnValue(true);
    verifyPassword.mockReturnValue(true);
    getKostnadsfriPageBySlug.mockResolvedValue(
      pageRow({ extra_data: { profile: { city: "Kista", orgNumber: "559599-5639" } } }),
    );

    const res = await POST(verifyRequest("zax-2-0-ab", "rätt", "10.9.0.13"), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.companyData.profile).toEqual({ city: "Kista", orgNumber: "559599-5639" });
    expect(lookupKostnadsfriProfile).not.toHaveBeenCalled();
    expect(backfillKostnadsfriPageProfile).not.toHaveBeenCalled();
  });
});
