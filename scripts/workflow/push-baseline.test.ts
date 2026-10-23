import { describe, expect, it, vi } from "vitest";
import { listWorkflowRunsForCommit, verifiedPushBaseline } from "./push-baseline.mjs";

const sha = "a".repeat(40);
const run = {
  id: 7, head_sha: sha, head_branch: "preview", event: "push", path: ".github/workflows/ci.yml",
  head_repository: { full_name: "owner/repo" }, status: "completed", conclusion: "success",
};
const input = { repository: "owner/repo", sha, token: "test-token", workflow: "ci.yml" };

/** Commit check-runs named scope → run ids → one run object per id. */
function github(runs: Array<Record<string, unknown>>, checkRuns?: unknown[]) {
  return vi.fn<typeof fetch>(async (url) => {
    const path = String(url);
    if (path.includes(`/commits/${sha}/check-runs?`)) {
      const list = checkRuns ?? runs.map((entry) => ({
        app: { slug: "github-actions" },
        details_url: `https://github.com/owner/repo/actions/runs/${entry.id}/job/${Number(entry.id) * 10}`,
      }));
      return new Response(JSON.stringify({ total_count: list.length, check_runs: list }));
    }
    const match = /\/actions\/runs\/(\d+)$/u.exec(path);
    const found = match && runs.find((entry) => String(entry.id) === match[1]);
    return found ? new Response(JSON.stringify(found)) : new Response(null, { status: 404 });
  });
}

describe("verified incremental push baseline", () => {
  it("requires the newest exact native preview push, found via the commit's scope check runs", async () => {
    const fetchImpl = github([run]);
    expect(await verifiedPushBaseline({ ...input, fetchImpl })).toBe(true);
    // The runs search endpoint returned 0 hits for green runs (2026-10-22); never use it.
    expect(String(fetchImpl.mock.calls[0][0])).toContain(`/commits/${sha}/check-runs?check_name=scope&filter=all`);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/actions/workflows/"))).toBe(false);
  });
  it.each([
    { status: "in_progress", conclusion: null },
    { status: "queued", conclusion: null },
    { conclusion: "failure" }, { conclusion: "cancelled" }, { conclusion: "skipped" },
    { head_sha: "b".repeat(40) }, { head_branch: "master" }, { event: "pull_request" },
    { path: ".github/workflows/imposter.yml" }, { head_repository: { full_name: "other/repo" } },
  ])("does not let an unverified predecessor unlock shortcuts: %j", async (change) => {
    expect(await verifiedPushBaseline({ ...input, fetchImpl: github([{ ...run, ...change }]) })).toBe(false);
  });
  it("lets the newest push run decide, even when an older one was green", async () => {
    const newerFailed = { ...run, id: 9, conclusion: "failure" };
    expect(await verifiedPushBaseline({ ...input, fetchImpl: github([run, newerFailed]) })).toBe(false);
    const newerGreen = { ...run, id: 9 };
    expect(await verifiedPushBaseline({ ...input, fetchImpl: github([{ ...run, conclusion: "failure" }, newerGreen]) })).toBe(true);
    const prRunOnSameCommit = { ...run, id: 9, event: "pull_request", conclusion: "failure" };
    expect(await verifiedPushBaseline({ ...input, fetchImpl: github([run, prRunOnSameCommit]) })).toBe(true);
  });
  it("fails closed for unavailable, malformed, truncated or foreign listings and missing credentials", async () => {
    expect(await verifiedPushBaseline({ ...input, fetchImpl: github([]) })).toBe(false);
    expect(await verifiedPushBaseline({
      ...input,
      fetchImpl: github([run], [{ app: { slug: "other-ci" }, details_url: "https://github.com/owner/repo/actions/runs/7/job/70" }]),
    })).toBe(false);
    expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => new Response(null, { status: 403 }) })).toBe(false);
    expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => new Response("invalid JSON") })).toBe(false);
    expect(await verifiedPushBaseline({
      ...input, fetchImpl: async () => new Response(JSON.stringify({ total_count: 101, check_runs: [] })),
    })).toBe(false);
    expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => { throw new Error("timeout"); } })).toBe(false);
    expect(await verifiedPushBaseline({ ...input, token: "" })).toBe(false);
  });
  it("lists only the requested workflow's runs, newest first, and rejects a mismatched run lookup", async () => {
    const dossier = { ...run, id: 8, path: ".github/workflows/dossier-acceptance.yml" };
    const newer = { ...run, id: 9 };
    const api = { apiUrl: "https://api.github.com", repository: "owner/repo", token: "t", sha, workflow: "ci.yml" };
    const runs = await listWorkflowRunsForCommit({ ...api, fetchImpl: github([run, dossier, newer]) });
    expect(runs.map((entry: { id: number }) => entry.id)).toEqual([9, 7]);
    const lying = vi.fn<typeof fetch>(async (url) => String(url).includes("/check-runs?")
      ? new Response(JSON.stringify({
        total_count: 1,
        check_runs: [{ app: { slug: "github-actions" }, details_url: "https://github.com/owner/repo/actions/runs/7/job/70" }],
      }))
      : new Response(JSON.stringify({ ...run, id: 99 })));
    await expect(listWorkflowRunsForCommit({ ...api, fetchImpl: lying })).rejects.toThrow("another run");
  });
  it("fails closed on an unrecognised Actions details_url instead of hiding a newer run", async () => {
    const newer = { ...run, id: 9, conclusion: "failure" };
    const checkRuns = [
      { app: { slug: "github-actions" }, details_url: "https://github.com/owner/repo/actions/runs/7/job/70" },
      { app: { slug: "github-actions" }, details_url: "https://github.com/owner/repo/actions/runs/9/job/90?pr=5" },
    ];
    expect(await verifiedPushBaseline({ ...input, fetchImpl: github([run, newer], checkRuns) })).toBe(false);
    await expect(listWorkflowRunsForCommit({
      apiUrl: "https://api.github.com", repository: "owner/repo", token: "t", sha, workflow: "ci.yml",
      fetchImpl: github([run, newer], checkRuns),
    })).rejects.toThrow("details_url");
  });
  it("de-duplicates re-run attempts and refuses commits with too many runs", async () => {
    const attempts = [70, 71, 72].map((job) => ({
      app: { slug: "github-actions" }, details_url: `https://github.com/owner/repo/actions/runs/7/job/${job}`,
    }));
    const fetchImpl = github([run], attempts);
    expect(await verifiedPushBaseline({ ...input, fetchImpl })).toBe(true);
    expect(fetchImpl.mock.calls.filter(([url]) => /\/actions\/runs\/7$/u.test(String(url)))).toHaveLength(1);
    const many = Array.from({ length: 17 }, (_, index) => ({ ...run, id: index + 1 }));
    expect(await verifiedPushBaseline({ ...input, fetchImpl: github(many) })).toBe(false);
  });
});
