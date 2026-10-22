import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  applyReceipt,
  findMergedPreviewPullRequest,
  findReusableReceipt,
  formatReceipt,
  HEAVY_RECEIPT_JOBS,
  parseReceipt,
  readTestedCommit,
  RECEIPT_TITLE,
} from "./ci-receipt.mjs";
import { receiptProfile, resolveReceiptReuse } from "./ci-scope.mjs";

const repository = "owner/repo";
const head = "a".repeat(40);
const base = "b".repeat(40);
const tree = "c".repeat(40);
const otherTree = "d".repeat(40);

type Run = Record<string, unknown> & { id: number };
type Job = { name: string; status: string; conclusion: string; check_run_url?: string };

function run(id: number, change: Record<string, unknown> = {}): Run {
  return {
    id, head_sha: head, event: "pull_request", path: ".github/workflows/ci.yml",
    head_repository: { full_name: repository }, status: "completed", conclusion: "success",
    ...change,
  };
}

function heavyJobs(id: number, change: (jobs: Job[]) => Job[] = (jobs) => jobs): Job[] {
  return change(HEAVY_RECEIPT_JOBS.map((name) => ({
    name, status: "completed", conclusion: "success",
    ...(name === "scope" ? { check_run_url: `https://api.github.com/repos/${repository}/check-runs/${id}000` } : {}),
  })).concat([{ name: "prod-migrations-applied", status: "completed", conclusion: "skipped" }]));
}

function notice(message: string) {
  return { title: RECEIPT_TITLE, annotation_level: "notice", message };
}

function receipt(change: Partial<Parameters<typeof formatReceipt>[0]> = {}) {
  return formatReceipt({ head, base, tree, profile: "heavy", previewHost: false, ...change });
}

/** Routes the three GitHub endpoints to in-memory fixtures. */
function github({
  runs,
  jobs = {},
  annotations = {},
  pulls = [],
}: {
  runs: Run[];
  jobs?: Record<number, Job[]>;
  annotations?: Record<number, unknown[]>;
  pulls?: unknown[];
}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body));
    if (url.includes("/actions/workflows/ci.yml/runs?")) return json({ workflow_runs: runs });
    const jobMatch = /\/actions\/runs\/(\d+)\/jobs\?/u.exec(url);
    if (jobMatch) return json({ jobs: jobs[Number(jobMatch[1])] ?? [] });
    const checkMatch = /\/check-runs\/(\d+)000\/annotations\?/u.exec(url);
    if (checkMatch) return json(annotations[Number(checkMatch[1])] ?? []);
    if (url.includes("/pulls?")) return json(pulls);
    return new Response(null, { status: 404 });
  });
}

const lookup = (fetchImpl: typeof fetch) => ({ repository, token: "t", fetchImpl, currentRunId: "999" });

describe("CI receipt format", () => {
  it("round-trips and rejects anything that is not the exact v1 line", () => {
    expect(parseReceipt(receipt())).toEqual({ head, base, tree, profile: "heavy", previewHost: false });
    for (const bad of [
      "", receipt().replace("v1", "v2"), `${receipt()} extra`, receipt().replace(head, "A".repeat(40)),
      receipt().replace("profile=heavy", "profile=full"), receipt().replace(tree, "c".repeat(39)),
      receipt().replace("preview_host=false", "preview_host=yes"),
    ]) expect(parseReceipt(bad), bad).toBeNull();
  });
});

describe("tested commit", () => {
  it("reads base, head and tree from a real merge commit and nothing from a non-merge", () => {
    const root = mkdtempSync(join(tmpdir(), "sajtmaskin-ci-receipt-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    try {
      git("init", "--quiet", "-b", "main");
      git("config", "core.autocrlf", "false");
      git("config", "user.email", "ci@example.test");
      git("config", "user.name", "CI");
      writeFileSync(join(root, "a.txt"), "a\n");
      git("add", "a.txt");
      git("commit", "--quiet", "-m", "base");
      git("checkout", "--quiet", "-b", "topic");
      writeFileSync(join(root, "b.txt"), "b\n");
      git("add", "b.txt");
      git("commit", "--quiet", "-m", "head");
      const headSha = git("rev-parse", "HEAD");
      git("checkout", "--quiet", "main");
      writeFileSync(join(root, "c.txt"), "c\n");
      git("add", "c.txt");
      git("commit", "--quiet", "-m", "base moved");
      const baseSha = git("rev-parse", "HEAD");
      git("merge", "--quiet", "--no-ff", "-m", "test merge", "topic");
      const mergeSha = git("rev-parse", "HEAD");

      expect(readTestedCommit({ sha: mergeSha, merge: true, cwd: root })).toEqual({
        tree: git("rev-parse", `${mergeSha}^{tree}`), base: baseSha, head: headSha,
      });
      expect(readTestedCommit({ sha: headSha, merge: false, cwd: root })).toEqual({
        tree: git("rev-parse", `${headSha}^{tree}`),
      });
      expect(readTestedCommit({ sha: headSha, merge: true, cwd: root })).toBeNull();
      expect(readTestedCommit({ sha: "0".repeat(40), merge: false, cwd: root })).toBeNull();
      expect(readTestedCommit({ sha: "e".repeat(40), merge: false, cwd: root })).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("reusable green receipt", () => {
  const find = (fetchImpl: typeof fetch, change: Record<string, unknown> = {}) =>
    findReusableReceipt({ ...lookup(fetchImpl), headSha: head, base, tree, ...change });

  it("reuses a successful full run on the exact same head, base and tree", async () => {
    const fetchImpl = github({ runs: [run(101)], jobs: { 101: heavyJobs(101) }, annotations: { 101: [notice(receipt())] } });
    expect(await find(fetchImpl)).toEqual({ reuse: { runId: "101", previewHost: false }, detail: "reused" });
    expect(String(fetchImpl.mock.calls[0][0])).toContain(`event=pull_request&head_sha=${head}`);
  });

  it.each([
    ["moved base", receipt({ base: "e".repeat(40) })],
    ["different tested tree", receipt({ tree: otherTree })],
    ["light profile", receipt({ profile: "light" })],
    ["reused profile alone", receipt({ profile: "reused" })],
  ])("does not reuse a %s", async (_label, message) => {
    const fetchImpl = github({ runs: [run(101)], jobs: { 101: heavyJobs(101) }, annotations: { 101: [notice(message)] } });
    expect((await find(fetchImpl)).reuse).toBeNull();
  });

  it("stops when the newest run on the same tree failed, even if an older one passed", async () => {
    const fetchImpl = github({
      runs: [run(101), run(102, { conclusion: "failure" })],
      jobs: { 101: heavyJobs(101), 102: heavyJobs(102) },
      annotations: { 101: [notice(receipt())], 102: [notice(receipt())] },
    });
    expect(await find(fetchImpl)).toMatchObject({ reuse: null, detail: "same-tree-failure:102" });
  });

  it("stops on a failed run whose tested tree is unknown", async () => {
    const fetchImpl = github({
      runs: [run(101), run(102, { conclusion: "failure" })],
      jobs: { 101: heavyJobs(101), 102: [] },
      annotations: { 101: [notice(receipt())] },
    });
    expect(await find(fetchImpl)).toMatchObject({ reuse: null, detail: "unknown-tree-failure:102" });
  });

  it("looks past cancelled, receipt-less green, light and reused runs to an older full run", async () => {
    const fetchImpl = github({
      runs: [run(101), run(102), run(103), run(104, { conclusion: "cancelled" }), run(105), run(999)],
      jobs: { 101: heavyJobs(101), 102: [], 103: heavyJobs(103), 105: heavyJobs(105) },
      annotations: {
        101: [notice(receipt({ previewHost: true }))],
        103: [notice(receipt({ profile: "light" }))],
        105: [notice(receipt({ profile: "reused" }))],
      },
    });
    expect(await find(fetchImpl)).toEqual({ reuse: { runId: "101", previewHost: true }, detail: "reused" });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/runs/999/"))).toBe(false);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/runs/104/"))).toBe(false);
  });

  it.each([
    ["a missing test shard", (jobs: Job[]) => jobs.filter((job) => job.name !== "quality-tests (4)")],
    ["a skipped heavy job", (jobs: Job[]) => jobs.map((job) => job.name === "quality-core" ? { ...job, conclusion: "skipped" } : job)],
    ["a failed job", (jobs: Job[]) => jobs.map((job) => job.name === "build" ? { ...job, conclusion: "failure" } : job)],
    ["a duplicated job", (jobs: Job[]) => [...jobs, { name: "build", status: "completed", conclusion: "success" }]],
  ])("does not trust a heavy receipt with %s", async (_label, change) => {
    const fetchImpl = github({ runs: [run(101)], jobs: { 101: heavyJobs(101, change) }, annotations: { 101: [notice(receipt())] } });
    expect((await find(fetchImpl)).reuse).toBeNull();
  });

  it.each([
    ["two receipts", [notice(receipt()), notice(receipt())]],
    ["wrong title", [{ ...notice(receipt()), title: "imposter" }]],
    ["warning level", [{ ...notice(receipt()), annotation_level: "warning" }]],
  ])("ignores ambiguous or foreign annotations: %s", async (_label, list) => {
    const fetchImpl = github({ runs: [run(101)], jobs: { 101: heavyJobs(101) }, annotations: { 101: list } });
    expect((await find(fetchImpl)).reuse).toBeNull();
  });

  it.each([
    { head_sha: "e".repeat(40) }, { event: "push" }, { path: ".github/workflows/imposter.yml" },
    { head_repository: { full_name: "fork/repo" } }, { status: "in_progress", conclusion: null },
  ])("ignores runs that are not this repository's completed PR CI on the head: %j", async (change) => {
    const fetchImpl = github({ runs: [run(101, change)], jobs: { 101: heavyJobs(101) }, annotations: { 101: [notice(receipt())] } });
    expect((await find(fetchImpl)).reuse).toBeNull();
  });

  it("fails closed on API errors, malformed listings and missing input", async () => {
    expect((await find(vi.fn<typeof fetch>(async () => new Response(null, { status: 403 })))).detail).toMatch(/^api-error:/u);
    expect((await find(vi.fn<typeof fetch>(async () => { throw new Error("timeout"); })))).toMatchObject({ reuse: null });
    expect((await find(vi.fn<typeof fetch>(async () => new Response("{}"))))).toMatchObject({ reuse: null, detail: "malformed-run-listing" });
    const unused = vi.fn<typeof fetch>();
    expect(await find(unused, { token: "" })).toMatchObject({ reuse: null, detail: "missing-input" });
    expect(await find(unused, { tree: "nope" })).toMatchObject({ reuse: null, detail: "missing-input" });
    expect(await find(unused, { base: "0".repeat(40) })).toMatchObject({ reuse: null, detail: "missing-input" });
    expect(unused).not.toHaveBeenCalled();
  });
});

describe("merged preview pull request", () => {
  const sha = "f".repeat(40);
  const pr = {
    number: 7, merged_at: "2026-10-22T10:00:00Z", merge_commit_sha: sha,
    base: { ref: "preview" }, head: { sha: head, repo: { full_name: repository } },
  };
  const find = (pulls: unknown[]) =>
    findMergedPreviewPullRequest({ ...lookup(github({ runs: [], pulls })), sha });

  it("returns the PR whose merge created exactly this preview tip", async () => {
    expect(await find([pr])).toEqual({ number: 7, headSha: head });
  });

  it.each([
    { merged_at: null }, { merge_commit_sha: "e".repeat(40) }, { base: { ref: "master" } },
    { head: { sha: head, repo: { full_name: "fork/repo" } } }, { head: { sha: "nope", repo: { full_name: repository } } },
  ])("rejects anything else: %j", async (change) => {
    expect(await find([{ ...pr, ...change }])).toBeNull();
  });

  it("rejects ambiguous and failed lookups", async () => {
    expect(await find([pr, { ...pr, number: 8 }])).toBeNull();
    expect(await find([])).toBeNull();
    expect(await findMergedPreviewPullRequest({
      ...lookup(vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }))), sha,
    })).toBeNull();
  });
});

describe("receipt reuse decision", () => {
  const heavy = {
    runHeavy: true, safeDocsOnly: false, highRisk: true, runPreviewHost: true,
    reason: "high-risk:agent", files: ["x"], highRiskReasons: ["agent"], safeDocsBlockers: [],
    classificationError: null,
  };
  const tested = { tree, base, head };
  const greenApi = (previewHost = false) => lookup(github({
    runs: [run(101)], jobs: { 101: heavyJobs(101) }, annotations: { 101: [notice(receipt({ previewHost }))] },
    pulls: [{
      number: 7, merged_at: "2026-10-22T10:00:00Z", merge_commit_sha: "f".repeat(40),
      base: { ref: "preview" }, head: { sha: head, repo: { full_name: repository } },
    }],
  }));
  const pr = (change: Record<string, unknown> = {}) => resolveReceiptReuse({
    decision: heavy, eventName: "pull_request", eventAction: "ready_for_review", baseRef: "preview",
    tested, prHeadSha: head, api: greenApi(), ...change,
  });

  it.each(["ready_for_review", "reopened"])("turns a proven %s run into a light receipt", async (eventAction) => {
    const { decision, detail } = await pr({ eventAction });
    expect(detail).toBe("reused");
    expect(decision).toMatchObject({
      runHeavy: false, safeDocsOnly: false, runPreviewHost: true,
      reason: "reused-green-receipt:101", receiptReused: true,
    });
    expect(receiptProfile(decision)).toBe("reused");
  });

  it("skips preview-host guards only when the receipt ran them", async () => {
    expect((await pr({ api: greenApi(true) })).decision.runPreviewHost).toBe(false);
  });

  it.each([
    { eventAction: "synchronize" }, { eventAction: "opened" }, { baseRef: "master" },
    { prHeadSha: "e".repeat(40) }, { tested: null }, { tested: { tree } },
    { decision: { ...heavy, runHeavy: false } },
    { decision: { ...heavy, classificationError: "boom" } },
  ])("keeps the classified decision when not eligible: %j", async (change) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const input = { ...change, api: lookup(fetchImpl) } as Record<string, unknown>;
    const result = await pr(input);
    expect(result.detail).toBe("not-eligible");
    expect(result.decision).toBe("decision" in change ? change.decision : heavy);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reuses the merged PR's full run for an identical preview push tree", async () => {
    const { decision, detail } = await resolveReceiptReuse({
      decision: heavy, eventName: "push", ref: "refs/heads/preview", tested: { tree },
      pushSha: "f".repeat(40), api: greenApi(),
    });
    expect(detail).toBe("reused:pr-7");
    expect(decision).toMatchObject({ runHeavy: false, receiptReused: true });
  });

  it("keeps full CI for a preview push whose tree differs or has no merged PR, and for master", async () => {
    const differs = await resolveReceiptReuse({
      decision: heavy, eventName: "push", ref: "refs/heads/preview", tested: { tree: otherTree },
      pushSha: "f".repeat(40), api: greenApi(),
    });
    expect(differs).toMatchObject({ decision: heavy, detail: "no-matching-receipt:pr-7" });
    const orphan = await resolveReceiptReuse({
      decision: heavy, eventName: "push", ref: "refs/heads/preview", tested: { tree },
      pushSha: "f".repeat(40), api: lookup(github({ runs: [], pulls: [] })),
    });
    expect(orphan).toMatchObject({ decision: heavy, detail: "no-merged-preview-pr" });
    const master = await resolveReceiptReuse({
      decision: heavy, eventName: "push", ref: "refs/heads/master", tested: { tree },
      pushSha: "f".repeat(40), api: greenApi(),
    });
    expect(master).toMatchObject({ decision: heavy, detail: "not-eligible" });
  });

  it("labels heavy and light runs for later lookups", () => {
    expect(receiptProfile(heavy)).toBe("heavy");
    expect(receiptProfile({ ...heavy, runHeavy: false })).toBe("light");
    expect(applyReceipt({ ...heavy, runPreviewHost: false }, { runId: "1", previewHost: false }).runPreviewHost).toBe(false);
  });
});
