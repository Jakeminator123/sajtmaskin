import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type DomainMap = {
  pages?: Record<
    string,
    {
      canonicalPaths?: string[];
      docsPaths?: string[];
      humanSchemaPaths?: string[];
      strictSchemaPaths?: string[];
      codeReaders?: string[];
    }
  >;
};

function repoPath(...segments: string[]): string {
  return path.join(process.cwd(), ...segments);
}

function loadDomainMap(): DomainMap {
  return JSON.parse(
    readFileSync(repoPath("config", "dashboard", "domain-map.json"), "utf8"),
  ) as DomainMap;
}

function normalizeLiteralPath(raw: string): { rel: string; kind: "file" | "dir" } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutAnnotation = trimmed.replace(/\s+\(.*$/, "");
  if (withoutAnnotation.includes("*")) return null;
  if (withoutAnnotation.endsWith("/")) {
    return { rel: withoutAnnotation.slice(0, -1), kind: "dir" };
  }
  return { rel: withoutAnnotation, kind: "file" };
}

// Paths we deliberately do NOT assert in parity:
//
// 1. `logs/**` — runtime artifacts written by generation-log-writer.ts
//    that are gitignored (`logs/*`). They exist on developer machines after
//    a generation run but never on a clean CI checkout (Vercel).
//
// 2. `.cursor/rules/**` — internal Cursor AI rule files. They are renamed/
//    consolidated as the AI config evolves, and breaking CI every time a
//    rule file is restructured is a wrong-coupling. The domain-map may
//    still reference them as "where to look" hints, but their existence is
//    not a contract.
//
// 3. `data/scaffold-eval/reports/**` — per-machine eval output written by
//    `npm run scaffolds:eval` (scripts/scaffolds/eval-scaffold-selection.ts
//    and eval-landing-variants.ts). The backoffice "Eval"-page reads the
//    latest local JSON report; the file is not produced on a clean CI
//    checkout. Same wrong-coupling as `logs/**`.
function isRuntimeArtifactPath(rel: string): boolean {
  if (rel === "logs" || rel.startsWith("logs/")) return true;
  if (rel === ".cursor" || rel.startsWith(".cursor/")) return true;
  if (rel.startsWith("data/scaffold-eval/reports/")) return true;
  return false;
}

function assertLiteralPathsExist(values: string[] | undefined) {
  for (const value of values ?? []) {
    const normalized = normalizeLiteralPath(value);
    if (!normalized) continue;
    if (isRuntimeArtifactPath(normalized.rel)) continue;
    const abs = repoPath(...normalized.rel.split("/"));
    expect(
      existsSync(abs),
      `Expected dashboard path to exist: ${normalized.rel}`,
    ).toBe(true);
  }
}

describe("config/dashboard/domain-map.json parity", () => {
  it("references existing literal config/doc/code paths", () => {
    const domainMap = loadDomainMap();
    for (const page of Object.values(domainMap.pages ?? {})) {
      assertLiteralPathsExist(page.canonicalPaths);
      assertLiteralPathsExist(page.docsPaths);
      assertLiteralPathsExist(page.codeReaders);
      assertLiteralPathsExist(page.humanSchemaPaths);
      assertLiteralPathsExist(page.strictSchemaPaths);
    }
  });

  it("keeps schema paths in the expected layers", () => {
    const domainMap = loadDomainMap();
    for (const page of Object.values(domainMap.pages ?? {})) {
      for (const rel of page.humanSchemaPaths ?? []) {
        expect(
          rel.startsWith("docs/schemas/"),
          `Expected human schema path inside docs/schemas/: ${rel}`,
        ).toBe(true);
        expect(
          rel.startsWith("docs/schemas/strict/"),
          `Human schema path should not point into strict/: ${rel}`,
        ).toBe(false);
      }
      for (const rel of page.strictSchemaPaths ?? []) {
        expect(
          rel.startsWith("docs/schemas/strict/"),
          `Expected strict schema path inside docs/schemas/strict/: ${rel}`,
        ).toBe(true);
      }
    }
  });
});
