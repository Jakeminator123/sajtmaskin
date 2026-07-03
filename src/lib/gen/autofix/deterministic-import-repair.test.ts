import { describe, expect, it } from "vitest";
import { runDeterministicImportRepair } from "./deterministic-import-repair";
import type { DeterministicImportRepairDiagnostic } from "./deterministic-import-repair";

function file(path: string, content: string): string {
  return `\`\`\`tsx file="${path}"\n${content}\n\`\`\``;
}

function project(...files: string[]): string {
  return files.join("\n\n");
}

function diag(filePath: string, message: string): DeterministicImportRepairDiagnostic {
  return { file: filePath, message };
}

describe("runDeterministicImportRepair", () => {
  it("resolves a missing shadcn import (TS2304)", () => {
    const content = file(
      "app/page.tsx",
      `export default function Page() {
  return <Button>Go</Button>;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag("app/page.tsx", "Cannot find name 'Button'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2304");
    expect(result.content).toContain('import { Button } from "@/components/ui/button"');
  });

  it("records the TS2552 'did you mean' variant distinctly from TS2304", () => {
    // Same resolvable shadcn symbol (`Button`) and same fix in both cases — only
    // the diagnostic shape differs. The recorded code must follow the message:
    // the "Did you mean" form is TS2552, the plain form is TS2304. They must not
    // be bucketed together (the gap that motivated #291's prod analysis).
    const content = file(
      "app/page.tsx",
      `export default function Page() {
  return <Button>Go</Button>;
}`,
    );

    const ts2552 = runDeterministicImportRepair(content, [
      diag("app/page.tsx", "Cannot find name 'Button'. Did you mean 'button'?"),
    ]);
    expect(ts2552.fixed).toBe(true);
    expect(ts2552.handledCodes).toContain("TS2552");
    expect(ts2552.handledCodes).not.toContain("TS2304");
    expect(ts2552.content).toContain('import { Button } from "@/components/ui/button"');

    const ts2304 = runDeterministicImportRepair(content, [
      diag("app/page.tsx", "Cannot find name 'Button'."),
    ]);
    expect(ts2304.fixed).toBe(true);
    expect(ts2304.handledCodes).toContain("TS2304");
    expect(ts2304.handledCodes).not.toContain("TS2552");
  });

  it("does not label non-TS2552 'did you mean' variants as TS2552", () => {
    // TS2662/TS2663 ("...the instance/static member 'this.X'") and TS2311
    // ("...to write this in an async function") also begin with "Cannot find
    // name 'X'." + a "Did you mean" clause, but they are NOT TS2552. Only the
    // quoted-name suggestion form is TS2552; anything else stays TS2304.
    const content = file(
      "components/hero.tsx",
      `export function Hero() {
  return <Image src="/a.png" alt="a" width={1} height={1} />;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(
        "components/hero.tsx",
        "Cannot find name 'Image'. Did you mean the instance member 'this.Image'?",
      ),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2304");
    expect(result.handledCodes).not.toContain("TS2552");
    expect(result.content).toContain('import Image from "next/image"');
  });

  const STRIPE_ROUTE = "app/api/checkout-session/route.ts";
  const stripeContent = file(
    STRIPE_ROUTE,
    `export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return Response.json({ id: stripe ? 1 : 0 });
}`,
  );
  const CLERK_MW = "middleware.ts";
  const clerkContent = file(
    CLERK_MW,
    `const isProtected = createRouteMatcher(["/dashboard(.*)"]);
export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});`,
  );

  it("resolves Stripe as a default import in an API route in F3 (TS2552)", () => {
    const result = runDeterministicImportRepair(
      stripeContent,
      [diag(STRIPE_ROUTE, "Cannot find name 'Stripe'. Did you mean 'stripe'?")],
      { previewPolicy: "fidelity3" },
    );

    expect(result.fixed).toBe(true);
    // `Stripe` arrived as the TS2552 "Did you mean 'stripe'?" variant, so it
    // must be recorded as TS2552 — not folded into TS2304.
    expect(result.handledCodes).toContain("TS2552");
    expect(result.handledCodes).not.toContain("TS2304");
    expect(result.content).toContain('import Stripe from "stripe"');
  });

  it("attributes cannot-find-name codes per file (residual code not counted)", () => {
    // The same symbol (`Stripe`) appears in two files with different codes. In
    // F3 it resolves in the API route (TS2552 "did you mean") but stays residual
    // in a plain component (TS2304) — the Node SDK only resolves in server-route
    // files. handledCodes must report ONLY the resolved TS2552; the unresolved
    // component's TS2304 must NOT be mis-counted (per-file, not per-name).
    const component = file(
      "components/pricing.tsx",
      `export function Pricing() {
  const client = new Stripe("pk");
  return <div>{client ? "ok" : "no"}</div>;
}`,
    );
    const result = runDeterministicImportRepair(
      project(stripeContent, component),
      [
        diag(STRIPE_ROUTE, "Cannot find name 'Stripe'. Did you mean 'stripe'?"),
        diag("components/pricing.tsx", "Cannot find name 'Stripe'."),
      ],
      { previewPolicy: "fidelity3" },
    );

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2552");
    expect(result.handledCodes).not.toContain("TS2304");
    // Only the route file received the import; the component stayed residual.
    const stripeImports =
      result.content.split('import Stripe from "stripe"').length - 1;
    expect(stripeImports).toBe(1);
  });

  const RESEND_ROUTE = "app/api/contact/route.ts";
  const resendContent = file(
    RESEND_ROUTE,
    `export async function POST() {
  const resend = new Resend(process.env.RESEND_API_KEY!);
  return Response.json({ ok: true });
}`,
  );

  it("resolves Resend as a NAMED import in an API route in F3 (prod cc10e7de v8)", () => {
    const result = runDeterministicImportRepair(
      resendContent,
      [diag(RESEND_ROUTE, "Cannot find name 'Resend'. Did you mean 'resend'?")],
      { previewPolicy: "fidelity3" },
    );

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2552");
    expect(result.content).toContain('import { Resend } from "resend"');
  });

  it("leaves Resend residual in F2 and reports the tier-3 gate in the telemetry summary", () => {
    const result = runDeterministicImportRepair(resendContent, [
      diag(RESEND_ROUTE, "Cannot find name 'Resend'."),
    ]); // no previewPolicy → F2-safe default

    expect(result.fixed).toBe(false);
    expect(result.content).not.toContain('from "resend"');
    expect(result.cannotFindSummary.residual).toEqual([
      { file: RESEND_ROUTE, name: "Resend", reason: "tier3_gated" },
    ]);
  });

  it("telemetry summary: seen codes + resolved names + residual reasons (M#imp1)", () => {
    const content = project(
      file(
        "app/page.tsx",
        `export default function Page() {
  return (
    <main>
      <Button>Start</Button>
      <MysteryWidget />
      <Calendar />
    </main>
  );
}`,
      ),
      stripeContent,
    );
    const result = runDeterministicImportRepair(content, [
      diag("app/page.tsx", "Cannot find name 'Button'."),
      diag("app/page.tsx", "Cannot find name 'MysteryWidget'."),
      diag("app/page.tsx", "Cannot find name 'Calendar'."),
      diag(STRIPE_ROUTE, "Cannot find name 'Stripe'. Did you mean 'stripe'?"),
    ]); // F2-safe default → Stripe gated

    expect(result.cannotFindSummary.seenCodes.sort()).toEqual(["TS2304", "TS2552"]);
    expect(result.cannotFindSummary.resolvedNames).toEqual(["app/page.tsx::Button"]);
    expect(result.cannotFindSummary.residual).toEqual(
      expect.arrayContaining([
        { file: "app/page.tsx", name: "MysteryWidget", reason: "unknown_name" },
        { file: "app/page.tsx", name: "Calendar", reason: "ambiguous_shadcn_lucide" },
        { file: STRIPE_ROUTE, name: "Stripe", reason: "tier3_gated" },
      ]),
    );
    expect(result.cannotFindSummary.residual).toHaveLength(3);
  });

  it("resolves Clerk server helpers in middleware in F3 (TS2304)", () => {
    const result = runDeterministicImportRepair(
      clerkContent,
      [
        diag(CLERK_MW, "Cannot find name 'clerkMiddleware'."),
        diag(CLERK_MW, "Cannot find name 'createRouteMatcher'."),
      ],
      { previewPolicy: "fidelity3" },
    );

    expect(result.fixed).toBe(true);
    expect(result.content).toContain('from "@clerk/nextjs/server"');
  });

  it("P1: leaves tier-3 SDK imports residual in F2 (never re-adds Stripe/Clerk)", () => {
    // The F2 SDK guard stripped these; re-adding them after the guard would let
    // an F2 design-preview promote silently with a forbidden backend import.
    const stripeF2 = runDeterministicImportRepair(stripeContent, [
      diag(STRIPE_ROUTE, "Cannot find name 'Stripe'. Did you mean 'stripe'?"),
    ]); // no previewPolicy → F2-safe default
    expect(stripeF2.fixed).toBe(false);
    expect(stripeF2.handledCodes).toEqual([]);
    expect(stripeF2.content).not.toContain('import Stripe from "stripe"');

    const clerkF2 = runDeterministicImportRepair(
      clerkContent,
      [
        diag(CLERK_MW, "Cannot find name 'clerkMiddleware'."),
        diag(CLERK_MW, "Cannot find name 'createRouteMatcher'."),
      ],
      { previewPolicy: "fidelity2" },
    );
    expect(clerkF2.fixed).toBe(false);
    expect(clerkF2.content).not.toContain('from "@clerk/nextjs/server"');
  });

  it("resolves non-tier-3 shadcn imports in BOTH F2 and F3 (unchanged by the gate)", () => {
    const content = file(
      "app/page.tsx",
      `export default function Page() {
  return <Card>x</Card>;
}`,
    );
    const diagnostics = [diag("app/page.tsx", "Cannot find name 'Card'.")];

    for (const previewPolicy of ["fidelity2", "fidelity3"] as const) {
      const result = runDeterministicImportRepair(content, diagnostics, { previewPolicy });
      expect(result.fixed).toBe(true);
      expect(result.content).toContain('import { Card } from "@/components/ui/card"');
    }
  });

  it("flips an `import type` used as an object value (TS1361)", () => {
    const f = "components/motif-selector.tsx";
    const content = file(
      f,
      `import type { PawPrint, MoonStar } from "lucide-react";

const motifs = [
  { id: "paw", icon: PawPrint },
  { id: "moon", icon: MoonStar },
];

export const data = motifs;`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(
        f,
        "'PawPrint' cannot be used as a value because it was imported using 'import type'.",
      ),
      diag(
        f,
        "'MoonStar' cannot be used as a value because it was imported using 'import type'.",
      ),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS1361");
    expect(result.content).toContain('import { PawPrint, MoonStar } from "lucide-react"');
    expect(result.content).not.toContain("import type {");
  });

  it("drops a self-import conflicting with a local declaration (TS2440)", () => {
    const f = "components/ui/carousel.tsx";
    const content = file(
      f,
      `import { Carousel } from "@/components/ui/carousel";

export function Carousel() {
  return <div />;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(f, "Import declaration conflicts with local declaration of 'Carousel'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2440");
    expect(result.content).not.toContain(
      'import { Carousel } from "@/components/ui/carousel"',
    );
    expect(result.content).toContain("export function Carousel");
  });

  it("dedupes a duplicate identifier import (TS2300)", () => {
    const f = "components/star-row.tsx";
    const content = file(
      f,
      `import { Star } from "lucide-react";
import { Star } from "@/components/star";

export function StarRow() {
  return <Star />;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(f, "Duplicate identifier 'Star'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2300");
    expect(result.content).toContain('import { Star } from "lucide-react"');
    expect(result.content).not.toContain('from "@/components/star"');
  });

  it("leaves a shadcn∩lucide ambiguous name untouched (no fix)", () => {
    const content = file(
      "app/page.tsx",
      `export default function Page() {
  return <Calendar />;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag("app/page.tsx", "Cannot find name 'Calendar'."),
    ]);

    expect(result.fixed).toBe(false);
    expect(result.handledCodes).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("leaves non-import (logic/type) diagnostics for the LLM", () => {
    const content = file(
      "components/palma-live-card.tsx",
      `export function Card() {
  const x = makeThing();
  return <div>{x}</div>;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag("components/palma-live-card.tsx", "Expected 1 arguments, but got 0."),
      diag("components/palma-live-card.tsx", "Parameter 'x' implicitly has an 'any' type."),
    ]);

    expect(result.fixed).toBe(false);
    expect(result.handledCodes).toEqual([]);
  });

  it("handles several codes across files in one pass", () => {
    // `Card` is shadcn-only (unlike `Badge`, which collides with a lucide glyph),
    // so it resolves deterministically; `Sparkles` is the TS1361 case.
    const a = file(
      "app/page.tsx",
      `export default function Page() {
  return <Card>New</Card>;
}`,
    );
    const b = file(
      "components/icon-list.tsx",
      `import type { Sparkles } from "lucide-react";

export const list = [{ icon: Sparkles }];`,
    );
    const result = runDeterministicImportRepair(project(a, b), [
      diag("app/page.tsx", "Cannot find name 'Card'."),
      diag(
        "components/icon-list.tsx",
        "'Sparkles' cannot be used as a value because it was imported using 'import type'.",
      ),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2304");
    expect(result.handledCodes).toContain("TS1361");
    expect(result.content).toContain('import { Card } from "@/components/ui/card"');
    expect(result.content).toContain('import { Sparkles } from "lucide-react"');
  });

  it("smörsajt regression: overlapping react imports consolidate into ONE value import (TS2300)", () => {
    // The repair paths themselves used to create this state: a file with an
    // existing react import where a repair pass injected a second/third
    // `import ... from "react"` line re-declaring useEffect/useState/ReactNode.
    // The generic duplicate-binding pruner keeps the FIRST declaration, which
    // for the type/value pair would keep `import type { ReactNode }` and
    // re-break the value usage — consolidation must win instead.
    const f = "components/three-canvas-shell.tsx";
    const content = file(
      f,
      `"use client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ReactNode, useEffect } from "react";

export function ThreeCanvasShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <div>{ready ? children : null}</div>;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(f, "Duplicate identifier 'ReactNode'."),
      diag(f, "Duplicate identifier 'useEffect'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2300");
    const reactImportLines = result.content
      .split("\n")
      .filter((line) => /from "react"/.test(line));
    expect(reactImportLines).toHaveLength(1);
    expect(reactImportLines[0]).toContain("useEffect");
    expect(reactImportLines[0]).toContain("useState");
    expect(reactImportLines[0]).toContain("ReactNode");
    // Value usage requires a VALUE import — no type-only react import left.
    expect(reactImportLines[0]).not.toMatch(/import\s+type/);
  });

  it("consolidates a doubled default React import (webpack-crash class)", () => {
    const f = "components/three-canvas-shell.tsx";
    const content = file(
      f,
      `"use client";
import React from "react";
import React from "react";

export function Shell() {
  return <React.Fragment>ok</React.Fragment>;
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(f, "Duplicate identifier 'React'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2300");
    const reactImportLines = result.content
      .split("\n")
      .filter((line) => /from "react"/.test(line));
    expect(reactImportLines).toHaveLength(1);
  });

  it("resolves a TS2304 for an own component with a NAMED export (Reveal class)", () => {
    const page = file(
      "app/page.tsx",
      `export default function Page() {
  return <Reveal delay={0.2}>Hello</Reveal>;
}`,
    );
    const reveal = file(
      "components/reveal.tsx",
      `"use client";

export function Reveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}`,
    );
    const result = runDeterministicImportRepair(project(page, reveal), [
      diag("app/page.tsx", "Cannot find name 'Reveal'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2304");
    expect(result.fixes.some((fix) => fix.fixer === "own-component-import-fixer")).toBe(
      true,
    );
    expect(result.content).toContain('import { Reveal } from "@/components/reveal"');
    // The component file itself is untouched.
    expect(result.content).toContain("export function Reveal");
  });

  it("resolves a TS2304 for an own component with a DEFAULT export", () => {
    const page = file(
      "app/page.tsx",
      `export default function Page() {
  return <Reveal>Hello</Reveal>;
}`,
    );
    const reveal = file(
      "components/reveal.tsx",
      `"use client";

export default function Reveal({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}`,
    );
    const result = runDeterministicImportRepair(project(page, reveal), [
      diag("app/page.tsx", "Cannot find name 'Reveal'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2304");
    expect(result.content).toContain('import Reveal from "@/components/reveal"');
  });

  it("leaves an unknown name with NO matching own file untouched (no silent stub)", () => {
    const page = file(
      "app/page.tsx",
      `export default function Page() {
  return <Reveal>Hello</Reveal>;
}`,
    );
    const other = file(
      "components/hero.tsx",
      `export function Hero() {
  return <div>hero</div>;
}`,
    );
    const content = project(page, other);
    const result = runDeterministicImportRepair(content, [
      diag("app/page.tsx", "Cannot find name 'Reveal'."),
    ]);

    expect(result.fixed).toBe(false);
    expect(result.handledCodes).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("does not import an own file when TWO own files export the same name (ambiguous)", () => {
    const page = file(
      "app/page.tsx",
      `export default function Page() {
  return <Reveal>Hello</Reveal>;
}`,
    );
    const a = file(
      "components/reveal.tsx",
      `export function Reveal() { return <div>a</div>; }`,
    );
    const b = file(
      "components/effects/reveal.tsx",
      `export function Reveal() { return <div>b</div>; }`,
    );
    const content = project(page, a, b);
    const result = runDeterministicImportRepair(content, [
      diag("app/page.tsx", "Cannot find name 'Reveal'."),
    ]);

    expect(result.fixed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("is idempotent — a second run makes no further change", () => {
    const content = file(
      "app/page.tsx",
      `export default function Page() {
  return <Button>Go</Button>;
}`,
    );
    const diagnostics = [diag("app/page.tsx", "Cannot find name 'Button'.")];
    const first = runDeterministicImportRepair(content, diagnostics);
    expect(first.fixed).toBe(true);
    // On the repaired content the import now exists, so the known-import fixer
    // skips it (already-imported guard) and nothing else matches.
    const second = runDeterministicImportRepair(first.content, [
      diag("app/page.tsx", "Cannot find name 'Button'."),
    ]);
    expect(second.fixed).toBe(false);
    expect(second.content).toBe(first.content);
  });
});
