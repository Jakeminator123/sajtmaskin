import { describe, expect, it } from "vitest";

import { analyzeTerminologyCoverage, isTerminologyProsePath } from "./check-term-coverage.mjs";

const dictionary = {
  rules: [
    {
      match: "LLM-fix",
      canonicalTerms: ["RepairGate"],
      severity: "advisory",
    },
  ],
  pascalCaseAllowlist: ["TypeScript"],
};

describe("advisory terminology coverage", () => {
  it("routes only active human-authored Markdown", () => {
    expect(isTerminologyProsePath("docs/contracts/example.md")).toBe(true);
    expect(isTerminologyProsePath("README.md")).toBe(true);
    expect(isTerminologyProsePath("src/runtime.ts")).toBe(false);
    expect(isTerminologyProsePath("docs/generated/policies.generated.md")).toBe(false);
    expect(isTerminologyProsePath("docs/plans/archived/old.md")).toBe(false);
  });

  it("reports active prose but ignores inline/fenced code", () => {
    const result = analyzeTerminologyCoverage({
      dictionary,
      glossaryText: "RepairGate\nTypeScript",
      documents: new Map([
        [
          "docs/example.md",
          "LLM-fix i prosa. `LLM-fix` och ``LLM-fix ` med tick`` i kod.\n```ts\nLLM-fix\n```\nUnknownWidget här.",
        ],
      ]),
    });
    expect(result.aliasHits).toHaveLength(1);
    expect(result.aliasHits[0]).toMatchObject({ path: "docs/example.md", line: 1 });
    expect(result.unknownTerms).toEqual([
      { term: "UnknownWidget", count: 1, first: "docs/example.md:5" },
    ]);
  });

  it("uses the glossary and machine allowlist for known PascalCase terms", () => {
    const result = analyzeTerminologyCoverage({
      dictionary,
      glossaryText: "RepairGate",
      documents: new Map([["docs/example.md", "RepairGate och TypeScript."]]),
    });
    expect(result.unknownTerms).toEqual([]);
  });

  it("matches exact canonical terms instead of glossary prose substrings", () => {
    const glossaryText = `# Glossary

## Kärntermer

| Term | Kort |
|---|---|
| RepairGate | Foo Bar. |

## Publicering och URL-nivåer

| Term | Kort |
|---|---|
| previewUrl | Preview. |

## Namnskuggor och legacy

| Undvik | Använd |
|---|---|
| LLM-fix | RepairGate |
`;
    const result = analyzeTerminologyCoverage({
      dictionary,
      glossaryText,
      documents: new Map([["docs/example.md", "RepairGate är känd, FooBar är inte det."]]),
    });
    expect(result.unknownTerms).toEqual([{ term: "FooBar", count: 1, first: "docs/example.md:1" }]);
  });
});
