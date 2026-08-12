import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isActiveMarkdown } from "./check-active-doc-links.mjs";
import {
  CANONICAL_GLOSSARY,
  aliasRegex,
  markdownProseLines,
  normalizeRules,
  normalizeTerm,
  parseGlossary,
} from "./terminology-core.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DICTIONARY_KEYS = new Set(["_comment", "_canonicalSource", "rules", "pascalCaseAllowlist"]);
const RULE_KEYS = new Set(["match", "canonicalTerms", "caseSensitive", "severity"]);

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    const normalized = normalizeTerm(value);
    if (seen.has(normalized)) repeated.add(value);
    seen.add(normalized);
  }
  return [...repeated].sort((left, right) => left.localeCompare(right, "en"));
}

function mappingRowsForMatch(aliasRows, match) {
  const needle = normalizeTerm(match);
  return aliasRows.filter((row) => normalizeTerm(row.left).includes(needle));
}

export async function checkTerminologyContract({ dictionary, trackedPaths, readTrackedFile } = {}) {
  const tracked =
    trackedPaths ??
    execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" })
      .split("\0")
      .filter((path) => path && existsSync(resolve(REPO_ROOT, path)));
  const read = readTrackedFile ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));
  const dict = dictionary ?? JSON.parse(await read("config/naming-dictionary.json"));
  const errors = [];

  if (dict._canonicalSource !== CANONICAL_GLOSSARY) {
    errors.push(`naming dictionary must declare ${CANONICAL_GLOSSARY} as _canonicalSource`);
  }
  for (const key of Object.keys(dict)) {
    if (!DICTIONARY_KEYS.has(key)) {
      errors.push(`naming dictionary uses unsupported or human-semantics key: ${key}`);
    }
  }
  if (!Array.isArray(dict.pascalCaseAllowlist)) {
    errors.push("naming dictionary must declare a pascalCaseAllowlist array");
  } else {
    const allowlist = dict.pascalCaseAllowlist.filter(
      (term) => typeof term === "string" && term.trim(),
    );
    if (allowlist.length !== dict.pascalCaseAllowlist.length) {
      errors.push("pascalCaseAllowlist must contain only non-empty strings");
    }
    for (const duplicate of duplicates(allowlist)) {
      errors.push(`duplicate pascalCaseAllowlist term: ${duplicate}`);
    }
  }

  const glossaryPaths = tracked
    .filter(
      (path) => isActiveMarkdown(path) && (path === "glossary.md" || path.endsWith("/glossary.md")),
    )
    .sort((left, right) => left.localeCompare(right, "en"));
  if (glossaryPaths.length !== 1 || glossaryPaths[0] !== CANONICAL_GLOSSARY) {
    errors.push(
      `active glossary paths must equal ${CANONICAL_GLOSSARY}; got ${glossaryPaths.join(", ")}`,
    );
  }

  const glossaryText = tracked.includes(CANONICAL_GLOSSARY) ? await read(CANONICAL_GLOSSARY) : "";
  const glossary = parseGlossary(glossaryText);
  for (const section of glossary.missingSections) {
    errors.push(`canonical glossary is missing section: ${section}`);
  }
  for (const term of glossary.duplicateCanonicalRows) {
    errors.push(`duplicate canonical glossary term row: ${term}`);
  }
  for (const alias of glossary.duplicateAliasRows) {
    errors.push(`duplicate glossary alias row: ${alias}`);
  }

  const rawRules = Array.isArray(dict.rules) ? dict.rules : [];
  if (!Array.isArray(dict.rules)) errors.push("naming dictionary must declare a rules array");
  const rules = normalizeRules(dict);
  for (const [index, rawRule] of rawRules.entries()) {
    for (const key of Object.keys(rawRule ?? {})) {
      if (!RULE_KEYS.has(key)) errors.push(`rules[${index}] uses unsupported key: ${key}`);
    }
    const hasNonEmptyMatch = typeof rawRule?.match === "string" && rawRule.match.trim().length > 0;
    const hasCanonicalTerms =
      Array.isArray(rawRule?.canonicalTerms) &&
      rawRule.canonicalTerms.length > 0 &&
      rawRule.canonicalTerms.every((term) => typeof term === "string" && term.trim().length > 0);
    if (!hasNonEmptyMatch || !hasCanonicalTerms) {
      errors.push(`rules[${index}] must declare match and non-empty canonicalTerms`);
    }
    if (!new Set(["advisory", "block"]).has(rawRule?.severity)) {
      errors.push(`rules[${index}] must declare severity advisory or block`);
    }
    if (
      Object.prototype.hasOwnProperty.call(rawRule ?? {}, "caseSensitive") &&
      typeof rawRule.caseSensitive !== "boolean"
    ) {
      errors.push(`rules[${index}].caseSensitive must be boolean when present`);
    }
  }
  for (const duplicate of duplicates(rules.map((rule) => rule.match).filter(Boolean))) {
    errors.push(`duplicate terminology match rule: ${duplicate}`);
  }

  for (const rule of rules) {
    if (!rule.match || rule.canonicalTerms.length === 0) continue;
    const mappings = mappingRowsForMatch(glossary.aliasRows, rule.match);
    if (mappings.length !== 1) {
      errors.push(
        `terminology rule ${rule.match} must resolve to exactly one glossary alias row; got ${mappings.length}`,
      );
      continue;
    }
    const replacement = normalizeTerm(mappings[0].right);
    for (const canonical of rule.canonicalTerms) {
      const normalizedCanonical = normalizeTerm(canonical);
      if (!glossary.canonicalTerms.has(normalizedCanonical)) {
        errors.push(`terminology rule ${rule.match} targets missing canonical term: ${canonical}`);
      }
      if (!replacement.includes(normalizedCanonical)) {
        errors.push(
          `terminology rule ${rule.match} disagrees with glossary replacement: ${canonical}`,
        );
      }
    }
    if (glossary.canonicalTerms.has(normalizeTerm(rule.match))) {
      errors.push(`term is both canonical and a terminology match rule: ${rule.match}`);
    }
  }

  const blockingRules = rules.filter((rule) => rule.severity === "block");
  for (const path of tracked.filter(isActiveMarkdown).sort()) {
    if (path === CANONICAL_GLOSSARY) continue;
    const proseLines = markdownProseLines(await read(path));
    for (const rule of blockingRules) {
      const regex = aliasRegex(rule.match, rule.caseSensitive);
      for (const { line, text } of proseLines) {
        regex.lastIndex = 0;
        if (regex.test(text)) {
          errors.push(`${path}:${line}: ${rule.match} -> ${rule.canonicalTerms.join(" / ")}`);
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
  console.log("[terms:contract] Glossary ownership, machine rules and active docs are consistent.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
