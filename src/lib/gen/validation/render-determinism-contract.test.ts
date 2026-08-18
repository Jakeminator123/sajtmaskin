import { describe, expect, it } from "vitest";
import { getAllScaffolds } from "@/lib/gen/scaffolds/registry";
import { buildDynamicContext } from "@/lib/gen/system-prompt/build-dynamic-context";
import { splitContextIntoBudgetBlocks } from "@/lib/gen/system-prompt/budget";
import {
  detectNonDeterministicRenderInSource,
  runHydrationPreflightChecks,
} from "./hydration-preflight";

describe("render determinism contract", () => {
  it("every registered scaffold passes hydration preflight with zero issues", () => {
    for (const scaffold of getAllScaffolds()) {
      const files = scaffold.files.map((file) => ({
        path: file.path,
        content: file.content,
        language: file.path.endsWith(".tsx")
          ? "tsx"
          : file.path.endsWith(".jsx")
            ? "jsx"
            : "ts",
      }));
      const issues = runHydrationPreflightChecks(files);
      expect(
        issues,
        `${scaffold.id}: expected 0 hydration issues, got ${JSON.stringify(
          issues.map((i) => ({ file: i.file, pattern: i.pattern })),
        )}`,
      ).toHaveLength(0);
    }
  });

  it("system prompt forbids non-deterministic values in render scope", () => {
    const { context } = buildDynamicContext({
      intent: "website",
      userPrompt: "Build a simple website",
      generationMode: "init",
    });
    expect(context).toMatch(/Math\.random/);
    expect(context).toMatch(/hydration|non-?deterministic/i);
    expect(context).toMatch(/Encountered a script tag while rendering React component/);
    expect(context).toMatch(/ThemeProvider/);

    // Bugbot 2026-08-05: the rule must be its own `##` budget block marked
    // required, or a tight systemContextTokens budget silently truncates it
    // away as the tail of the preceding required block.
    const block = splitContextIntoBudgetBlocks(context).find((b) =>
      /render determinism/i.test(b.title),
    );
    expect(block, "expected an own '## Render determinism' budget block").toBeDefined();
    expect(block?.required).toBe(true);
  });

  it("motprov: detector still flags Math.random in useState init and ignores new Date(fixedArg)", () => {
    const risky = `"use client"
import { useState } from "react"
export default function Page() {
  const [items] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      height: Math.floor(Math.random() * 400) + 100,
    })),
  )
  return <div>{items.length}</div>
}`;
    const issues = detectNonDeterministicRenderInSource("app/page.tsx", risky);
    expect(issues).toHaveLength(1);
    expect(issues[0].pattern).toBe("Math.random()");

    const safe = `export default function P({ ts }: { ts: number }) {
  return <time>{new Date(ts).toISOString()}</time>
}`;
    expect(detectNonDeterministicRenderInSource("app/page.tsx", safe)).toHaveLength(0);
  });
});
