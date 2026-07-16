import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isActiveMarkdown } from "./check-active-doc-links.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CANONICAL_GLOSSARY = "docs/architecture/glossary.md";
const DEPRECATED_CANONICAL_TERMS = new Set([
  "mekaniskautofix",
  "llmfix",
  "qualitygate",
  "templatelibrary",
]);
const REQUIRED_CANONICAL_TERMS = Object.freeze([
  "Normalize",
  "RepairGate",
  "RenderGate",
  "ReleaseGate",
  "Advisory",
  "Blocker",
  "CapabilitySmoke",
  "Template (v0-mall)",
]);
const WB_L = "(?<![\\p{L}\\p{N}_])";
const WB_R = "(?![\\p{L}\\p{N}_])";

function compareText(left, right) {
  return left.localeCompare(right, "en");
}

export function normalizeTerm(value) {
  return String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function aliasRegex(alias, caseSensitive) {
  const escaped = alias
    .replace(/[.*+?^${}()|[\]\\]/g, "\\  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`${WB_L}${escaped}${WB_R}`, caseSensitive ? "gu" : "giu");
}

function proseOnly(content) {
  return content
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1.*$/gm, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    const normalized = normalizeTerm(value);
    if (seen.has(normalized)) repeated.add(value);
    seen.add(normalized);
  }
  return [...repeated].sort(compareText);
}

export async function checkTerminologyContract({
  dictionary,
  trackedPaths,
  readTrackedFile,
} = {}) {
  const tracked = trackedPaths ??
    execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  const read = readTrackedFile ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));
  const dict = dictionary ?? JSON.parse(await read("config/naming-dictionary.json"));
  const errors = [];

  if (dict._canonicalSource !== CANONICAL_GLOSSARY) {
    errors.push(`naming dictionary must declare ${CANONICAL_GLOSSARY} as _canonicalSource`);
  }

  const glossaryPaths = tracked
    .filter(
      (path) =>
        isActiveMarkdown(path) && (path === "glossary.md" || path.endsWith("/glossary.md")),
    )
    .sort(compareText);
  if (glossaryPaths.length !== 1 || glossaryPaths[0] !== CANONICAL_GLOSSARY) {
    errors.push(
      `active glossary paths must equal ${CANONICAL_GLOSSARY}; got ${glossaryPaths.join(", ")}`,
    );
  }

  const canonicalTerms = Array.isArray(dict.canonicalTerms) ? dict.canonicalTerms : [];
  const aliases = Array.isArray(dict.forbiddenAliases) ? dict.forbiddenAliases : [];
  for (const [index, entry] of aliases.entries()) {
    if (!entry?.alias || !entry?.canonical) {
      errors.push(`forbiddenAliases[${index}] must declare alias and canonical`);
    }
  }
  for (const duplicate of duplicates(canonicalTerms)) {
    errors.push(`duplicate canonical term: ${duplicate}`);
  }
  for (const duplicate of duplicates(aliases.map((entry) => entry.alias).filter(Boolean))) {
    errors.push(`duplicate forbidden alias: ${duplicate}`);
  }

  const canonicalNormalized = new Set(canonicalTerms.map(normalizeTerm));
  for (const required of REQUIRED_CANONICAL_TERMS) {
    if (!canonicalNormalized.has(normalizeTerm(required))) {
      errors.push(`missing canonical term: ${required}`);
    }
  }
  for (const term of canonicalTerms) {
    if (DEPRECATED_CANONICAL_TERMS.has(normalizeTerm(term))) {
      errors.push(`deprecated alias listed as canonical: ${term}`);
    }
  }

  const aliasNormalized = new Set(aliases.map((entry) => normalizeTerm(entry.alias ?? "")));
  for (const term of canonicalTerms) {
    if (aliasNormalized.has(normalizeTerm(term))) {
      errors.push(`term is both canonical and forbidden: ${term}`);
    }
  }

  const glossary = tracked.includes(CANONICAL_GLOSSARY) ? await read(CANONICAL_GLOSSARY) : "";
  for (const required of REQUIRED_CANONICAL_TERMS) {
    if (!glossary.includes(required)) errors.push(`canonical glossary is missing ${required}`);
  }

  const blockingAliases = aliases.filter((entry) => entry.blockInActiveDocs === true);
  for (const path of tracked.filter(isActiveMarkdown).sort(compareText)) {
    if (path === CANONICAL_GLOSSARY) continue;
    const content = proseOnly(await read(path));
    for (const entry of blockingAliases) {
      if ((entry.ignorePathContains ?? []).some((fragment) => path.includes(fragment))) continue;
      const regex = aliasRegex(entry.alias, entry.caseSensitive === true);
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        regex.lastIndex = 0;
        if (regex.test(lines[index])) {
          errors.push(`${path}:${index + 1}: ${entry.alias} -> ${entry.canonical}`);
        }
      }
    }
  }

  return errors;
}

async function main() {
  const errors = await checkTerminologyContract();
  if (errors.length > 0) {
    for (const error of errors) console.error(`[terms:contract] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("[terms:contract] Glossary ownership, aliases and active docs are consistent.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
