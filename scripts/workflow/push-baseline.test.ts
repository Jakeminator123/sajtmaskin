import { describe, expect, it, vi } from "vitest";
import { verifiedPushBaseline } from "./push-baseline.mjs";

const sha = "a".repeat(40);
const run = {
  head_sha: sha, head_branch: "preview", event: "push", path: ".github/workflows/ci.yml",
  head_repository: { full_name: "owner/repo" }, status: "completed", conclusion: "success",
};
const input = { repository: "owner/repo", sha, token: "test-token", workflow: "ci.yml" };
const response = (runs: unknown) => new Response(JSON.stringify({ workflow_runs: runs }));

describe("verified incremental push baseline", () => {
  it("requires the latest exact native preview push, not any historical green run", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response([run]));
    expect(await verifiedPushBaseline({ ...input, fetchImpl })).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toContain(`event=push&head_sha=${sha}&per_page=1`);
    expect(fetchImpl.mock.calls[0][0]).not.toContain("status=success");
  });
  it.each([
    { status: "in_progress", conclusion: null },
    { status: "queued", conclusion: null },
    { conclusion: "failure" }, { conclusion: "cancelled" }, { conclusion: "skipped" },
    { head_sha: "b".repeat(40) }, { head_branch: "master" }, { event: "pull_request" },
    { path: ".github/workflows/imposter.yml" }, { head_repository: { full_name: "other/repo" } },
  ])("does not let an unverified predecessor unlock shortcuts: %j", async (change) => {
    expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => response([{ ...run, ...change }]) })).toBe(false);
  });
  it("fails closed for unavailable, malformed or empty API results and missing credentials", async () => {
    for (const runs of [[], null, [run, run], [{}]]) {
      expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => response(runs) })).toBe(false);
    }
    expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => new Response(null, { status: 403 }) })).toBe(false);
    expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => new Response("invalid JSON") })).toBe(false);
    expect(await verifiedPushBaseline({ ...input, fetchImpl: async () => { throw new Error("timeout"); } })).toBe(false);
    expect(await verifiedPushBaseline({ ...input, token: "" })).toBe(false);
  });
});
