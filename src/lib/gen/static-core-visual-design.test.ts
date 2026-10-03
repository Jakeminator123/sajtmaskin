import { describe, expect, it } from "vitest";

import { getStaticCoreFromWorkspace } from "./static-core-loader";
import { SYSTEM_PROMPT_SEPARATOR } from "./system-prompt";

/**
 * Guards the assembled static core after 03-visual-design text changes.
 * Technical color/font/contrast/chart/follow-up protections must survive;
 * universal look recipes must not return as quality requirements.
 *
 * `composeEngineSystemPrompt()` is not called here: its CJS `require` of
 * the loader does not resolve under Vitest ESM. Assembly is the same
 * concatenation the composer uses (`core + separator + dynamic`).
 */
describe("static core visual-design contract", () => {
  const core = getStaticCoreFromWorkspace();
  const assembled = `${core}${SYSTEM_PROMPT_SEPARATOR}## Design Priority\n\ntest dynamic context`;

  it("keeps neighboring core contracts when 03 changes", () => {
    expect(core).toContain("Respond exclusively in **CodeProject** format");
    expect(core).toContain("Follow-ups return only changed files");
    expect(core).toContain('import { Dialog as DialogPrimitive } from "radix-ui"');
    expect(core).toContain("Never invent a local image path");
    expect(core).toContain("WCAG 2.1 AA contrast");
    expect(core).toContain("prefers-reduced-motion");
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

  it("assembles ahead of request-specific context without dropping 03", () => {
    expect(assembled).toContain(SYSTEM_PROMPT_SEPARATOR);
    expect(assembled).toContain(core);
    expect(assembled).toContain("test dynamic context");
    expect(assembled.indexOf(core)).toBe(0);
  });
});
