import { describe, expect, it } from "vitest";
import { fixLucideImageMisuse, fixLucideLinkMisuse } from "./lucide-misuse-fixer";

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
