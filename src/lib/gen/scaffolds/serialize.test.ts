import { describe, expect, it } from "vitest";
import { serializeScaffoldForPrompt } from "./serialize";
import type { ScaffoldManifest } from "./types";

function makeLongFile(label: string): string {
  return [
    `export const ${label} = () => {`,
    "  return (",
    "    <section>",
    `      <h2>${label}</h2>`,
    `      <p>${"content ".repeat(400)}</p>`,
    "    </section>",
    "  );",
    "};",
  ].join("\n");
}

describe("serializeScaffoldForPrompt", () => {
  it("keeps structural mode within a predictable budget", () => {
    const scaffold: ScaffoldManifest = {
      id: "test-scaffold",
      family: "landing-page",
      label: "Test scaffold",
      description: "A scaffold used for prompt-budget tests.",
      buildIntents: ["website"],
      tags: [],
      promptHints: [],
      files: [
        { path: "app/layout.tsx", content: makeLongFile("Layout") },
        { path: "app/page.tsx", content: makeLongFile("HomePage") },
        { path: "app/globals.css", content: ".root { color: red; }\n".repeat(500) },
        { path: "components/hero.tsx", content: makeLongFile("Hero") },
        { path: "components/features.tsx", content: makeLongFile("Features") },
        { path: "components/testimonials.tsx", content: makeLongFile("Testimonials") },
        { path: "components/non-critical.tsx", content: "NON_CRITICAL_PAYLOAD\n".repeat(600) },
      ],
    };

    const out = serializeScaffoldForPrompt(scaffold, "structural", {
      maxChars: 22_000,
      contextPolicy: "normal",
    });

    expect(out.length).toBeLessThanOrEqual(22_500);
    expect(out).toContain("## Scaffold File Tree");
    expect(out).toContain("## Critical Scaffold Files");
    expect(out).toContain('file="app/layout.tsx"');
    expect(out).toContain('file="app/page.tsx"');
    expect(out).not.toContain("NON_CRITICAL_PAYLOAD");
  });
});
