import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkTerminologyContract } from "./check-terminology-contract.mjs";
import { parseGlossary } from "./terminology-core.mjs";

const glossary = `# Glossary — Sajtmaskin

## Kärntermer

| Term | Kort |
|---|---|
| Deep Brief | Init-brief. |
| Normalize | Mekanisk kodstädning. |
| RepairGate | LLM-repair-port. |

## Publicering och URL-nivåer

| Term | Kort |
|---|---|
| previewUrl | Preview-URL. |

## Namnskuggor och legacy

| Undvik eller precisera | Använd |
|---|---|
| StructuredBrief | Deep Brief |
| LLM-fix | RepairGate |
| demoUrl | previewUrl |
`;

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    _canonicalSource: "docs/architecture/glossary.md",
    rules: [
      {
        match: "StructuredBrief",
        canonicalTerms: ["Deep Brief"],
        caseSensitive: true,
        severity: "block",
      },
      {
        match: "LLM-fix",
        canonicalTerms: ["RepairGate"],
        severity: "advisory",
      },
      {
        match: "demoUrl",
        canonicalTerms: ["previewUrl"],
        severity: "advisory",
      },
    ],
    pascalCaseAllowlist: ["TypeScript"],
    ...overrides,
  };
}

async function run({
  dictionary = fixture(),
  glossaryText = glossary,
  docs = {},
}: {
  dictionary?: Record<string, unknown>;
  glossaryText?: string;
  docs?: Record<string, string>;
} = {}) {
  const files = new Map([
    ["config/naming-dictionary.json", JSON.stringify(dictionary)],
    ["docs/architecture/glossary.md", glossaryText],
    ["docs/README.md", "Canonical docs."],
    ...Object.entries(docs),
  ]);
  return checkTerminologyContract({
    dictionary,
    trackedPaths: [...files.keys()],
    readTrackedFile: async (path: string) => files.get(path) ?? "",
  });
}

describe("terminology contract", () => {
  it("parses the committed glossary tables without missing or duplicate ownership", () => {
    const parsed = parseGlossary(readFileSync("docs/architecture/glossary.md", "utf8"));
    expect(parsed.missingSections).toEqual([]);
    expect(parsed.canonicalRows.length).toBeGreaterThan(0);
    expect(parsed.aliasRows.length).toBeGreaterThan(0);
    expect(parsed.duplicateCanonicalRows).toEqual([]);
    expect(parsed.duplicateAliasRows).toEqual([]);
  });

  it("accepts one human glossary plus aligned machine-only rules", async () => {
    await expect(run()).resolves.toEqual([]);
  });

  it("rejects retired dictionary inventories and explanatory rule prose", async () => {
    const dictionary = fixture({
      canonicalTerms: ["RepairGate"],
      rules: [
        {
          match: "LLM-fix",
          canonicalTerms: ["RepairGate"],
          severity: "advisory",
          note: "Human semantics do not belong here.",
        },
      ],
    });
    const errors = await run({ dictionary });
    expect(errors).toContain(
      "naming dictionary uses unsupported or human-semantics key: canonicalTerms",
    );
    expect(errors).toContain("rules[0] uses unsupported key: note");
  });

  it("validates the machine allowlist and rule knobs", async () => {
    const dictionary = fixture({
      pascalCaseAllowlist: ["TypeScript", "typescript", ""],
      rules: [
        {
          match: "LLM-fix",
          canonicalTerms: ["RepairGate"],
          caseSensitive: "yes",
          severity: "advisory",
        },
      ],
    });
    const errors = await run({ dictionary });
    expect(errors).toContain("pascalCaseAllowlist must contain only non-empty strings");
    expect(errors).toContain("duplicate pascalCaseAllowlist term: typescript");
    expect(errors).toContain("rules[0].caseSensitive must be boolean when present");
  });

  it("rejects whitespace-only matches and canonical targets", async () => {
    const errors = await run({
      dictionary: fixture({
        rules: [
          { match: "   ", canonicalTerms: ["RepairGate"], severity: "block" },
          { match: "LLM-fix", canonicalTerms: [""], severity: "block" },
        ],
      }),
    });
    expect(errors.filter((error) => error.includes("must declare match"))).toHaveLength(2);
  });

  it("rejects duplicate glossary term and alias rows", async () => {
    const duplicateGlossary = glossary
      .replace(
        "| Normalize | Mekanisk kodstädning. |",
        "| Normalize | Mekanisk kodstädning. |\n| Normalize | Dubblett. |",
      )
      .replace(
        "| LLM-fix | RepairGate |",
        "| LLM-fix | RepairGate |\n| LLM-fix | RepairGate igen | ",
      );
    const errors = await run({ glossaryText: duplicateGlossary });
    expect(errors).toContain("duplicate canonical glossary term row: normalize");
    expect(errors).toContain("duplicate glossary alias row: llmfix");
  });

  it("rejects a machine rule that is absent from or disagrees with the glossary", async () => {
    const missingAlias = fixture({
      rules: [
        {
          match: "old-name",
          canonicalTerms: ["RepairGate"],
          severity: "advisory",
        },
      ],
    });
    expect(await run({ dictionary: missingAlias })).toContain(
      "terminology rule old-name must resolve to exactly one glossary alias row; got 0",
    );

    const wrongTarget = fixture({
      rules: [
        {
          match: "LLM-fix",
          canonicalTerms: ["Normalize"],
          severity: "advisory",
        },
      ],
    });
    expect(await run({ dictionary: wrongTarget })).toContain(
      "terminology rule LLM-fix disagrees with glossary replacement: Normalize",
    );
  });

  it("rejects a canonical target that the glossary never defines", async () => {
    const dictionary = fixture({
      rules: [
        {
          match: "LLM-fix",
          canonicalTerms: ["MissingGate"],
          severity: "advisory",
        },
      ],
    });
    const errors = await run({
      dictionary,
      glossaryText: glossary.replace("| LLM-fix | RepairGate |", "| LLM-fix | MissingGate |"),
    });
    expect(errors).toContain(
      "terminology rule LLM-fix targets missing canonical term: MissingGate",
    );
  });

  it("blocks configured active-doc prose but ignores code spans, fences and history", async () => {
    const activeErrors = await run({
      docs: { "docs/contracts/example.md": "Use StructuredBrief here." },
    });
    expect(activeErrors).toContain("docs/contracts/example.md:1: StructuredBrief -> Deep Brief");

    const ignoredErrors = await run({
      docs: {
        "docs/contracts/example.md":
          "Use `StructuredBrief` only as a code identifier.\n```ts\nStructuredBrief\n```",
        "docs/plans/archived/old.md": "Historical StructuredBrief wording.",
      },
    });
    expect(ignoredErrors).toEqual([]);
  });

  it("keeps shorter nested fence markers inside a longer code fence", async () => {
    const errors = await run({
      docs: {
        "docs/contracts/example.md": "````md\n```\nStructuredBrief\n```\n````\nCanonical prose.",
      },
    });
    expect(errors).toEqual([]);
  });

  it("does not close a fence when the marker line has trailing code text", async () => {
    const errors = await run({
      docs: {
        "docs/contracts/example.md": "```md\n```js\nStructuredBrief\n```\nCanonical prose.",
      },
    });
    expect(errors).toEqual([]);
  });

  it("rejects an alternate active glossary", async () => {
    const errors = await run({ docs: { "docs/concepts/glossary.md": "parallel" } });
    expect(errors.some((error) => error.startsWith("active glossary paths must equal"))).toBe(true);
  });

  it("keeps live simplifiedBriefSchema and Style direction out of alias rules", () => {
    const dictionary = JSON.parse(readFileSync("config/naming-dictionary.json", "utf8")) as {
      rules: Array<{ match: string }>;
    };
    const matches = dictionary.rules.map((rule) => rule.match.toLowerCase());
    expect(matches).not.toContain("simplifiedbriefschema");
    expect(matches).not.toContain("style direction");
  });
});
