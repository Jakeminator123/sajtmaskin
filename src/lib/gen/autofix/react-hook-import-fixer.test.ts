import { describe, it, expect } from "vitest";
import {
  fixReactHookImports,
  fixDomGlobalShadowing,
} from "./react-hook-import-fixer";

describe("fixReactHookImports", () => {
  it("adds missing useState import", () => {
    const code = `"use client";

import React from "react";

export default function Foo() {
  const [x, setX] = useState("");
  return <div>{x}</div>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toContain("useState");
    expect(result.code).toContain('import React, { useState } from "react"');
  });

  it("merges into existing named import", () => {
    const code = `import { useEffect } from "react";

export default function Foo() {
  const [x, setX] = useState("");
  useEffect(() => {}, []);
  return <div>{x}</div>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toContain("useState");
    expect(result.code).toMatch(/import\s*\{[^}]*useEffect[^}]*useState[^}]*\}\s*from\s*["']react["']/);
  });

  it("adds new named import when no react import exists", () => {
    const code = `"use client";

export default function Foo() {
  const [x, setX] = useState("");
  const ref = useRef(null);
  return <div ref={ref}>{x}</div>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toContain("useState");
    expect(result.addedHooks).toContain("useRef");
    expect(result.code).toContain('import { useRef, useState } from "react"');
  });

  it("does nothing when all hooks are already imported", () => {
    const code = `import { useState, useEffect } from "react";

export default function Foo() {
  const [x, setX] = useState("");
  useEffect(() => {}, []);
  return <div>{x}</div>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(false);
    expect(result.addedHooks).toEqual([]);
  });

  it("does nothing when no hooks are used", () => {
    const code = `export default function Foo() {
  return <div>hello</div>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(false);
  });

  it("handles React.useState correctly (via default import)", () => {
    const code = `import React from "react";

export default function Foo() {
  const [x, setX] = React.useState("");
  const y = useMemo(() => x.length, [x]);
  return <div>{y}</div>;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    expect(result.addedHooks).toContain("useMemo");
    expect(result.addedHooks).not.toContain("useState");
  });

  it("handles multiple missing hooks in a file with use client", () => {
    const code = `"use client";

export default function Form() {
  const [name, setName] = useState("");
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {}, []);
  const memo = useMemo(() => name, [name]);
  const cb = useCallback(() => {}, []);
  return <input />;
}`;
    const result = fixReactHookImports(code);
    expect(result.fixed).toBe(true);
    for (const hook of ["useState", "useRef", "useId", "useEffect", "useMemo", "useCallback"]) {
      expect(result.addedHooks).toContain(hook);
    }
  });
});

describe("fixDomGlobalShadowing", () => {
  it("removes local import that shadows HTMLFormElement", () => {
    const code = `import HTMLFormElement from "@/components/html-form-element";

export default function Foo() {
  return <HTMLFormElement />;
}`;
    const result = fixDomGlobalShadowing(code);
    expect(result.fixed).toBe(true);
    expect(result.removedImports).toContain("HTMLFormElement");
    expect(result.code).toContain("REMOVED: shadowed DOM global");
  });

  it("does nothing for non-shadowing imports", () => {
    const code = `import MyComponent from "@/components/my-component";

export default function Foo() {
  return <MyComponent />;
}`;
    const result = fixDomGlobalShadowing(code);
    expect(result.fixed).toBe(false);
  });
});
