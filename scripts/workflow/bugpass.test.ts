// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertPinnedCliVersion, PINNED_CODEX_VERSION, WINDOWS_SANDBOX_MODE, codexArgs, reviewerEnv, reviewPrompt, reviewSchema, validateReview, validateSandboxProbeEvidence } from "./bugpass.mjs";
import { requireConfirmation, validatePrepared, preparePreview, publishAndReview, selectPreviousReview } from "./preview-push.mjs";
import { validateDecision, reviewDigest, reviewStatus, nextRound, followUpDigest, validateCachedContext, canReuseAfterPublication, validateReviewChain } from "./bugpass-state.mjs";

const base = "a".repeat(40);
const head = "b".repeat(40);
const review = { base, head, complete: true, summary: "Full diff reviewed; no credible findings.", findings: [] };
const prepared = { version: 3, base, head, verification: "verify:pr:plan", plannedAt: "2026-10-07T10:00:00Z", postPushReview: "required" };
const finding = { id: "F1", priority: "P2", confidencePercent: 85, impactScore: 2, file: "a.ts", line: 1, description: "Concrete regression" };

describe("IDE-neutral Buggpass", () => {
  it("requires successful reading plus actual write/network denial, not a broken sandbox", () => {
    const evidence = { nonce: "canary", control: "canary", markerExists: false, requests: 0,
      read: { code: 0, stdout: "canary\r\n" }, write: { code: 17, stderr: "PermissionDenied" },
      network: { code: 7, stderr: "curl: (7) failed to connect" } };
    expect(() => validateSandboxProbeEvidence(evidence)).not.toThrow();
    for (const invalid of [
      { ...evidence, read: { code: 1, stdout: "" } },
      { ...evidence, read: { code: 0, stdout: "wrong" } },
      { ...evidence, control: "wrong" }, { ...evidence, nonce: "" },
      { ...evidence, write: { code: 17, stderr: "helper_unknown_error" } },
      { ...evidence, write: { code: 0, stderr: "" } },
      { ...evidence, network: { code: 1, stderr: "helper_unknown_error" } },
      { ...evidence, network: { code: 0, stderr: "" } },
      { ...evidence, markerExists: true }, { ...evidence, requests: 1 },
    ]) expect(() => validateSandboxProbeEvidence(invalid)).toThrow();
  });
  it("fails closed on a different CLI version until sandbox revalidation", () => {
    expect(() => assertPinnedCliVersion(PINNED_CODEX_VERSION)).not.toThrow();
    expect(() => assertPinnedCliVersion("codex-cli future")).toThrow(/Unverified/);
  });
  it("passes only OS paths, never arbitrary provider secrets or Git/Node injection", () => {
    expect(reviewerEnv({ Path: "bin", USERPROFILE: "profile", CODEX_HOME: "auth-store",
      OPENAI_API_KEY: "secret", REDIS_URL: "secret", UNFAMILIAR_CREDENTIAL: "secret",
      NODE_OPTIONS: "--require bad.js", GIT_DIR: "wrong", CODEX_THREAD_ID: "author-chat" }))
      .toEqual({ Path: "bin", USERPROFILE: "profile", CODEX_HOME: "auth-store" });
  });
  it("accepts only a complete review for the exact base/head", () => {
    expect(() => validateReview(review, base, head)).not.toThrow();
    for (const invalid of [null, {}, { ...review, complete: false }, { ...review, base: head },
      { ...review, head: base }, { ...review, summary: "" }, { ...review, findings: null }]) {
      expect(() => validateReview(invalid, base, head)).toThrow();
    }
    expect(() => validateReview(review, "origin/preview", head)).toThrow();
  });
  it("returns valid findings to the author without treating them as review failure or automatic approval", () => {
    const report = { ...review, findings: [finding] };
    expect(() => validateReview(report, base, head)).not.toThrow();
    expect(reviewStatus(report)).toBe("needs-triage");
    for (const invalid of [
      { ...finding, priority: "nit" }, { ...finding, line: 0 }, { ...finding, confidencePercent: 101 },
      { ...finding, confidencePercent: -1 }, { ...finding, impactScore: 0 }, { ...finding, impactScore: 6 },
      { ...finding, id: "" }, { ...finding, confidencePercent: 0.9 },
    ]) expect(() => validateReview({ ...review, findings: [invalid] }, base, head)).toThrow();
    expect(() => validateReview({ ...review, findings: [finding, finding] }, base, head)).toThrow();
  });
  it("uses a fresh read-only CLI process without chat history or user config", () => {
    const args = codexArgs("scratch", "schema", "result", "chosen-model");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("multi_agent");
    expect(args).toContain("read-only");
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain('model_reasoning_effort="xhigh"');
    expect(WINDOWS_SANDBOX_MODE).toBe("elevated");
    if (process.platform === "win32") expect(args).toContain('windows.sandbox="elevated"');
    expect(args).toContain("chosen-model");
    for (const forbidden of ["resume", "fork", "--last", "danger-full-access", "--approve-for-me"])
      expect(args).not.toContain(forbidden);
    expect(reviewPrompt("repo", base, head)).toContain("COMPLETE git diff");
    expect(reviewSchema(base, head).properties.head.enum).toEqual([head]);
  });
});

describe("confirmed preview push", () => {
  it("rejects missing, stale, wrong-base and old full-verification receipts", () => {
    expect(() => validatePrepared(prepared, base, head)).not.toThrow();
    for (const invalid of [null, {}, { ...prepared, head: base }, { ...prepared, base: head },
      { ...prepared, verification: "verify:pr" }, { ...prepared, plannedAt: undefined },
      { ...prepared, plannedAt: "invalid" }, { ...prepared, version: 2 }, { ...prepared, postPushReview: undefined }]) {
      expect(() => validatePrepared(invalid, base, head)).toThrow();
    }
  });
  it("requires full, exact confirmation; an earlier yes/short SHA is insufficient", () => {
    for (const value of [undefined, "yes", "1", head.slice(0, 12), base])
      expect(() => requireConfirmation(value, head)).toThrow(/Är du säker/);
    expect(() => requireConfirmation(head, head)).not.toThrow();
  });
  it("keeps the declared policy and executable command entrypoints aligned", () => {
    const policy = JSON.parse(readFileSync("config/agent-workflow.json", "utf8"));
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(policy.directPreview).toMatchObject({ allowed: true, reviewName: "Buggpass", reviewTiming: "after-push", remoteChecks: "after-push" });
    expect(pkg.scripts[policy.directPreview.prepareCommand]).toContain("preview-push.mjs --prepare");
    expect(pkg.scripts[policy.directPreview.pushCommand]).toBe("node scripts/workflow/preview-push.mjs");
  });
  it("prepares exactly one plan without claiming test or review execution", () => {
    const calls: string[] = [];
    const result = preparePreview(base, head, null, {
      plan: (value: string) => calls.push(`plan:${value}`),
      readState: () => { calls.push("state"); return { base, head }; },
    });
    expect(calls).toEqual([`plan:${base}`, "state"]);
    expect(() => validatePrepared(result, base, head)).not.toThrow();
    expect(result.verification).toBe("verify:pr:plan");
    expect(result).not.toHaveProperty("verifiedAt");
    expect(() => preparePreview(base, head, null, {
      plan: () => { throw new Error("plan failed"); }, readState: () => { throw new Error("must not run"); },
    })).toThrow("plan failed");
    for (const moved of [{ base: head, head }, { base, head: base }]) {
      expect(() => preparePreview(base, head, null, { plan: () => {}, readState: () => moved })).toThrow(/moved/);
    }
  });
  it("checks runtime once at push time, not again in preparation", () => {
    const source = readFileSync("scripts/workflow/preview-push.mjs", "utf8");
    const prepare = source.slice(source.indexOf('if (args[0] === "--prepare")'));
    expect(prepare.match(/assertReviewRuntime\(\);/g)).toHaveLength(1);
    expect(prepare.indexOf("assertReviewRuntime();")).toBeGreaterThan(prepare.indexOf("requireConfirmation(args[1], head)"));
    expect(prepare.indexOf("assertReviewRuntime();")).toBeLessThan(prepare.indexOf("publishAndReview(base, head, prepared"));
    expect(prepare.match(/"scripts\/workflow\/verify-pr.mjs"/g)).toHaveLength(1);
    expect(prepare).toContain('["scripts/workflow/verify-pr.mjs", "--plan", "--no-fetch", "--base", base]');
    const probe = readFileSync("scripts/workflow/probe-bugpass-sandbox.mjs", "utf8");
    expect(probe).not.toContain("codexArgs(");
    expect(probe).not.toContain("--model");
  });
  it("reviews only after a successful publication and durable publication receipt", () => {
    const events: string[] = [];
    publishAndReview(base, head, prepared, {
      push: () => events.push("push"), save: () => events.push("save"), review: () => events.push("review"),
    });
    expect(events).toEqual(["push", "save", "review"]);
    events.length = 0;
    expect(() => publishAndReview(base, head, prepared, {
      push: () => { throw new Error("push denied"); }, save: () => events.push("save"), review: () => events.push("review"),
    })).toThrow("push denied");
    expect(events).toEqual([]);
    for (const failing of ["save", "review"]) {
      expect(() => publishAndReview(base, head, prepared, {
        push: () => {}, save: () => { if (failing === "save") throw new Error("disk full"); },
        review: () => { throw new Error("model unavailable"); },
      })).toThrow(/PUSH SUCCEEDED.*Do not push again/);
    }
  });
  it("automatically carries unresolved findings across ordinary pushes and preserves the round limit", () => {
    const publishedAt = "2026-10-07T12:00:00Z";
    const previous = { base, head, rootBase: base, round: 1, publishedAt, review: { ...review, findings: [finding] }, decisions: [] };
    const publication = { version: 2, base, head, publishedAt };
    expect(selectPreviousReview(head, null, publication, () => previous)).toEqual(previous);
    expect(() => selectPreviousReview(head, null, publication, () => ({ ...previous, round: 3 }))).toThrow();
    expect(() => selectPreviousReview(head, null, publication, () => { throw new Error("missing review"); })).toThrow(/missing/);
    expect(() => selectPreviousReview(head, null, publication, () => ({ ...previous, publishedAt: null }))).toThrow(/post-push/);
    expect(selectPreviousReview(head, null, publication, () => ({ ...previous, review, decisions: [] }))).toBeNull();
  });
  it("does not present a pre-publication model pass as post-publication review", () => {
    const publishedAt = "2026-10-07T12:00:00Z";
    expect(canReuseAfterPublication({ publishedAt: null, reviewedAt: "2026-10-07T11:00:00Z" }, publishedAt)).toBe(false);
    expect(canReuseAfterPublication({ publishedAt, reviewedAt: "2026-10-07T12:01:00Z" }, publishedAt)).toBe(true);
    expect(canReuseAfterPublication({ publishedAt, reviewedAt: "2026-10-07T11:59:00Z" }, publishedAt)).toBe(false);
    expect(() => canReuseAfterPublication({ publishedAt, reviewedAt: "2026-10-07T12:01:00Z" }, "bad")).toThrow();
  });
});

describe("bounded author triage", () => {
  const report = { ...review, findings: [finding] };
  const decision = { findingId: "F1", action: "reject", reason: "Regression test proves this branch is unreachable.", reviewDigest: reviewDigest(report), followUp: "" };
  it("requires an evidenced decision for every current finding", () => {
    expect(reviewStatus(report, [decision])).toBe("clear");
    expect(reviewStatus(report, [{ ...decision, action: "accept" }])).toBe("needs-fix");
    for (const invalid of [
      { ...decision, findingId: "F2" }, { ...decision, reason: "disagree" },
      { ...decision, reviewDigest: "stale" }, { ...decision, action: "fixed" },
    ]) expect(() => validateDecision(report, invalid)).toThrow();
    expect(() => reviewStatus(report, [decision, decision])).toThrow(/Duplicate/);
    expect(reviewStatus({ ...report, complete: false }, [decision])).toBe("incomplete");
  });
  it("allows documented low-impact debt, never silently defers serious findings", () => {
    const deferred = { ...decision, action: "defer", followUp: "BUG-SWARM follow-up #example" };
    expect(reviewStatus(report, [deferred])).toBe("acceptable-with-follow-up");
    expect(() => validateDecision(report, { ...deferred, followUp: "" })).toThrow();
    for (const high of [{ ...finding, impactScore: 3 }, { ...finding, priority: "P1" }]) {
      const highReport = { ...report, findings: [high] };
      expect(() => validateDecision(highReport, { ...deferred, reviewDigest: reviewDigest(highReport) })).toThrow();
    }
  });
  it("bounds review loops and supplies previous findings, not author chat history", () => {
    expect(nextRound(null)).toBe(1);
    expect(nextRound({ round: 1 })).toBe(2);
    expect(() => nextRound({ round: 3 })).toThrow(/Three/);
    expect(() => nextRound({ round: "bad" })).toThrow();
    const prompt = reviewPrompt("repo", base, head, { head: "c".repeat(40), rootBase: base, review: report, decisions: [decision] });
    expect(prompt).toContain("Regression test proves");
    expect(prompt).toContain("Recheck previously accepted/unresolved findings");
    expect(prompt).toContain("not test coverage");
  });
  it("cannot reuse a delta-only clean review that never covered outstanding earlier findings", () => {
    const previous = { base, head, rootBase: base, review: report, decisions: [decision] };
    expect(() => validateCachedContext({ previousContext: null }, previous)).toThrow(/not a green cache hit/);
    const cached = { previousContext: followUpDigest(previous) };
    expect(() => validateCachedContext(cached, previous)).not.toThrow();
    expect(() => validateCachedContext(cached, { ...previous, decisions: [{ ...decision, action: "accept" }] })).toThrow();
  });
  it("blocks a new publication when any ancestor decision changed after a linked clean review", () => {
    const first = { base, head, rootBase: base, round: 1, review: report, decisions: [decision] };
    const second = { base: head, head: "c".repeat(40), rootBase: base, round: 2, review, decisions: [],
      previous: { base, head }, previousContext: followUpDigest(first), publishedAt: "2026-10-07T12:00:00Z" };
    const third = { ...second, base: second.head, head: "d".repeat(40), round: 3,
      previous: { base: second.base, head: second.head }, previousContext: followUpDigest(second) };
    const read = (_base: string, sha: string) => sha === head ? first : second;
    expect(() => validateReviewChain(third, read)).not.toThrow();
    first.decisions = [{ ...decision, action: "accept" }];
    expect(() => validateReviewChain(third, read)).toThrow(/fresh review required/);
    const publication = { version: 2, base: third.base, head: third.head, publishedAt: third.publishedAt };
    expect(() => selectPreviousReview(third.head, null, publication, (b: string, h: string) => h === third.head ? third : read(b, h))).toThrow(/fresh review required/);
  });
});
