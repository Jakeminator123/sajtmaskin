// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertVerifiedCliVersion, VERIFIED_CODEX_VERSION, codexArgs, reviewerEnv, reviewPrompt, reviewSchema, validateReview, validateSandboxProbeEvidence } from "./bugpass.mjs";
import { requireConfirmation, validatePrepared } from "./preview-push.mjs";

const base = "a".repeat(40);
const head = "b".repeat(40);
const review = { base, head, complete: true, summary: "Full diff reviewed; no credible findings.", findings: [] };
const prepared = { version: 1, base, head, verification: "verify:pr", verifiedAt: "2026-10-07T10:00:00Z", review };

describe("IDE-neutral Buggpass", () => {
  it("requires exact denied targets and a complete structured result for sandbox evidence", () => {
    const marker = "C:\\temp\\canary.txt", url = "http://127.0.0.1:12345/sandbox-probe";
    const prefix = "ERROR codex_core::tools::router: error=exec_command failed:";
    const transcript = `${prefix} Set-Content '${marker}' blocked by policy\n${prefix} curl.exe ${url} blocked by policy`;
    const evidence = { review, transcript, marker, url, code: 0, markerExists: false, requests: 0 };
    expect(() => validateSandboxProbeEvidence(evidence)).not.toThrow();
    for (const invalid of [
      { ...evidence, transcript: transcript.replace("canary.txt", "wrong.txt") },
      { ...evidence, transcript: transcript.replace("canary.txt", "canary.txt.bak") },
      { ...evidence, transcript: transcript.replace("/sandbox-probe", "/sandbox-probe-evil") },
      { ...evidence, transcript: `${prefix} Set-Content '${marker}'; curl.exe ${url} blocked by policy\n${prefix} unrelated blocked by policy` },
      { ...evidence, transcript: transcript.replace(":12345", ":54321") },
      { ...evidence, review: { ...review, complete: false } },
      { ...evidence, review: { ...review, head: base } },
      { ...evidence, markerExists: true }, { ...evidence, requests: 1 }, { ...evidence, code: 1 },
    ]) expect(() => validateSandboxProbeEvidence(invalid)).toThrow();
  });
  it("fails closed on a different CLI version until sandbox revalidation", () => {
    expect(() => assertVerifiedCliVersion(VERIFIED_CODEX_VERSION)).not.toThrow();
    expect(() => assertVerifiedCliVersion("codex-cli future")).toThrow(/Unverified/);
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
  it("never treats actionable or malformed findings as green", () => {
    for (const finding of [
      { priority: "P1", file: "a.ts", line: 1, description: "Concrete regression" },
      { priority: "nit", file: "a.ts", line: 1, description: "invalid" },
      { priority: "P2", file: "a.ts", line: 0, description: "invalid" },
    ]) expect(() => validateReview({ ...review, findings: [finding] }, base, head)).toThrow();
  });
  it("uses a fresh read-only CLI process without chat history or user config", () => {
    const args = codexArgs("scratch", "schema", "result", "chosen-model");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("read-only");
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain('model_reasoning_effort="xhigh"');
    expect(args).toContain("chosen-model");
    for (const forbidden of ["resume", "fork", "--last", "danger-full-access", "--approve-for-me"])
      expect(args).not.toContain(forbidden);
    expect(reviewPrompt("repo", base, head)).toContain("COMPLETE git diff");
    expect(reviewSchema(base, head).properties.head.enum).toEqual([head]);
  });
});

describe("confirmed preview push", () => {
  it("rejects missing, stale, wrong-base and unverified receipts", () => {
    expect(() => validatePrepared(prepared, base, head)).not.toThrow();
    for (const invalid of [null, {}, { ...prepared, head: base }, { ...prepared, base: head },
      { ...prepared, verification: "plan" }, { ...prepared, verifiedAt: null },
      { ...prepared, review: { ...review, complete: false } }]) {
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
    expect(policy.directPreview).toMatchObject({ allowed: true, reviewName: "Buggpass", remoteChecks: "after-push" });
    expect(pkg.scripts[policy.directPreview.prepareCommand]).toContain("preview-push.mjs --prepare");
    expect(pkg.scripts[policy.directPreview.pushCommand]).toBe("node scripts/workflow/preview-push.mjs");
  });
});
