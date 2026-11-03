// @vitest-environment node
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { renderHookScript } from "../dev/install-git-hooks.mjs";
import {
  prepareHotfix, publishHotfix, validateHotfixDestination, validateHotfixMandate,
  validateHotfixPrepared, validateHotfixPushUpdates, validateHotfixRemote,
} from "./hotfix-push.mjs";

const zero = "0".repeat(40), base = "a".repeat(40), head = "b".repeat(40), tree = "c".repeat(40);
const url = "https://github.com/Jakeminator123/sajtmaskin.git";
const destination = "refs/heads/hotfix/fixture";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const state = { repository: "Jakeminator123/sajtmaskin", repositoryId: "d".repeat(64), worktreeRoot: "/work",
  commonDir: "/work/.git", gitDir: "/work/.git", branch: "hotfix/fixture", remoteName: "origin", canonicalPushUrl: url,
  baseRef: "refs/heads/master", base, head, tree, destinationRef: destination, remoteTip: zero,
  reviewProof: "e".repeat(64), contractDigest: "f".repeat(64) };
const mandate = { version: 1, kind: "master-hotfix-feature-pr-push", repository: state.repository,
  baseRef: state.baseRef, base, head, destinationRef: destination, scope: "Synthetic fixture only",
  source: { kind: "host-user-message", threadId: "test-only-thread", messageId: "test-only-message" } };
const approval = { path: "/work/.git/mandate.json", digest: hash(JSON.stringify(mandate)), mandate };
const prepare = () => prepareHotfix(state, approval, { plan: () => {}, readState: () => state, readApproval: () => approval });

describe("master hotfix receipt", () => {
  it("plans exactly once and binds a real-message reference without claiming to authenticate it", () => {
    let plans = 0;
    const receipt = prepareHotfix(state, approval, {
      plan: (selected: string) => { expect(selected).toBe(base); plans++; }, readState: () => state, readApproval: () => approval,
    });
    expect(plans).toBe(1);
    expect(receipt.verification).toBe("verify:pr:plan:committed");
    expect(() => validateHotfixPrepared(receipt, state, approval)).not.toThrow();
    expect(receipt.approvalSource).toEqual(mandate.source);
  });

  it.each(Object.keys(state))("rejects stale or substituted receipt field %s", (key) => {
    expect(() => validateHotfixPrepared({ ...prepare(), [key]: "changed" }, state, approval)).toThrow();
  });

  it.each(["base", "head", "tree", "repositoryId", "worktreeRoot", "commonDir", "gitDir", "branch", "canonicalPushUrl",
    "destinationRef", "remoteTip", "reviewProof", "contractDigest"])("rejects %s changing during preparation", (key) => {
    let plans = 0;
    expect(() => prepareHotfix(state, approval, { plan: () => plans++,
      readState: () => ({ ...state, [key]: key.endsWith("Proof") || key.endsWith("Digest") ? "1".repeat(64) : "changed" }),
      readApproval: () => approval })).toThrow();
    expect(plans).toBe(1);
  });

  it("rejects changed mandate bytes, file, source, scope, base/head and incomplete local approvals", () => {
    const receipt = prepare();
    for (const changed of [
      { ...approval, digest: "1".repeat(64) }, { ...approval, path: "/other/mandate.json" },
      { ...approval, mandate: { ...mandate, source: { ...mandate.source, messageId: "other-message" } } },
    ]) expect(() => validateHotfixPrepared(receipt, state, changed)).toThrow();
    for (const changed of [null, { approved: true }, { ...mandate, scope: "" }, { ...mandate, head: base },
      { ...mandate, base: head }, { ...mandate, source: { kind: "copied-text", threadId: "x", messageId: "y" } }])
      expect(() => validateHotfixMandate(changed, state)).toThrow();
    expect(() => prepareHotfix(state, approval, { plan: () => {}, readState: () => state,
      readApproval: () => ({ ...approval, digest: "1".repeat(64) }) })).toThrow();
    expect(() => validateHotfixPrepared({ ...receipt, plannedAt: "invalid" }, state, approval)).toThrow();
    expect(() => validateHotfixPrepared(null, state, approval)).toThrow();
  });

  it("requires confirmation and revalidation before publishing", () => {
    const receipt = prepare();
    let pushes = 0, checks = 0;
    const actions = { check: () => { checks++; }, push: () => { pushes++; } };
    expect(() => publishHotfix(receipt, base, actions)).toThrow();
    expect(checks).toBe(0);
    expect(() => publishHotfix(receipt, head, { ...actions, check: () => { throw new Error("stale review"); } })).toThrow("stale review");
    expect(pushes).toBe(0);
    publishHotfix(receipt, head, actions);
    expect([checks, pushes]).toEqual([1, 1]);
  });

  it("accepts exactly one full SHA to feature update", () => {
    const receipt = prepare(), valid = `${head} ${head} ${destination} ${zero}\n`;
    expect(() => validateHotfixPushUpdates(valid, receipt)).not.toThrow();
    for (const input of ["", `${valid}${valid}`, `${valid}${head} ${head} refs/tags/extra ${zero}\n`,
      `${head} ${base} ${destination} ${zero}`, `${head} ${head} ${destination} ${base}`,
      `${head} ${head} ${destination} ${zero} extra`, `refs/heads/hotfix/fixture ${head} ${destination} ${zero}`,
      ...["refs/heads/master", "refs/heads/preview", "refs/tags/x"].map((ref) => `${head} ${head} ${ref} ${zero}`),
      `(delete) ${zero} ${destination} ${head}`])
      expect(() => validateHotfixPushUpdates(input, receipt), input).toThrow();
  });

  it.each(["refs/heads/master", "refs/heads/main", "refs/heads/preview", "refs/heads/BRA_x", "refs/heads/rescue/a/b",
    "refs/heads/dependabot/a", "refs/tags/x", "HEAD", "+refs/heads/x", "refs/heads/a:b", "refs/heads/a..b",
    "refs/heads/.bad", "refs/heads/a.lock", "refs/heads/a ", "refs/heads/a/", "refs/heads/a\\b"])("rejects unsafe destination %s", (ref) => {
    expect(() => validateHotfixDestination(ref, ["dependabot/*"])).toThrow();
  });

  it("preserves the policy's case-sensitive backup patterns for ordinary feature names", () => {
    expect(validateHotfixDestination("refs/heads/codex/brand-fix", ["*BRA*"]))
      .toBe("refs/heads/codex/brand-fix");
  });

  it("binds the raw and expanded configured push URL and the hook's actual URL", () => {
    expect(validateHotfixRemote({ urls: [url], configuredUrls: [url], actualUrl: url })).toBe(url);
    for (const options of [
      { urls: [url, url], configuredUrls: [url] }, { urls: [url], configuredUrls: ["other"] },
      { urls: [url], configuredUrls: [url], remoteName: "fork" }, { urls: [url], configuredUrls: [url], actualUrl: `${url}/other` },
      { urls: ["https://github.com/other/sajtmaskin.git"], configuredUrls: ["https://github.com/other/sajtmaskin.git"] },
      { urls: ["/tmp/local.git"], configuredUrls: ["/tmp/local.git"] },
    ]) expect(() => validateHotfixRemote(options)).toThrow();
  });
});

const fixtures: string[] = [];
afterAll(() => {
  const temporary = realpathSync(tmpdir());
  for (const fixture of fixtures) {
    const absolute = realpathSync(fixture);
    if (!absolute.startsWith(`${temporary}${sep}sajtmaskin-hotfix-fixture-`)) throw new Error("Unsafe fixture cleanup path");
    rmSync(absolute, { recursive: true, force: true });
  }
});

function gitFixture() {
  const fixture = mkdtempSync(join(tmpdir(), "sajtmaskin-hotfix-fixture-"));
  fixtures.push(fixture);
  const root = join(fixture, "work"), remote = join(fixture, "remote.git").replaceAll("\\", "/");
  mkdirSync(root);
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(fixture, "absent-global"),
    GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_TERMINAL_PROMPT: "0", CI: "false", GITHUB_ACTIONS: "false", SAJTMASKIN_SKIP_VERIFY_HOOKS: "0" };
  for (const key of Object.keys(env)) if (/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)|NAMESPACE|INTERNAL_SUPER_PREFIX)$/.test(key)) delete env[key];
  const run = (exe: string, args: string[], extra: NodeJS.ProcessEnv = {}) => spawnSync(exe, args,
    { cwd: root, env: { ...env, ...extra }, encoding: "utf8", timeout: 30_000 });
  const g = (...args: string[]) => { const result = run("git", args); expect(result.status, result.stderr || result.stdout).toBe(0); return result.stdout.trim(); };
  g("init", "--quiet", "--initial-branch=fixture-base");
  g("config", "core.autocrlf", "false");
  g("init", "--bare", "--quiet", remote);
  g("remote", "add", "origin", remote);
  const copy = ["scripts/workflow/hotfix-push.mjs", "scripts/workflow/bugpass.mjs", "scripts/workflow/bugpass-state.mjs",
    "scripts/workflow/preview-push.mjs", "scripts/workflow/path-impact.mjs", "scripts/workflow/ci-scope.mjs",
    "scripts/workflow/check-contract.mjs", "scripts/dev/install-git-hooks.mjs", "scripts/dev/backup-retirements.mjs",
    "config/agent-workflow.json", "docs/schemas/strict/agent-workflow.schema.json", ".agents/skills/pr-workflow/SKILL.md"];
  for (const file of copy) { mkdirSync(dirname(join(root, file)), { recursive: true }); copyFileSync(resolve(file), join(root, file)); }
  // Native Git hooks/refs and all validation remain real. Only the hardcoded
  // GitHub endpoint is substituted in this disposable source copy so the
  // fixture can publish to a local bare repository without network/credentials.
  const wrapperPath = join(root, "scripts/workflow/hotfix-push.mjs");
  const source = readFileSync(wrapperPath, "utf8");
  const localized = source.replace(/^const CANONICAL_URL = .+;$/m,
    `const CANONICAL_URL = new RegExp(${JSON.stringify(`^${remote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)});`);
  expect(localized).not.toBe(source);
  writeFileSync(wrapperPath, localized);
  writeFileSync(join(root, ".gitignore"), "node_modules/\n");
  writeFileSync(join(root, "AGENTS.md"), "Synthetic fixture instructions; no real user authorization.\n");
  writeFileSync(join(root, "fixture.txt"), "common\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "verify:pr": "node scripts/workflow/verify-pr.mjs" } }));
  writeFileSync(join(root, "scripts/workflow/verify-pr.mjs"), [
    'import { appendFileSync } from "node:fs";', 'import { spawnSync } from "node:child_process";',
    'const args = process.argv.slice(2), explicit = args.indexOf("--base");',
    'const base = explicit < 0 ? "origin/preview" : args[explicit + 1];',
    'if (explicit >= 0 && args.join(" ") !== `--plan --committed --no-fetch --base ${base}`) process.exit(3);',
    'const status = spawnSync("git", ["merge-base", "--is-ancestor", base, "HEAD"]).status;',
    'appendFileSync(".git/plans", `${base}\\n`); process.exit(status === 0 ? 0 : 1);', "",
  ].join("\n"));
  g("add", "."); g("commit", "--quiet", "-m", "common");
  const common = g("rev-parse", "HEAD");
  g("checkout", "--quiet", "-b", "preview");
  writeFileSync(join(root, "preview.txt"), "unrelated staging\n");
  g("add", "preview.txt"); g("commit", "--quiet", "-m", "preview");
  const preview = g("rev-parse", "HEAD");
  g("checkout", "--quiet", "-b", "master", common);
  writeFileSync(join(root, "master.txt"), "production\n");
  g("add", "master.txt"); g("commit", "--quiet", "-m", "master");
  const master = g("rev-parse", "HEAD");
  g("push", "--quiet", "origin", "preview", "master");
  g("checkout", "--quiet", "-b", "hotfix/fixture");
  writeFileSync(join(root, "fixture.txt"), "hotfix\n");
  g("add", "fixture.txt"); g("commit", "--quiet", "-m", "hotfix");
  const fixtureHead = g("rev-parse", "HEAD");
  const hooks = join(root, ".git/hooks");
  writeFileSync(join(hooks, "pre-push"), renderHookScript("pre-push")); chmodSync(join(hooks, "pre-push"), 0o755);
  const cli = (...args: string[]) => run(process.execPath, ["scripts/workflow/hotfix-push.mjs", ...args]);
  const reviewCli = (...args: string[]) => run(process.execPath, ["scripts/workflow/bugpass.mjs", "--base", master, ...args]);
  expect(reviewCli().status).toBe(0);
  const cache = join(root, "node_modules/.cache/sajtmaskin-bugpass");
  const request = JSON.parse(readFileSync(join(cache, `${master}-${fixtureHead}.request.json`), "utf8"));
  const resultPath = join(root, ".git/review.json"), reviewerPath = join(root, ".git/reviewer.json");
  const finding = { id: "F1", priority: "P2", confidencePercent: 90, impactScore: 1, file: "fixture.txt", line: 1, description: "Synthetic fixture finding" };
  writeFileSync(resultPath, JSON.stringify({ base: master, head: fixtureHead, requestId: request.requestId,
    complete: true, summary: "Synthetic test evidence only", findings: [finding] }));
  writeFileSync(reviewerPath, JSON.stringify({ independent: true, provider: "fixture", reference: "synthetic-review", model: "fixture", reasoning: "high" }));
  expect(reviewCli("--import", resultPath, "--reviewer", reviewerPath).status).toBe(2);
  expect(reviewCli("--triage", fixtureHead, "F1", "reject", "Synthetic fixture evidence excludes this test finding.").status).toBe(0);
  const mandatePath = join(root, ".git/mandate.json");
  const actualMandate = { ...mandate, base: master, head: fixtureHead };
  writeFileSync(mandatePath, JSON.stringify(actualMandate));
  const prepareReceipt = () => cli("--prepare", "--destination", destination, "--approval", mandatePath);
  const receiptId = () => {
    const identity = hash(JSON.stringify([realpathSync(root), realpathSync(join(root, ".git")), realpathSync(join(root, ".git"))]));
    return JSON.parse(readFileSync(join(root, ".git/sajtmaskin-hotfix", identity, "prepared.json"), "utf8")).id as string;
  };
  return { root, remote, env, run, g, cli, master, preview, fixtureHead, prepareReceipt, receiptId, mandatePath, actualMandate, reviewCli };
}

describe("native Git hotfix push", () => {
  it("allows one prepared master-based feature push while preserving generic preview and all ref gates", () => {
    const f = gitFixture();
    expect(f.run("git", ["merge-base", "--is-ancestor", f.preview, f.fixtureHead]).status).toBe(1);
    expect(f.run("git", ["push", "origin", `${f.fixtureHead}:${destination}`]).status).toBe(1);
    const prepared = f.prepareReceipt();
    expect(prepared.status, prepared.stderr || prepared.stdout).toBe(0);
    expect(readFileSync(join(f.root, ".git/plans"), "utf8").trim().split(/\r?\n/)).toEqual(["origin/preview", f.master]);
    expect(f.cli("--dry-run").status).toBe(0);
    const signal = { SAJTMASKIN_HOTFIX_RECEIPT: f.receiptId(), CI: "true", SAJTMASKIN_SKIP_VERIFY_HOOKS: "1" };
    const push = (refs: string[], extra: NodeJS.ProcessEnv = {}) => f.run("git", ["push", "origin", ...refs], { ...signal, ...extra });
    const main = `${f.fixtureHead}:${destination}`;
    for (const refs of [[main, `${f.fixtureHead}:refs/heads/extra`], [main, `${f.fixtureHead}:refs/tags/extra`],
      [`${f.fixtureHead}:refs/heads/master`], [`${f.fixtureHead}:refs/heads/preview`], [`${f.fixtureHead}:refs/heads/BRA_fixture`],
      [`${f.fixtureHead}:refs/tags/only`]])
      expect(push(refs).status, refs.join(" ")).not.toBe(0);
    expect(push([main], { SAJTMASKIN_HOTFIX_RECEIPT: "invalid" }).status).toBe(1);
    expect(push([main], { SAJTMASKIN_HOTFIX_RECEIPT: "" }).status).toBe(1);
    expect(push([main], { SAJTMASKIN_HOTFIX_RECEIPT: "1".repeat(64) }).status).toBe(1);
    f.g("remote", "add", "other", f.remote);
    expect(f.run("git", ["push", "other", main], signal).status).toBe(1);
    f.g("remote", "set-url", "--add", "--push", "origin", f.remote);
    f.g("remote", "set-url", "--add", "--push", "origin", f.remote);
    expect(push([main]).status).toBe(1);
    f.g("config", "--unset-all", "remote.origin.pushurl");
    writeFileSync(f.mandatePath, JSON.stringify({ ...f.actualMandate, scope: "changed mandate" }));
    expect(push([main]).status).toBe(1);
    writeFileSync(f.mandatePath, JSON.stringify(f.actualMandate));
    const reviewPath = join(f.root, "node_modules/.cache/sajtmaskin-bugpass", `${f.master}-${f.fixtureHead}.review.json`);
    const originalReview = readFileSync(reviewPath, "utf8"), changedReview = JSON.parse(originalReview);
    changedReview.decisions[0].reason = "Changed author triage evidence";
    writeFileSync(reviewPath, JSON.stringify(changedReview));
    expect(push([main]).status).toBe(1);
    writeFileSync(reviewPath, originalReview);
    // Explicit byte checks catch dirty safety owners hidden by index flags.
    const owner = join(f.root, "scripts/workflow/verify-pr.mjs"), originalOwner = readFileSync(owner, "utf8");
    f.g("update-index", "--assume-unchanged", "scripts/workflow/verify-pr.mjs");
    writeFileSync(owner, `${originalOwner}\n// changed verifier\n`);
    expect(push([main]).status).toBe(1);
    writeFileSync(owner, originalOwner);
    f.g("update-index", "--no-assume-unchanged", "scripts/workflow/verify-pr.mjs");
    expect(f.cli("--confirm", f.master).status).toBe(1);
    const published = f.cli("--confirm", f.fixtureHead);
    expect(published.status, published.stderr || published.stdout).toBe(0);
    expect(f.g("ls-remote", "origin", destination)).toContain(f.fixtureHead);
    // Plan was prepared once; dry run, failed attempts and native hook reuse it.
    expect(readFileSync(join(f.root, ".git/plans"), "utf8").trim().split(/\r?\n/)).toEqual(["origin/preview", f.master]);
    expect(push([`:${destination}`], { SAJTMASKIN_PROVEN_REMOTE_DELETE_BRANCH: "hotfix/fixture", SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA: f.fixtureHead }).status).toBe(1);
    const force = f.run("git", ["push", "--force", "origin", `${f.master}:${destination}`], { ...signal,
      SAJTMASKIN_BREAK_GLASS: "1", SAJTMASKIN_BREAK_GLASS_REASON: "synthetic force must be refused" });
    expect(force.status).toBe(1);
    expect(f.g("ls-remote", "origin", destination)).toContain(f.fixtureHead);
  }, 180_000);

  it("rejects unrelated master, stale base/head and wrong remote repository", () => {
    const f = gitFixture();
    expect(f.prepareReceipt().status).toBe(0);
    const originalHead = f.fixtureHead;
    // Move remote master to a sibling commit: a current but unrelated base
    // cannot be authorized merely by copying a receipt's base field.
    f.g("--git-dir", f.remote, "update-ref", "refs/heads/master", f.preview);
    expect(f.cli("--dry-run").status).toBe(1);
    f.g("--git-dir", f.remote, "update-ref", "refs/heads/master", f.master);
    f.g("--git-dir", f.remote, "update-ref", destination, f.master);
    expect(f.cli("--dry-run").status).toBe(1); // Changed remote feature tip.
    f.g("--git-dir", f.remote, "update-ref", "-d", destination);
    writeFileSync(join(f.root, "fixture.txt"), "new head\n");
    f.g("add", "fixture.txt"); f.g("commit", "--quiet", "-m", "new head");
    expect(f.g("rev-parse", "HEAD")).not.toBe(originalHead);
    expect(f.cli("--dry-run").status).toBe(1);
    f.g("remote", "set-url", "origin", join(f.root, "another.git"));
    expect(f.cli("--dry-run").status).toBe(1);
  }, 180_000);
});
