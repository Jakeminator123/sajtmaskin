import { afterEach, describe, expect, it, vi } from "vitest";
import { commitExportToGitHub, GitHubExportPrivateRepoRequiredError } from "./git-data-export";

type Visibility = boolean | undefined;

function installGitHubMock(existingPrivate: Visibility, exists = true, createdPrivate?: Visibility) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const repo = (visibility: Visibility) => ({
    full_name: "sites/site-1", html_url: "https://github.com/sites/site-1",
    default_branch: "main", private: visibility,
  });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "GET" && path === "/repos/sites/site-1") {
      return exists ? Response.json(repo(existingPrivate)) : Response.json({}, { status: 404 });
    }
    if (method === "POST" && path === "/orgs/sites/repos") return Response.json(repo(createdPrivate), { status: 201 });
    if (method === "GET" && path.endsWith("/git/refs/heads/main")) return Response.json({ object: { sha: "base" } });
    if (method === "GET" && path.endsWith("/git/commits/base")) return Response.json({ sha: "base", tree: { sha: "base-tree" } });
    if (method === "GET" && path.endsWith("/git/trees/base-tree")) return Response.json({ tree: [], truncated: false });
    if (method === "POST" && path.endsWith("/git/trees")) return Response.json({ sha: "new-tree" });
    if (method === "POST" && path.endsWith("/git/commits")) return Response.json({ sha: "new-commit" });
    if (method === "PATCH" && path.endsWith("/git/refs/heads/main")) return Response.json({ object: { sha: "new-commit" } });
    throw new Error(`Unexpected local mock call ${method} ${path}`);
  }));
  return calls;
}

function publish(requirePrivate = true, isPrivate = true) {
  return commitExportToGitHub({
    token: "mock-only", owner: "sites", repo: "site-1", ownerIsOrg: true,
    isPrivate, ...(requirePrivate ? { requirePrivate: true } : {}),
    files: [{ path: "src/server.ts", content: "customer-private-source" }],
    commitMessage: "privacy-test", textTransport: "inline",
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("automatic backup private-repository contract", () => {
  it.each([false, undefined])("rejects existing private=%s before any write", async visibility => {
    const calls = installGitHubMock(visibility);
    await expect(publish()).rejects.toBeInstanceOf(GitHubExportPrivateRepoRequiredError);
    expect(calls.every(call => call.method === "GET")).toBe(true);
  });

  it.each([false, undefined])("rejects an unconfirmed new repo private=%s before source writes", async visibility => {
    const calls = installGitHubMock(undefined, false, visibility);
    await expect(publish()).rejects.toBeInstanceOf(GitHubExportPrivateRepoRequiredError);
    const writes = calls.filter(call => call.method !== "GET");
    expect(writes).toEqual([{ method: "POST", path: "/orgs/sites/repos", body: { name: "site-1", private: true, auto_init: false } }]);
  });

  it("commits to an existing confirmed private repo", async () => {
    const calls = installGitHubMock(true);
    await expect(publish()).resolves.toMatchObject({ commitSha: "new-commit" });
    expect(calls.some(call => call.method === "PATCH")).toBe(true);
  });

  it("creates and commits to a confirmed private repo", async () => {
    const calls = installGitHubMock(undefined, false, true);
    await expect(publish()).resolves.toMatchObject({ commitSha: "new-commit", created: true });
    expect(calls.some(call => call.method === "PATCH")).toBe(true);
  });

  it("preserves a user-requested public export when the private requirement is omitted", async () => {
    const calls = installGitHubMock(false);
    await expect(publish(false, false)).resolves.toMatchObject({ commitSha: "new-commit", repo: { private: false } });
    expect(calls.some(call => call.method === "PATCH")).toBe(true);
  });
});
