import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildBrandedLiveDomain,
  getBrandedLiveSiteDomain,
  resolveLiveUrl,
  slugCandidate,
} from "./live-site-url";

const getVercelToken = vi.hoisted(() => vi.fn(() => "token"));
vi.mock("@/lib/vercel", () => ({ getVercelToken }));

const {
  buildGeneratedVercelProjectName,
  checkVercelProjectDomain,
  ensureVercelProject,
  ensureVercelProjectDomain,
} = await import("./vercelDeploy");

afterEach(() => {
  vi.unstubAllEnvs();
});

it("makes provider project names collision-safe across customer projects", () => {
  const first = buildGeneratedVercelProjectName("Min butik", "project_a");
  const second = buildGeneratedVercelProjectName("Min butik", "project_b");
  expect(first).toMatch(/^sajtmaskin-min-butik-[a-f0-9]{8}$/);
  expect(second).toMatch(/^sajtmaskin-min-butik-[a-f0-9]{8}$/);
  expect(first).not.toBe(second);
  expect(buildGeneratedVercelProjectName("!!!", "project_a")).toBe(
    buildGeneratedVercelProjectName("!!!", "project_a"),
  );
});

describe("branded live URL policy", () => {
  it("requires both rollout flag and base domain", () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "");
    expect(getBrandedLiveSiteDomain()).toBeNull();
    expect(buildBrandedLiveDomain("my-site")).toBeNull();
  });

  it("builds exact hostnames and reserves platform labels", () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "1");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    expect(buildBrandedLiveDomain("my-site")).toBe("my-site.sites.sajtmaskin.se");
    expect(buildBrandedLiveDomain("preview")).toBeNull();
  });

  it("resolves verified custom, branded and provider URL precedence", () => {
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    expect(
      resolveLiveUrl({
        customDomain: "kund.se",
        customDomainVerifiedAt: new Date(),
        brandedDomain: "kund.sites.sajtmaskin.se",
        brandedDomainVerifiedAt: new Date(),
        providerUrl: "kund.vercel.app",
      }),
    ).toBe("https://kund.se");
    expect(
      resolveLiveUrl({
        customDomain: "kund.se",
        customDomainVerifiedAt: null,
        brandedDomain: "kund.sites.sajtmaskin.se",
        brandedDomainVerifiedAt: new Date(),
        providerUrl: "kund.vercel.app",
      }),
    ).toBe("https://kund.sites.sajtmaskin.se");
    expect(
      resolveLiveUrl({
        brandedDomain: "kund.sites.sajtmaskin.se",
        brandedDomainVerifiedAt: null,
        providerUrl: "kund.vercel.app",
      }),
    ).toBe("https://kund.vercel.app");
  });

  it("enforces rollback gate and parent-zone ownership", () => {
    expect(
      resolveLiveUrl({
        brandedDomain: "kund.sites.sajtmaskin.se",
        brandedDomainVerifiedAt: new Date(),
        providerUrl: "kund.vercel.app",
      }),
    ).toBe("https://kund.vercel.app");
    vi.stubEnv("SAJTMASKIN_BRANDED_LIVE_URLS", "true");
    vi.stubEnv("SAJTMASKIN_LIVE_SITE_DOMAIN", "sites.sajtmaskin.se");
    expect(
      resolveLiveUrl({
        brandedDomain: "attacker.example.com",
        brandedDomainVerifiedAt: new Date(),
        providerUrl: "safe.vercel.app",
      }),
    ).toBe("https://safe.vercel.app");
  });

  it("normalizes provider URLs and stable slug candidates", () => {
    expect(resolveLiveUrl({ providerUrl: "https://kund.vercel.app" })).toBe(
      "https://kund.vercel.app",
    );
    expect(slugCandidate("Åäö Bistro!")).toBe("aao-bistro");
    expect(slugCandidate("Preview")).toBe("site");
  });
});

it("marks public builder previews as non-indexable and non-cacheable", () => {
  const source = readFileSync(
    resolve(process.cwd(), "preview-host/src/server.js"),
    "utf8",
  );
  expect(source).toContain(
    'res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive")',
  );
  expect(source).toContain(
    'res.setHeader("Cache-Control", "private, no-store")',
  );
});

describe("ensureVercelProjectDomain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds an exact branded hostname when absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ domains: [] }))
      .mockResolvedValueOnce(Response.json({ name: "bistro.sites.sajtmaskin.se", verified: true }))
      .mockResolvedValueOnce(Response.json({ misconfigured: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureVercelProjectDomain("prj_1", "bistro.sites.sajtmaskin.se"),
    ).resolves.toEqual({
      name: "bistro.sites.sajtmaskin.se",
      verified: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "bistro.sites.sajtmaskin.se" }),
    });
  });

  it("does not create a duplicate hostname already assigned to the project", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ domains: [{ name: "bistro.sites.sajtmaskin.se", verified: true }] }),
      )
      .mockResolvedValueOnce(Response.json({ misconfigured: false }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureVercelProjectDomain("prj_1", "bistro.sites.sajtmaskin.se"),
    ).resolves.toEqual({
      name: "bistro.sites.sajtmaskin.se",
      verified: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("ensureVercelProject", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses an existing generated project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ id: "prj_existing", name: "bistro" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureVercelProject("bistro")).resolves.toEqual({
      id: "prj_existing",
      name: "bistro",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates the project before first publish when missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { message: "not found" } }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ id: "prj_new", name: "bistro" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureVercelProject("bistro")).resolves.toEqual({
      id: "prj_new",
      name: "bistro",
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "bistro", framework: "nextjs" }),
    });
  });

  it("refuses to retarget a persisted customer project id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ id: "prj_other", name: "other" }),
      ),
    );
    await expect(
      ensureVercelProject("bistro", "prj_expected"),
    ).rejects.toThrow(/ownership mismatch/i);
  });

  it("reuses the winner of a parallel first-project creation race", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({}, { status: 404 }))
        .mockResolvedValueOnce(Response.json({}, { status: 409 }))
        .mockResolvedValueOnce(
          Response.json({ id: "prj_winner", name: "bistro" }),
        ),
    );

    await expect(ensureVercelProject("bistro")).resolves.toEqual({
      id: "prj_winner",
      name: "bistro",
    });
  });
});

describe("checkVercelProjectDomain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails closed when DNS configuration is no longer valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ domains: [{ name: "kund.se", verified: true }] }),
        )
        .mockResolvedValueOnce(Response.json({ misconfigured: true })),
    );
    await expect(checkVercelProjectDomain("prj_1", "kund.se")).resolves.toBe(false);
  });

  it("preserves last-known-good when provider status is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(checkVercelProjectDomain("prj_1", "kund.se")).resolves.toBeNull();
  });
});
