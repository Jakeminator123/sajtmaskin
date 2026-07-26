import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import { applyQuickEdits } from "./apply";

const pageContent = `export default function Page() {
  return (
    <main>
      <aside className="promo">
        <h2>Erbjudande</h2>
      </aside>
      <p>Brodtext</p>
    </main>
  );
}
`;

const baseFiles: CodeFile[] = [
  { path: "app/page.tsx", content: pageContent, language: "tsx" },
  {
    path: "package.json",
    content: '{\n  "name": "site"\n}\n',
    language: "json",
  },
];

describe("applyQuickEdits — delete_jsx_node", () => {
  it("removes the node and reports the changed path", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_jsx_node", path: "app/page.tsx", lineNumber: 4, tagName: "aside" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedPaths).toEqual(["app/page.tsx"]);
    expect(result.removedPaths).toEqual([]);
    const page = result.files.find((f) => f.path === "app/page.tsx");
    expect(page?.content).not.toContain("<aside");
    expect(page?.content).toContain("<p>Brodtext</p>");
    expect(page?.language).toBe("tsx");
  });

  it("refuses a structurally protected path", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_jsx_node", path: "package.json", lineNumber: 2, tagName: "div" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("protected_path");
  });

  it("refuses a blocked (secret) path before touching the file set", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_jsx_node", path: ".env.local", lineNumber: 1, tagName: "div" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsafe_path");
  });

  it("fails when the target file is missing", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_jsx_node", path: "app/ghost.tsx", lineNumber: 1, tagName: "div" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("file_not_found");
  });

  it("maps a tag mismatch to no_match and changes nothing", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_jsx_node", path: "app/page.tsx", lineNumber: 4, tagName: "nav" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_match");
  });

  it("maps a sole-return deletion to jsx_delete_unsafe", () => {
    const files: CodeFile[] = [
      {
        path: "components/Only.tsx",
        content: "export function Only() {\n  return <div>bara</div>;\n}\n",
        language: "tsx",
      },
    ];
    const result = applyQuickEdits(files, [
      { kind: "delete_jsx_node", path: "components/Only.tsx", lineNumber: 2, tagName: "div" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("jsx_delete_unsafe");
  });

  it("maps a non-JSX dialect to jsx_delete_unsupported", () => {
    const files: CodeFile[] = [
      { path: "lib/data.ts", content: "export const a = 1;\n", language: "ts" },
    ];
    const result = applyQuickEdits(files, [
      { kind: "delete_jsx_node", path: "lib/data.ts", lineNumber: 1, tagName: "div" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("jsx_delete_unsupported");
  });

  it("combines with a text replacement in one batch", () => {
    const result = applyQuickEdits(baseFiles, [
      { kind: "delete_jsx_node", path: "app/page.tsx", lineNumber: 4, tagName: "aside" },
      { kind: "replace_text", path: "app/page.tsx", find: "Brodtext", replace: "Ny text" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.files.find((f) => f.path === "app/page.tsx");
    expect(page?.content).not.toContain("<aside");
    expect(page?.content).toContain("<p>Ny text</p>");
  });
});
