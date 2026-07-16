import { describe, expect, it } from "vitest";

import { checkTerminologyContract } from "./check-terminology-contract.mjs";

const canonicalTerms = [
  "Normalize",
  "RepairGate",
  "RenderGate",
  "ReleaseGate",
  "Advisory",
  "Blocker",
  "CapabilitySmoke",
  "Template (v0-mall)",
];

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    _canonicalSource: "docs/architecture/glossary.md",
    canonicalTerms,
    forbiddenAliases: [
      { alias: "LLM-fix", canonical: "RepairGate", blockInActiveDocs: true },
    ],
    ...overrides,
  };
}

async function run(dictionary = fixture(), docs: Record<string, string> = {}) {
  const files = new Map([
    ["config/naming-dictionary.json", JSON.stringify(dictionary)],
    ["docs/architecture/glossary.md", canonicalTerms.join("\n")],
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
  it("accepts one canonical glossary and aligned terms", async () => {
    await expect(run()).resolves.toEqual([]);
  });

  it("rejects deprecated terms in the canonical list", async () => {
    const errors = await run(fixture({ canonicalTerms: [...canonicalTerms, "LLM-fix"] }));
    expect(errors).toContain("deprecated alias listed as canonical: LLM-fix");
  });

  it("rejects duplicate aliases and an alternate active glossary", async () => {
    const dictionary = fixture({
      forbiddenAliases: [
        { alias: "LLM-fix", canonical: "RepairGate", blockInActiveDocs: true },
        { alias: "llm fix", canonical: "RepairGate", blockInActiveDocs: true },
      ],
    });
    const errors = await run(dictionary, { "docs/concepts/glossary.md": "parallel" });
    expect(errors.some((error) => error.startsWith("duplicate forbidden alias:"))).toBe(true);
    expect(errors.some((error) => error.startsWith("active glossary paths must equal"))).toBe(true);
  });

  it("rejects aliases without an explicit canonical replacement", async () => {
    const errors = await run(fixture({ forbiddenAliases: [{ alias: "old-name" }] }));
    expect(errors).toContain("forbiddenAliases[0] must declare alias and canonical");
  });

  it("blocks deprecated prose in active docs but ignores code and historical docs", async () => {
    const activeErrors = await run(fixture(), {
      "docs/contracts/example.md": "Use LLM-fix here.",
    });
    expect(activeErrors).toContain("docs/contracts/example.md:1: LLM-fix -> RepairGate");

    const ignoredErrors = await run(fixture(), {
      "docs/contracts/example.md": "Use `LLM-fix` only as a code identifier.",
      "docs/archive/old.md": "Historical LLM-fix wording.",
    });
    expect(ignoredErrors).toEqual([]);
  });
});
