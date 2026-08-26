import { beforeEach, describe, expect, it, vi } from "vitest";

const runLlmFixer = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() =>
  vi.fn(async (content: string) => {
    const broken = content.includes("( {");
    return broken
      ? {
          valid: false,
          errors: [
            { file: "components/ui/accordion.tsx", line: 3, column: 33, message: "')' expected." },
          ],
          fileErrors: new Map<string, string[]>(),
        }
      : { valid: true, errors: [], fileErrors: new Map<string, string[]>() };
  }),
);

vi.mock("@/lib/gen/autofix/llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("@/lib/logging/dev-log", () => ({
  devLogAppend,
}));

vi.mock("@/lib/gen/retry/validate-syntax", () => ({
  validateGeneratedCode,
}));

import { runRepairLoop, type RepairMethod } from "./repair-loop";

const SCOPED_ACCORDION = [
  "'use client'",
  "",
  "import * as React from 'react'",
  "import * as AccordionPrimitive from '@radix-ui/react-accordion'",
  "",
  "const Accordion = AccordionPrimitive.Root",
  "export { Accordion }",
  "",
].join("\n");

function fence(path: string, language: string, content: string): string {
  return "```" + language + ' file="' + path + '"\n' + content + "\n```";
}

const unrelatedGateFailure = {
  check: "typecheck",
  exitCode: 1,
  output: "components/ui/accordion.tsx(6,10): error TS2554: Expected 0 arguments, but got 1.",
};

async function runLoopCapturingPromotedContent(opts: {
  initialContent: string;
  verbatimRepo?: boolean;
  failedOutputs: Array<{ check: string; exitCode: number; output: string }>;
  promoteOn: RepairMethod;
}): Promise<{ promotedContent: string | null; method: RepairMethod | null }> {
  let promotedContent: string | null = null;
  const result = await runRepairLoop<{ captured: true }>({
    initialContent: opts.initialContent,
    verbatimRepo: opts.verbatimRepo,
    failedOutputs: opts.failedOutputs,
    contextLines: [],
    maxLlmPasses: 1,
    llmTimeoutMs: 1_000,
    enableTargetedRepair: false,
    onAttemptPromotion: async (projectContent, method) => {
      if (method === opts.promoteOn) {
        promotedContent = projectContent;
        return { promoted: true, payload: { captured: true } };
      }
      return { promoted: false };
    },
  });
  return { promotedContent, method: result.method };
}

describe("runRepairLoop — radix verbatimRepo flag", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    validateGeneratedCode.mockClear();
  });

  it("keeps scoped radix without a package.json when verbatimRepo is true", async () => {
    const { promotedContent, method } = await runLoopCapturingPromotedContent({
      initialContent: fence("components/ui/accordion.tsx", "tsx", SCOPED_ACCORDION),
      verbatimRepo: true,
      failedOutputs: [unrelatedGateFailure],
      promoteOn: "deterministic",
    });

    expect(method).toBe("deterministic");
    expect(promotedContent).not.toBeNull();
    expect(promotedContent).toContain("@radix-ui/react-accordion");
    expect(promotedContent).not.toContain('from "radix-ui"');
    expect(runLlmFixer).not.toHaveBeenCalled();
  });

  it("unifies for the own-engine lane even with a scoped-only manifest", async () => {
    const content = [
      fence(
        "package.json",
        "json",
        JSON.stringify({ dependencies: { "@radix-ui/react-accordion": "^1.1.2" } }, null, 2),
      ),
      fence("components/ui/accordion.tsx", "tsx", SCOPED_ACCORDION),
    ].join("\n\n");

    const { promotedContent, method } = await runLoopCapturingPromotedContent({
      initialContent: content,
      verbatimRepo: false,
      failedOutputs: [unrelatedGateFailure],
      promoteOn: "deterministic",
    });

    expect(method).toBe("deterministic");
    expect(promotedContent).not.toBeNull();
    expect(promotedContent).toContain('from "radix-ui"');
    expect(promotedContent).not.toContain("'@radix-ui/react-accordion'");
  });
});
