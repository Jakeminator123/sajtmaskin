#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, SHA, command, git, readyReview, reviewContract, reviewProof } from "./bugpass.mjs";

const REPOSITORY = "Jakeminator123/sajtmaskin";
const CANONICAL_URL = /^(https:\/\/github\.com\/|git@github\.com:)Jakeminator123\/sajtmaskin(?:\.git)?$/;
const KIND = "master-hotfix-feature-pr-push";
const BASE_REF = "refs/heads/master";
const ZERO = "0".repeat(40);
const DIGEST = /^[a-f0-9]{64}$/;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const text = (value) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 2048;
const STATE_FIELDS = ["repository", "repositoryId", "worktreeRoot", "commonDir", "gitDir", "branch", "remoteName",
  "canonicalPushUrl", "baseRef", "base", "head", "tree", "destinationRef", "remoteTip", "reviewProof", "contractDigest"];

// Include the code actually used to plan, inspect and accept the push. The
// independent review's own contract additionally covers agent instructions.
const CONTRACT_FILES = ["scripts/workflow/hotfix-push.mjs", "scripts/workflow/verify-pr.mjs",
  "scripts/dev/install-git-hooks.mjs", "scripts/workflow/path-impact.mjs", "scripts/workflow/ci-scope.mjs",
  "scripts/workflow/check-contract.mjs", "scripts/workflow/bugpass.mjs", "scripts/workflow/bugpass-state.mjs",
  "scripts/workflow/preview-push.mjs", "config/agent-workflow.json",
  "docs/schemas/strict/agent-workflow.schema.json", "package.json"];

export function validateHotfixRemote({ urls, configuredUrls, remoteName = "origin", actualUrl } = {}) {
  if (remoteName !== "origin" || !Array.isArray(urls) || urls.length !== 1 || !CANONICAL_URL.test(urls[0]) ||
      !Array.isArray(configuredUrls) || configuredUrls.length !== 1 || configuredUrls[0] !== urls[0] ||
      (actualUrl !== undefined && actualUrl !== urls[0]))
    throw new Error("Hotfix requires origin with one exact canonical Sajtmaskin push URL; rewrites/other remotes are not accepted.");
  return urls[0];
}

function branchMatches(branch, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${escaped}$`).test(branch);
}

export function validateHotfixDestination(ref, protectedPatterns = []) {
  const branch = typeof ref === "string" && ref.startsWith("refs/heads/") ? ref.slice(11) : "";
  if (!branch || /[\x00-\x20\x7f~^:?*\[\\]/.test(branch) || branch.includes("..") || branch.includes("@{") ||
      branch.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock")) ||
      ["master", "main", "preview", "*BRA*", "rescue/*", ...protectedPatterns].some((pattern) => branchMatches(branch, pattern)))
    throw new Error("Hotfix destination must be one valid, unprotected feature branch ref.");
  return ref;
}

// This binds a reference to the real owner instruction. A local JSON/hash is
// NOT authentication of the user; the trusted host must read that instruction.
export function validateHotfixMandate(mandate, state) {
  if (mandate?.version !== 1 || mandate.kind !== KIND || mandate.repository !== REPOSITORY ||
      mandate.baseRef !== BASE_REF || mandate.base !== state.base || mandate.head !== state.head ||
      mandate.destinationRef !== state.destinationRef || !text(mandate.scope) ||
      mandate.source?.kind !== "host-user-message" || !text(mandate.source.threadId) || !text(mandate.source.messageId))
    throw new Error("Missing/stale hotfix mandate: exact repository, scope, master base, head, destination and real owner-message reference required.");
}

function validateState(state) {
  if (state?.repository !== REPOSITORY || state.baseRef !== BASE_REF || state.remoteName !== "origin" ||
      !SHA.test(state.base ?? "") || !SHA.test(state.head ?? "") || !SHA.test(state.tree ?? "") ||
      !SHA.test(state.remoteTip ?? "") || state.base === ZERO || state.head === ZERO || state.tree === ZERO || state.base === state.head ||
      !DIGEST.test(state.repositoryId ?? "") || !DIGEST.test(state.reviewProof ?? "") || !DIGEST.test(state.contractDigest ?? "") ||
      [state.worktreeRoot, state.commonDir, state.gitDir, state.branch].some((value) => !text(value)))
    throw new Error("Invalid observed hotfix repository/HEAD/base/review/contract state.");
  validateHotfixDestination(state.destinationRef);
}

export function validateHotfixPrepared(receipt, state, approval) {
  validateState(state);
  validateHotfixMandate(approval.mandate, state);
  if (receipt?.version !== 1 || receipt.kind !== KIND || receipt.verification !== "verify:pr:plan:committed" ||
      !Number.isFinite(Date.parse(receipt.plannedAt)) || STATE_FIELDS.some((field) => receipt[field] !== state[field]) ||
      !DIGEST.test(approval.digest ?? "") || receipt.approvalDigest !== approval.digest || receipt.approvalFile !== approval.path ||
      !same(receipt.approvalSource, approval.mandate.source))
    throw new Error("No current hotfix review/mandate/plan receipt; run npm run hotfix:prepare again.");
}

export function prepareHotfix(state, approval, actions) {
  validateState(state);
  validateHotfixMandate(approval.mandate, state);
  actions.plan(state.base);
  const receipt = { version: 1, kind: KIND, ...Object.fromEntries(STATE_FIELDS.map((key) => [key, state[key]])),
    approvalFile: approval.path, approvalDigest: approval.digest, approvalSource: approval.mandate.source,
    verification: "verify:pr:plan:committed", plannedAt: new Date().toISOString() };
  validateHotfixPrepared(receipt, actions.readState(), actions.readApproval());
  return receipt;
}

export function validateHotfixPushUpdates(input, receipt) {
  const lines = String(input).split(/\r?\n/).filter((line) => line.trim());
  const parts = lines.length === 1 ? lines[0].trim().split(/\s+/) : [];
  if (parts.length !== 4 || parts[0] !== receipt.head || parts[1] !== receipt.head ||
      parts[2] !== receipt.destinationRef || parts[3] !== receipt.remoteTip)
    throw new Error("Hotfix push requires exactly one SHA:feature update with the prepared HEAD and remote tip; no extra/protected/tag/delete refs.");
}

export function publishHotfix(receipt, confirmation, actions) {
  if (!SHA.test(receipt.head ?? "") || confirmation !== receipt.head)
    throw new Error(`Hotfix requires the owner-approved full SHA: --confirm ${receipt.head}`);
  actions.check();
  actions.push();
  return receipt;
}

function identity() {
  const worktreeRoot = realpathSync(git(["rev-parse", "--show-toplevel"]));
  if (worktreeRoot !== realpathSync(ROOT)) throw new Error("Hotfix must inspect this exact worktree.");
  const commonDir = realpathSync(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const gitDir = realpathSync(git(["rev-parse", "--absolute-git-dir"]));
  return { worktreeRoot, commonDir, gitDir, repositoryId: digest(JSON.stringify([worktreeRoot, commonDir, gitDir])) };
}

function cacheDir() {
  const { commonDir, repositoryId } = identity();
  return join(commonDir, "sajtmaskin-hotfix", repositoryId);
}

function readApproval(file) {
  const path = realpathSync(resolve(file)), content = readFileSync(path);
  return { path, digest: digest(content), mandate: JSON.parse(content.toString("utf8")) };
}

function contractDigest() {
  const policies = git(["ls-files", "-z", "--", "AGENTS.md", "**/AGENTS.md", ".cursor/rules/*.mdc",
    ".agents/skills/pr-workflow/SKILL.md", ".codex/README.md", "docs/runbooks/agent-workflow.md", "docs/runbooks/buggpass.md"])
    .split("\0").filter(Boolean);
  const files = [...new Set([...CONTRACT_FILES, ...policies])].sort().map((path) => {
    // hash-object applies the repository's normal clean filters, including
    // CRLF handling. Explicit comparison also catches assume-unchanged flags.
    if (git(["hash-object", `--path=${path}`, path]) !== git(["rev-parse", `HEAD:${path}`]))
      throw new Error(`Hotfix verification owner differs from committed HEAD: ${path}`);
    return [path, digest(readFileSync(join(ROOT, path)))];
  });
  return digest(JSON.stringify({ files, reviewContract: reviewContract() }));
}

export function hotfixState(destinationRef, { fetch = false, remoteName = "origin", actualUrl } = {}) {
  const repo = identity();
  if (git(["status", "--porcelain", "--untracked-files=normal"])) throw new Error("Hotfix requires a strictly clean index/worktree at exact HEAD.");
  for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer", "BISECT_LOG"]) {
    if (existsSync(git(["rev-parse", "--git-path", name]))) throw new Error(`Finish the active Git operation first: ${name}`);
  }
  const policy = JSON.parse(readFileSync(join(ROOT, "config/agent-workflow.json"), "utf8"));
  if (policy.trunk !== "master" || policy.deliveryBranch !== "preview" || !Array.isArray(policy.protectedBranchPatterns))
    throw new Error("Unexpected hotfix branch policy.");
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  validateHotfixDestination(`refs/heads/${branch}`, policy.protectedBranchPatterns);
  validateHotfixDestination(destinationRef, policy.protectedBranchPatterns);
  git(["check-ref-format", destinationRef]);
  const configured = git(["config", "--get-regexp", "^remote\\.origin\\.(url|pushurl)$"]).split(/\r?\n/);
  const configuredFetch = configured.filter((line) => line.startsWith("remote.origin.url ")).map((line) => line.slice(18));
  const configuredPush = configured.filter((line) => line.startsWith("remote.origin.pushurl ")).map((line) => line.slice(22));
  if (configuredFetch.length !== 1 || !CANONICAL_URL.test(configuredFetch[0])) throw new Error("origin fetch URL must be the canonical repository.");
  const canonicalPushUrl = validateHotfixRemote({ remoteName, actualUrl,
    urls: git(["remote", "get-url", "--push", "--all", "origin"]).split(/\r?\n/),
    configuredUrls: configuredPush.length ? configuredPush : configuredFetch });
  let fetched;
  if (fetch) {
    git(["fetch", "--quiet", "--no-tags", "--no-recurse-submodules", canonicalPushUrl, BASE_REF]);
    fetched = git(["rev-parse", "FETCH_HEAD"]);
  }
  const refs = new Map();
  for (const row of git(["ls-remote", "--refs", canonicalPushUrl, BASE_REF, destinationRef]).split(/\r?\n/).filter(Boolean)) {
    const [sha, ref, extra] = row.split(/\s+/);
    if (!SHA.test(sha ?? "") || sha === ZERO || ![BASE_REF, destinationRef].includes(ref) || refs.has(ref) || extra)
      throw new Error("Ambiguous remote hotfix refs.");
    refs.set(ref, sha);
  }
  const base = refs.get(BASE_REF), head = git(["rev-parse", "HEAD"]), tree = git(["rev-parse", "HEAD^{tree}"]);
  if (!SHA.test(base ?? "") || (fetch && fetched !== base)) throw new Error("Remote master missing/changed while fetching; prepare again.");
  git(["merge-base", "--is-ancestor", base, head]);
  const remoteTip = refs.get(destinationRef) ?? ZERO;
  if (remoteTip !== ZERO) git(["merge-base", "--is-ancestor", remoteTip, head]);
  const state = { repository: REPOSITORY, ...repo, branch, remoteName, canonicalPushUrl, baseRef: BASE_REF,
    base, head, tree, destinationRef, remoteTip, contractDigest: contractDigest(), reviewProof: reviewProof(readyReview(base, head)) };
  validateState(state);
  return state;
}

function saveReceipt(receipt) {
  const dir = cacheDir(), body = `${JSON.stringify(receipt, null, 2)}\n`, id = digest(body);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), body);
  writeFileSync(join(dir, "prepared.json"), JSON.stringify({ id }));
  return id;
}

function loadReceipt(id) {
  if (!DIGEST.test(id ?? "")) throw new Error("Invalid hotfix receipt selector.");
  const body = readFileSync(join(cacheDir(), `${id}.json`));
  if (digest(body) !== id) throw new Error("Hotfix receipt content changed.");
  return JSON.parse(body.toString("utf8"));
}

export function checkHotfixPrepared(id, options = {}) {
  const receipt = loadReceipt(id);
  const state = hotfixState(receipt.destinationRef, options);
  validateHotfixPrepared(receipt, state, readApproval(receipt.approvalFile));
  return receipt;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--hook" && args.length === 4) {
    const id = process.env.SAJTMASKIN_HOTFIX_RECEIPT;
    const receipt = loadReceipt(id);
    validateHotfixPushUpdates(args[3], receipt);
    checkHotfixPrepared(id, { remoteName: args[1], actualUrl: args[2] });
    console.log(`[hotfix] Reused master-based committed review/plan for ${receipt.head}; PR/master CI still required.`);
    return;
  }
  if (args.length === 5 && args[0] === "--prepare" && args[1] === "--destination" && args[3] === "--approval") {
    const approval = readApproval(args[4]), state = hotfixState(args[2], { fetch: true });
    const receipt = prepareHotfix(state, approval, {
      plan: (base) => command(process.execPath, ["scripts/workflow/verify-pr.mjs", "--plan", "--committed", "--no-fetch", "--base", base], { stdio: "inherit" }),
      readState: () => hotfixState(args[2]), readApproval: () => readApproval(args[4]),
    });
    const id = saveReceipt(receipt);
    console.log(`[hotfix] Prepared ${receipt.head} -> ${receipt.destinationRef}; receipt ${id}. Plan only; report targeted tests separately. Nothing pushed.`);
    return;
  }
  if (!(args.length === 1 && args[0] === "--dry-run") && !(args.length === 2 && args[0] === "--confirm" && SHA.test(args[1])))
    throw new Error("Use hotfix:prepare -- --destination refs/heads/<feature> --approval <mandate.json>, then hotfix:push -- --dry-run or --confirm <owner-approved full SHA>.");
  const { id } = JSON.parse(readFileSync(join(cacheDir(), "prepared.json"), "utf8"));
  const receipt = checkHotfixPrepared(id);
  if (args[0] === "--dry-run") {
    console.log(`[hotfix] DRY RUN OK ${receipt.base}..${receipt.head} -> ${receipt.destinationRef}; no push/model call. Exact owner mandate and confirmation required.`);
    return;
  }
  publishHotfix(receipt, args[1], {
    check: () => checkHotfixPrepared(id),
    push: () => command("git", ["push", "origin", `${receipt.head}:${receipt.destinationRef}`], {
      stdio: "inherit", env: { ...process.env, SAJTMASKIN_HOTFIX_RECEIPT: id },
    }),
  });
  console.log(`[hotfix] Published ${receipt.head} to feature branch ${receipt.destinationRef}; create/review the PR against master. CI, merge and preview sync remain separate.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[hotfix] STOP: ${error.message}`); process.exitCode = 1; });
}
