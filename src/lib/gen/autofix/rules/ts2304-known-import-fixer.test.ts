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

  it("adds a sonner import for a `toast` call flagged by TS2304 (top recurring prod fault)", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <button onClick={() => toast.success("Saved")}>Save</button>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'toast'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "toast", module: "sonner" },
    ]);
    expect(result.code).toContain('import { toast } from "sonner"');
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

  const CLERK_MIDDLEWARE = "middleware.ts";
  const clerkMiddlewareContent = project(
    CLERK_MIDDLEWARE,
    `const isProtected = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});`,
  );
  const clerkDiagnostics = [
    { file: CLERK_MIDDLEWARE, message: "Cannot find name 'clerkMiddleware'." },
    {
      file: CLERK_MIDDLEWARE,
      message: "Cannot find name 'createRouteMatcher'. Did you mean 'createRouteMatcher'?",
    },
  ];

  it("resolves Clerk server helpers to @clerk/nextjs/server in F3 (allowTier3)", () => {
    const result = fixKnownTs2304Imports(clerkMiddlewareContent, clerkDiagnostics, {
      allowTier3: true,
    });

    expect(result.code).toContain('from "@clerk/nextjs/server"');
    expect(result.code).toContain("clerkMiddleware");
    expect(result.code).toContain("createRouteMatcher");
    expect(result.code.match(/from "@clerk\/nextjs\/server"/g)).toHaveLength(1);
  });

  it("leaves Clerk server helpers residual in F2 (default — never undo the F2 SDK guard)", () => {
    const result = fixKnownTs2304Imports(clerkMiddlewareContent, clerkDiagnostics);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(clerkMiddlewareContent);
  });

  it("never injects @clerk/nextjs/server into a 'use client' file (BB#291)", () => {
    // A TS2304 on `auth` in a CLIENT component must stay residual for the LLM
    // fixer — the server entrypoint is illegal in the client bundle and would
    // trade one build error for another.
    const clientFile = "components/user-badge.tsx";
    const content = project(
      clientFile,
      `"use client";

export function UserBadge() {
  const session = auth();
  return <span>{String(session)}</span>;
}`,
    );

    const result = fixKnownTs2304Imports(
      content,
      [{ file: clientFile, message: "Cannot find name 'auth'." }],
      { allowTier3: true },
    );

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
    expect(result.code).not.toContain("@clerk/nextjs/server");
  });

  it("detects a 'use client' directive with trailing comment or after a block comment (Codex P2)", () => {
    // `"use client"; // hooks` and a directive preceded by a multi-line block
    // comment are valid Next.js client files — the server-only skip must
    // still apply to them.
    const trailing = "components/trailing-comment.tsx";
    const trailingContent = project(
      trailing,
      `"use client"; // needs hooks

export function A() {
  const session = auth();
  return <span>{String(session)}</span>;
}`,
    );
    const blockComment = "components/block-comment.tsx";
    const blockCommentContent = project(
      blockComment,
      `/*
Header comment that does not
prefix every line with a star
*/
"use client";

export function B() {
  const session = auth();
  return <span>{String(session)}</span>;
}`,
    );

    for (const [file, content] of [
      [trailing, trailingContent],
      [blockComment, blockCommentContent],
    ] as const) {
      const result = fixKnownTs2304Imports(
        content,
        [{ file, message: "Cannot find name 'auth'." }],
        { allowTier3: true },
      );
      expect(result.addedImports).toEqual([]);
      expect(result.code).toBe(content);
    }
  });

  it("still resolves Clerk server helpers in a server component without a directive (BB#291)", () => {
    const serverPage = "app/dashboard/page.tsx";
    const content = project(
      serverPage,
      `export default async function DashboardPage() {
  const { userId } = await auth();
  return <main>{userId}</main>;
}`,
    );

    const result = fixKnownTs2304Imports(
      content,
      [{ file: serverPage, message: "Cannot find name 'auth'." }],
      { allowTier3: true },
    );

    expect(result.addedImports).toEqual([
      { file: serverPage, name: "auth", module: "@clerk/nextjs/server" },
    ]);
  });

  const STRIPE_ROUTE = "app/api/checkout-session/route.ts";
  const stripeRouteContent = project(
    STRIPE_ROUTE,
    `export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return Response.json({ ok: true });
}`,
  );
  const stripeDiagnostics = [
    { file: STRIPE_ROUTE, message: "Cannot find name 'Stripe'. Did you mean 'stripe'?" },
  ];

  it("resolves Stripe as a default import in an API route in F3 (allowTier3)", () => {
    const result = fixKnownTs2304Imports(stripeRouteContent, stripeDiagnostics, {
      allowTier3: true,
    });

    expect(result.addedImports).toEqual([
      { file: STRIPE_ROUTE, name: "Stripe", module: "stripe" },
    ]);
    expect(result.code).toContain('import Stripe from "stripe"');
  });

  it("leaves Stripe residual in F2 (default — never undo the F2 SDK guard)", () => {
    const result = fixKnownTs2304Imports(stripeRouteContent, stripeDiagnostics);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(stripeRouteContent);
  });

  it("does NOT import Stripe into a non-server file even in F3 (path-gate)", () => {
    // `Stripe` only resolves in API route / route handler files. A client page
    // referencing `Stripe` is almost certainly wrong in another way — don't pull
    // the Node SDK into the browser bundle. allowTier3 isolates the path-gate.
    const content = project(
      FILE,
      `export default function Page() {
  const s = new Stripe("");
  return <div>{String(s)}</div>;
}`,
    );

    const result = fixKnownTs2304Imports(
      content,
      [{ file: FILE, message: "Cannot find name 'Stripe'." }],
      { allowTier3: true },
    );

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
  });

  const RESEND_ROUTE = "app/api/contact/route.ts";
  const resendRouteContent = project(
    RESEND_ROUTE,
    `export async function POST() {
  const resend = new Resend(process.env.RESEND_API_KEY!);
  return Response.json({ ok: true });
}`,
  );
  const resendDiagnostics = [
    { file: RESEND_ROUTE, message: "Cannot find name 'Resend'. Did you mean 'resend'?" },
  ];

  it("resolves Resend as a NAMED import in an API route in F3 (allowTier3) — prod cc10e7de v8", () => {
    const result = fixKnownTs2304Imports(resendRouteContent, resendDiagnostics, {
      allowTier3: true,
    });

    expect(result.addedImports).toEqual([
      { file: RESEND_ROUTE, name: "Resend", module: "resend" },
    ]);
    expect(result.code).toContain('import { Resend } from "resend"');
  });

  it("leaves Resend residual in F2 (tier-3 gate — never undo the F2 SDK guard)", () => {
    const result = fixKnownTs2304Imports(resendRouteContent, resendDiagnostics);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(resendRouteContent);
  });

  it("does NOT import Resend into a non-server file even in F3 (path-gate)", () => {
    const content = project(
      FILE,
      `export default function Page() {
  const r = new Resend("");
  return <div>{String(r)}</div>;
}`,
    );

    const result = fixKnownTs2304Imports(
      content,
      [{ file: FILE, message: "Cannot find name 'Resend'." }],
      { allowTier3: true },
    );

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
  });

  it("never injects resend into a 'use client' route-adjacent file even in F3", () => {
    const clientFile = "app/api/contact/route.ts";
    const content = project(
      clientFile,
      `"use client";

export function ContactWidget() {
  const r = new Resend("");
  return <div>{String(r)}</div>;
}`,
    );

    const result = fixKnownTs2304Imports(
      content,
      [{ file: clientFile, message: "Cannot find name 'Resend'." }],
      { allowTier3: true },
    );

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
  });

  it("resolves LucideIcon as an `import type` (type-named kind)", () => {
    const content = project(
      "components/icon-list.tsx",
      `const features: { icon: LucideIcon; label: string }[] = [];

export function IconList() {
  return <div>{features.length}</div>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: "components/icon-list.tsx", message: "Cannot find name 'LucideIcon'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: "components/icon-list.tsx", name: "LucideIcon", module: "lucide-react" },
    ]);
    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
    // Never a value import — lucide-react has no runtime LucideIcon export.
    expect(result.code).not.toMatch(/import\s+\{\s*LucideIcon/);
  });

  it("merges LucideIcon into an existing lucide type-only import line", () => {
    const content = project(
      "components/icon-list.tsx",
      `import type { LucideProps } from "lucide-react";

const features: { icon: LucideIcon; props: LucideProps }[] = [];

export function IconList() {
  return <div>{features.length}</div>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: "components/icon-list.tsx", message: "Cannot find name 'LucideIcon'." },
    ]);

    expect(result.code).toContain(
      'import type { LucideProps, LucideIcon } from "lucide-react"',
    );
    expect(result.code.match(/from "lucide-react"/g)).toHaveLength(1);
  });

  it("does NOT merge LucideIcon into a lucide VALUE import line", () => {
    const content = project(
      "components/icon-list.tsx",
      `import { Flame } from "lucide-react";

const features: { icon: LucideIcon }[] = [{ icon: Flame }];

export function IconList() {
  return <Flame />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: "components/icon-list.tsx", message: "Cannot find name 'LucideIcon'." },
    ]);

    expect(result.code).toContain('import { Flame } from "lucide-react"');
    expect(result.code).toContain('import type { LucideIcon } from "lucide-react"');
  });

  it("leaves a shadcn∩lucide ambiguous name (Calendar) for the LLM", () => {
    // `Calendar` is both a shadcn component AND a lucide icon. A bare,
    // prop-less `<Calendar />` gives no usage signal, so the deterministic
    // fixer must do nothing.
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

  // M#badge1: shadcn∩lucide collisions are now resolved when the file's usage
  // is unambiguous, instead of always deferring to the LLM loop. `<Badge
  // variant=…>text</Badge>` can only be the shadcn component (a glyph renders
  // children inside an <svg> — invalid HTML → hydration mismatch; prod chat
  // 1c34592c v3).
  it("resolves a shadcn∩lucide collision to shadcn when used with variant/children", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <Badge variant="secondary">Vårt erbjudande</Badge>;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Badge'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Badge", module: "@/components/ui/badge" },
    ]);
    expect(result.code).toContain('import { Badge } from "@/components/ui/badge"');
  });

  it("resolves a shadcn∩lucide collision to lucide for icon-ish self-closing usage", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return <Badge className="h-4 w-4" />;
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Badge'." },
    ]);

    expect(result.addedImports).toEqual([
      { file: FILE, name: "Badge", module: "lucide-react" },
    ]);
    expect(result.code).toContain('import { Badge } from "lucide-react"');
  });

  // Codex P2 (PR #356): mixed shadcn + icon-shaped usage in the same file —
  // one import cannot satisfy both, so the deterministic fixer must defer.
  it("leaves a mixed shadcn/icon collision usage for the LLM", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return (
    <div>
      <Badge variant="secondary">Nyhet</Badge>
      <Badge className="h-4 w-4" />
    </div>
  );
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Badge'." },
    ]);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
  });

  // Codex P2 (PR #356): a bare self-closing usage anywhere keeps the whole
  // file ambiguous — the bare `<Calendar />` may be the shadcn calendar.
  it("keeps a collision ambiguous when icon-ish and bare usages are mixed", () => {
    const content = project(
      FILE,
      `export default function Page() {
  return (
    <div>
      <Calendar className="h-4 w-4" />
      <Calendar />
    </div>
  );
}`,
    );

    const result = fixKnownTs2304Imports(content, [
      { file: FILE, message: "Cannot find name 'Calendar'." },
    ]);

    expect(result.addedImports).toEqual([]);
    expect(result.code).toBe(content);
  });
});
