import { describe, expect, it } from "vitest";
import { fixGlobalShadowingImports } from "./global-shadow-import-fixer";

describe("global-shadow-import-fixer (name-guard)", () => {
  it("removes an unused local import that shadows the global Date (the aas bug)", () => {
    const code = `"use client";

import { useEffect, useState } from "react";
import Date from "@/components/date";

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);
  return <time>{now ? now.toISOString() : "--"}</time>;
}
`;
    const result = fixGlobalShadowingImports(code, "components/clock.tsx");
    expect(result.fixed).toBe(true);
    expect(result.removed).toContain("Date");
    // The shadowing import is gone…
    expect(result.code).not.toContain('from "@/components/date"');
    // …but the global usages survive.
    expect(result.code).toContain("new Date()");
    expect(result.code).toContain('"use client"');
    expect(result.code).toContain('from "react"');
  });

  it("removes a value-only shadowing import (Map used via new Map())", () => {
    const code = `import Map from "@/components/map";

export function makeIndex() {
  const m = new Map<string, number>();
  m.set("a", 1);
  return m;
}
`;
    const result = fixGlobalShadowingImports(code, "lib/index.ts");
    expect(result.fixed).toBe(true);
    expect(result.removed).toContain("Map");
    expect(result.code).not.toContain('from "@/components/map"');
    expect(result.code).toContain("new Map<string, number>()");
  });

  it("aliases the import + JSX tags when the binding is rendered as a component", () => {
    const code = `import Date from "@/components/date";

export function Row() {
  const stamp = new Date();
  return <Date value={stamp} label="Skapad" />;
}
`;
    const result = fixGlobalShadowingImports(code, "components/row.tsx");
    expect(result.fixed).toBe(true);
    expect(result.renamed).toEqual([{ from: "Date", to: "DateView" }]);
    // Import + JSX renamed…
    expect(result.code).toContain('import DateView from "@/components/date"');
    expect(result.code).toContain("<DateView");
    // …global `new Date()` left intact.
    expect(result.code).toContain("new Date()");
  });

  it("does NOT touch a package import that intentionally reuses a global name", () => {
    const code = `import Image from "next/image";

export function Avatar() {
  return <Image src="/a.png" alt="a" width={40} height={40} />;
}
`;
    const result = fixGlobalShadowingImports(code, "components/avatar.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("leaves a non-colliding local import alone", () => {
    const code = `import Hero from "@/components/hero";

export default function Page() {
  return <Hero />;
}
`;
    const result = fixGlobalShadowingImports(code, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("drops a shadowing binding from a named import, keeping the rest", () => {
    const code = `import { Map, Sidebar } from "@/components/widgets";

export function Panel() {
  const cache = new Map<string, string>();
  cache.set("x", "y");
  return <Sidebar entries={cache} />;
}
`;
    const result = fixGlobalShadowingImports(code, "components/panel.tsx");
    expect(result.fixed).toBe(true);
    expect(result.removed).toContain("Map");
    expect(result.code).toContain("Sidebar");
    expect(result.code).toContain("new Map<string, string>()");
    expect(result.code).toContain("<Sidebar");
  });
});
