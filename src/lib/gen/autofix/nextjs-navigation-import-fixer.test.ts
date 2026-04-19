import { describe, expect, it } from "vitest";
import { fixNextNavigationImports } from "./nextjs-navigation-import-fixer";

describe("fixNextNavigationImports", () => {
  it("adds usePathname import when called from a client component without it", () => {
    const code = `"use client";

import Link from "next/link";

export function FloatingCta() {
  const pathname = usePathname();
  if (pathname === "/kontakt") return null;
  return <Link href="/kontakt">CTA</Link>;
}
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedSymbols).toEqual(["usePathname"]);
    expect(result.code).toContain('import { usePathname } from "next/navigation"');
    expect(result.code.startsWith('"use client"')).toBe(true);
  });

  it("merges into an existing next/navigation import block", () => {
    const code = `"use client";
import { useRouter } from "next/navigation";

export function Foo() {
  const router = useRouter();
  const pathname = usePathname();
  return null;
}
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedSymbols).toEqual(["usePathname"]);
    expect(result.code).toMatch(
      /import \{ useRouter, usePathname \} from "next\/navigation"/,
    );
  });

  it("adds multiple missing symbols at once", () => {
    const code = `"use client";

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  return null;
}
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedSymbols).toContain("useRouter");
    expect(result.addedSymbols).toContain("useParams");
    expect(result.addedSymbols).toContain("useSearchParams");
    expect(result.code).toMatch(
      /import \{ useParams, useRouter, useSearchParams \} from "next\/navigation"/,
    );
  });

  it("does not duplicate already-imported symbols", () => {
    const code = `"use client";
import { usePathname } from "next/navigation";
const pathname = usePathname();
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(false);
    expect(result.addedSymbols).toEqual([]);
  });

  it("ignores function calls that are not next/navigation symbols", () => {
    const code = `const x = useState(0);
const y = myCustomThing();
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(false);
  });

  it("places import at top when no use client directive exists (server component using redirect)", () => {
    const code = `export default function Page() {
  redirect("/login");
}
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.code.startsWith('import { redirect } from "next/navigation"')).toBe(
      true,
    );
  });

  it("adds value import when only a type-only navigation import exists", () => {
    const code = `import type { ReadonlyURLSearchParams } from "next/navigation";

export function Foo() {
  const search = useSearchParams();
  return search?.get("q");
}
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import type { ReadonlyURLSearchParams } from "next/navigation";');
    expect(result.code).toContain('import { useSearchParams } from "next/navigation";');
  });

  it("handles notFound() called bare in a server component", () => {
    const code = `export default async function Page({ params }: { params: { id: string } }) {
  if (!params.id) notFound();
  return <div>{params.id}</div>;
}
`;
    const result = fixNextNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedSymbols).toEqual(["notFound"]);
  });
});
