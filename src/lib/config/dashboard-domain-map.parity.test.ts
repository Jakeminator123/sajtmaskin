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

function assertLiteralPathsExist(values: string[] | undefined) {
  for (const value of values ?? []) {
    const normalized = normalizeLiteralPath(value);
    if (!normalized) continue;
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
