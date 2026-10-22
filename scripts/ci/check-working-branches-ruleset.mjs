import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SPEC_PATH = resolve(ROOT, ".github/rulesets/protect-working-branches.expected.json");
const FIELDS = ["name", "target", "enforcement", "conditions", "bypass_actors", "rules"];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
  return value;
}

export function evaluateWorkingBranchesRuleset(live, spec, { readOnly = false } = {}) {
  if (spec?.schemaVersion !== 1 || FIELDS.some((key) => spec.expected?.[key] === undefined)) {
    return ["invalid working-branches ruleset spec"];
  }
  // GitHub hides bypass_actors from tokens without ruleset write access.
  // Read-only mode may report that field as unverified, never ignore a visible mismatch.
  return FIELDS.filter((key) => !(readOnly && key === "bypass_actors" && live?.[key] === undefined)).filter((key) =>
    JSON.stringify(canonical(live?.[key])) !== JSON.stringify(canonical(spec.expected[key])),
  ).map((key) => "working-branches ruleset drift: " + key);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--read-only")) throw new Error("unknown argument");
  const readOnly = args.includes("--read-only");
  const spec = JSON.parse(await readFile(SPEC_PATH, "utf8"));
  const repository = process.env.GITHUB_REPOSITORY || spec.repository;
  if (repository !== "Jakeminator123/sajtmaskin" || repository !== spec.repository) {
    throw new Error("repository mismatch; refusing to read another repository");
  }
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sajtmaskin-working-branches-audit",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = "Bearer " + token;
  const api = "https://api.github.com/repos/" + repository + "/rulesets";
  const index = await fetch(api + "?per_page=100", { headers });
  if (!index.ok) throw new Error("ruleset list failed: " + index.status);
  // Never treat an incomplete inventory as proof that there is exactly one owner.
  if (index.headers.get("link")?.includes('rel="next"')) {
    throw new Error("ruleset list is incomplete; refusing a partial audit");
  }
  const rulesets = await index.json();
  if (!Array.isArray(rulesets)) throw new Error("invalid ruleset list");
  const matches = rulesets.filter((item) => item?.name === spec.expected?.name);
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id <= 0) {
    throw new Error("expected exactly one working-branches ruleset, found " + matches.length);
  }
  const response = await fetch(api + "/" + matches[0].id, { headers });
  if (!response.ok) throw new Error("ruleset read failed: " + response.status);
  const live = await response.json();
  const issues = evaluateWorkingBranchesRuleset(live, spec, { readOnly });
  if (issues.length) throw new Error(issues.join("\n"));
  if (readOnly && live?.bypass_actors === undefined) {
    const warning = "Partial working-branch audit: public fields match; bypass actors UNVERIFIED. " +
      "GitHub omits them for this token. Run the default full audit with an authorized operator token after any ruleset change.";
    console.warn("::warning::" + warning);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, "\n### Working-branch protection: PARTIAL audit\n\n" + warning + "\n");
    }
  } else {
    console.log("Working-branch deletion protection matches versioned policy (including bypass actors)");
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
