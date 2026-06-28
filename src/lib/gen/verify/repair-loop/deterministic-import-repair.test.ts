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

  it("resolves Stripe as a default import in an API route (TS2552)", () => {
    const routeFile = "app/api/checkout-session/route.ts";
    const content = file(
      routeFile,
      `export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return Response.json({ id: stripe ? 1 : 0 });
}`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(routeFile, "Cannot find name 'Stripe'. Did you mean 'stripe'?"),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.handledCodes).toContain("TS2304");
    expect(result.content).toContain('import Stripe from "stripe"');
  });

  it("resolves Clerk server helpers in middleware (TS2304)", () => {
    const mw = "middleware.ts";
    const content = file(
      mw,
      `const isProtected = createRouteMatcher(["/dashboard(.*)"]);
export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});`,
    );
    const result = runDeterministicImportRepair(content, [
      diag(mw, "Cannot find name 'clerkMiddleware'."),
      diag(mw, "Cannot find name 'createRouteMatcher'."),
    ]);

    expect(result.fixed).toBe(true);
    expect(result.content).toContain('from "@clerk/nextjs/server"');
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
