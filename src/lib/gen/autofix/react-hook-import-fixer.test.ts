import { describe, expect, it } from "vitest";
import { fixReactHookImports } from "./react-hook-import-fixer";

describe("fixReactHookImports", () => {
  it("adds useState import when called but not imported", () => {
    const code = `"use client";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toEqual(["useState"]);
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
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toEqual(["useState"]);
    expect(result.code).toContain("useEffect");
    expect(result.code).toContain("useState");
    expect(result.code).toMatch(/import \{.*useState.*\} from "react"/);
  });

  it("merges into a default-plus-named react import", () => {
    const code = `import React, { useEffect } from "react";

export default function Timer() {
  const [t, setT] = useState(0);
  useEffect(() => {}, []);
  return <span>{t}</span>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toEqual(["useState"]);
    expect(result.code).toContain('import React, { useEffect, useState } from "react";');
  });

  it("adds multiple missing hooks at once", () => {
    const code = `const ref = useRef(null);
const [v, setV] = useState(0);
const cb = useCallback(() => {}, []);
`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toContain("useRef");
    expect(result.addedHooks).toContain("useState");
    expect(result.addedHooks).toContain("useCallback");
    expect(result.code).toMatch(/import \{.*useCallback.*useRef.*useState.*\} from "react"/);
  });

  it("does nothing when all hooks are already imported", () => {
    const code = `import { useState, useEffect } from "react";
const [v, setV] = useState(0);
useEffect(() => {}, []);
`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(false);
    expect(result.addedHooks).toEqual([]);
    expect(result.code).toBe(code);
  });

  it("does nothing when no React hooks are used", () => {
    const code = `export default function Static() {
  return <div>Hello</div>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(false);
  });

  it("ignores non-React hooks like useRouter", () => {
    const code = `const router = useRouter();
const params = usePathname();
`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(false);
  });

  it("ignores custom hooks like useFoo", () => {
    const code = `const data = useFetch("/api/data");
const theme = useCustomTheme();
`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(false);
  });

  it("places import after use client directive when no existing react import", () => {
    const code = `"use client";

const [open, setOpen] = useState(false);
`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { useState } from "react"');
    const importIdx = result.code.indexOf('import { useState }');
    const directiveEnd = result.code.indexOf('"use client";') + '"use client";'.length;
    expect(importIdx).toBeGreaterThan(directiveEnd);
  });

  it("places import at top when no directive exists", () => {
    const code = `const [v, setV] = useState(0);
`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.code.startsWith('import { useState } from "react"')).toBe(true);
  });

  it("adds a value import when only a type-only react import exists", () => {
    const code = `import type { ReactNode } from "react";

export default function Counter(): ReactNode {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import type { ReactNode } from "react";');
    expect(result.code).toContain('import { useState } from "react";');
  });
});
