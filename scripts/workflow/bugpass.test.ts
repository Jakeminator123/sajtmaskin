// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertPinnedCliVersion, PINNED_CODEX_VERSION, WINDOWS_SANDBOX_MODE, codexArgs, reviewerEnv, reviewPrompt, reviewSchema, validateReview, validateSandboxProbeEvidence } from "./bugpass.mjs";
import { requireConfirmation, validatePrepared } from "./preview-push.mjs";

const base = "a".repeat(40);
const head = "b".repeat(40);
const review = { base, head, complete: true, summary: "Full diff reviewed; no credible findings.", findings: [] };
const prepared = { version: 1, base, head, verification: "verify:pr", verifiedAt: "2026-10-07T10:00:00Z", review };

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
  it("checks runtime capability before expensive verification or model work", () => {
    const source = readFileSync("scripts/workflow/preview-push.mjs", "utf8");
    const prepare = source.slice(source.indexOf('if (args[0] === "--prepare")'));
    expect(prepare.indexOf("assertReviewRuntime();")).toBeGreaterThan(0);
    expect(prepare.indexOf("assertReviewRuntime();")).toBeLessThan(prepare.indexOf("verify-pr.mjs"));
    const probe = readFileSync("scripts/workflow/probe-bugpass-sandbox.mjs", "utf8");
    expect(probe).not.toContain("codexArgs(");
    expect(probe).not.toContain("--model");
  });
});
