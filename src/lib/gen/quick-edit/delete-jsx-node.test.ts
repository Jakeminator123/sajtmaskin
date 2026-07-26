import { describe, expect, it } from "vitest";
import { countParseErrors } from "@/lib/gen/autofix/rules/import-binding-ast";
import { deleteJsxNode } from "./delete-jsx-node";

const PAGE = `export default function Page() {
  return (
    <main>
      <section className="hero">
        <h1>Hej</h1>
        <p>Text</p>
      </section>
      <img src="/a.png" alt="a" />
      <footer>Slut</footer>
    </main>
  );
}
`;

describe("deleteJsxNode", () => {
  it("removes an element with children and leaves the file parsable", () => {
    const result = deleteJsxNode(PAGE, "app/page.tsx", { lineNumber: 4, tagName: "section" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("<section");
    expect(result.content).not.toContain("</section>");
    expect(result.content).not.toContain("<h1>Hej</h1>");
    expect(result.content).toContain('<img src="/a.png" alt="a" />');
    expect(result.content).toContain("<footer>Slut</footer>");
    expect(countParseErrors(result.content, "app/page.tsx")).toBe(0);
  });

  it("leaves no blank hole where the node was", () => {
    const result = deleteJsxNode(PAGE, "app/page.tsx", { lineNumber: 9, tagName: "footer" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(
      PAGE.split("\n")
        .filter((line) => !line.includes("<footer>"))
        .join("\n"),
    );
  });

  it("removes a self-closing element", () => {
    const result = deleteJsxNode(PAGE, "app/page.tsx", { lineNumber: 8, tagName: "img" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("<img");
    expect(countParseErrors(result.content, "app/page.tsx")).toBe(0);
  });

  it("removes a child of a fragment", () => {
    const source = `export function List() {
  return (
    <>
      <li>ett</li>
      <li>tva</li>
    </>
  );
}
`;
    const result = deleteJsxNode(source, "components/List.tsx", {
      lineNumber: 4,
      tagName: "li",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("<li>tva</li>");
    expect(result.content).not.toContain("<li>ett</li>");
    expect(countParseErrors(result.content, "components/List.tsx")).toBe(0);
  });

  it("removes a fragment node itself when the locator says so", () => {
    const source = `export function Panel() {
  return (
    <div>
      <>
        <span>a</span>
      </>
      <span>b</span>
    </div>
  );
}
`;
    const result = deleteJsxNode(source, "components/Panel.tsx", {
      lineNumber: 4,
      tagName: "",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("<>");
    expect(result.content).toContain("<span>b</span>");
    expect(countParseErrors(result.content, "components/Panel.tsx")).toBe(0);
  });

  it("picks the innermost element when several start on the same line", () => {
    const source = `export function Row() {
  return (
    <div><span>text</span></div>
  );
}
`;
    const result = deleteJsxNode(source, "components/Row.tsx", {
      lineNumber: 3,
      tagName: "span",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("<div></div>");
    expect(countParseErrors(result.content, "components/Row.tsx")).toBe(0);
  });

  it("returns tag_mismatch instead of deleting the wrong node", () => {
    const result = deleteJsxNode(PAGE, "app/page.tsx", { lineNumber: 5, tagName: "button" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("tag_mismatch");
  });

  it("returns node_not_found when no JSX starts on the line", () => {
    const result = deleteJsxNode(PAGE, "app/page.tsx", { lineNumber: 1, tagName: "main" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("node_not_found");
  });

  it("refuses to delete the sole returned element of a component", () => {
    const source = `export function Card() {
  return <article>innehall</article>;
}
`;
    const result = deleteJsxNode(source, "components/Card.tsx", {
      lineNumber: 2,
      tagName: "article",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sole_return_value");
  });

  it("refuses to delete the concise arrow body of a component", () => {
    const source = `export const Item = () => <li>rad</li>;
`;
    const result = deleteJsxNode(source, "components/Item.tsx", {
      lineNumber: 1,
      tagName: "li",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sole_return_value");
  });

  it("does not perform a deletion that would make the file unparsable", () => {
    const source = `export function Toggle({ open }: { open: boolean }) {
  return (
    <div>
      {open && <span>oppen</span>}
    </div>
  );
}
`;
    const result = deleteJsxNode(source, "components/Toggle.tsx", {
      lineNumber: 4,
      tagName: "span",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("parse_regression");
  });

  it("refuses a file dialect that cannot contain JSX", () => {
    const result = deleteJsxNode("export const a = 1;\n", "lib/data.ts", {
      lineNumber: 1,
      tagName: "div",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unsupported_file");
  });

  it("refuses a non-positive line number", () => {
    const result = deleteJsxNode(PAGE, "app/page.tsx", { lineNumber: 0, tagName: "main" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_locator");
  });

  it("matches a component tag reported by its rendered DOM casing", () => {
    const source = `import { Button } from "@/components/ui/button";

export function Bar() {
  return (
    <div>
      <Button>Klicka</Button>
      <span>kvar</span>
    </div>
  );
}
`;
    const result = deleteJsxNode(source, "components/Bar.tsx", {
      lineNumber: 6,
      tagName: "button",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tagName).toBe("Button");
    expect(result.content).toContain("<span>kvar</span>");
    // The now-unused import is deliberately left to autofix.
    expect(result.content).toContain('import { Button }');
  });
});
