import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { repairGeneratedFiles } from "./repair-generated-files";
import { runAutoFix } from "./pipeline";

/**
 * Regression: imported v0 templates (verbatim repos) ship shadcn ui components
 * importing scoped `@radix-ui/react-*` packages, and their own `package.json`
 * declares exactly those. The mechanical radix unification rewrote the imports
 * to `"radix-ui"` — a package the manifest never declared — so the preview VM
 * died on `Module not found: Can't resolve 'radix-ui'` (prod template imports
 * 2026-08-13..25, e.g. chat 39856586, template fnLkUW05eg3). The manifest that
 * travels with the fileset is the authority: unification stays on for the
 * own-engine lane (no manifest, or a baseline-merged manifest that declares
 * `radix-ui`) and turns off only for scoped-only manifests.
 */

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

function accordionFile(): CodeFile {
  return { path: "components/ui/accordion.tsx", content: SCOPED_ACCORDION, language: "tsx" };
}

function manifestFile(dependencies: Record<string, string>): CodeFile {
  return {
    path: "package.json",
    content: JSON.stringify({ name: "imported-template", dependencies }, null, 2),
    language: "json",
  };
}

describe("repairGeneratedFiles — radix unification follows the project manifest", () => {
  it("keeps scoped radix imports for a scoped-only manifest (imported template)", () => {
    const result = repairGeneratedFiles([
      manifestFile({ "@radix-ui/react-accordion": "^1.1.2", next: "14.0.3" }),
      accordionFile(),
    ]);
    const accordion = result.files.find((f) => f.path === "components/ui/accordion.tsx");
    expect(accordion?.content).toContain("@radix-ui/react-accordion");
    expect(accordion?.content).not.toContain('from "radix-ui"');
    expect(result.fixes.filter((fix) => /unified "radix-ui"/.test(fix.description))).toEqual([]);
  });

  it("still unifies when the manifest declares the unified package", () => {
    const result = repairGeneratedFiles([
      manifestFile({ "radix-ui": "1.4.3", "@radix-ui/react-accordion": "^1.1.2" }),
      accordionFile(),
    ]);
    const accordion = result.files.find((f) => f.path === "components/ui/accordion.tsx");
    expect(accordion?.content).toContain('from "radix-ui"');
    expect(accordion?.content).not.toContain("@radix-ui/react-accordion");
  });

  it("still unifies when no manifest travels with the fileset (generation lane)", () => {
    const result = repairGeneratedFiles([accordionFile()]);
    const accordion = result.files.find((f) => f.path === "components/ui/accordion.tsx");
    expect(accordion?.content).toContain('from "radix-ui"');
  });
});

describe("runAutoFix — radix unification follows the project manifest", () => {
  function fence(path: string, language: string, content: string): string {
    return "```" + language + ' file="' + path + '"\n' + content + "\n```";
  }

  it("keeps scoped radix imports for a scoped-only manifest (repair prepass lane)", async () => {
    const content = [
      fence(
        "package.json",
        "json",
        JSON.stringify({ dependencies: { "@radix-ui/react-accordion": "^1.1.2" } }, null, 2),
      ),
      fence("components/ui/accordion.tsx", "tsx", SCOPED_ACCORDION),
    ].join("\n\n");

    const result = await runAutoFix(content);
    expect(result.fixedContent).toContain("@radix-ui/react-accordion");
    expect(result.fixedContent).not.toContain('from "radix-ui"');
  });

  it("still unifies without a manifest in the fileset", async () => {
    const content = fence("components/ui/accordion.tsx", "tsx", SCOPED_ACCORDION);
    const result = await runAutoFix(content);
    expect(result.fixedContent).toContain('from "radix-ui"');
    expect(result.fixedContent).not.toContain("'@radix-ui/react-accordion'");
  });

  it("honours an explicit verbatimRepo flag over the manifest heuristic", async () => {
    const content = fence("components/ui/accordion.tsx", "tsx", SCOPED_ACCORDION);
    const verbatim = await runAutoFix(content, { verbatimRepo: true });
    expect(verbatim.fixedContent).toContain("@radix-ui/react-accordion");
    expect(verbatim.fixedContent).not.toContain('from "radix-ui"');
  });

  it("keeps unifying for the generation lane even with a scoped-only manifest", async () => {
    // `verbatimRepo: false` is the own-engine lane: the scaffold baseline is
    // merged later and always declares `radix-ui`, so unification is correct
    // and must not drift just because the model emitted a partial manifest.
    const content = [
      fence(
        "package.json",
        "json",
        JSON.stringify({ dependencies: { "@radix-ui/react-accordion": "^1.1.2" } }, null, 2),
      ),
      fence("components/ui/accordion.tsx", "tsx", SCOPED_ACCORDION),
    ].join("\n\n");

    const result = await runAutoFix(content, { verbatimRepo: false });
    expect(result.fixedContent).toContain('from "radix-ui"');
  });
});
