import { describe, expect, it } from "vitest";
import {
  detectNonDeterministicRenderInSource,
  runHydrationPreflightChecks,
} from "./hydration-preflight";

describe("detectNonDeterministicRenderInSource", () => {
  it("flags Math.random() in a useState initializer (the Masonry-grid template case)", () => {
    const src = `"use client"
import { useState } from "react"
export default function Page() {
  const [items] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      height: Math.floor(Math.random() * 400) + 100,
      color: ["#fff", "#000"][Math.floor(Math.random() * 2)],
    })),
  )
  return <div>{items.length}</div>
}`;
    const issues = detectNonDeterministicRenderInSource("app/page.tsx", src);
    expect(issues).toHaveLength(1);
    expect(issues[0].pattern).toBe("Math.random()");
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].category).toBe("non_blocking_quality_warning");
    expect(issues[0].line).toBeGreaterThan(0);
  });

  it("flags new Date() with no args and Date.now() in render", () => {
    const src = `export default function Clock() {
  const now = Date.now()
  return <time>{new Date().toISOString()} {now}</time>
}`;
    const issues = detectNonDeterministicRenderInSource("app/page.tsx", src);
    const patterns = issues.map((i) => i.pattern).sort();
    expect(patterns).toContain("Date.now()");
    expect(patterns).toContain("new Date()");
  });

  it("does NOT flag calls inside useEffect (client-only, post-hydration)", () => {
    const src = `"use client"
import { useEffect, useState } from "react"
export default function Page() {
  const [v, setV] = useState(0)
  useEffect(() => {
    setV(Math.random())
  }, [])
  return <div>{v}</div>
}`;
    expect(detectNonDeterministicRenderInSource("app/page.tsx", src)).toHaveLength(0);
  });

  it("does NOT flag new Date(arg) (deterministic)", () => {
    const src = `export default function P({ ts }: { ts: number }) {
  return <time>{new Date(ts).toISOString()}</time>
}`;
    expect(detectNonDeterministicRenderInSource("app/page.tsx", src)).toHaveLength(0);
  });

  it("does NOT flag tokens that only appear in strings or comments", () => {
    const src = `export default function P() {
  // uses Math.random() historically
  const label = "call Date.now() to get a timestamp"
  return <div>{label}</div>
}`;
    expect(detectNonDeterministicRenderInSource("app/page.tsx", src)).toHaveLength(0);
  });

  it("flags render-scope call even when another call is safely inside useEffect", () => {
    const src = `"use client"
import { useEffect } from "react"
export default function P() {
  useEffect(() => { console.log(Math.random()) }, [])
  const seed = Math.random()
  return <div style={{ opacity: seed }} />
}`;
    const issues = detectNonDeterministicRenderInSource("app/page.tsx", src);
    expect(issues).toHaveLength(1);
    expect(issues[0].pattern).toBe("Math.random()");
  });

  it("dedupes to one issue per pattern per file", () => {
    const src = `export default function P() {
  const a = Math.random(); const b = Math.random(); const c = Math.random()
  return <div>{a}{b}{c}</div>
}`;
    expect(detectNonDeterministicRenderInSource("app/page.tsx", src)).toHaveLength(1);
  });
});

describe("runHydrationPreflightChecks", () => {
  it("only scans tsx/jsx files", () => {
    const issues = runHydrationPreflightChecks([
      { path: "app/page.tsx", content: "export default () => <p>{Math.random()}</p>", language: "tsx" },
      { path: "lib/util.ts", content: "export const r = () => Math.random()", language: "ts" },
      { path: "data.json", content: '{"x": 1}', language: "json" },
    ]);
    expect(issues.map((i) => i.file)).toEqual(["app/page.tsx"]);
  });

  it("returns nothing for a clean project", () => {
    const issues = runHydrationPreflightChecks([
      { path: "app/page.tsx", content: "export default () => <p>hello</p>", language: "tsx" },
    ]);
    expect(issues).toHaveLength(0);
  });
});
