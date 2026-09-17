import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return { ...actual, safeFetch };
});

import { GITHUB_IMPORT_USER_AGENT, MAX_GITHUB_TREE_SEGMENTS } from "./import-init-contract";
import { ImportInitError } from "./github-import-errors";
import {
  assertPrivateGithubAccess,
  downloadGithubZipBuffer,
  fetchGithubRepoMeta,
  githubImportHeaders,
  resolveGithubImport,
} from "./github-import-transport";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("githubImportHeaders", () => {
  it("sets an explicit User-Agent and only adds Authorization when a token exists", () => {
    expect(githubImportHeaders(null)["User-Agent"]).toBe(GITHUB_IMPORT_USER_AGENT);
    expect(githubImportHeaders(null).Authorization).toBeUndefined();
    expect(githubImportHeaders("tok_1").Authorization).toBe("Bearer tok_1");
  });
});

describe("fetchGithubRepoMeta", () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it("sends User-Agent on the actual GitHub request", async () => {
    safeFetch.mockResolvedValueOnce(jsonResponse({ private: false, default_branch: "main" }));

    await fetchGithubRepoMeta({ owner: "acme", repo: "site" }, null);

    expect(safeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = safeFetch.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(url).toBe("https://api.github.com/repos/acme/site");
    expect(init.headers?.["User-Agent"]).toBe(GITHUB_IMPORT_USER_AGENT);
    expect(init.headers?.Authorization).toBeUndefined();
  });

  it.each([
    [401, "github_auth_required"],
    [403, "github_forbidden"],
    [404, "github_not_found"],
    [429, "github_rate_limited"],
  ] as const)("preserves metadata HTTP %s instead of inventing a missing branch", async (status, code) => {
    safeFetch.mockResolvedValueOnce(new Response("nope", { status }));

    await expect(fetchGithubRepoMeta({ owner: "acme", repo: "private-site" }, "tok")).rejects.toMatchObject({
      code,
      step: "github_meta",
    });
  });

  it("maps a timeout to github_timeout", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    safeFetch.mockRejectedValueOnce(abortError);

    await expect(fetchGithubRepoMeta({ owner: "acme", repo: "site" })).rejects.toMatchObject({
      code: "github_timeout",
    });
  });
});

describe("resolveGithubImport", () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it("resolves feature/new-ui as a complete branch and binds a commit SHA", async () => {
    safeFetch
      .mockResolvedValueOnce(jsonResponse({ private: false, default_branch: "main" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "deadbeefcafebabe" }));

    const resolved = await resolveGithubImport({
      url: "https://github.com/acme/site/tree/feature/new-ui",
    });

    expect(resolved).toMatchObject({
      repo: { owner: "acme", repo: "site" },
      branch: "feature/new-ui",
      commitSha: "deadbeefcafebabe",
    });
    const commitUrl = safeFetch.mock.calls[1]?.[0] as string;
    expect(commitUrl).toContain("/commits/feature%2Fnew-ui");
  });

  it("rejects a /tree/branch/dir link instead of silently importing the whole repo", async () => {
    safeFetch
      .mockResolvedValueOnce(jsonResponse({ private: false, default_branch: "main" }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ sha: "aaa111" }));

    await expect(
      resolveGithubImport({
        url: "https://github.com/acme/site/tree/main/packages/web",
      }),
    ).rejects.toMatchObject({
      code: "github_subdir_unsupported",
    });
  });

  it("rejects a long /tree/a/b/c/... URL before any GitHub request", async () => {
    const segments = Array.from({ length: MAX_GITHUB_TREE_SEGMENTS + 1 }, (_, index) => `s${index}`);
    await expect(
      resolveGithubImport({
        url: `https://github.com/acme/site/tree/${segments.join("/")}`,
      }),
    ).rejects.toMatchObject({
      code: "github_url_invalid",
      step: "parse",
    });
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("does not treat a metadata 404 as a missing branch", async () => {
    safeFetch.mockResolvedValueOnce(new Response("missing", { status: 404 }));

    await expect(
      resolveGithubImport({
        url: "https://github.com/acme/missing",
        explicitBranch: "main",
      }),
    ).rejects.toMatchObject({
      code: "github_not_found",
      step: "github_meta",
    });
  });

  it("retries a public repo without Authorization after a stale token 401", async () => {
    safeFetch
      .mockResolvedValueOnce(new Response("bad credentials", { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ private: false, default_branch: "main" }))
      .mockResolvedValueOnce(jsonResponse({ sha: "abc1234" }));

    const resolved = await resolveGithubImport({
      url: "https://github.com/acme/site",
      token: "stale-token",
    });

    expect(resolved).toMatchObject({
      repo: { owner: "acme", repo: "site" },
      branch: "main",
      commitSha: "abc1234",
      private: false,
      accessToken: null,
    });
    expect(safeFetch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer stale-token" }),
      }),
    );
    expect(safeFetch.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    );
    expect(safeFetch.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    );
  });

  it("keeps the auth error when a stale token cannot see a private repo", async () => {
    safeFetch
      .mockResolvedValueOnce(new Response("bad credentials", { status: 401 }))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));

    await expect(
      resolveGithubImport({
        url: "https://github.com/acme/private-site",
        token: "stale-token",
      }),
    ).rejects.toMatchObject({
      code: "github_auth_required",
      step: "github_meta",
    });
  });
});

describe("assertPrivateGithubAccess", () => {
  it("rejects a private repo when the user has no GitHub token", () => {
    expect(() => assertPrivateGithubAccess({ isPrivate: true, token: null })).toThrowError(
      /Anslut GitHub/,
    );
    expect(() => assertPrivateGithubAccess({ isPrivate: false, token: null })).not.toThrow();
  });
});

describe("downloadGithubZipBuffer", () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it("downloads a private zipball with User-Agent and Authorization", async () => {
    safeFetch.mockResolvedValueOnce(new Response(Buffer.from("PK\u0003\u0004"), { status: 200 }));

    await downloadGithubZipBuffer({
      repo: { owner: "acme", repo: "private-site" },
      commitSha: "abc1234",
      token: "secret-token",
    });

    const [url, init] = safeFetch.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(url).toBe("https://api.github.com/repos/acme/private-site/zipball/abc1234");
    expect(init.headers?.["User-Agent"]).toBe(GITHUB_IMPORT_USER_AGENT);
    expect(init.headers?.Authorization).toBe("Bearer secret-token");
  });

  it("does not attach Authorization to a public archive download", async () => {
    safeFetch.mockResolvedValueOnce(new Response(Buffer.from("PK\u0003\u0004"), { status: 200 }));

    await downloadGithubZipBuffer({
      repo: { owner: "acme", repo: "site" },
      commitSha: "abc1234",
    });

    const [url, init] = safeFetch.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(url).toBe("https://github.com/acme/site/archive/abc1234.zip");
    expect(init.headers?.["User-Agent"]).toBe(GITHUB_IMPORT_USER_AGENT);
    expect(init.headers?.Authorization).toBeUndefined();
  });

  it("throws ImportInitError on SSRF-blocked ZIP URLs", async () => {
    await expect(
      import("./github-import-transport").then((mod) =>
        mod.downloadZipBufferFromUrl({
          url: "http://169.254.169.254/latest/meta-data",
          maxBytes: 1024,
        }),
      ),
    ).rejects.toBeInstanceOf(ImportInitError);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
