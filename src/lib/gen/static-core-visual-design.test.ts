// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const dynamicContexts = [
  "## Design Priority\n\ntest dynamic context",
  "## Aktuell instruktion\n\nÄndra bara kontakttexten. Bevara övrigt innehåll och utseende.",
];

// Exercise the production CJS loader through tsx, as the CLI/preflight does.
// Do not reconstruct the composer in the test to work around Vitest ESM.
const composed = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--import", "tsx", "-e",
      [
        'const { getStaticCoreFromWorkspace } = require("./src/lib/gen/static-core-loader.ts");',
        'const { composeEngineSystemPrompt, getSystemPromptLengths, SYSTEM_PROMPT_SEPARATOR } = require("./src/lib/gen/system-prompt/compose.ts");',
        "const contexts = JSON.parse(process.argv[1]);",
        "const results = contexts.map((dynamic) => {",
        "  const prompt = composeEngineSystemPrompt(dynamic);",
        "  return { prompt, lengths: getSystemPromptLengths(prompt) };",
        "});",
        "console.log(JSON.stringify({ core: getStaticCoreFromWorkspace(), separator: SYSTEM_PROMPT_SEPARATOR, results }));",
      ].join("\n"),
      JSON.stringify(dynamicContexts),
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  ),
) as {
  core: string;
  separator: string;
  results: { prompt: string; lengths: { total: number; static: number; dynamic: number } }[];
};

/**
 * Guards the actual composed prompt after 03-visual-design text changes.
 * Technical color/font/contrast/chart/follow-up protections must survive;
 * universal look recipes must not return as quality requirements.
 */
describe("static core visual-design contract", () => {
  const core = composed.results[0].prompt;

  it("keeps neighboring core contracts when 03 changes", () => {
    expect(core).toContain("Respond exclusively in **CodeProject** format");
    expect(core).toContain("Follow-ups return only changed files");
    expect(core).toContain('import { Dialog as DialogPrimitive } from "radix-ui"');
    expect(core).toContain("Never invent a local image path");
    expect(core).toContain("WCAG 2.1 AA contrast");
    expect(core).toContain("prefers-reduced-motion");
  });

  it("routes explicitly requested stock-photo searches through the materializer", () => {
    expect(core).toContain("**Explicit stock-photo search:**");
    expect(core).toContain("/placeholder.svg?width=<w>&height=<h>&text=<subject>");
    expect(core).toContain("A direct Unsplash photo ID bypasses the search");
    expect(core).toContain("preserve any exact image URL or asset the user supplied");
    expect(core).toContain("For stock images without an explicit search request, direct");
  });

  it("keeps color, font, contrast and chart technical protections", () => {
    expect(core).toContain("@theme inline");
    expect(core).toContain("--color-background: oklch(...)");
    expect(core).toContain("--color-*");
    expect(core).toContain("next/font/google");
    expect(core).toContain("--font-sans");
    expect(core).toContain("AA contrast");
    expect(core).toContain("ChartContainer");
    expect(core).toContain("semantic colors from the chart config");
  });

  it("recolors a role through its shared token and keeps labels readable (SM-135)", () => {
    expect(core).toContain("**Recoloring a role**");
    expect(core).toContain("Do not add a parallel token (`--color-cta`, `--color-button`)");
    expect(core).toContain("set its `-foreground` partner too");
    // V-2 (prod 2026-11-20): an override outside `@theme inline` never reached `bg-primary`.
    expect(core).toContain("**Where a color change takes effect:**");
    expect(core).toContain("only changes when you edit the `--color-primary` line inside that block");
    expect(core).toContain("changes nothing on screen");
    expect(core).toContain("WCAG AA, 4.5:1");
  });

  it("labels invented facts as examples on the page", () => {
    expect(core).toContain("**Facts the user did not give are examples, and the page says so.**");
    expect(core).toContain("«Exempel på omdömen»");
    expect(core).toContain("governs opening hours and contact details only");
    expect(core).toContain("Prices and reviews still follow the example rule above.");
  });

  it("does not prescribe a universal look", () => {
    expect(core).not.toContain("hover:shadow-md hover:border-primary/20");
    expect(core).not.toContain("text-4xl sm:text-5xl lg:text-6xl");
    expect(core).not.toContain("py-16 sm:py-24 lg:py-32");
    expect(core).not.toContain("Prefer deliberate structure (asymmetry");
    expect(core).not.toContain("avoid default centered stacks");
  });

  it("treats composition as a choice under Design Priority", () => {
    expect(core).toContain("optional treatments, not a quality checklist");
    expect(core).toContain("Centered, symmetric and asymmetric compositions are equally valid");
    expect(core).toContain(
      "A local edit or generic polish request is not permission for a site-wide redesign",
    );
    expect(core).toMatch(/Theme tokens[\s\S]*default when no higher-priority/i);
    expect(core).toMatch(/font pairings are the default/i);
  });

  it.each(dynamicContexts.map((dynamic, index) => ({ dynamic, index })))(
    "preserves core, changed request context and real length accounting ($index)",
    ({ dynamic, index }) => {
      const { prompt, lengths } = composed.results[index];
      expect(composed.core.length).toBeGreaterThan(0);
      expect(prompt.startsWith(composed.core + composed.separator)).toBe(true);
      expect(prompt.slice(composed.core.length + composed.separator.length)).toBe(dynamic);
      expect(lengths).toEqual({
        total: prompt.length,
        static: composed.core.length,
        dynamic: dynamic.length,
      });
    },
  );
});
