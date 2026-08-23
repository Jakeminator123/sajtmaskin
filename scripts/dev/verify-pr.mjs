import { execFileSync } from "node:child_process";
import { analyze, gitDiffNames } from "./change-impact.mjs";

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const base = baseIndex >= 0 ? args[baseIndex + 1] : "origin/master";
const dryRun = args.includes("--dry-run");
const files = gitDiffNames();
const impact = analyze(files);
const ordered = [
  "check:agent-context",
  "docs:test",
  "control-plane:check",
  "backoffice:test",
  "db:schema-drift",
  "baseline-deps:verify",
  "baseline-deps:tree",
  "typecheck",
  "test:ci",
  "lint",
];
const selected = ordered.filter((check) => impact.checks.includes(check));

console.log(JSON.stringify(impact, null, 2));
if (files.length === 0) throw new Error(`Ingen diff mot ${base}.`);
if (dryRun) {
  console.log(
    `Would run: ${selected.map((check) => `npm run ${check}`).join(" && ") || "git diff --check"}`,
  );
  process.exit(0);
}
for (const check of selected)
  execFileSync("npm", ["run", check], { stdio: "inherit", shell: process.platform === "win32" });
execFileSync("git", ["diff", "--check", `${base}...HEAD`], { stdio: "inherit" });
execFileSync("git", ["diff", "--check"], { stdio: "inherit" });
console.log(`PR-ready lokalt: ${selected.length} riktade kontroller + git diff --check passerade.`);
