#!/usr/bin/env node
/**
 * Advisory terminology scan for active human-authored Markdown prose.
 *
 * Human meanings live in docs/architecture/glossary.md. The naming dictionary
 * only selects machine-match rules and a PascalCase false-positive allowlist.
 * Runtime identifiers, generated docs, code spans and historical plans are not
 * prose migration work and are deliberately outside this scan.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isActiveMarkdown } from "../docs/check-active-doc-links.mjs";
import {
  CANONICAL_GLOSSARY,
  aliasRegex,
  markdownProseLines,
  normalizeRules,
  normalizeTerm,
  parseGlossary,
} from "../docs/terminology-core.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_PER_RULE = 12;
const MAX_UNKNOWN_TERMS = 25;
const CAMEL_RX = /(?<![\p{L}\p{N}_])(?:\p{Lu}[\p{Ll}\d]+){2,}(?![\p{L}\p{N}_])/gu;

export function isTerminologyProsePath(path) {
  return (
    isActiveMarkdown(path) && path !== CANONICAL_GLOSSARY && !path.startsWith("docs/generated/")
  );
}

export function analyzeTerminologyCoverage({ documents, dictionary, glossaryText }) {
  const rules = normalizeRules(dictionary);
  const aliasHits = [];
  for (const rule of rules) {
    const regex = aliasRegex(rule.match, rule.caseSensitive);
    for (const [path, content] of documents) {
      for (const { line, text } of markdownProseLines(content)) {
        regex.lastIndex = 0;
        if (!regex.test(text)) continue;
        aliasHits.push({
          path,
          line,
          match: rule.match,
          canonicalTerms: rule.canonicalTerms,
          severity: rule.severity,
          snippet: text.trim().slice(0, 120),
        });
      }
    }
  }

  const knownTerms = new Set(parseGlossary(glossaryText).canonicalTerms);
  for (const term of dictionary?.pascalCaseAllowlist ?? []) {
    knownTerms.add(normalizeTerm(term));
  }
  for (const rule of rules) {
    knownTerms.add(normalizeTerm(rule.match));
    for (const term of rule.canonicalTerms) knownTerms.add(normalizeTerm(term));
  }
  const unknownByTerm = new Map();
  for (const [path, content] of documents) {
    for (const { line, text } of markdownProseLines(content)) {
      for (const match of text.matchAll(CAMEL_RX)) {
        const term = match[0];
        const normalized = normalizeTerm(term);
        if (normalized.length < 6 || knownTerms.has(normalized)) continue;
        const record = unknownByTerm.get(term) ?? { term, count: 0, first: `${path}:${line}` };
        record.count += 1;
        unknownByTerm.set(term, record);
      }
    }
  }

  return {
    aliasHits,
    unknownTerms: [...unknownByTerm.values()].sort(
      (left, right) => right.count - left.count || left.term.localeCompare(right.term, "en"),
    ),
  };
}

function loadRepositoryInputs() {
  const dictionary = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "config/naming-dictionary.json"), "utf8"),
  );
  const glossaryText = readFileSync(resolve(REPO_ROOT, CANONICAL_GLOSSARY), "utf8");
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => isTerminologyProsePath(path) && existsSync(resolve(REPO_ROOT, path)));
  const documents = new Map(
    tracked.map((path) => [path, readFileSync(resolve(REPO_ROOT, path), "utf8")]),
  );
  return { dictionary, glossaryText, documents };
}

function main() {
  console.log("[check:terms] Rådgivande scan av aktiv Markdown-prosa");
  console.log(`[check:terms] Mänsklig källa: ${CANONICAL_GLOSSARY}`);
  const result = analyzeTerminologyCoverage(loadRepositoryInputs());

  console.log("\n== A. Maskinvalda namnskuggor ==");
  const rules = new Map();
  for (const hit of result.aliasHits) {
    const list = rules.get(hit.match) ?? [];
    list.push(hit);
    rules.set(hit.match, list);
  }
  if (rules.size === 0) console.log("  (inga träffar i aktiv prosa)");
  for (const [match, hits] of rules) {
    console.log(
      `\nWARN  ${match} -> ${hits[0].canonicalTerms.join(" / ")} (${hits.length} träffar)`,
    );
    for (const hit of hits.slice(0, MAX_PER_RULE)) {
      console.log(`      ${hit.path}:${hit.line}  ${hit.snippet}`);
    }
    if (hits.length > MAX_PER_RULE) {
      console.log(`      ... (+${hits.length - MAX_PER_RULE} fler träffar)`);
    }
  }

  console.log("\n== B. Okända PascalCase-kandidater ==");
  if (result.unknownTerms.length === 0) console.log("  (inga kandidater)");
  for (const record of result.unknownTerms.slice(0, MAX_UNKNOWN_TERMS)) {
    console.log(
      `WARN  okänt begrepp "${record.term}" (${record.count} träffar) först: ${record.first}`,
    );
  }
  if (result.unknownTerms.length > MAX_UNKNOWN_TERMS) {
    console.log(`  ... (+${result.unknownTerms.length - MAX_UNKNOWN_TERMS} fler kandidater)`);
  }

  console.log(
    `\n[check:terms] Klart. Alias=${result.aliasHits.length}, okända=${result.unknownTerms.length}. EXIT 0 (rådgivande).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
