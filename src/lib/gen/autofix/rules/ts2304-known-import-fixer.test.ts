import { describe, expect, it } from "vitest";
import { fixKnownTs2304Imports } from "./ts2304-known-import-fixer";

function project(filePath: string, content: string): string {
  return `\`\`\`tsx file="${filePath}"\n${content}\n\`\`\``;
}

const FILE = "app/page.tsx";

describe("ts2304-known-import-fixer", () => {
  it("adds a lucide import for a JSX usage flagged by TS2304", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <Clapperboard className="h-6 w-6" />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Clapperboard'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Clapperboard", module: "lucide-react" },
    ]);
    expect(result.code).toContain('import { Clapperboard } from "lucide-react"');
    expect(result.fixes[0]?.fixer).toBe("ts2304-known-import-fixer");
  });

  it("adds a lucide import for a NON-JSX usage flagged by TS2304", () => {
    // This is the gap the JSX-scan fixers miss: the icon is used as a value,
    // never as `<Clapperboard/>`, so only a diagnostic-driven fixer catches it.
    const content = project(
      FILE,
      `import type { LucideIcon } from "lucide-react";

const ActiveIcon: LucideIcon = Clapperboard;

export default function Page() {
  const Icon = ActiveIcon;
  return <Icon />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Clapperboard'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Clapperboard", module: "lucide-react" },
    ]);
    // Must add a VALUE import, not merge into the type-only line.
    expect(result.code).toContain('import { Clapperboard } from "lucide-react"');
    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
  });

  it("leaves an unknown / non-lucide name untouched for the LLM", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <TotallyMadeUpWidget />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'TotallyMadeUpWidget'." },
    ]);

    expect(result.addedImports).toEqual([]);
    expect(result.fixes).toEqual([]);
    expect(result.code).toBe(content);
  });

  it("merges into an existing lucide-react value import line", () => {
    const content = project(
      FILE,
      `import { Camera } from "lucide-react";

export default function Page() {
  return (
    <div>
      <Camera />
      <Clapperboard />
    </div>
  );
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Clapperboard'." },
    ]);

    expect(result.code).toContain(
      'import { Camera, Clapperboard } from "lucide-react"',
    );
    // No duplicate second lucide import line.
    expect(result.code.match(/from "lucide-react"/g)).toHaveLength(1);
  });

  it("resolves a known module specifier (react hook) flagged by TS2304", () => {
    const content = project(
      FILE,
      `"use client";

export default function Page() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'useState'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "useState", module: "react" },
    ]);
    expect(result.code).toContain('import { useState } from "react"');
  });

  it("prefers next/image default import over the lucide Image icon (non-JSX)", () => {
    // `Image` exists in BOTH LUCIDE_ICONS and KNOWN_MODULE_SPECIFIERS. The Next
    // component (default import) must win, otherwise we promote the wrong
    // component and keep failing on Next-specific props.
    const content = project(
      FILE,
      `export default function Page() {
  const HeroImage = Image;
  return <HeroImage src="/hero.png" alt="" width={1200} height={600} />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Image'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Image", module: "next/image" },
    ]);
    expect(result.code).toContain('import Image from "next/image"');
    expect(result.code).not.toContain('from "lucide-react"');
  });

  it("prefers next/link default import over the lucide Link icon (non-JSX)", () => {
    const content = project(
      FILE,
      `export default function Page() {
  const Anchor = Link;
  return <Anchor href="/">home</Anchor>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Link'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Link", module: "next/link" },
    ]);
    expect(result.code).toContain('import Link from "next/link"');
    expect(result.code).not.toContain('from "lucide-react"');
  });

  it("does nothing when there are no Cannot-find-name diagnostics", () => {
    const content = project(FILE, `export default function Page() { return null; }`);

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Type 'string' is not assignable to type 'number'." },
    ]);

    expect(result.code).toBe(content);
    expect(result.addedImports).toEqual([]);
  });

  it("does not self-import cn into lib/utils.ts where cn is declared (#201)", () => {
    // `cn` resolves to `@/lib/utils`. When the diagnosed file IS lib/utils.ts and
    // it declares `cn`, adding `import { cn } from "@/lib/utils"` would be a
    // self-/circular-import. The fixer must leave the file byte-identical.
    const utilsFile = "lib/utils.ts";
    const content = project(
      utilsFile,
      `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: utilsFile, message: "Cannot find name 'cn'." },
    ]);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
    expect(result.code).not.toContain('import { cn } from "@/lib/utils"');
  });

  it("still adds the cn import for a normal file that uses but does not declare it", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <div className={cn("p-4", "text-center")} />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'cn'." },
    ]);

    expect(result.code).toContain('import { cn } from "@/lib/utils"');
    expect(result.addedImports).toEqual([
      { file: FILE, name: "cn", module: "@/lib/utils" },
    ]);
  });

  it("resolves a shadcn component to its @/components/ui subpath (prod TS2304)", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <Button>Click</Button>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Button'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Button", module: "@/components/ui/button" },
    ]);
    expect(result.code).toContain('import { Button } from "@/components/ui/button"');
  });

  it("merges multiple shadcn symbols from the same module into one import", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hi</CardTitle>
      </CardHeader>
      <CardContent>Body</CardContent>
    </Card>
  );
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Card'." },
      { file: FILE, message: "Cannot find name 'CardHeader'." },
      { file: FILE, message: "Cannot find name 'CardTitle'." },
      { file: FILE, message: "Cannot find name 'CardContent'." },
    ]);

    expect(result.code).toContain(
      'import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"',
    );
    expect(result.code.match(/from "@\/components\/ui\/card"/g)).toHaveLength(1);
  });

  it("resolves Clerk server helpers to @clerk/nextjs/server (prod TS2304/2552)", () => {
    const middleware = "middleware.ts";
    const content = project(
      middleware,
      `const isProtected = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: middleware, message: "Cannot find name 'clerkMiddleware'." },
      {
        file: middleware,
        message: "Cannot find name 'createRouteMatcher'. Did you mean 'createRouteMatcher'?",
      },
    ]);

    expect(result.code).toContain('from "@clerk/nextjs/server"');
    expect(result.code).toContain("clerkMiddleware");
    expect(result.code).toContain("createRouteMatcher");
    expect(result.code.match(/from "@clerk\/nextjs\/server"/g)).toHaveLength(1);
  });

  it("resolves Stripe as a default import in an API route (prod TS2552)", () => {
    const routeFile = "app/api/checkout-session/route.ts";
    const content = project(
      routeFile,
      `export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return Response.json({ ok: true });
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: routeFile, message: "Cannot find name 'Stripe'. Did you mean 'stripe'?" },
    ]);

    expect(result.addedImports).toEqual([
      { file: routeFile, name: "Stripe", module: "stripe" },
    ]);
    expect(result.code).toContain('import Stripe from "stripe"');
  });

  it("does NOT import Stripe into a non-server file (left for the LLM)", () => {
    // `Stripe` only resolves in API route / route handler files. A client page
    // referencing `Stripe` is almost certainly wrong in another way — don't pull
    // the Node SDK into the browser bundle.
    const content = project(
      FILE,
      `export default function Page() {
  const s = new Stripe("");
  return <div>{String(s)}</div>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Stripe'." },
    ]);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
  });

  it("leaves a shadcn∩lucide ambiguous name (Calendar) for the LLM", () => {
    // `Calendar` is both a shadcn component AND a lucide icon — the correct
    // module is genuinely ambiguous, so the deterministic fixer must do nothing.
    const content = project(
      FILE,
      `export default function Page() {
  return <Calendar />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Calendar'." },
    ]);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
  });
});
