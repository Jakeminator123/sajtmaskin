import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
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
    readFileSync(repoPath("config", "backoffice", "domain-map.json"), "utf8"),
  ) as DomainMap;
}

type NormalizedDomainMapPath = {
  rel: string;
  kind: "file" | "dir" | "glob";
};

function normalizeDomainMapPath(raw: string): NormalizedDomainMapPath | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutAnnotation = trimmed.replace(/\s+\(.*$/, "");
  if (withoutAnnotation.includes("*")) {
    return { rel: withoutAnnotation, kind: "glob" };
  }
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
// 2. `data/scaffold-eval/reports/**` — per-machine eval output written by
//    `npm run eval` (scaffold lane in src/lib/gen/eval/canonical.ts
//    and eval-landing-variants.ts). The backoffice "Eval"-page reads the
//    latest local JSON report; the file is not produced on a clean CI
//    checkout. Same wrong-coupling as `logs/**`.
//
// 3. `data/prompt-dumps/**` — per-run prompt artefakter skrivna av
//    `prompt-dump-writer.ts` under generation. Mappen är gitignored
//    (`data/prompt-dumps/*`) och finns bara på utvecklarmaskiner efter
//    minst en generation. Backoffice "Prompt-dumps"-sidan läser dem.
//    Samma wrong-coupling som `logs/**` och `data/scaffold-eval/reports/**`.
//
// 4. `data/backoffice/**` — backoffice-paneldata (pipeline-health-state) och
//    backup/restore-snapshots (`shared.write_text/write_json` snapshotar hit
//    före sparning). Hela `data/backoffice/` är gitignored (`.gitignore`) och
//    skapas on-demand vid körning, så den finns aldrig på en ren CI-checkout.
//    Backoffice "Återställning"/"Pipeline Health"-sidorna läser den. Samma
//    wrong-coupling som `logs/**`.
//
// 5. `data/observability/**` — runtime-observability-artefakter (error-log RAG
//    index, fixer-registry-snapshot). Hela `data/observability/` är gitignored
//    och skrivs on-demand, aldrig på en ren CI-checkout. Backoffice
//    "Error-log RAG"/"Fixer Registry"-sidorna läser den. Samma wrong-coupling
//    som `logs/**`.
function isRuntimeArtifactPath(rel: string): boolean {
  if (rel === "logs" || rel.startsWith("logs/")) return true;
  if (rel === "data/scaffold-eval/reports" || rel.startsWith("data/scaffold-eval/reports/"))
    return true;
  if (rel === "data/prompt-dumps" || rel.startsWith("data/prompt-dumps/")) {
    return true;
  }
  if (rel === "data/backoffice" || rel.startsWith("data/backoffice/")) {
    return true;
  }
  if (rel === "data/observability" || rel.startsWith("data/observability/")) {
    return true;
  }
  return false;
}

function assertSafeRepoGlobHasMatch(rel: string): void {
  const segments = rel.split("/");
  const leaf = segments.at(-1) ?? "";
  const parentSegments = segments.slice(0, -1);

  expect(rel, `Recursive glob is not supported: ${rel}`).not.toContain("**");
  expect(rel, `Only '*' is supported as a glob token: ${rel}`).not.toMatch(/[?\[\]{}]/);
  expect(
    parentSegments.some((segment) => segment.includes("*")),
    `Glob must be limited to the final path segment: ${rel}`,
  ).toBe(false);
  expect(leaf, `Glob must contain '*' in its final path segment: ${rel}`).toContain("*");

  const parent = repoPath(...parentSegments);
  expect(existsSync(parent), `Expected glob parent to exist: ${parentSegments.join("/")}`).toBe(
    true,
  );
  expect(statSync(parent).isDirectory(), `Expected glob parent to be a directory: ${rel}`).toBe(
    true,
  );

  const pattern = new RegExp(
    `^${leaf
      .split("*")
      .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
  const matches = readdirSync(parent, { withFileTypes: true }).filter((entry) =>
    pattern.test(entry.name),
  );
  expect(matches.length, `Expected repo glob to match at least one path: ${rel}`).toBeGreaterThan(
    0,
  );
}

function assertRepoPathsExist(values: string[] | undefined): void {
  for (const value of values ?? []) {
    const normalized = normalizeDomainMapPath(value);
    if (!normalized) continue;
    if (isRuntimeArtifactPath(normalized.rel)) continue;
    if (normalized.kind === "glob") {
      assertSafeRepoGlobHasMatch(normalized.rel);
      continue;
    }
    const abs = repoPath(...normalized.rel.split("/"));
    expect(existsSync(abs), `Expected Backoffice domain-map path to exist: ${normalized.rel}`).toBe(
      true,
    );
    expect(
      normalized.kind === "dir" ? statSync(abs).isDirectory() : statSync(abs).isFile(),
      `Expected ${normalized.rel} to be a ${normalized.kind}`,
    ).toBe(true);
  }
}

describe("config/backoffice/domain-map.json parity", () => {
  it("matches its strict schema", () => {
    const schema = JSON.parse(
      readFileSync(
        repoPath("docs", "schemas", "strict", "backoffice-domain-map.schema.json"),
        "utf8",
      ),
    ) as object;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    const domainMap = loadDomainMap();

    expect(validate(domainMap), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("references existing config/doc/code paths with the expected type", () => {
    const domainMap = loadDomainMap();
    for (const page of Object.values(domainMap.pages ?? {})) {
      assertRepoPathsExist(page.canonicalPaths);
      assertRepoPathsExist(page.docsPaths);
      assertRepoPathsExist(page.codeReaders);
      assertRepoPathsExist(page.humanSchemaPaths);
      assertRepoPathsExist(page.strictSchemaPaths);
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
