import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCodeProject, serializeCodeProject } from "../parser";
import { runAutoFix } from "./pipeline-steps/run-auto-fix";
import { countParseErrors } from "./rules/import-binding-ast";

const file = (body: string) => serializeCodeProject([{ path: "app/page.tsx", language: "tsx", content: body }]);
const bodyOf = (content: string) => parseCodeProject(content).files.find((entry) => entry.path === "app/page.tsx")!.content;

describe("public autofix transform regressions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NETWORK_DISABLED_FOR_REGRESSION_TEST"); }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("A3: keeps unsafe eval blocked even when an untouched comment contains $&", async () => {
    const result = await runAutoFix(file('// $&\neval("globalThis.auditSentinel = 1");'), { previewPolicy: "fidelity2" });

    expect(bodyOf(result.fixedContent)).not.toContain("eval(");
    expect(bodyOf(result.fixedContent)).toContain("// $&");
    expect(result.warnings.some((warning) => warning.startsWith("[security:block]"))).toBe(true);
  });

  it("B3: adds use-client while preserving literal price and replacement tokens", async () => {
    const body = 'export default function Page() { return <button onClick={() => {}}>Pay $100 $$ $& $1 $3</button>; }';
    const result = await runAutoFix(file(body), { previewPolicy: "fidelity2" });
    const fixed = bodyOf(result.fixedContent);

    expect(fixed).toContain('"use client";');
    expect(fixed).toContain("Pay $100 $$ $& $1 $3");
    expect(countParseErrors(fixed, "app/page.tsx")).toBe(0);
  });

  it("B21: strips multiline backend SDK imports in F2 and preserves them in F3", async () => {
    const body = `import {
  createClient,
} from "@supabase/supabase-js"; // backend
export default function Page() { return <main>{String(createClient)}</main>; }`;
    const f2 = await runAutoFix(file(body), { previewPolicy: "fidelity2" });
    const f3 = await runAutoFix(file(body), { previewPolicy: "fidelity3" });

    expect(bodyOf(f2.fixedContent)).not.toContain('from "@supabase/supabase-js"');
    expect(bodyOf(f3.fixedContent)).toContain('from "@supabase/supabase-js"');
    expect(bodyOf(f2.fixedContent)).toContain("// backend");
  });

  it("B22: preserves metadata when a comment mentions an event handler", async () => {
    const body = `"use client";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Preserve SEO",
};
// onClick will be added later
export default function Page() { return <main>Hello</main>; }`;
    const result = await runAutoFix(file(body), { previewPolicy: "fidelity2" });
    const fixed = bodyOf(result.fixedContent);

    expect(fixed).toContain('title: "Preserve SEO"');
    expect(fixed).toContain("export const metadata");
    expect(fixed).toContain("// onClick will be added later");
    expect(fixed).not.toContain('"use client"');
    expect(countParseErrors(fixed, "app/page.tsx")).toBe(0);
  });

  it("B22: keeps the client boundary when an imported hook is consumed through a local alias", async () => {
    const body = '"use client"; import {useState} from "react"; export const metadata={title:"test"}; const state=useState; export default function Page(){const [n]=state(0);return n;}';
    const result = await runAutoFix(file(body), { previewPolicy: "fidelity2" });
    const fixed = bodyOf(result.fixedContent);

    expect(fixed).toContain('"use client"');
    expect(fixed).toContain("const state=useState");
    expect(fixed).not.toContain("export const metadata");
    expect(countParseErrors(fixed, "app/page.tsx")).toBe(0);
  });

  it.each([
    ['import * as React from "react";', "const state = React.useState;"],
    ['import React from "react";', "const { useState: state } = React;"],
  ])("B22: retains the client boundary for namespace/default runtime aliases: %s %s", async (reactImport, alias) => {
    const body = `"use client"; ${reactImport} export const metadata = { title: "test" }; ${alias} export default function Page() { const [n] = state(0); return n; }`;
    const result = await runAutoFix(file(body), { previewPolicy: "fidelity2" });
    const fixed = bodyOf(result.fixedContent);

    expect(fixed).toContain('"use client"');
    expect(fixed).toContain(alias);
    expect(fixed).not.toContain("export const metadata");
    expect(countParseErrors(fixed, "app/page.tsx")).toBe(0);
  });
});
