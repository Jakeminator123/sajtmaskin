import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const findOrCreateKostnadsfriCampaignUser = vi.hoisted(() => vi.fn());
const transferKostnadsfriCampaignAccount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
  clearAuthCookie: vi.fn(async () => undefined),
  setAuthCookie: vi.fn(async () => undefined),
  createToken: vi.fn(() => "campaign-token"),
  verifyPassword: vi.fn(() => false),
}));
vi.mock("@/lib/db/services/kostnadsfri-account", () => ({
  findOrCreateKostnadsfriCampaignUser,
  transferKostnadsfriCampaignAccount,
}));
vi.mock("@/lib/db/services/kostnadsfri-campaign", () => ({
  getKostnadsfriBoundProjectIdForOwner: vi.fn(async () => null),
}));
vi.mock("@/lib/db/services/users", () => ({
  updateUserLastLogin: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/services/analytics", () => ({
  recordPageView: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db/services/kostnadsfri", () => ({
  getKostnadsfriPageBySlug: vi.fn(async () => null),
  backfillKostnadsfriPageProfile: vi.fn(async () => true),
  markKostnadsfriProfileLookupSettled: vi.fn(async () => true),
  getAcceptedKostnadsfriMailEvent: vi.fn(async () => null),
}));
vi.mock("@/lib/kostnadsfri/profile-lookup", () => ({
  isKostnadsfriLookupConfigured: () => false,
  lookupKostnadsfriProfile: vi.fn(),
}));
vi.mock("@/lib/data/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (_req: unknown, _key: string, handler: () => Promise<Response>) => handler(),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => void cb() };
});

import { POST as logout } from "../auth/logout/route";
import { POST as claimAccount } from "./claim/route";
import { POST as verifyInvitation } from "./[slug]/verify/route";
import { generatePassword } from "@/lib/kostnadsfri";
import {
  CAMPAIGN_CLAIM_COOKIE_HOST,
  CAMPAIGN_CLAIM_COOKIE_LEGACY,
  kostnadsfriCampaignEmail,
} from "@/lib/kostnadsfri/campaign-account-ticket";
import {
  KOSTNADSFRI_CAMPAIGN_COOKIE,
  createKostnadsfriCampaignReceipt,
} from "@/lib/kostnadsfri/campaign-receipt";

const SLUG_A = "inbjudan-a";
const SLUG_B = "inbjudan-b";

function setCookieLines(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieValue(lines: string[], name: string): string | null {
  const line = lines.find((entry) => entry.startsWith(`${name}=`));
  if (!line) return null;
  const value = line.slice(name.length + 1).split(";")[0];
  return value || null;
}

function receiptFor(slug: string): string {
  return createKostnadsfriCampaignReceipt({
    slug,
    sessionId: "sess_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  });
}

function campaignUser(slug: string, id: string) {
  return { id, provider: "kostnadsfri", email: kostnadsfriCampaignEmail(slug) };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KOSTNADSFRI_PASSWORD_SEED = randomBytes(32).toString("hex");
  delete process.env.KOSTNADSFRI_API_KEY;
  findOrCreateKostnadsfriCampaignUser.mockImplementation(async (input: { email: string }) => ({
    id: input.email === kostnadsfriCampaignEmail(SLUG_B) ? "user_b" : "user_a",
    email: input.email,
    provider: "kostnadsfri",
  }));
  transferKostnadsfriCampaignAccount.mockResolvedValue({ status: "transferred", projects: 1 });
});

afterEach(() => {
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
  delete process.env.KOSTNADSFRI_API_KEY;
});

describe("kampanjbyte och utloggning", () => {
  it("flyttar inte A när kunden bytt till B och sedan loggar in", async () => {
    getCurrentUser.mockResolvedValue(campaignUser(SLUG_A, "user_a"));
    const started = await claimAccount(
      new NextRequest("https://sajtmaskin.se/api/kostnadsfri/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${KOSTNADSFRI_CAMPAIGN_COOKIE}=${receiptFor(SLUG_A)}`,
        },
        body: JSON.stringify({ action: "start" }),
      }),
    );
    expect(started.status).toBe(200);
    const ticketA = cookieValue(setCookieLines(started), CAMPAIGN_CLAIM_COOKIE_HOST);
    expect(ticketA).toBeTruthy();

    const verified = await verifyInvitation(
      new NextRequest(`https://sajtmaskin.se/api/kostnadsfri/${SLUG_B}/verify`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${CAMPAIGN_CLAIM_COOKIE_HOST}=${ticketA}`,
        },
        body: JSON.stringify({ password: generatePassword(SLUG_B) }),
      }),
      { params: Promise.resolve({ slug: SLUG_B }) },
    );
    expect(verified.status).toBe(200);
    const verifiedCookies = setCookieLines(verified);
    expect(
      verifiedCookies.some(
        (entry) => entry.startsWith(`${CAMPAIGN_CLAIM_COOKIE_HOST}=`) && /Max-Age=0/i.test(entry),
      ),
    ).toBe(true);
    const receiptB = cookieValue(verifiedCookies, KOSTNADSFRI_CAMPAIGN_COOKIE);
    expect(receiptB).toBeTruthy();

    getCurrentUser.mockResolvedValue({ id: "user_own", provider: "email", email: "kund@example.com" });
    const stale = await claimAccount(
      new NextRequest("https://sajtmaskin.se/api/kostnadsfri/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${CAMPAIGN_CLAIM_COOKIE_HOST}=${ticketA}; ${KOSTNADSFRI_CAMPAIGN_COOKIE}=${receiptB}`,
        },
        body: JSON.stringify({ action: "complete" }),
      }),
    );
    expect(stale.status).toBe(400);
    await expect(stale.json()).resolves.toMatchObject({ code: "ticket_stale" });
    expect(transferKostnadsfriCampaignAccount).not.toHaveBeenCalled();

    getCurrentUser.mockResolvedValue(campaignUser(SLUG_B, "user_b"));
    const startedB = await claimAccount(
      new NextRequest("https://sajtmaskin.se/api/kostnadsfri/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${KOSTNADSFRI_CAMPAIGN_COOKIE}=${receiptB}`,
        },
        body: JSON.stringify({ action: "start" }),
      }),
    );
    const ticketB = cookieValue(setCookieLines(startedB), CAMPAIGN_CLAIM_COOKIE_HOST);
    expect(startedB.status).toBe(200);
    expect(ticketB).toBeTruthy();

    getCurrentUser.mockResolvedValue({ id: "user_own", provider: "email", email: "kund@example.com" });
    const savedB = await claimAccount(
      new NextRequest("https://sajtmaskin.se/api/kostnadsfri/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${CAMPAIGN_CLAIM_COOKIE_HOST}=${ticketB}; ${KOSTNADSFRI_CAMPAIGN_COOKIE}=${receiptB}`,
        },
        body: JSON.stringify({ action: "complete" }),
      }),
    );
    expect(savedB.status).toBe(200);
    expect(transferKostnadsfriCampaignAccount).toHaveBeenCalledTimes(1);
    expect(transferKostnadsfriCampaignAccount).toHaveBeenCalledWith({
      campaignUserId: "user_b",
      targetUserId: "user_own",
    });
  });

  it("låter utloggning gå ut båda överföringskakorna", async () => {
    const response = await logout();
    const lines = setCookieLines(response);
    for (const name of [CAMPAIGN_CLAIM_COOKIE_HOST, CAMPAIGN_CLAIM_COOKIE_LEGACY]) {
      expect(lines.some((entry) => entry.startsWith(`${name}=`) && /Max-Age=0/i.test(entry))).toBe(
        true,
      );
    }
  });
});
