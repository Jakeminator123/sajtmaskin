import { beforeEach, describe, expect, it, vi } from "vitest";

// Same mocking strategy as repair-loop.outcome.test.ts: the LLM fixer and the
// esbuild-backed validator are stubbed, `runAutoFix` runs for real.
const runLlmFixer = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());
const appendErrorLogEvent = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() =>
  vi.fn(async () => ({
    valid: true,
    errors: [] as Array<{ file: string; line: number; column: number; message: string }>,
    fileErrors: new Map<string, string[]>(),
  })),
);

vi.mock("@/lib/gen/autofix/llm-fixer", () => ({ runLlmFixer }));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend }));
vi.mock("@/lib/logging/error-log-rag", () => ({ appendErrorLogEvent }));
vi.mock("@/lib/gen/retry/validate-syntax", () => ({ validateGeneratedCode }));

import { runRepairLoop } from "./repair-loop";
import { collectRepairBlockers, introducedRepairBlockers } from "./repair-blockers";

function file(path: string, content: string): string {
  return `\`\`\`tsx file="${path}"\n${content}\n\`\`\``;
}

const STRIP_MARKER = "(stripped for preview compatibility)";

const cleanPage = file(
  "app/page.tsx",
  `export default function Page() {\n  return <main><h1>Acme</h1></main>;\n}`,
);

// A blocking preflight finding project-sanity rejects as an error: preview-only
// stripped imports must never reach saved files.
const blockedPage = file(
  "app/page.tsx",
  `// import { cookies } from "next/headers"; ${STRIP_MARKER}\nexport default function Page() {\n  return <main><h1>Acme</h1></main>;\n}`,
);
const blockedPageEdited = file(
  "app/page.tsx",
  `// import { cookies } from "next/headers"; ${STRIP_MARKER}\nexport default function Page() {\n  return <main><h1>Acme Inc</h1></main>;\n}`,
);

function fixerResult(fixedContent: string) {
  return {
    fixedContent,
    fixedFiles: ["app/page.tsx"],
    missingFiles: [],
    incompleteFiles: [],
    partial: false,
    success: true,
    aborted: false,
    durationMs: 1,
  };
}

const gateFailure = {
  check: "typecheck",
  exitCode: 1,
  output:
    "app/page.tsx(2,10): error TS2322: Type 'number' is not assignable to type 'string'.",
};

describe("collectRepairBlockers", () => {
  it("returns no blockers for a clean project", () => {
    expect(collectRepairBlockers(cleanPage).size).toBe(0);
  });

  it("reports a preview-only stripped import as a blocker", () => {
    const blockers = [...collectRepairBlockers(blockedPage)];
    expect(blockers.some((key) => key.includes("Preview-only stripped import"))).toBe(true);
  });

  it("lists only blockers that are new", () => {
    const before = collectRepairBlockers(cleanPage);
    const after = collectRepairBlockers(blockedPage);
    expect(introducedRepairBlockers(before, after).length).toBe(1);
    expect(introducedRepairBlockers(after, after)).toEqual([]);
  });

  // Codex P1 på #623. Båda de här meddelandena räknar upp vad som är fel, och
  // uppräkningen krymper när felet fixas delvis. Nyckeln måste därför vara
  // fyndets identitet, inte dess text — annars läses "tre dubletter blev två"
  // som två nya blockerare och loopen rullar tillbaka riktig framgång.
  it("does not read a partially reduced duplicate-module blocker as new", () => {
    const card = "export const Card = () => null;";
    const three = [
      file("components/card.ts", card),
      file("components/card.tsx", card),
      file("components/card.jsx", card),
    ].join("\n");
    const two = [file("components/card.ts", card), file("components/card.tsx", card)].join("\n");

    const before = collectRepairBlockers(three);
    const after = collectRepairBlockers(two);
    const duplicates = (keys: Set<string>) => [...keys].filter((k) => k.includes("duplicate-module"));

    expect(duplicates(before)).toHaveLength(3);
    expect(duplicates(after)).toHaveLength(2);
    expect(introducedRepairBlockers(before, after)).toEqual([]);
  });

});

describe("runRepairLoop — a repair must not introduce a new blocker", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    appendErrorLogEvent.mockReset();
    validateGeneratedCode.mockClear();
  });

  it("rolls back a pass that trades one blocker for a new one", async () => {
    runLlmFixer.mockResolvedValue(fixerResult(blockedPage));
    const promotedContents: string[] = [];

    const result = await runRepairLoop({
      initialContent: cleanPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async (content) => {
        promotedContents.push(content);
        return { promoted: false };
      },
    });

    expect(result.earlyStopReason).toBe("blocker_regression");
    expect(result.introducedBlockers?.length).toBe(1);
    expect(result.introducedBlockers?.[0]).toContain("Preview-only stripped import");
    // Only one pass was spent, and no candidate carrying the new blocker was
    // ever handed to the verify gate.
    expect(runLlmFixer).toHaveBeenCalledTimes(1);
    for (const content of promotedContents) {
      expect(content).not.toContain(STRIP_MARKER);
    }
  });

  it("stops when the same blocker survives two passes", async () => {
    runLlmFixer
      .mockResolvedValueOnce(fixerResult(blockedPageEdited))
      .mockResolvedValue(fixerResult(blockedPage));

    const result = await runRepairLoop({
      initialContent: blockedPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 4,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async () => ({ promoted: false }),
    });

    expect(result.earlyStopReason).toBe("blocker_unresolved");
    expect(result.unresolvedBlockers?.[0]).toContain("Preview-only stripped import");
    expect(runLlmFixer).toHaveBeenCalledTimes(2);
  });

  it("leaves a clean repair untouched", async () => {
    const edited = file(
      "app/page.tsx",
      `export default function Page() {\n  return <main><h1>Acme Inc</h1></main>;\n}`,
    );
    runLlmFixer.mockResolvedValue(fixerResult(edited));

    const result = await runRepairLoop({
      initialContent: cleanPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 2,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      onAttemptPromotion: async (_content, method) =>
        method === "llm" ? { promoted: true } : { promoted: false },
    });

    expect(result.promoted).toBe(true);
    expect(result.earlyStopReason).toBeNull();
  });
});
