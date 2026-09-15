import { beforeEach, describe, expect, it, vi } from "vitest";

const selectLimit = vi.hoisted(() => vi.fn());
const updateWhere = vi.hoisted(() => vi.fn());
const updateReturning = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        // `where().limit()` (setDeploymentDomainForRequest),
        // `where().orderBy().limit()` (getLinkedDomainForChat /
        // getLinkedDomainProjectIdForChat) OCH `where().orderBy()` utan
        // `.limit()` (getLatestVercelProjectIdForChat) delar samma
        // `selectLimit`-mock — varje test köar sina egna returvärden med
        // `mockResolvedValueOnce` i anropsordning. `.orderBy()`s returvärde
        // är ett lat "thenable": `.then()` triggar `selectLimit()` bara om
        // den awaitas DIREKT (inget efterföljande `.limit()`), så en kedja
        // som ANROPAR `.limit(n)` konsumerar inte av misstag en extra kö-post.
        where: () => ({
          limit: selectLimit,
          orderBy: () => ({
            limit: selectLimit,
            then: (
              resolve: (value: unknown) => void,
              reject: (reason: unknown) => void,
            ) => selectLimit().then(resolve, reject),
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        // `where(...)` är awaitable (domän-helpers + non-error status-write)
        // OCH exponerar `.returning()` (error-transitionens villkorliga claim).
        where: (...args: unknown[]) =>
          Object.assign(Promise.resolve(updateWhere(...args)), {
            returning: updateReturning,
          }),
      }),
    }),
  },
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getChatByIdForRequest,
}));

const {
  setDeploymentDomainForRequest,
  getLinkedDomainForChat,
  getLatestReadyDeploymentIdentityForChat,
  pickProductionReadyIdentity,
  updateDeploymentStatus,
  resolveCanonicalVercelProjectForDomain,
} = await import("./deployment");

function req() {
  return new Request("http://localhost/api/domains/save", { method: "POST" });
}

describe("setDeploymentDomainForRequest (A#3: engine + legacy chat resolution)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit.mockResolvedValue([{ chatId: "engine_chat_1" }]);
    updateWhere.mockResolvedValue({ rowCount: 1 });
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue(null);
  });

  it("returns false when the deployment row does not exist", async () => {
    selectLimit.mockResolvedValue([]);

    const result = await setDeploymentDomainForRequest(req(), "dep_missing", "site.example");

    expect(result).toBe(false);
    expect(updateWhere).not.toHaveBeenCalled();
  });

  // Core of A#3: own-engine deployments store an engine_chats.id in
  // deployments.chat_id, so the domain save must authorize via the engine
  // lookup (previously it used the legacy-only lookup and 404'd every time).
  it("saves the domain when the deployment's chat resolves as an owned engine chat", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "engine_chat_1", project_id: "proj_1" });

    const result = await setDeploymentDomainForRequest(req(), "dep_1", "site.example");

    expect(result).toBe(true);
    expect(getEngineChatByIdForRequest).toHaveBeenCalledTimes(1);
    // No need to fall back to the legacy lookup once the engine chat is owned.
    expect(getChatByIdForRequest).not.toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("still authorizes legacy v0-era deployments via the legacy chat lookup", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue({ id: "legacy_chat_1" });

    const result = await setDeploymentDomainForRequest(req(), "dep_legacy", "site.example");

    expect(result).toBe(true);
    expect(getChatByIdForRequest).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("returns false (no write) when neither engine nor legacy chat is owned by the caller", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue(null);

    const result = await setDeploymentDomainForRequest(req(), "dep_foreign", "site.example");

    expect(result).toBe(false);
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("returns false when the update affects no rows", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "engine_chat_1", project_id: "proj_1" });
    updateWhere.mockResolvedValue({ rowCount: 0 });

    const result = await setDeploymentDomainForRequest(req(), "dep_1", "site.example");

    expect(result).toBe(false);
  });
});

// A2 (Ö2): read-helper som deploy-route:n använder för projektnamn-låset. Den
// returnerar senaste icke-null `deployments.domain` för chatten, eller null.
describe("getLinkedDomainForChat (A2: domain project-name lock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the chat has no domain-carrying deployment", async () => {
    selectLimit.mockResolvedValue([]);

    const result = await getLinkedDomainForChat("chat_1");

    expect(result).toBeNull();
  });

  it("returns the latest linked domain for the chat", async () => {
    selectLimit.mockResolvedValue([{ domain: "mysite.example" }]);

    const result = await getLinkedDomainForChat("chat_1");

    expect(result).toBe("mysite.example");
  });

  it("treats a whitespace-only domain value as no linked domain", async () => {
    selectLimit.mockResolvedValue([{ domain: "   " }]);

    const result = await getLinkedDomainForChat("chat_1");

    expect(result).toBeNull();
  });
});

describe("pickProductionReadyIdentity", () => {
  const production = {
    url: "https://demo.vercel.app",
    providerUrl: "https://demo.vercel.app",
    vercelProjectId: "vp_1",
  };
  const preview = {
    url: "https://demo-git-feat-x-team.vercel.app",
    providerUrl: "https://demo-git-feat-x-team.vercel.app",
    vercelProjectId: "vp_1",
  };

  it("skips a newer preview READY and keeps the production identity", () => {
    expect(
      pickProductionReadyIdentity([preview, production], {
        vercelProjectId: "vp_1",
        attestedProductionHost: "demo.vercel.app",
      }),
    ).toEqual(production);
  });

  it("keeps an older READY row that lacks vercelProjectId when the host matches", () => {
    expect(
      pickProductionReadyIdentity(
        [{ ...production, vercelProjectId: null }],
        { vercelProjectId: "vp_1", attestedProductionHost: "demo.vercel.app" },
      ),
    ).toEqual({ ...production, vercelProjectId: null });
  });

  it("keeps an older custom-host READY only when that host is currently verified", () => {
    const custom = {
      url: "https://www.kund.se",
      providerUrl: "https://demo.vercel.app",
      vercelProjectId: null,
    };
    expect(
      pickProductionReadyIdentity([custom], {
        vercelProjectId: "vp_1",
        verifiedCustomerHosts: ["www.kund.se"],
      }),
    ).toEqual(custom);
    expect(pickProductionReadyIdentity([custom], { vercelProjectId: "vp_1" })).toBeNull();
    expect(
      pickProductionReadyIdentity([custom], {
        vercelProjectId: "vp_1",
        attestedProductionHost: "demo.vercel.app",
      }),
    ).toEqual(custom);
  });

  it("rejects an unverified branded last-working host", () => {
    const branded = {
      url: "https://demo.sites.sajtmaskin.se",
      providerUrl: "https://demo.vercel.app",
      vercelProjectId: "vp_1",
    };
    expect(pickProductionReadyIdentity([branded], { vercelProjectId: "vp_1" })).toBeNull();
    expect(
      pickProductionReadyIdentity([branded], {
        vercelProjectId: "vp_1",
        attestedProductionHost: "demo.vercel.app",
      }),
    ).toEqual(branded);
  });

  it("keeps a last-working provider alias while the attested alias is unknown", () => {
    expect(
      pickProductionReadyIdentity([production], {
        vercelProjectId: "vp_1",
        allowLastWorkingProvider: true,
      }),
    ).toEqual(production);
  });

  it("rejects an older vercel.app READY that does not match the attested alias", () => {
    expect(
      pickProductionReadyIdentity(
        [{ ...production, vercelProjectId: null }],
        { vercelProjectId: "vp_1", attestedProductionHost: "other.vercel.app" },
      ),
    ).toBeNull();
  });

  it("rejects a per-deployment READY even when vercelProjectId matches", () => {
    expect(
      pickProductionReadyIdentity(
        [
          {
            url: "https://demo-a1b2c3-team.vercel.app",
            providerUrl: "https://demo-a1b2c3-team.vercel.app",
            vercelProjectId: "vp_1",
          },
        ],
        { vercelProjectId: "vp_1", attestedProductionHost: "demo.vercel.app" },
      ),
    ).toBeNull();
  });

  it("rejects the attested alias when it belongs to another project host", () => {
    expect(
      pickProductionReadyIdentity([production], {
        vercelProjectId: "vp_1",
        attestedProductionHost: "annat.vercel.app",
      }),
    ).toBeNull();
  });

  it("accepts the attested production alias", () => {
    expect(
      pickProductionReadyIdentity([production], {
        vercelProjectId: "vp_1",
        attestedProductionHost: "demo.vercel.app",
      }),
    ).toEqual(production);
  });
});

describe("getLatestReadyDeploymentIdentityForChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the latest production READY and skips a newer preview READY", async () => {
    selectLimit.mockResolvedValue([
      {
        url: "https://demo-git-feat-x-team.vercel.app",
        providerUrl: "https://demo-git-feat-x-team.vercel.app",
        vercelProjectId: "vp_1",
      },
      {
        url: "https://www.kund.se",
        providerUrl: "https://kund-project.vercel.app",
        vercelProjectId: "vp_1",
      },
    ]);
    await expect(
      getLatestReadyDeploymentIdentityForChat("chat_1", {
        vercelProjectId: "vp_1",
        verifiedCustomerHosts: ["www.kund.se"],
      }),
    ).resolves.toEqual({
      url: "https://www.kund.se",
      providerUrl: "https://kund-project.vercel.app",
      vercelProjectId: "vp_1",
    });
  });
});

// BB#deploy2: `updateDeploymentStatus` reports whether THIS call atomically
// flipped the row to `error`, so the webhook and the SSE-poll can log a build
// failure exactly once instead of both logging on `status === "error"`.
describe("updateDeploymentStatus (BB#deploy2: atomic error-transition claim)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateWhere.mockResolvedValue(undefined);
    updateReturning.mockResolvedValue([]);
  });

  it("reports transitionedToError=true when the conditional claim wins a row", async () => {
    updateReturning.mockResolvedValue([{ id: "dep_1" }]);

    const result = await updateDeploymentStatus("dep_1", "error", {
      inspectorUrl: "https://vercel.com/i/dep_1",
    });

    expect(result.transitionedToError).toBe(true);
    // The transition claim used the RETURNING path; no separate metadata write.
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("reports transitionedToError=false when the row is already error (claim returns no rows)", async () => {
    updateReturning.mockResolvedValue([]);

    const result = await updateDeploymentStatus("dep_1", "error", {
      inspectorUrl: "https://vercel.com/i/dep_1",
    });

    expect(result.transitionedToError).toBe(false);
    // Late metadata still merged via a second unconditional update.
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(2);
  });

  it("skips the metadata merge on a duplicate error with no extra metadata", async () => {
    updateReturning.mockResolvedValue([]);

    const result = await updateDeploymentStatus("dep_1", "error");

    expect(result.transitionedToError).toBe(false);
    // Only the claim's where() ran; nothing extra to persist.
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("never reports a transition for a non-error status (unconditional write)", async () => {
    const result = await updateDeploymentStatus("dep_1", "ready", {
      url: "https://site.vercel.app",
    });

    expect(result.transitionedToError).toBe(false);
    // Non-error path does not use the conditional RETURNING claim.
    expect(updateReturning).not.toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});

// #519 bugbot round 3: ONE canonical priority for "which domain is linked" +
// "which project id does that domain's hosting resolve to" — the deploy
// route's POST lock/deploy-target and GET recheck both key off this so they
// can never diverge again (bugbot finding 1: a stale legacy `deployments.domain`
// row could otherwise win project-id resolution even for an app_projects-owned
// custom/branded domain).
describe("resolveCanonicalVercelProjectForDomain (#519 bugbot round 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a verified custom domain wins and resolves the GENERIC project id — never touches the legacy row", async () => {
    // Only ONE db read expected (the generic `getLatestVercelProjectIdForChat`
    // lookup) — the legacy-row queries must never run for an app_projects
    // -owned domain, even if a legacy row exists with different data.
    selectLimit.mockResolvedValueOnce([{ vercelProjectId: "vp_generic", status: "ready" }]);

    const result = await resolveCanonicalVercelProjectForDomain("chat_1", {
      vercel_project_id: "vp_cache",
      custom_domain: "kund.example",
      custom_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
    });

    expect(result).toEqual({
      domain: "kund.example",
      source: "custom",
      projectId: "vp_generic",
    });
    expect(selectLimit).toHaveBeenCalledTimes(1);
  });

  it("a verified branded domain wins and resolves the GENERIC project id — never touches the legacy row", async () => {
    selectLimit.mockResolvedValueOnce([]);

    const result = await resolveCanonicalVercelProjectForDomain("chat_1", {
      vercel_project_id: "vp_cache",
      branded_domain: "demo.sites.sajtmaskin.se",
      branded_domain_verified_at: new Date("2026-07-10T00:00:00Z"),
    });

    expect(result).toEqual({
      domain: "demo.sites.sajtmaskin.se",
      source: "branded",
      // No `ready`-carrying deployment row → falls back to the app_projects
      // cache passed in.
      projectId: "vp_cache",
    });
    expect(selectLimit).toHaveBeenCalledTimes(1);
  });

  it("the legacy row's OWN project id wins over a diverging latest-deployment-overall id", async () => {
    selectLimit
      .mockResolvedValueOnce([{ domain: "mysite.example" }]) // getLinkedDomainForChat
      .mockResolvedValueOnce([{ vercelProjectId: "vp_domain_row" }]); // getLinkedDomainProjectIdForChat

    const result = await resolveCanonicalVercelProjectForDomain("chat_1", {
      vercel_project_id: "vp_cache",
    });

    expect(result).toEqual({
      domain: "mysite.example",
      source: "legacy-row",
      projectId: "vp_domain_row",
    });
    // The generic fallback (getLatestVercelProjectIdForChat) must NOT have
    // been consulted — the legacy row's own id was sufficient.
    expect(selectLimit).toHaveBeenCalledTimes(2);
  });

  it("falls back to the generic order when the legacy row predates the project-id column", async () => {
    selectLimit
      .mockResolvedValueOnce([{ domain: "mysite.example" }]) // getLinkedDomainForChat
      .mockResolvedValueOnce([]) // getLinkedDomainProjectIdForChat: no id on the row
      .mockResolvedValueOnce([{ vercelProjectId: "vp_generic", status: "ready" }]); // generic fallback

    const result = await resolveCanonicalVercelProjectForDomain("chat_1", {
      vercel_project_id: "vp_cache",
    });

    expect(result).toEqual({
      domain: "mysite.example",
      source: "legacy-row",
      projectId: "vp_generic",
    });
    expect(selectLimit).toHaveBeenCalledTimes(3);
  });

  it("resolves 'none' + the generic order when no domain is linked at all", async () => {
    selectLimit
      .mockResolvedValueOnce([]) // getLinkedDomainForChat: no row
      .mockResolvedValueOnce([]); // generic fallback: no deployment row → cache wins

    const result = await resolveCanonicalVercelProjectForDomain("chat_1", {
      vercel_project_id: "vp_cache",
    });

    expect(result).toEqual({
      domain: null,
      source: "none",
      projectId: "vp_cache",
    });
  });
});
