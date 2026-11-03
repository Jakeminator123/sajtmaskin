import { describe, expect, it } from "vitest";
import { countParseErrors } from "./import-binding-ast";
import { fixMetadataClientConflict } from "./metadata-client-conflict-fixer";
import { transformSync } from "next/dist/build/swc";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const METADATA = `export const metadata: Metadata = {
  title: "Welcome",
  openGraph: {
    title: "Nested title",
  },
};`;

function page(body: string, metadata = METADATA): string {
  return `"use client";
import type { Metadata } from "next";
${metadata}
${body}`;
}

describe("fixMetadataClientConflict", () => {
  it.each([
    "// onClick will be added later\nexport default function Page() { return <main>Hello</main>; }",
    "/* useState and window.location are examples, not code. */\nexport default function Page() { return null; }",
    'const help = "onClick useState localStorage"; export default function Page() { return <main>{help}</main>; }',
    'export default function Page() { return <main title="onClick">useState window.location</main>; }',
    'import { useState } from "react"; export default function Page() { return null; }',
    'import { useState } from "react"; const example = { useState: "example" }; type StateHook = typeof useState; export default function Page() { return <main>{example.useState}</main>; }',
    'type Example = { onClick: () => void }; export default function Page() { return null; }',
    'import * as React from "react"; type StateHook = typeof React.useState; const config = { useState: "label" }; export default function Page() { return React.createElement("main", null, config.useState); }',
    'import React from "react"; const UI = React; // const state = UI.useState;\nconst example = "React.useState"; export default function Page() { return UI.createElement("main", null, example); }',
  ])("preserves metadata when only comments, text, types or unused imports mention client APIs: %s", (body) => {
    const result = fixMetadataClientConflict(page(body), "app/page.tsx");

    expect(result.fixed).toBe(true);
    expect(result.code).not.toContain('"use client"');
    expect(result.code).toContain(METADATA);
    expect(result.code).toContain(body);
    expect(result.code).toContain('import type { Metadata } from "next";');
    expect(countParseErrors(result.code, "app/page.tsx")).toBe(0);
    expect(fixMetadataClientConflict(result.code, "app/page.tsx").fixed).toBe(false);
  });

  it.each([
    'export default function Page() { return <button onClick={() => {}}>Hello</button>; }',
    'export default function Page() { return <button\n onPointerDown={\n () => {}\n }>Hello</button>; }',
    'import { useState as state } from "react"; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import { useState } from "react"; const state = useState; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import { useState as originalState } from "react"; const hooks = { state: originalState }; export default function Page() { const [count] = hooks.state(0); return <main>{count}</main>; }',
    'import * as React from "react"; export default function Page() { const [count] = React.useState(0); return <main>{count}</main>; }',
    'import * as React from "react"; const state = React.useState; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import React from "react"; const state = React.useState; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import * as React from "react"; const state = React["useState"]; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import React from "react"; const UI = React; const Hooks = UI; const state = Hooks.useState; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import * as React from "react"; const { useState: state } = React; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import React from "react"; const { useState: state } = React; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import { default as React } from "react"; const state = React.useState; export default function Page() { const [count] = state(0); return <main>{count}</main>; }',
    'import { useRouter as router } from "next/navigation"; export default function Page() { return <main>{router().pathname}</main>; }',
    'export default function Page() { return <main>{window.location.href}</main>; }',
    'import { motion } from "framer-motion"; export default function Page() { return <motion.main />; }',
  ])("keeps client execution and removes the actual nested metadata declaration: %s", (body) => {
    const result = fixMetadataClientConflict(page(body), "app/page.tsx");

    expect(result.fixed).toBe(true);
    expect(result.code).toContain('"use client"');
    expect(result.code).not.toContain("export const metadata");
    expect(result.code).not.toContain("Nested title");
    expect(result.code).not.toContain('import type { Metadata } from "next";');
    expect(result.code).toContain(body);
    expect(countParseErrors(result.code, "app/page.tsx")).toBe(0);
  });

  it("recognizes a directive after comments and preserves the actual generateMetadata function", () => {
    const code = `// onClick comes later
"use strict";
"use client"; // keep this explanation
export async function generateMetadata() { return { title: "Welcome" }; }
export default function Page() { return null; }`;

    const result = fixMetadataClientConflict(code, "app/page.tsx");

    expect(result.fixed).toBe(true);
    expect(result.code).not.toContain('"use client"');
    expect(result.code).toContain('"use strict";');
    expect(result.code).toContain("// keep this explanation");
    expect(result.code).toContain("export async function generateMetadata()");
    expect(countParseErrors(result.code, "app/page.tsx")).toBe(0);
  });

  it("ignores commented metadata exports", () => {
    const code = '"use client";\n// export const metadata = { title: "Old" };\nexport default function Page() { return null; }';

    expect(fixMetadataClientConflict(code, "app/page.tsx")).toEqual({ code, fixed: false, fixes: [] });
  });

  it("removes inline metadata without discarding other exported declarations or used Metadata imports", () => {
    const code = `"use client";
import type { Metadata as PageMetadata, Viewport } from "next";
export const metadata = { title: "Remove me" }, viewport: Viewport = { width: "device-width" };
const other: PageMetadata = { title: "Keep me" };
export default function Page() { return <button onClick={() => {}}>{other.title}</button>; }`;

    const result = fixMetadataClientConflict(code, "app/page.tsx");

    expect(result.code).not.toContain("Remove me");
    expect(result.code).toContain("export const viewport: Viewport");
    expect(result.code).toContain("Metadata as PageMetadata");
    expect(result.code).toContain("Keep me");
    expect(countParseErrors(result.code, "app/page.tsx")).toBe(0);
  });

  it("removes unused aliased Metadata from a multiline mixed import", () => {
    const code = `"use client";
import type {
  Metadata as PageMetadata,
  Viewport,
} from "next";
export const metadata: PageMetadata = { title: "Remove me" };
export const viewport: Viewport = { width: "device-width" };
export default function Page() { return <button onClick={() => {}}>Hello</button>; }`;

    const result = fixMetadataClientConflict(code, "app/page.tsx");

    expect(result.code).not.toContain("PageMetadata");
    expect(result.code).toContain('import type { Viewport } from "next";');
    expect(result.code).toContain("export const viewport: Viewport");
    expect(countParseErrors(result.code, "app/page.tsx")).toBe(0);
  });

  it("keeps an aliased hook in a valid client boundary according to the real Next server-component transform", () => {
    const options = {
      filename: "app/page.tsx",
      jsc: {
        parser: { syntax: "typescript", tsx: true },
        transform: { react: { runtime: "automatic" } },
      },
      serverComponents: {
        isReactServerLayer: true,
        cacheComponentsEnabled: false,
        useCacheEnabled: false,
        taintEnabled: false,
        pageExtensions: ["tsx"],
      },
    };
    const code = '"use client"; import {useState} from "react"; export const metadata={title:"test"}; const state=useState; export default function Page(){const [n]=state(0);return n;}';
    const invalidServer = code.replace('"use client";', "");
    expect(() => transformSync(invalidServer, options)).toThrow(/useState/);

    const result = fixMetadataClientConflict(code, "app/page.tsx");

    expect(result.code).toContain('"use client"');
    expect(result.code).toContain("const state=useState");
    expect(result.code).not.toContain("export const metadata");
    expect(() => transformSync(result.code, options)).not.toThrow();
  });

  it.each([
    ['import * as React from "react";', "const state = React.useState;"],
    ['import React from "react";', "const state = React.useState;"],
    ['import * as React from "react";', "const { useState: state } = React;"],
    ['import React from "react";', "const { useState: state } = React;"],
  ])("protects the real React server-runtime boundary for %s %s", (reactImport, alias) => {
    const code = `"use client"; ${reactImport} export const metadata = { title: "test" }; ${alias} export default function Page() { const [n] = state(0); return n; }`;
    const requireFromTest = createRequire(import.meta.url);
    const serverReact: unknown = requireFromTest(join(dirname(requireFromTest.resolve("react/package.json")), "react.react-server.js"));
    const runtime = {
      exports: {} as { default?: () => unknown },
      require: (specifier: string) => {
        if (specifier === "react") return serverReact;
        throw new Error(`Unexpected runtime import: ${specifier}`);
      },
    };
    const invalidServer = code.replace('"use client";', "");
    runInNewContext(ts.transpileModule(invalidServer, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, runtime);
    expect(() => runtime.exports.default!()).toThrow(/state is not a function/);

    const result = fixMetadataClientConflict(code, "app/page.tsx");

    expect(result.code).toContain('"use client"');
    expect(result.code).toContain(alias);
    expect(result.code).not.toContain("export const metadata");
    expect(countParseErrors(result.code, "app/page.tsx")).toBe(0);
  });
});
