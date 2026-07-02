import { describe, expect, it } from "vitest";
import {
  SHADCN_LUCIDE_COLLISION_NAMES,
  fixLucideImageMisuse,
  fixLucideLinkMisuse,
  fixLucideShadcnCollisionMisuse,
} from "./lucide-misuse-fixer";

describe("fixLucideLinkMisuse", () => {
  it("replaces lucide Link import with next/link when <Link href> is used", () => {
    const code = [
      'import { Link, ArrowRight } from "lucide-react";',
      "",
      "export default function Nav() {",
      '  return <Link href="/about">About</Link>;',
      "}",
    ].join("\n");

    const result = fixLucideLinkMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Link from "next/link"');
    expect(result.code).toContain('import { ArrowRight } from "lucide-react"');
    expect(result.code).not.toMatch(/import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*["']lucide-react/);
  });

  it("keeps lucide Link as LinkIcon when used as icon (no href)", () => {
    const code = [
      'import { Link } from "lucide-react";',
      "",
      "export default function Nav() {",
      "  return (",
      "    <>",
      '      <Link href="/about">About</Link>',
      '      <Link className="h-4 w-4" />',
      "    </>",
      "  );",
      "}",
    ].join("\n");

    const result = fixLucideLinkMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Link from "next/link"');
    expect(result.code).toContain("Link as LinkIcon");
    expect(result.code).toContain("<LinkIcon");
  });

  it("does nothing when Link from lucide-react has no href usage", () => {
    const code = [
      'import { Link } from "lucide-react";',
      "",
      "export default function Icon() {",
      '  return <Link className="h-4 w-4" />;',
      "}",
    ].join("\n");

    const result = fixLucideLinkMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("does nothing when there is no lucide Link import", () => {
    const code = [
      'import Link from "next/link";',
      'import { ArrowRight } from "lucide-react";',
      "",
      "export default function Nav() {",
      '  return <Link href="/about">About</Link>;',
      "}",
    ].join("\n");

    const result = fixLucideLinkMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("removes entire lucide import when Link is the only import", () => {
    const code = [
      'import { Link } from "lucide-react";',
      "",
      "export default function Nav() {",
      '  return <Link href="/about">About</Link>;',
      "}",
    ].join("\n");

    const result = fixLucideLinkMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Link from "next/link"');
    expect(result.code).not.toContain("lucide-react");
  });

  it("does not duplicate next/link import if already present", () => {
    const code = [
      'import Link from "next/link";',
      'import { Link, ArrowRight } from "lucide-react";',
      "",
      "export default function Nav() {",
      '  return <Link href="/about">About</Link>;',
      "}",
    ].join("\n");

    const result = fixLucideLinkMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    const linkImportCount = (result.code.match(/import Link from "next\/link"/g) || []).length;
    expect(linkImportCount).toBe(1);
  });
});

describe("fixLucideImageMisuse", () => {
  it("replaces lucide Image import with next/image when <Image src> is used", () => {
    const code = [
      'import { Image, Camera } from "lucide-react";',
      "",
      "export default function Hero() {",
      '  return <Image src="/hero.png" alt="Hero" width={800} height={400} />;',
      "}",
    ].join("\n");

    const result = fixLucideImageMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Image from "next/image"');
    expect(result.code).toContain('import { Camera } from "lucide-react"');
  });

  it("triggers on <Image fill /> usage too", () => {
    const code = [
      'import { Image } from "lucide-react";',
      "",
      "export default function Card() {",
      '  return <Image src="/x.png" fill />;',
      "}",
    ].join("\n");

    const result = fixLucideImageMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Image from "next/image"');
  });

  it("does nothing when Image from lucide-react is used as an icon (no src/fill)", () => {
    const code = [
      'import { Image } from "lucide-react";',
      "",
      "export default function Icon() {",
      '  return <Image className="h-4 w-4" />;',
      "}",
    ].join("\n");

    const result = fixLucideImageMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("does not duplicate next/image import if already present", () => {
    const code = [
      'import Image from "next/image";',
      'import { Image, Camera } from "lucide-react";',
      "",
      "export default function Hero() {",
      '  return <Image src="/x.png" alt="x" width={1} height={1} />;',
      "}",
    ].join("\n");

    const result = fixLucideImageMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    const importCount = (result.code.match(/import Image from "next\/image"/g) || []).length;
    expect(importCount).toBe(1);
  });

  it("removes entire lucide import when Image is the only import", () => {
    const code = [
      'import { Image } from "lucide-react";',
      "",
      "export default function Hero() {",
      '  return <Image src="/x.png" alt="x" width={1} height={1} />;',
      "}",
    ].join("\n");

    const result = fixLucideImageMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import Image from "next/image"');
    expect(result.code).not.toContain("lucide-react");
  });
});

// Prod chat 1c34592c v3: a follow-up rewrote `import { Badge } from
// "@/components/ui/badge"` to `import { Badge } from "lucide-react"`. Every
// validator accepted it (Badge IS a lucide glyph) but `<Badge>` then rendered
// as an <svg> whose <span>/text children are invalid HTML → hydration
// mismatch that regenerated the whole tree on the client.
describe("fixLucideShadcnCollisionMisuse", () => {
  it("derives the collision set from the canonical data (Badge included)", () => {
    expect(SHADCN_LUCIDE_COLLISION_NAMES).toContain("Badge");
    expect(SHADCN_LUCIDE_COLLISION_NAMES).toContain("Table");
  });

  it("rewrites lucide Badge to shadcn when used with children/variant (prod v3 shape)", () => {
    const code = [
      'import { BadgeCheck, Fish } from "lucide-react";',
      'import { Button } from "@/components/ui/button";',
      'import { Badge } from "lucide-react";',
      "",
      "export default function Page() {",
      "  return (",
      "    <div>",
      '      <Badge className="rounded-full">',
      '        <span className="h-2 w-2 rounded-full" />',
      "        Lokal fångst från Bohuslän",
      "      </Badge>",
      '      <Badge variant="secondary">Vårt erbjudande</Badge>',
      '      <BadgeCheck className="h-5 w-5" />',
      "    </div>",
      "  );",
      "}",
    ].join("\n");

    const result = fixLucideShadcnCollisionMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.fixedNames).toEqual(["Badge"]);
    expect(result.code).toContain('import { Badge } from "@/components/ui/badge"');
    expect(result.code).not.toMatch(
      /import\s*\{[^}]*\bBadge\b[^}]*\}\s*from\s*["']lucide-react/,
    );
    // Sibling lucide glyphs are untouched.
    expect(result.code).toContain('import { BadgeCheck, Fish } from "lucide-react"');
  });

  it("keeps icon-only usages as an aliased glyph when both usages exist", () => {
    const code = [
      'import { Badge } from "lucide-react";',
      "",
      "export default function Page() {",
      "  return (",
      "    <div>",
      '      <Badge variant="outline">Nyhet</Badge>',
      '      <Badge className="h-4 w-4" />',
      "    </div>",
      "  );",
      "}",
    ].join("\n");

    const result = fixLucideShadcnCollisionMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { Badge } from "@/components/ui/badge"');
    expect(result.code).toContain("Badge as BadgeIcon");
    expect(result.code).toContain('<BadgeIcon className="h-4 w-4" />');
    expect(result.code).toContain('<Badge variant="outline">Nyhet</Badge>');
  });

  it("does nothing for icon-only usage", () => {
    const code = [
      'import { Badge } from "lucide-react";',
      "",
      "export default function Icon() {",
      '  return <Badge className="h-4 w-4" />;',
      "}",
    ].join("\n");

    const result = fixLucideShadcnCollisionMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("does nothing when the name is not imported from lucide-react", () => {
    const code = [
      'import { Badge } from "@/components/ui/badge";',
      "",
      "export default function Page() {",
      '  return <Badge variant="secondary">OK</Badge>;',
      "}",
    ].join("\n");

    const result = fixLucideShadcnCollisionMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
  });

  it("merges into an existing shadcn import without duplicating", () => {
    const code = [
      'import { Badge } from "lucide-react";',
      'import { badgeVariants } from "@/components/ui/badge";',
      "",
      "export default function Page() {",
      '  return <Badge variant="secondary">OK</Badge>;',
      "}",
    ].join("\n");

    const result = fixLucideShadcnCollisionMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      'import { badgeVariants, Badge } from "@/components/ui/badge"',
    );
    const importCount = (result.code.match(/@\/components\/ui\/badge/g) || []).length;
    expect(importCount).toBe(1);
  });

  it("handles other collision names generically (Table with children)", () => {
    const code = [
      'import { Table } from "lucide-react";',
      "",
      "export default function Prices() {",
      "  return (",
      "    <Table>",
      "      <tbody />",
      "    </Table>",
      "  );",
      "}",
    ].join("\n");

    const result = fixLucideShadcnCollisionMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { Table } from "@/components/ui/table"');
    expect(result.code).not.toContain("lucide-react");
  });
});
