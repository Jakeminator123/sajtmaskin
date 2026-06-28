import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildSpecPreviewPolicy } from "@/lib/gen/build-spec";

// The LLM fixer is mocked so the loop never makes a real model call — we
// control exactly what "the LLM returned" and assert how the post-LLM
// mechanical pass treats it under each preview policy.
const runLlmFixer = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());
// `validateGeneratedCode` runs esbuild, which cannot be loaded inside the
// vitest worker (native binary). It is orchestration plumbing, not the code
// under test (the tier3 SDK guard inside the REAL `runAutoFix`), so we stub it
// with a deterministic, content-driven validity check. `( {` is the broken
// function signature in the loop fixtures below.
const validateGeneratedCode = vi.hoisted(() =>
  vi.fn(async (content: string) => {
    const broken = content.includes("( {");
    return broken
      ? {
          valid: false,
          errors: [
            { file: "app/checkout.tsx", line: 3, column: 33, message: "')' expected." },
          ],
          fileErrors: new Map<string, string[]>(),
        }
      : { valid: true, errors: [], fileErrors: new Map<string, string[]>() };
  }),
);

vi.mock("@/lib/gen/autofix/llm-fixer", () => ({
  runLlmFixer,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend,
}));

vi.mock("@/lib/gen/retry/validate-syntax", () => ({
  validateGeneratedCode,
}));

import { runRepairLoop, type RepairMethod } from "./repair-loop";

function file(path: string, content: string): string {
  return `\`\`\`tsx file="${path}"\n${content}\n\`\`\``;
}

const STRIPE_ROUTE = "app/api/checkout-session/route.ts";
// Valid F3 backend code that ALREADY imports the tier-3 SDKs. The F2 SDK guard
// (tier3-sdk-guard-fixer) strips these import lines; F3 must keep them.
const stripeRoute = file(
  STRIPE_ROUTE,
  `import Stripe from "stripe";

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
  return Response.json({ ok: Boolean(stripe) });
}`,
);

const CLERK_MW = "middleware.ts";
const clerkMiddleware = file(
  CLERK_MW,
  `import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});`,
);

const integrationsProject = `${stripeRoute}\n\n${clerkMiddleware}`;

// A gate failure that has NOTHING to do with the SDK imports (a logic-arity
// error). The deterministic import-repair must ignore it, so the version
// enters the repair loop carrying its (valid) backend SDK imports.
const unrelatedGateFailure = {
  check: "typecheck",
  exitCode: 1,
  output: `${STRIPE_ROUTE}(4,18): error TS2554: Expected 0 arguments, but got 1.`,
};

async function runLoopCapturingPromotedContent(opts: {
  initialContent: string;
  previewPolicy: BuildSpecPreviewPolicy;
  failedOutputs: Array<{ check: string; exitCode: number; output: string }>;
  maxLlmPasses: number;
  promoteOn: RepairMethod;
}): Promise<{ promotedContent: string | null; method: RepairMethod | null }> {
  let promotedContent: string | null = null;
  const result = await runRepairLoop<{ captured: true }>({
    initialContent: opts.initialContent,
    previewPolicy: opts.previewPolicy,
    failedOutputs: opts.failedOutputs,
    contextLines: [],
    maxLlmPasses: opts.maxLlmPasses,
    llmTimeoutMs: 1_000,
    // Keep the fixer input as the full project so the post-LLM autofix runs on
    // exactly what the (mocked) LLM returned — no targeted-bundle merge-back.
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

describe("runRepairLoop — F2/F3 SDK-guard policy (Codex P1)", () => {
  beforeEach(() => {
    runLlmFixer.mockReset();
    devLogAppend.mockReset();
    validateGeneratedCode.mockClear();
  });

  describe("initial mechanical pass (deterministic promotion)", () => {
    it("F3: preserves valid tier-3 backend SDK imports through the initial autofix", async () => {
      const { promotedContent, method } = await runLoopCapturingPromotedContent({
        initialContent: integrationsProject,
        previewPolicy: "fidelity3",
        failedOutputs: [unrelatedGateFailure],
        maxLlmPasses: 2,
        promoteOn: "deterministic",
      });

      expect(method).toBe("deterministic");
      expect(promotedContent).not.toBeNull();
      expect(promotedContent).toContain('import Stripe from "stripe"');
      expect(promotedContent).toContain('from "@clerk/nextjs/server"');
      // The LLM fixer must never run when the deterministic pass already
      // promoted a clean (F3-preserving) version.
      expect(runLlmFixer).not.toHaveBeenCalled();
    });

    it("F2: still strips tier-3 backend SDK imports in the initial autofix", async () => {
      const { promotedContent, method } = await runLoopCapturingPromotedContent({
        initialContent: integrationsProject,
        previewPolicy: "fidelity2",
        failedOutputs: [unrelatedGateFailure],
        maxLlmPasses: 2,
        promoteOn: "deterministic",
      });

      expect(method).toBe("deterministic");
      expect(promotedContent).not.toBeNull();
      expect(promotedContent).not.toContain('import Stripe from "stripe"');
      expect(promotedContent).not.toContain('from "@clerk/nextjs/server"');
    });
  });

  describe("post-LLM mechanical pass (inside the loop)", () => {
    // A syntactically broken F3 file so the deterministic promotion is skipped
    // and the loop escalates to the (mocked) LLM fixer. The LLM "repair"
    // returns valid F3 code that still imports Stripe.
    const brokenInitial = file(
      "app/checkout.tsx",
      `import Stripe from "stripe";

export default function Checkout( {
  return <div>pay</div>;
}`,
    );
    const llmRepairedContent = file(
      "app/checkout.tsx",
      `import Stripe from "stripe";

export default function Checkout() {
  return <div>pay</div>;
}`,
    );
    const brokenSyntaxFailure = {
      check: "syntax",
      exitCode: 1,
      output: "app/checkout.tsx(3,33): error TS1005: ')' expected.",
    };

    function mockLlmReturns(content: string) {
      runLlmFixer.mockResolvedValue({
        fixedContent: content,
        fixedFiles: ["app/checkout.tsx"],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: true,
        aborted: false,
        durationMs: 1,
      });
    }

    it("F3: preserves a re-emitted backend SDK import after the LLM pass", async () => {
      mockLlmReturns(llmRepairedContent);

      const { promotedContent, method } = await runLoopCapturingPromotedContent({
        initialContent: brokenInitial,
        previewPolicy: "fidelity3",
        failedOutputs: [brokenSyntaxFailure],
        maxLlmPasses: 1,
        promoteOn: "llm",
      });

      expect(runLlmFixer).toHaveBeenCalledTimes(1);
      expect(method).toBe("llm");
      expect(promotedContent).not.toBeNull();
      expect(promotedContent).toContain('import Stripe from "stripe"');
    });

    it("F2: still strips a re-emitted backend SDK import after the LLM pass", async () => {
      mockLlmReturns(llmRepairedContent);

      const { promotedContent, method } = await runLoopCapturingPromotedContent({
        initialContent: brokenInitial,
        previewPolicy: "fidelity2",
        failedOutputs: [brokenSyntaxFailure],
        maxLlmPasses: 1,
        promoteOn: "llm",
      });

      expect(runLlmFixer).toHaveBeenCalledTimes(1);
      expect(method).toBe("llm");
      expect(promotedContent).not.toBeNull();
      expect(promotedContent).not.toContain('import Stripe from "stripe"');
    });
  });
});
