import { describe, expect, it } from "vitest";
import { runDeterministicImportRepair } from "./deterministic-import-repair";
import type { ParsedRepairDiagnostic } from "./diagnostics-parser";

function file(path: string, content: string): string {
  return `\`\`\`tsx file="${path}"\n${content}\n\`\`\``;
}

function project(...files: string[]): string {
  return files.join("\n\n");
}

function diag(filePath: string, message: string): ParsedRepairDiagnostic {
  return { file: filePath, line: 1, column: 1, message, source: "typecheck" };
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
