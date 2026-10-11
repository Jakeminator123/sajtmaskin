// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reviewPrompt, reviewSchema, validateReview, validateReviewer, reviewProof, reviewContext, renewalHistory, validateRenewalFindings } from "./bugpass.mjs";
import { requireConfirmation, validatePrepared, preparePreview, publishPrepared } from "./preview-push.mjs";
import { validateDecision, reviewDigest, reviewStatus, nextRound, followUpDigest, validateCachedContext, validateReviewChain } from "./bugpass-state.mjs";

const base = "a".repeat(40), head = "b".repeat(40), requestId = "c".repeat(64), contract = "d".repeat(64);
const review = { base, head, requestId, complete: true, summary: "Full diff reviewed; no credible findings.", findings: [] };
const proof = "e".repeat(64);
const prepared = { version: 4, base, head, verification: "verify:pr:plan", plannedAt: "2026-10-11T10:00:00Z", reviewProof: proof };
const finding = { id: "F1", priority: "P2", confidencePercent: 85, impactScore: 2, file: "a.ts", line: 1, description: "Concrete regression" };
const reviewer = { provider: "test", reference: "fixture-review", model: "fixture", reasoning: "high", independent: true };

describe("portable independent Buggpass", () => {
  it("rejects incomplete results and mismatched request/base/head", () => {
    expect(() => validateReview(review, base, head, requestId)).not.toThrow();
    for (const invalid of [null, {}, { ...review, complete: false }, { ...review, base: head }, { ...review, head: base },
      { ...review, summary: "" }, { ...review, findings: null }, { ...review, requestId: contract }])
      expect(() => validateReview(invalid, base, head, requestId)).toThrow();
    expect(() => validateReview(review, "origin/preview", head, requestId)).toThrow();
  });
  it("requires an actual reviewer reference and explicit independence", () => {
    expect(() => validateReviewer(reviewer)).not.toThrow();
    for (const invalid of [null, {}, { ...reviewer, independent: false }, { ...reviewer, reference: "" }, { ...reviewer, model: "" }])
      expect(() => validateReviewer(invalid)).toThrow();
  });
  it("validates all finding scores/locations and unique IDs", () => {
    expect(() => validateReview({ ...review, findings: [finding] }, base, head, requestId)).not.toThrow();
    for (const invalid of [{ ...finding, priority: "nit" }, { ...finding, line: 0 }, { ...finding, confidencePercent: 101 },
      { ...finding, confidencePercent: 0.9 }, { ...finding, impactScore: 0 }, { ...finding, impactScore: 6 }, { ...finding, id: "" }])
      expect(() => validateReview({ ...review, findings: [invalid] }, base, head, requestId)).toThrow();
    expect(() => validateReview({ ...review, findings: [finding, finding] }, base, head, requestId)).toThrow();
  });
  it("keeps previous findings while switching from delta to full review when the contract changes", () => {
    const previous = { head: "f".repeat(40), rootBase: base, contract, review: { ...review, findings: [finding] }, decisions: [] };
    const request = { base, head, requestId, contract };
    expect(reviewPrompt("repo", request, previous)).toContain(`diff ${previous.head}..${head}`);
    expect(reviewPrompt("repo", { ...request, contract: proof }, previous)).toContain(`diff ${base}..${head}`);
    expect(reviewPrompt("repo", request, previous)).toContain("Recheck previously accepted/unresolved findings");
    expect(reviewPrompt("repo", request)).toContain("no author conversation");
    expect(reviewSchema(base, head, requestId).properties.requestId.enum).toEqual([requestId]);
  });
  it("carries findings from every superseded same-head review into the renewal prompt", () => {
    const old = { review: { ...review, findings: [finding] }, decisions: [{ action: "accept" }] };
    const current = { review: { ...review, findings: [{ ...finding, id: "F2" }] }, decisions: [], supersededReview: old };
    const renewals = renewalHistory(current);
    expect(renewals).toHaveLength(2);
    const prompt = reviewPrompt("repo", { base, head, requestId, contract, fullReview: true }, null, [], renewals);
    expect(prompt).toContain("SAME head");
    expect(prompt).toContain('"id":"F1"');
    expect(prompt).toContain('"id":"F2"');
    expect(prompt).toContain('"action":"accept"');
  });
  it("rejects silent omission of unresolved same-head findings until explicit author rejection", () => {
    const known = { review: { ...review, findings: [finding] }, decisions: [] as { findingId: string; action: string }[] };
    for (const decisions of [[], [{ findingId: "F1", action: "accept" }], [{ findingId: "F1", action: "defer" }]])
      expect(() => validateRenewalFindings(review, { ...known, decisions })).toThrow(/cannot drop unresolved/);
    expect(() => validateRenewalFindings({ ...review, findings: [{ ...finding, id: "F2" }] }, known)).not.toThrow();
    expect(() => validateRenewalFindings({ ...review, findings: [{ ...finding, description: "Different issue" }] }, known)).toThrow();
    expect(() => validateRenewalFindings(review, { ...known, decisions: [{ findingId: "F1", action: "reject" }], supersededReview: known })).not.toThrow();
    expect(() => validateRenewalFindings(review, { review, decisions: [], supersededReview: known })).toThrow();
    expect(() => validateRenewalFindings(review, null)).not.toThrow(); // Changed code may fix prior findings.
  });
});

describe("light pre-push gate", () => {
  it("rejects old plans, missing or changed review proof and stale base/head", () => {
    expect(() => validatePrepared(prepared, base, head, proof)).not.toThrow();
    for (const invalid of [null, {}, { ...prepared, version: 3 }, { ...prepared, base: head }, { ...prepared, head: base },
      { ...prepared, plannedAt: "bad" }, { ...prepared, reviewProof: contract }, { ...prepared, verification: "verify:pr" }])
      expect(() => validatePrepared(invalid, base, head, proof)).toThrow();
    expect(() => validatePrepared(prepared, base, head, undefined)).toThrow();
  });
  it("plans once, requires review first and detects changes during planning", () => {
    const calls: string[] = [];
    const actions = { reviewProof: () => { calls.push("review"); return proof; },
      plan: () => { calls.push("plan"); }, readState: () => ({ base, head }) };
    expect(preparePreview(base, head, actions)).toMatchObject({ version: 4, reviewProof: proof });
    expect(calls).toEqual(["review", "plan", "review"]);
    expect(() => preparePreview(base, head, { ...actions, readState: () => ({ base, head: base }) })).toThrow();
    let reads = 0;
    expect(() => preparePreview(base, head, { ...actions, reviewProof: () => ++reads === 1 ? proof : contract })).toThrow();
    calls.length = 0;
    expect(() => preparePreview(base, head, { ...actions, reviewProof: () => { throw Error("missing review"); } })).toThrow();
    expect(calls).toEqual([]);
  });
  it("requires exact human confirmation", () => {
    for (const value of [undefined, "yes", "1", head.slice(0, 12), base]) expect(() => requireConfirmation(value, head)).toThrow(/Är du säker/);
    expect(() => requireConfirmation(head, head)).not.toThrow();
  });
  it("checks before publication, does not review again and distinguishes post-push disk failure", () => {
    const events: string[] = [];
    const actions = { check: () => { events.push("check"); }, push: () => { events.push("push"); }, save: () => { events.push("save"); } };
    publishPrepared(base, head, prepared, actions);
    expect(events).toEqual(["check", "push", "save"]);
    events.length = 0;
    expect(() => publishPrepared(base, head, prepared, { ...actions, check: () => { throw Error("stale"); } })).toThrow("stale");
    expect(events).toEqual([]);
    expect(() => publishPrepared(base, head, prepared, { ...actions, push: () => { throw Error("denied"); } })).toThrow("denied");
    expect(events).toEqual(["check"]);
    expect(() => publishPrepared(base, head, prepared, { ...actions, save: () => { throw Error("disk full"); } })).toThrow(/PUSH SUCCEEDED.*Do not push again/);
  });
  it("binds review proof to reviewer and current author decisions", () => {
    const receipt = { base, head, rootBase: base, contract, requestId, review, reviewer, decisions: [] };
    expect(reviewProof(receipt)).not.toBe(reviewProof({ ...receipt, reviewer: { ...reviewer, reference: "different" } }));
    expect(reviewProof(receipt)).not.toBe(reviewProof({ ...receipt, decisions: [{ action: "reject" }] }));
  });
  it("declares pre-push review but keeps remote CI after push", () => {
    const policy = JSON.parse(readFileSync("config/agent-workflow.json", "utf8"));
    expect(policy.directPreview).toMatchObject({ reviewTiming: "before-push", remoteChecks: "after-push" });
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["bugpass:sandbox-check"]).toBeUndefined();
    expect(pkg.scripts["bugpass:wsl-setup"]).toBeUndefined();
  });
});

describe("bounded author triage", () => {
  const report = { ...review, findings: [finding] };
  const decision = { findingId: "F1", action: "reject", reason: "Regression test proves this branch is unreachable.", reviewDigest: reviewDigest(report), followUp: "" };
  it("requires an evidenced decision for every finding and a fresh review after fixes", () => {
    expect(reviewStatus(report)).toBe("needs-triage");
    expect(reviewStatus(report, [decision])).toBe("clear");
    expect(reviewStatus(report, [{ ...decision, action: "accept" }])).toBe("needs-fix");
    for (const invalid of [{ ...decision, findingId: "F2" }, { ...decision, reason: "disagree" },
      { ...decision, reviewDigest: "stale" }, { ...decision, action: "fixed" }]) expect(() => validateDecision(report, invalid)).toThrow();
    expect(() => reviewStatus(report, [decision, decision])).toThrow(/Duplicate/);
    expect(reviewStatus({ ...report, complete: false })).toBe("incomplete");
  });
  it("only defers low-impact P2 with follow-up", () => {
    const deferred = { ...decision, action: "defer", followUp: "BUG-SWARM issue" };
    expect(reviewStatus(report, [deferred])).toBe("acceptable-with-follow-up");
    expect(() => validateDecision(report, { ...deferred, followUp: "" })).toThrow();
    for (const high of [{ ...finding, impactScore: 3 }, { ...finding, priority: "P1" }]) {
      const highReport = { ...report, findings: [high] };
      expect(() => validateDecision(highReport, { ...deferred, reviewDigest: reviewDigest(highReport) })).toThrow();
    }
  });
  it("bounds rounds and invalidates descendants after earlier triage changes", () => {
    expect(nextRound(null)).toBe(1);
    expect(nextRound({ round: 1 })).toBe(2);
    expect(() => nextRound({ round: 3 })).toThrow(/Three/);
    expect(() => nextRound({ round: 3 }, "yes")).toThrow(/Three/);
    expect(nextRound({ round: 3 }, "Owner explicitly approved one additional pass in this task.")).toBe(4);
    expect(() => nextRound({ round: 4 }, "Owner explicitly approved one additional pass in this task.")).toThrow(/Three/);
    const first = { base, head, rootBase: base, round: 1, review: report, decisions: [decision] };
    const second = { base, head: "f".repeat(40), rootBase: base, round: 2, review, decisions: [],
      previous: { base, head }, previousContext: followUpDigest(first) };
    expect(() => validateReviewChain(second, () => first)).not.toThrow();
    first.decisions = [{ ...decision, action: "accept" }];
    expect(() => validateReviewChain(second, () => first)).toThrow(/fresh review required/);
    expect(() => validateCachedContext({ previousContext: null }, first)).toThrow();
  });
  it("reconciles stale ancestors with a full review without resetting the round limit", () => {
    const first = { base, head, rootBase: base, round: 1, contract, review: report, decisions: [decision] };
    const second = { base, head: "f".repeat(40), rootBase: base, round: 2, contract, review, decisions: [],
      previous: { base, head }, previousContext: followUpDigest(first) };
    const readPrior = (_base: string, requested: string) => requested === first.head ? first : second;
    first.decisions = [{ ...decision, action: "accept" }];
    const context = reviewContext(second, contract, readPrior);
    expect(context.fullReview).toBe(true);
    expect(context.history).toHaveLength(2);
    const third = { base, head: "9".repeat(40), rootBase: base, round: nextRound(second), contract, review, decisions: [],
      previous: { base, head: second.head }, previousContext: followUpDigest(second),
      fullReview: context.fullReview, previousChainContext: context.previousChainContext };
    expect(reviewPrompt("repo", { ...third, requestId }, second, context.history)).toContain(`diff ${base}..${third.head}`);
    expect(() => validateReviewChain(third, readPrior)).not.toThrow();
    expect(() => nextRound(third)).toThrow(/Three/);
    first.decisions = [{ ...decision, action: "accept", reason: "Different evidence now requires another review." }];
    expect(() => validateReviewChain(third, readPrior)).toThrow(/fresh review required/);
    expect(() => reviewContext({ ...second, round: 1 }, contract, readPrior)).toThrow(/round chain/);
  });
});
