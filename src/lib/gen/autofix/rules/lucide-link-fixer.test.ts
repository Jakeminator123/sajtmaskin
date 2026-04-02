import { describe, expect, it } from "vitest";
import { fixLucideLinkMisuse } from "./lucide-link-fixer";

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
