import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Focused suite for the deterministic import pre-fix in `runVerifierPhase`
 * (prod incident 2026-07-03, chat e8420220): `undefined-jsx-symbol` findings
 * for KNOWN imports (Link → next/link, Button/Badge → shadcn) must be
 * resolved mechanically via `runDeterministicImportRepair` BEFORE the LLM
 * repair gate, so a slow/timed-out LLM call can never leave trivially
 * fixable missing imports blocking the version.
 *
 * `runVerifierPass` is mocked (no LLM); the parse/scan/repair helpers are
 * the real implementations.
 */

const runVerifierPass = vi.hoisted(() => vi.fn());
const runLlmRepairGate = vi.hoisted(() => vi.fn());
const appendErrorLogEvent = vi.hoisted(() => vi.fn());
const devLogAppend = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/verify/verifier-pass", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/gen/verify/verifier-pass")>();
  return {
    ...actual,
    runVerifierPass,
  };
});

vi.mock("@/lib/gen/autofix/llm-repair-gate", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/gen/autofix/llm-repair-gate")>();
  return {
    ...actual,
    runLlmRepairGate,
  };
});

vi.mock("@/lib/logging/error-log-rag", () => ({
  appendErrorLogEvent,
}));

vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend,
}));

import { runVerifierPhase } from "./verifier-phase";
import { checkUndefinedJsxSymbols } from "@/lib/gen/verify/verifier-pass";
import { parseCodeProject } from "@/lib/gen/parser";

function fencedFile(path: string, code: string): string {
  return `\`\`\`tsx file="${path}"\n${code}\n\`\`\``;
}

const PAGE_WITHOUT_IMPORTS = fencedFile(
  "app/page.tsx",
  `export default function Page() {
  return (
    <main>
      <Link href="/tjanster">Tjänster</Link>
      <Button variant="default">Boka</Button>
      <Badge variant="outline">Ny</Badge>
    </main>
  );
}`,
);

function undefinedJsxFinding(file: string, symbol: string) {
  return {
    id: "undefined-jsx-symbol",
    detail: `${file}: \`<${symbol} />\` is used but \`${symbol}\` is neither imported nor declared in this file. Either import it from the correct package or replace it with a supported element.`,
  };
}

function baseParams(contentForVersion: string) {
  return {
    enabled: true,
    reason: "test",
    chatId: "chat_test",
    model: "gpt-5.5",
    verifierTier: "max" as const,
    resolvedScaffold: null,
    repairPassIndex: 0,
    contentForVersion,
    runAutoFix: vi.fn(async (content: string) => ({
      fixedContent: content,
      fixes: [],
      warnings: [],
      dependencies: {},
    })),
  };
}

describe("runVerifierPhase deterministic import pre-fix", () => {
  beforeEach(() => {
    runVerifierPass.mockReset();
    runLlmRepairGate.mockReset();
    appendErrorLogEvent.mockReset();
    devLogAppend.mockReset();
  });

  it("resolves known missing imports (Link/Button/Badge) without the LLM gate", async () => {
    runVerifierPass.mockResolvedValueOnce({
      blocking: [
        undefinedJsxFinding("app/page.tsx", "Link"),
        undefinedJsxFinding("app/page.tsx", "Button"),
        undefinedJsxFinding("app/page.tsx", "Badge"),
      ],
      quality: [],
    });

    const result = await runVerifierPhase(baseParams(PAGE_WITHOUT_IMPORTS));

    expect(result.contentForVersion).toContain('import Link from "next/link"');
    expect(result.contentForVersion).toContain(
      'import { Button } from "@/components/ui/button"',
    );
    expect(result.contentForVersion).toContain(
      'import { Badge } from "@/components/ui/badge"',
    );
    // All blockers resolved deterministically → nothing left for the LLM.
    expect(result.verifierBlockingFindings).toEqual([]);
    expect(runLlmRepairGate).not.toHaveBeenCalled();
    // RAG rows record the deterministic fix as "fixed".
    expect(appendErrorLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        fixer: "deterministic-import-repair",
        result: "fixed",
        fault: "undefined-jsx-symbol",
      }),
    );
    expect(appendErrorLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ result: "still-failing" }),
    );
  });

  it("routes only the residue to the LLM gate when some findings are not import-solvable", async () => {
    runVerifierPass
      .mockResolvedValueOnce({
        blocking: [
          undefinedJsxFinding("app/page.tsx", "Link"),
          {
            id: "navigation-placeholder-actions",
            detail: "app/page.tsx: hero CTA href is empty",
          },
        ],
        quality: [],
      })
      // Post-LLM confirmation rerun.
      .mockResolvedValue({ blocking: [], quality: [] });
    runLlmRepairGate.mockResolvedValueOnce({
      result: {
        fixedContent: PAGE_WITHOUT_IMPORTS,
        fixedFiles: ["app/page.tsx"],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: true,
        aborted: false,
        durationMs: 5,
      },
      fixerModel: "gpt-5.5",
      deduped: false,
    });

    await runVerifierPhase(baseParams(PAGE_WITHOUT_IMPORTS));

    expect(runLlmRepairGate).toHaveBeenCalledTimes(1);
    const gateArgs = runLlmRepairGate.mock.calls[0][0];
    // The Link finding was already fixed deterministically — only the
    // placeholder finding reaches the LLM.
    expect(gateArgs.errors).toHaveLength(1);
    expect(gateArgs.errors[0]).toContain("navigation-placeholder-actions");
    // And the deterministically fixed import is present in the gate input.
    expect(gateArgs.content).toContain('import Link from "next/link"');
  });

  it("leaves ambiguous names (shadcn∩lucide) for the LLM gate", async () => {
    const page = fencedFile(
      "app/page.tsx",
      `export default function Page() {
  return <Calendar />;
}`,
    );
    runVerifierPass
      .mockResolvedValueOnce({
        blocking: [undefinedJsxFinding("app/page.tsx", "Calendar")],
        quality: [],
      })
      .mockResolvedValue({ blocking: [], quality: [] });
    runLlmRepairGate.mockResolvedValueOnce({
      result: {
        fixedContent: page,
        fixedFiles: [],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: false,
        aborted: false,
        durationMs: 5,
      },
      fixerModel: "gpt-5.5",
      deduped: false,
    });

    const result = await runVerifierPhase(baseParams(page));

    // A bare `<Calendar />` cannot be disambiguated deterministically
    // (shadcn component vs lucide glyph) — it must stay a blocking finding
    // and reach the LLM gate untouched.
    expect(runLlmRepairGate).toHaveBeenCalledTimes(1);
    expect(result.verifierBlockingFindings).toEqual([
      expect.objectContaining({ id: "undefined-jsx-symbol" }),
    ]);
    expect(result.contentForVersion).toBe(page);
  });

  it("prod cc10e7de contact-form: a valid FormEvent<HTMLFormElement> type annotation never blocks (full normalize+verifier path)", async () => {
    // Failing-test for M#jsx1: this is the REAL prod file shape (minimized
    // from version 4a29c7b4's components/contact-form.tsx). There is no JSX
    // misuse — only the type-generic annotation. Before the scanner fix the
    // deterministic verifier scan flagged `<HTMLFormElement>` inside the
    // generic as `undefined-jsx-symbol`; the dom pre-fix correctly no-ops
    // (nothing to rewrite), the import pre-fix correctly refuses the
    // DOM-variant, and the finding reached the LLM gate as an unfixable
    // blocker — failing v1, v5 and v8 in prod. The mocked `runVerifierPass`
    // delegates to the REAL deterministic scan so this exercises the whole
    // dom-prefix → scan → import-prefix chain on real content.
    const prodContactForm = fencedFile(
      "components/contact-form.tsx",
      `"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ContactForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (!formData.get("name")) {
      toast.error("Fyll i namn.");
      return;
    }
    setIsSubmitting(true);
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <Button type="submit" disabled={isSubmitting}>
        Skicka
      </Button>
    </form>
  );
}`,
    );
    runVerifierPass.mockImplementation(async (content: string) => ({
      blocking: checkUndefinedJsxSymbols(parseCodeProject(content).files),
      quality: [],
    }));

    const result = await runVerifierPhase(baseParams(prodContactForm));

    expect(result.verifierBlockingFindings).toEqual([]);
    expect(result.contentForVersion).toBe(prodContactForm);
    expect(runLlmRepairGate).not.toHaveBeenCalled();
  });

  it("real DOM-interface JSX misuse is rewritten by the dom pre-fix BEFORE the verifier scan", async () => {
    const brokenForm = fencedFile(
      "components/contact-form.tsx",
      `export function ContactForm() {
  return (
    <HTMLFormElement onSubmit={() => {}}>
      <input name="email" />
    </HTMLFormElement>
  );
}`,
    );
    runVerifierPass.mockImplementation(async (content: string) => ({
      blocking: checkUndefinedJsxSymbols(parseCodeProject(content).files),
      quality: [],
    }));

    const result = await runVerifierPhase(baseParams(brokenForm));

    // The deterministic dom pre-fix rewrote the tag, so the (real) scan on the
    // fixed content finds nothing and no blocker survives to the LLM gate.
    expect(result.contentForVersion).toContain("<form onSubmit=");
    expect(result.contentForVersion).not.toContain("<HTMLFormElement");
    expect(result.verifierBlockingFindings).toEqual([]);
    expect(runLlmRepairGate).not.toHaveBeenCalled();
  });

  it("ignores DOM-interface undefined-jsx details (owned by dom-builtin-jsx-fixer)", async () => {
    // The DOM-interface wording never matches the import parser — and the
    // dom pre-fix already rewrote the tag before the verifier ran. A stale
    // DOM-style finding must not trigger the import repair.
    const page = fencedFile(
      "app/kontakt/page.tsx",
      `export default function Page() {
  return <form>ok</form>;
}`,
    );
    runVerifierPass
      .mockResolvedValueOnce({
        blocking: [
          {
            id: "undefined-jsx-symbol",
            detail:
              "app/kontakt/page.tsx: `<HTMLFormElement />` is a DOM interface type, not a JSX component. Replace it with the lowercase HTML tag `<form>` and keep the same props/children. Do NOT import a library or introduce a new component to satisfy `HTMLFormElement`.",
          },
        ],
        quality: [],
      })
      .mockResolvedValue({ blocking: [], quality: [] });
    runLlmRepairGate.mockResolvedValueOnce({
      result: {
        fixedContent: page,
        fixedFiles: [],
        missingFiles: [],
        incompleteFiles: [],
        partial: false,
        success: false,
        aborted: false,
        durationMs: 5,
      },
      fixerModel: "gpt-5.5",
      deduped: false,
    });

    const result = await runVerifierPhase(baseParams(page));

    expect(result.contentForVersion).toBe(page);
    expect(devLogAppend).not.toHaveBeenCalledWith(
      "in-progress",
      expect.objectContaining({ type: "verifier-pass.deterministic-import-fix" }),
    );
  });
});
