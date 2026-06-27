import { describe, expect, it } from "vitest";
import { fixReactAndNavigationImports } from "./react-import-consolidated";

describe("fixReactAndNavigationImports — default React", () => {
  it("adds `import React` when a bare `React.` reference is used", () => {
    const code = `"use client";

export default function App() {
  const ref = React.createRef();
  return <span>{ref.current ? "x" : "y"}</span>;
}
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedReactDefault).toBe(true);
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import React from "react";');
  });

  it("places React default import after `use client`", () => {
    const code = `"use client";

const node = React.createElement("div");
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedReactDefault).toBe(true);
    const reactIdx = result.code.indexOf('import React from "react"');
    const directiveEnd = result.code.indexOf('"use client";') + '"use client";'.length;
    expect(reactIdx).toBeGreaterThan(directiveEnd);
  });

  it("leaves existing `import React` untouched", () => {
    const code = `import React from "react";
const x = React.createElement("div");
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedReactDefault).toBe(false);
    expect(result.fixed).toBe(false);
  });

  it("leaves `import * as React` untouched", () => {
    const code = `import * as React from "react";
const x = React.createElement("div");
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedReactDefault).toBe(false);
  });
});

describe("fixReactAndNavigationImports — React hooks", () => {
  it("adds useState when called but not imported", () => {
    const code = `"use client";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const result = fixReactAndNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedReactHooks).toEqual(["useState"]);
    expect(result.code).toContain('import { useState } from "react"');
    expect(result.code.startsWith('"use client"')).toBe(true);
  });

  it("merges into existing named react import", () => {
    const code = `"use client";
import { useEffect } from "react";

export default function Timer() {
  const [t, setT] = useState(0);
  useEffect(() => {}, []);
  return <span>{t}</span>;
}`;
    const result = fixReactAndNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedReactHooks).toEqual(["useState"]);
    expect(result.code).toMatch(/import \{.*useState.*\} from "react"/);
  });

  it("merges into a default-plus-named react import", () => {
    const code = `import React, { useEffect } from "react";

export default function Timer() {
  const [t, setT] = useState(0);
  useEffect(() => {}, []);
  return <span>{t}</span>;
}`;
    const result = fixReactAndNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedReactHooks).toEqual(["useState"]);
    expect(result.code).toContain('import React, { useEffect, useState } from "react";');
  });

  it("adds multiple missing hooks at once", () => {
    const code = `const ref = useRef(null);
const [v, setV] = useState(0);
const cb = useCallback(() => {}, []);
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedReactHooks).toContain("useRef");
    expect(result.addedReactHooks).toContain("useState");
    expect(result.addedReactHooks).toContain("useCallback");
    expect(result.code).toMatch(/import \{.*useCallback.*useRef.*useState.*\} from "react"/);
  });

  it("does nothing when all hooks are already imported", () => {
    const code = `import { useState, useEffect } from "react";
const [v, setV] = useState(0);
useEffect(() => {}, []);
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.fixed).toBe(false);
    expect(result.addedReactHooks).toEqual([]);
  });

  it("ignores custom hooks like useFoo", () => {
    const code = `const data = useFetch("/api/data");
const theme = useCustomTheme();
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedReactHooks).toEqual([]);
  });

  it("adds a value import when only a type-only react import exists", () => {
    const code = `import type { ReactNode } from "react";

export default function Counter(): ReactNode {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedReactHooks).toEqual(["useState"]);
    expect(result.code).toContain('import type { ReactNode } from "react";');
    expect(result.code).toContain('import { useState } from "react";');
  });
});

describe("fixReactAndNavigationImports — next/navigation", () => {
  it("adds usePathname when called from a client component without it", () => {
    const code = `"use client";

import Link from "next/link";

export function FloatingCta() {
  const pathname = usePathname();
  if (pathname === "/kontakt") return null;
  return <Link href="/kontakt">CTA</Link>;
}
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedNavigationSymbols).toEqual(["usePathname"]);
    expect(result.code).toContain('import { usePathname } from "next/navigation"');
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
    const result = fixReactAndNavigationImports(code);
    expect(result.addedNavigationSymbols).toEqual(["usePathname"]);
    expect(result.code).toMatch(
      /import \{ useRouter, usePathname \} from "next\/navigation"/,
    );
  });

  it("adds multiple navigation symbols at once", () => {
    const code = `"use client";

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  return null;
}
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedNavigationSymbols).toContain("useRouter");
    expect(result.addedNavigationSymbols).toContain("useParams");
    expect(result.addedNavigationSymbols).toContain("useSearchParams");
    expect(result.code).toMatch(
      /import \{ useParams, useRouter, useSearchParams \} from "next\/navigation"/,
    );
  });

  it("handles notFound() bare in a server component", () => {
    const code = `export default async function Page({ params }: { params: { id: string } }) {
  if (!params.id) notFound();
  return <div>{params.id}</div>;
}
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedNavigationSymbols).toEqual(["notFound"]);
  });

  it("adds value import when only a type-only navigation import exists", () => {
    const code = `import type { ReadonlyURLSearchParams } from "next/navigation";

export function Foo() {
  const search = useSearchParams();
  return search?.get("q");
}
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.addedNavigationSymbols).toEqual(["useSearchParams"]);
    expect(result.code).toContain('import type { ReadonlyURLSearchParams } from "next/navigation";');
    expect(result.code).toContain('import { useSearchParams } from "next/navigation";');
  });
});

describe("fixReactAndNavigationImports — cross-flavor interactions", () => {
  it("fixes react hook AND navigation symbol in one pass without shadowing each other", () => {
    const code = `"use client";

export default function Thing() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return <button onClick={() => { setOpen(true); router.push("/x"); }}>hit</button>;
}
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedReactHooks).toEqual(["useState"]);
    expect(result.addedNavigationSymbols).toEqual(["useRouter"]);
    expect(result.code).toContain('import { useState } from "react"');
    expect(result.code).toContain('import { useRouter } from "next/navigation"');
  });

  it("leaves code untouched when nothing is missing", () => {
    const code = `"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Thing() {
  const [x] = useState(0);
  const r = useRouter();
  return <span>{x}{r.pathname}</span>;
}
`;
    const result = fixReactAndNavigationImports(code);
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("is idempotent — second run makes no further changes", () => {
    const code = `"use client";

export default function Thing() {
  const [x, setX] = useState(0);
  const path = usePathname();
  const ref = React.createRef();
  return <span>{x}{path}{ref.current}</span>;
}
`;
    const first = fixReactAndNavigationImports(code);
    expect(first.fixed).toBe(true);
    const second = fixReactAndNavigationImports(first.code);
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });
});

describe("fixReactAndNavigationImports — duplicate react import consolidation", () => {
  const reactImportLines = (code: string): string =>
    code
      .split("\n")
      .filter((line) => /from\s+["']react["']/.test(line))
      .join("\n");

  const countIn = (haystack: string, name: string): number =>
    (haystack.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;

  it("merges a type-only + two value react imports without duplicate identifiers (three-canvas-shell TS2300)", () => {
    const code = [
      '"use client";',
      'import type { ReactNode } from "react";',
      'import { useEffect, useState } from "react";',
      'import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useState } from "react";',
      "",
      "export function Shell({ children }: { children: ReactNode }) {",
      "  useEffect(() => {}, []);",
      "  const [v] = useState(0);",
      "  return <Suspense>{children}{v}</Suspense>;",
      "}",
    ].join("\n");

    const result = fixReactAndNavigationImports(code);

    expect(result.fixed).toBe(true);
    expect(result.consolidatedReactBindings).toEqual(["ReactNode", "useEffect", "useState"]);

    // No duplicate identifiers: each binding appears exactly once across the
    // react imports.
    const imports = reactImportLines(result.code);
    expect(countIn(imports, "useEffect")).toBe(1);
    expect(countIn(imports, "useState")).toBe(1);
    expect(countIn(imports, "ReactNode")).toBe(1);
    expect(countIn(imports, "ErrorInfo")).toBe(1);
    expect(countIn(imports, "Component")).toBe(1);
    expect(countIn(imports, "Suspense")).toBe(1);

    // ReactNode/ErrorInfo stay type-only; the value import carries the runtime
    // bindings.
    expect(result.code).toContain('import type { ReactNode, ErrorInfo } from "react";');
    expect(result.code).toContain('import { useEffect, useState, Component, Suspense } from "react";');
    // The "use client" directive is preserved at the top.
    expect(result.code.startsWith('"use client";')).toBe(true);
  });

  it("merges duplicate default + named react imports into one statement", () => {
    const code = [
      'import React from "react";',
      'import React, { useMemo, useMemo as useMemoAlias } from "react";',
    ].join("\n");

    const result = fixReactAndNavigationImports(code);

    expect(result.fixed).toBe(true);
    expect(result.consolidatedReactBindings).toContain("React");
    // Only one react import statement survives, with a single React default.
    expect(countIn(reactImportLines(result.code), "React")).toBe(1);
    expect(reactImportLines(result.code).split("\n").length).toBe(1);
  });

  it("drops a named specifier duplicating the default binding (avoids invalid `import React, { React }`)", () => {
    const code = [
      'import React from "react";',
      'import { React, useState } from "react";',
      "const el = React.createElement('div');",
      "const [v] = useState(0);",
    ].join("\n");

    const result = fixReactAndNavigationImports(code);

    expect(result.fixed).toBe(true);
    expect(result.consolidatedReactBindings).toContain("React");
    // React stays the default binding only — never re-listed as a named import.
    expect(countIn(reactImportLines(result.code), "React")).toBe(1);
    expect(result.code).toContain('import React, { useState } from "react";');
  });

  it("is idempotent — second consolidation run makes no further change", () => {
    const code = [
      'import type { ReactNode } from "react";',
      'import { useEffect, useState } from "react";',
      'import { Component, type ErrorInfo, type ReactNode, Suspense, useEffect, useState } from "react";',
    ].join("\n");

    const first = fixReactAndNavigationImports(code);
    expect(first.fixed).toBe(true);
    const second = fixReactAndNavigationImports(first.code);
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
    expect(second.consolidatedReactBindings).toEqual([]);
  });

  it("leaves two react imports with disjoint specifiers untouched", () => {
    const code = [
      'import React from "react";',
      'import { useState } from "react";',
      "const el = React.createElement('div');",
      "const [v] = useState(0);",
    ].join("\n");

    const result = fixReactAndNavigationImports(code);

    expect(result.consolidatedReactBindings).toEqual([]);
    expect(result.code).toContain('import React from "react";');
    expect(result.code).toContain('import { useState } from "react";');
  });
});
