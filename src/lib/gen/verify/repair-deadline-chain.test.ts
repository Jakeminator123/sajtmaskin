import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C4: `verifyDeadlineEpochMs` created by the repair-loop final-gate budget
 * must reach `shouldPromoteAfterRepair` and the preview-host verify call.
 * This is an application-level chain test, not an isolated budget-function check.
 */

const runPreviewHostQualityGate = vi.hoisted(() => vi.fn());
const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn());
const runLlmFixer = vi.hoisted(() => vi.fn());
const validateGeneratedCode = vi.hoisted(() =>
  vi.fn(async () => ({ valid: true, errors: [], fileErrors: new Map<string, string[]>() })),
);

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  runPreviewHostQualityGate,
}));
vi.mock("@/lib/gen/preview/tier2-config", () => ({
  getPreviewHostBaseUrl,
}));
vi.mock("@/lib/gen/autofix/llm-fixer", () => ({ runLlmFixer }));
vi.mock("@/lib/gen/retry/validate-syntax", () => ({ validateGeneratedCode }));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/logging/error-log-rag", () => ({ appendErrorLogEvent: vi.fn() }));

import { FINAL_GATE_RELEASE_MARGIN_MS } from "@/lib/gen/defaults";
import { parseCodeProject } from "@/lib/gen/parser";
import { shouldPromoteAfterRepair } from "./preview-quality-gate";
import { runRepairLoop } from "./repair-loop";

function file(path: string, content: string): string {
  return `\`\`\`tsx file="${path}"\n${content}\n\`\`\``;
}

const validPage = file(
  "app/page.tsx",
  `export default function Page() {\n  return <main><h1>Acme</h1></main>;\n}`,
);
const validPageEdited = file(
  "app/page.tsx",
  `export default function Page() {\n  return <main><h1>Acme Inc</h1></main>;\n}`,
);

const gateFailure = {
  check: "typecheck" as const,
  exitCode: 1,
  output: "app/page.tsx(2,10): error TS2322: Type 'number' is not assignable to type 'string'.",
};

describe("C4 repair deadline reaches preview-host verify", () => {
  beforeEach(() => {
    runPreviewHostQualityGate.mockReset();
    getPreviewHostBaseUrl.mockReset().mockReturnValue("https://preview-host.example");
    runLlmFixer.mockReset();
    validateGeneratedCode.mockClear();
  });

  it("threads verifyDeadlineEpochMs from the repair-loop final gate through shouldPromoteAfterRepair to preview-host", async () => {
    runLlmFixer.mockResolvedValue({
      fixedContent: validPageEdited,
      fixedFiles: ["app/page.tsx"],
      missingFiles: [],
      incompleteFiles: [],
      partial: false,
      success: true,
      aborted: false,
      durationMs: 1,
    });
    runPreviewHostQualityGate.mockImplementation(async (params: { filesJson?: Record<string, string> }) => {
      const page = params.filesJson?.["app/page.tsx"] ?? "";
      const edited = page.includes("Acme Inc");
      return {
        ok: true,
        durationMs: 4,
        jobStartedAt: null,
        jobFinishedAt: null,
        firstFailureCheck: edited ? null : "typecheck",
        results: [
          {
            check: "typecheck",
            passed: edited,
            exitCode: edited ? 0 : 1,
            output: edited ? "" : gateFailure.output,
          },
        ],
      };
    });

    const repairDeadlineEpochMs = Date.now() + 200_000;
    const result = await runRepairLoop({
      initialContent: validPage,
      failedOutputs: [gateFailure],
      contextLines: [],
      maxLlmPasses: 1,
      llmTimeoutMs: 1_000,
      enableTargetedRepair: false,
      repairDeadlineEpochMs,
      onAttemptPromotion: async (projectContent, method, options) => {
        const decision = await shouldPromoteAfterRepair({
          chatId: "chat-c4",
          versionId: "ver-c4",
          exportable: parseCodeProject(projectContent).files,
          hadQualityGateFailures: true,
          checks: ["typecheck"],
          verifyDeadlineEpochMs: options?.verifyDeadlineEpochMs,
        });
        return { promoted: decision.promote && method === "llm" };
      },
    });

    expect(result.promoted).toBe(true);
    const deadlineCalls = runPreviewHostQualityGate.mock.calls
      .map((call) => call[0] as { verifyDeadlineEpochMs?: number })
      .filter((params) => params.verifyDeadlineEpochMs !== undefined);
    expect(deadlineCalls).toHaveLength(1);
    expect(deadlineCalls[0]?.verifyDeadlineEpochMs).toBe(
      repairDeadlineEpochMs - FINAL_GATE_RELEASE_MARGIN_MS,
    );
  });
});
