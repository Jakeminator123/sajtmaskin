import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithPinnedDns = vi.hoisted(() => vi.fn());
const addDomainToProject = vi.hoisted(() => vi.fn());
const removeDomainFromProject = vi.hoisted(() => vi.fn());
const updateProjectDomainRedirect = vi.hoisted(() => vi.fn());
const observeVercelDomain = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const setProjectCustomDomainCandidate = vi.hoisted(() => vi.fn());
const setProjectVerifiedCustomDomain = vi.hoisted(() => vi.fn());
const clearProjectCustomDomain = vi.hoisted(() => vi.fn());
const clearProjectCustomDomainVerification = vi.hoisted(() => vi.fn());
const setLatestDeploymentLiveUrlForChat = vi.hoisted(() => vi.fn());
const getVercelToken = vi.hoisted(() => vi.fn(() => "token"));

vi.mock("@/lib/capture/pinned-fetch", () => ({
  fetchWithPinnedDns,
  PINNED_ADDRESS_BLOCKED_MESSAGE: "Pinned fetch blocked: hostname resolved to a private/internal address",
}));
vi.mock("@/lib/vercel/vercel-client", () => ({
  addDomainToProject,
  removeDomainFromProject,
  updateProjectDomainRedirect,
}));
vi.mock("@/lib/vercel/domain-observation", () => ({ observeVercelDomain }));
vi.mock("@/lib/db/services/projects", () => ({
  getProjectById,
  setProjectCustomDomainCandidate,
  setProjectVerifiedCustomDomain,
  clearProjectCustomDomain,
  clearProjectCustomDomainVerification,
}));
vi.mock("@/lib/deployment", () => ({ setLatestDeploymentLiveUrlForChat }));
vi.mock("@/lib/vercel", () => ({ getVercelToken }));

const {
  activateCustomerDomain,
  checkCustomerHttps,
  linkCustomerDomain,
  unlinkCustomerDomain,
  verifyCustomerDomain,
} = await import("./customer-domain-flow");

const HOSTING = {
  vercelProjectId: "vp_owned",
  appProjectId: "proj_1",
  chatId: "chat_1",
};

function observation(
  domain: string,
  overrides: Partial<{
    connection: "connected" | "not_connected" | "unknown";
    ownership: "pending" | "verified" | "unknown";
    dns: "pending" | "valid" | "invalid" | "unknown";
    value: string;
  }> = {},
) {
  return {
    domain,
    connection: overrides.connection ?? "connected",
    ownership: overrides.ownership ?? "pending",
    dns: overrides.dns ?? "invalid",
    https: "not_checked" as const,
    activation: "not_started" as const,
    records: [
      {
        type: "A",
        host: domain,
        value: overrides.value ?? "192.0.2.10",
        purpose: "configuration" as const,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectById.mockResolvedValue({
    id: "proj_1",
    custom_domain: null,
    custom_domain_verified_at: null,
    published_slug: "kund",
  });
  addDomainToProject.mockResolvedValue({ name: "exempel.se", apexName: "exempel.se", verified: false });
  observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
    observation(domain),
  );
  fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
  setProjectCustomDomainCandidate.mockResolvedValue({ id: "proj_1" });
  setProjectVerifiedCustomDomain.mockResolvedValue({ id: "proj_1" });
  removeDomainFromProject.mockResolvedValue({ removed: true, unknown: false });
  updateProjectDomainRedirect.mockResolvedValue({
    name: "www.exempel.se",
    apexName: "exempel.se",
    verified: true,
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ verified: true }), { status: 200 })));
});

describe("checkCustomerHttps", () => {
  it("treats a timeout as unknown, not invalid", async () => {
    fetchWithPinnedDns.mockRejectedValue(new Error("Pinned fetch timed out after 8000 ms"));
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("unknown");
  });

  it("treats a certificate failure as invalid", async () => {
    fetchWithPinnedDns.mockRejectedValue(new Error("unable to verify the first certificate"));
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("invalid");
  });
});

describe("linkCustomerDomain", () => {
  it("rejects a reserved platform hostname before any provider write", async () => {
    const result = await linkCustomerDomain({ hosting: HOSTING, domain: "admin.sajtmaskin.se" });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(addDomainToProject).not.toHaveBeenCalled();
  });

  it("attaches apex and www as a pair and does not promote the live URL", async () => {
    const result = await linkCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(addDomainToProject).toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(addDomainToProject).toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(setProjectCustomDomainCandidate).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.snapshot.primary?.records[0]?.value).toBe("192.0.2.10");
      expect(JSON.stringify(result.snapshot)).not.toContain("vp_owned");
    }
  });

  it("does not persist a candidate when the companion attach fails", async () => {
    addDomainToProject
      .mockResolvedValueOnce({ name: "exempel.se", apexName: "exempel.se", verified: false })
      .mockRejectedValueOnce(new Error("network timeout"));

    const result = await linkCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(false);
    expect(setProjectCustomDomainCandidate).not.toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
  });
});

describe("verifyCustomerDomain", () => {
  it("keeps a previously verified domain when the provider is temporarily unknown", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    vi.mocked(fetch).mockResolvedValue(new Response("down", { status: 503 }));
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { connection: "unknown", ownership: "unknown", dns: "unknown" }),
    );

    const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.snapshot.primary?.status).toBe("unknown");
      expect(result.snapshot.message).toMatch(/just nu|okänd|oförändrad/i);
    }
  });
});

describe("activateCustomerDomain", () => {
  it("refuses to replace a live domain when HTTPS is unknown", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "gammal.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockRejectedValue(new Error("Pinned fetch timed out after 8000 ms"));

    const result = await activateCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

    expect(result.ok).toBe(false);
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
  });

  it("promotes only a fully ready host and arms www redirect", async () => {
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });

    const result = await activateCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(setProjectVerifiedCustomDomain).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(setLatestDeploymentLiveUrlForChat).toHaveBeenCalledWith("chat_1", "exempel.se");
    expect(updateProjectDomainRedirect).toHaveBeenCalledWith(
      "vp_owned",
      "www.exempel.se",
      "exempel.se",
      undefined,
    );
  });
});

describe("unlinkCustomerDomain", () => {
  it("drops live advertising first and removes the apex/www pair", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(true);
    expect(clearProjectCustomDomainVerification).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(clearProjectCustomDomain).toHaveBeenCalledWith("proj_1");
  });

  it("does not clear the stored hostname when provider remove is unknown", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    removeDomainFromProject.mockResolvedValue({ removed: false, unknown: true });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(false);
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    expect(clearProjectCustomDomainVerification).toHaveBeenCalled();
  });
});
