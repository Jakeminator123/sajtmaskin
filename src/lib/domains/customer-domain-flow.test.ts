import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithPinnedDns = vi.hoisted(() => vi.fn());
const addDomainToProject = vi.hoisted(() => vi.fn());
const getProjectDomain = vi.hoisted(() => vi.fn());
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
  getProjectDomain,
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
  inspectCustomerDomain,
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
  getProjectDomain.mockResolvedValue({
    name: "www.exempel.se",
    apexName: "exempel.se",
    verified: true,
    redirect: null,
  });
  updateProjectDomainRedirect.mockResolvedValue({
    name: "www.exempel.se",
    apexName: "exempel.se",
    verified: true,
    redirect: "exempel.se",
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

  it.each([401, 404])("treats HTTP %s as invalid, not valid", async (status) => {
    fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("no") });
    await expect(checkCustomerHttps("ny.se")).resolves.toBe("invalid");
  });

  it.each([502, 503])("treats HTTP %s as unknown, not invalid", async (status) => {
    fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("blip") });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("unknown");
  });

  it("treats 2xx as valid", async () => {
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("valid");
  });

  it.each([301, 308])(
    "follows a %s to the intended primary host and requires a terminal 2xx",
    async (status) => {
      fetchWithPinnedDns.mockImplementation(async (url: string) => {
        if (String(url).startsWith("https://www.exempel.se/")) {
          return { status, headers: { location: "https://exempel.se/" }, body: Buffer.from("") };
        }
        return { status: 200, headers: {}, body: Buffer.from("ok") };
      });
      await expect(checkCustomerHttps("www.exempel.se", "exempel.se")).resolves.toBe("valid");
      expect(fetchWithPinnedDns).toHaveBeenCalledTimes(2);
    },
  );

  it("does not fetch a hop to a foreign host", async () => {
    fetchWithPinnedDns.mockResolvedValue({
      status: 302,
      headers: { location: "https://annan.se/" },
      body: Buffer.from(""),
    });
    await expect(checkCustomerHttps("www.exempel.se", "exempel.se")).resolves.toBe("invalid");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(1);
    expect(String(fetchWithPinnedDns.mock.calls[0]?.[0])).not.toContain("annan.se");
  });

  it.each(["https://exempel.se/", "/"])("treats Location %s as a loop", async (location) => {
    fetchWithPinnedDns.mockResolvedValue({
      status: 301,
      headers: { location },
      body: Buffer.from(""),
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("invalid");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(1);
  });

  it("treats 302 → /en → 200 as valid", async () => {
    fetchWithPinnedDns.mockImplementation(async (url: string) => {
      if (String(url) === "https://exempel.se/") {
        return { status: 302, headers: { location: "/en" }, body: Buffer.from("") };
      }
      if (String(url) === "https://exempel.se/en") {
        return { status: 200, headers: {}, body: Buffer.from("ok") };
      }
      return { status: 500, headers: {}, body: Buffer.from("no") };
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("valid");
  });

  it("treats 302 → /en → 404 as invalid", async () => {
    fetchWithPinnedDns.mockImplementation(async (url: string) => {
      if (String(url) === "https://exempel.se/") {
        return { status: 302, headers: { location: "/en" }, body: Buffer.from("") };
      }
      return { status: 404, headers: {}, body: Buffer.from("no") };
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("invalid");
  });

  it("treats a redirect loop A → B → A as invalid", async () => {
    fetchWithPinnedDns.mockImplementation(async (url: string) => {
      if (String(url) === "https://exempel.se/") {
        return { status: 302, headers: { location: "https://exempel.se/en" }, body: Buffer.from("") };
      }
      return { status: 302, headers: { location: "https://exempel.se/" }, body: Buffer.from("") };
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("invalid");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(2);
  });

  it("treats a three-hop language chain that ends in 2xx as valid", async () => {
    const hops = [
      "https://exempel.se/",
      "https://exempel.se/sv",
      "https://exempel.se/sv/start",
    ];
    fetchWithPinnedDns.mockImplementation(async (url: string) => {
      const index = hops.indexOf(String(url));
      const next = hops[index + 1];
      if (next) return { status: 302, headers: { location: next }, body: Buffer.from("") };
      return { status: 200, headers: {}, body: Buffer.from("ok") };
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("valid");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(3);
  });

  it("treats a four-hop chain as invalid", async () => {
    const hops = [
      "https://exempel.se/",
      "https://exempel.se/a",
      "https://exempel.se/b",
      "https://exempel.se/c",
      "https://exempel.se/d",
    ];
    fetchWithPinnedDns.mockImplementation(async (url: string) => {
      const index = hops.indexOf(String(url));
      const next = hops[index + 1];
      if (next) return { status: 302, headers: { location: next }, body: Buffer.from("") };
      return { status: 200, headers: {}, body: Buffer.from("ok") };
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("invalid");
    expect(fetchWithPinnedDns).toHaveBeenCalledTimes(4);
  });

  it("treats 503 in the middle of the chain as unknown", async () => {
    fetchWithPinnedDns.mockImplementation(async (url: string) => {
      if (String(url) === "https://exempel.se/") {
        return { status: 302, headers: { location: "/en" }, body: Buffer.from("") };
      }
      return { status: 503, headers: {}, body: Buffer.from("blip") };
    });
    await expect(checkCustomerHttps("exempel.se")).resolves.toBe("unknown");
  });
});

describe("inspectCustomerDomain HTTPS", () => {
  it.each([301, 308])(
    "keeps a companion %s to primary as ready, not Problem",
    async (status) => {
      observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
        observation(domain, { ownership: "verified", dns: "valid" }),
      );
      getProjectDomain.mockResolvedValue({
        name: "www.exempel.se",
        apexName: "exempel.se",
        verified: true,
        redirect: "exempel.se",
      });
      fetchWithPinnedDns.mockImplementation(async (url: string) => {
        if (String(url).includes("www.exempel.se")) {
          return {
            status,
            headers: { location: "https://exempel.se/" },
            body: Buffer.from(""),
          };
        }
        return { status: 200, headers: {}, body: Buffer.from("ok") };
      });

      const snapshot = await inspectCustomerDomain({
        hosting: HOSTING,
        domain: "exempel.se",
        checkHttps: true,
      });

      expect(snapshot.companion?.https).toBe("valid");
      expect(snapshot.companion?.status).not.toBe("problem");
      expect(snapshot.redirectArmed).toBe(true);
    },
  );
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
    if (!result.ok) {
      expect(result.snapshot?.hostResults).toEqual([
        { domain: "exempel.se", outcome: "ok" },
        { domain: "www.exempel.se", outcome: "failed" },
      ]);
    }
  });

  it("retries a partial attach and only needs the missing host to succeed", async () => {
    addDomainToProject
      .mockResolvedValueOnce({ name: "exempel.se", apexName: "exempel.se", verified: false })
      .mockRejectedValueOnce(new Error("503 gateway"))
      .mockResolvedValueOnce({ name: "exempel.se", apexName: "exempel.se", verified: false })
      .mockResolvedValueOnce({ name: "www.exempel.se", apexName: "exempel.se", verified: false });

    const first = await linkCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });
    expect(first.ok).toBe(false);
    expect(setProjectCustomDomainCandidate).not.toHaveBeenCalled();

    const retry = await linkCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });
    expect(retry.ok).toBe(true);
    expect(setProjectCustomDomainCandidate).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(addDomainToProject).toHaveBeenCalledTimes(4);
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

  it("does not auto-activate a builder-poll candidate when a live site is already verified", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });

    const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

    expect(result.ok).toBe(true);
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    expect(removeDomainFromProject).not.toHaveBeenCalled();
  });

  it("retries a failed redirect from verify without claiming it is active", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
    getProjectDomain.mockResolvedValue({
      name: "www.exempel.se",
      apexName: "exempel.se",
      verified: true,
      redirect: null,
    });
    updateProjectDomainRedirect.mockRejectedValue(new Error("502 from provider"));

    const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(updateProjectDomainRedirect).toHaveBeenCalled();
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.snapshot.redirectArmed).toBe(false);
      expect(result.snapshot.canArmRedirect).toBe(true);
    }
  });

  it.each([401, 404, 500])(
    "does not auto-activate a first-time candidate that returns %s",
    async (status) => {
      observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
        observation(domain, { ownership: "verified", dns: "valid" }),
      );
      fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("no") });

      const result = await verifyCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

      expect(result.ok).toBe(true);
      expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
      expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
    },
  );
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

  it("refuses to activate when 302 → /en lands on 404", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/en")) {
        return { status: 404, headers: {}, body: Buffer.from("no") };
      }
      if (String(url).includes("ny.se")) {
        return { status: 302, headers: { location: "/en" }, body: Buffer.from("") };
      }
      return { status: 200, headers: {}, body: Buffer.from("ok") };
    });

    const result = await activateCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

    expect(result.ok).toBe(false);
    expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
  });

  it.each([401, 404, 500])(
    "refuses to replace a live domain when the candidate returns %s",
    async (status) => {
      getProjectById.mockResolvedValue({
        id: "proj_1",
        custom_domain: "exempel.se",
        custom_domain_verified_at: new Date("2026-09-01"),
        published_slug: "kund",
      });
      observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
        observation(domain, { ownership: "verified", dns: "valid" }),
      );
      fetchWithPinnedDns.mockResolvedValue({ status, headers: {}, body: Buffer.from("no") });

      const result = await activateCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

      expect(result.ok).toBe(false);
      expect(setProjectVerifiedCustomDomain).not.toHaveBeenCalled();
      expect(setLatestDeploymentLiveUrlForChat).not.toHaveBeenCalled();
      expect(removeDomainFromProject).not.toHaveBeenCalled();
    },
  );

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
    if (result.ok) {
      expect(result.snapshot.redirectArmed).toBe(true);
      expect(result.snapshot.canArmRedirect).toBe(false);
    }
  });

  it("does not claim redirect is active when the PATCH fails, and leaves retry open", async () => {
    observeVercelDomain.mockImplementation(async ({ domain }: { domain: string }) =>
      observation(domain, { ownership: "verified", dns: "valid" }),
    );
    fetchWithPinnedDns.mockResolvedValue({ status: 200, headers: {}, body: Buffer.from("ok") });
    updateProjectDomainRedirect.mockRejectedValue(new Error("502 from provider"));

    const result = await activateCustomerDomain({ hosting: HOSTING, domain: "exempel.se" });

    expect(result.ok).toBe(true);
    expect(setProjectVerifiedCustomDomain).toHaveBeenCalledWith("proj_1", "exempel.se");
    if (result.ok) {
      expect(result.snapshot.redirectArmed).toBe(false);
      expect(result.snapshot.canArmRedirect).toBe(true);
      expect(result.snapshot.message).toMatch(/omdirigeringen kunde inte/i);
    }
  });
});

describe("unlinkCustomerDomain", () => {
  it("removes the apex/www pair at the provider before clearing live advertising", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(true);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(clearProjectCustomDomainVerification).toHaveBeenCalledWith("proj_1", "exempel.se");
    expect(clearProjectCustomDomain).toHaveBeenCalledWith("proj_1", "exempel.se");
    const removedAt = Math.min(...removeDomainFromProject.mock.invocationCallOrder);
    const clearedAt = clearProjectCustomDomainVerification.mock.invocationCallOrder[0];
    expect(removedAt).toBeLessThan(clearedAt);
  });

  it("does not change verification when provider remove fails", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    removeDomainFromProject.mockResolvedValue({ removed: false, unknown: true });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
  });

  it("removes an unfinished candidate host without touching the live address", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING, domain: "ny.se" });

    expect(result.ok).toBe(true);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "ny.se", undefined);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "www.ny.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    if (result.ok) expect(result.snapshot.message).toMatch(/oförändrad/i);
  });

  it.each([
    ["exempel.se", "www.exempel.se"],
    ["www.exempel.se", "exempel.se"],
    ["exempel.co.uk", "www.exempel.co.uk"],
  ])("treats typed %s as the live pair stored as %s and runs the full unlink", async (typed, stored) => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: stored,
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING, domain: typed });

    expect(result.ok).toBe(true);
    const storedPair = stored.startsWith("www.") ? stored.slice(4) : stored;
    const www = stored.startsWith("www.") ? stored : `www.${stored}`;
    const apex = storedPair;
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", apex, undefined);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", www, undefined);
    expect(clearProjectCustomDomainVerification).toHaveBeenCalledWith("proj_1", stored);
    expect(clearProjectCustomDomain).toHaveBeenCalledWith("proj_1", stored);
  });

  it("does not treat a subdomain as the live pair", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });

    const result = await unlinkCustomerDomain({ hosting: HOSTING, domain: "shop.exempel.se" });

    expect(result.ok).toBe(true);
    expect(removeDomainFromProject).toHaveBeenCalledWith("vp_owned", "shop.exempel.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "exempel.se", undefined);
    expect(removeDomainFromProject).not.toHaveBeenCalledWith("vp_owned", "www.exempel.se", undefined);
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
  });

  it("leaves verification untouched when the second host in the pair fails", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    removeDomainFromProject
      .mockResolvedValueOnce({ removed: true, unknown: false })
      .mockResolvedValueOnce({ removed: false, unknown: true });

    const result = await unlinkCustomerDomain({ hosting: HOSTING });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    expect(clearProjectCustomDomainVerification).not.toHaveBeenCalled();
  });

  it("resumes unlink after a partial remove and treats already-removed as done", async () => {
    getProjectById.mockResolvedValue({
      id: "proj_1",
      custom_domain: "exempel.se",
      custom_domain_verified_at: new Date("2026-09-01"),
      published_slug: "kund",
    });
    removeDomainFromProject
      .mockResolvedValueOnce({ removed: true, unknown: false })
      .mockResolvedValueOnce({ removed: false, unknown: true })
      .mockResolvedValueOnce({ removed: true, unknown: false })
      .mockResolvedValueOnce({ removed: true, unknown: false });

    const first = await unlinkCustomerDomain({ hosting: HOSTING });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.status).toBe(503);
    expect(clearProjectCustomDomain).not.toHaveBeenCalled();
    expect(first.ok === false && first.snapshot?.hostResults).toEqual(
      expect.arrayContaining([
        { domain: "exempel.se", outcome: "ok" },
        { domain: "www.exempel.se", outcome: "failed" },
      ]),
    );

    const retry = await unlinkCustomerDomain({ hosting: HOSTING });
    expect(retry.ok).toBe(true);
    expect(clearProjectCustomDomain).toHaveBeenCalledWith("proj_1", "exempel.se");
  });
});
