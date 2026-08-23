import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const base = valueAfter("--base") ?? "origin/master";
const json = args.includes("--json");
const staged = args.includes("--staged");
const config = JSON.parse(
  readFileSync(new URL("../../config/change-impact.json", import.meta.url), "utf8"),
);

function gitDiffNames() {
  const outputs = staged
    ? [
        execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], {
          encoding: "utf8",
        }),
      ]
    : [
        execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...HEAD`], {
          encoding: "utf8",
        }),
        execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRD"], { encoding: "utf8" }),
        execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], {
          encoding: "utf8",
        }),
        execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }),
      ];
  return [
    ...new Set(
      outputs
        .join("\n")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

export { gitDiffNames };

export function analyze(files) {
  const owners = new Set();
  const checks = new Set();
  const protectedFiles = [];
  for (const file of files) {
    if (config.protectedPrefixes.some((prefix) => file.startsWith(prefix)))
      protectedFiles.push(file);
    for (const rule of config.rules) {
      if (!file.startsWith(rule.prefix)) continue;
      rule.owners.forEach((owner) => owners.add(owner));
      rule.checks.forEach((check) => checks.add(check));
    }
  }
  return {
    base,
    risk:
      protectedFiles.length > 0
        ? "high"
        : files.some((file) => file.startsWith("src/"))
          ? "medium"
          : "low",
    files,
    protectedFiles,
    owners: [...owners].sort(),
    checks: [...checks].sort(),
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = analyze(gitDiffNames());
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Risk: ${result.risk}`);
    console.log(`Owners: ${result.owners.join(", ") || "none"}`);
    console.log(`Checks: ${result.checks.join(", ") || "none"}`);
    if (result.protectedFiles.length) console.log(`Protected: ${result.protectedFiles.join(", ")}`);
  }
}
