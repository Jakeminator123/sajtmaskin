import { describe, expect, it } from "vitest";
import {
  buildDeleteElementOps,
  buildImageEditOps,
  buildTextEditOps,
  classifyInspectedElement,
  describeInspectQuickEditError,
  validateInspectImageInput,
  validateInspectTextInput,
  type InspectedElement,
} from "./inspect-element-actions";

const FILE = "app/page.tsx";

function element(overrides: Partial<InspectedElement> = {}): InspectedElement {
  return {
    tag: "h1",
    ownText: null,
    text: null,
    src: null,
    childElementCount: 0,
    ...overrides,
  };
}

describe("classifyInspectedElement — text", () => {
  it("skiljer en JSX-literal från en variabelrefererad text", () => {
    const literalFile = [
      "export default function Page() {",
      "  return (",
      "    <section>",
      "      <h1>Välkommen hem</h1>",
      "    </section>",
      "  );",
      "}",
    ].join("\n");
    const variableFile = [
      "export default function Page({ title }: { title: string }) {",
      "  return (",
      "    <section>",
      "      <h1>{title}</h1>",
      "    </section>",
      "  );",
      "}",
    ].join("\n");

    const literal = classifyInspectedElement({
      element: element({ ownText: "Välkommen hem", text: "Välkommen hem" }),
      location: { filePath: FILE, lineNumber: 4 },
      fileContent: literalFile,
    });
    const fromVariable = classifyInspectedElement({
      element: element({ ownText: "Välkommen hem", text: "Välkommen hem" }),
      location: { filePath: FILE, lineNumber: 4 },
      fileContent: variableFile,
    });

    expect(literal.editText).toEqual({
      available: true,
      target: {
        filePath: FILE,
        lineNumber: 4,
        find: "Välkommen hem",
        occurrence: 1,
        current: "Välkommen hem",
      },
    });
    expect(fromVariable.editText.available).toBe(false);
    expect(fromVariable.editText).toMatchObject({
      reason: "Texten hämtas från en annan del av koden.",
    });
  });

  it("räknar rätt förekomst när samma text finns flera gånger i filen", () => {
    const file = [
      "export default function Page() {",
      "  return (",
      "    <div>",
      "      <p>Läs mer</p>",
      "      <p>Läs mer</p>",
      "    </div>",
      "  );",
      "}",
    ].join("\n");

    const second = classifyInspectedElement({
      element: element({ tag: "p", ownText: "Läs mer", text: "Läs mer" }),
      location: { filePath: FILE, lineNumber: 5 },
      fileContent: file,
    });

    expect(second.editText).toMatchObject({
      available: true,
      target: { occurrence: 2, lineNumber: 5 },
    });
  });

  it("erbjuder inte textändring när elementet bara innehåller andra element", () => {
    const file = ["<div>", "  <span>Hej</span>", "</div>"].join("\n");
    const actions = classifyInspectedElement({
      element: element({ tag: "div", text: "Hej", ownText: null, childElementCount: 1 }),
      location: { filePath: FILE, lineNumber: 1 },
      fileContent: file,
    });
    expect(actions.editText).toMatchObject({
      available: false,
      reason: "Elementet innehåller andra element i stället för egen text.",
    });
  });

  it("erbjuder ingen åtgärd alls utan träff i koden", () => {
    const actions = classifyInspectedElement({
      element: element({ ownText: "Hej" }),
      location: null,
      fileContent: "<h1>Hej</h1>",
    });
    expect(actions.editText.available).toBe(false);
    expect(actions.replaceImage.available).toBe(false);
    expect(actions.deleteElement.available).toBe(false);
  });
});

describe("classifyInspectedElement — bild", () => {
  const literalFile = '<img src="/hero.png" alt="Hero" />';
  const expressionFile = "<img src={heroUrl} alt=\"Hero\" />";

  it("tillåter bildbyte när src är en literal", () => {
    const actions = classifyInspectedElement({
      element: element({ tag: "img", src: "/hero.png" }),
      location: { filePath: FILE, lineNumber: 1 },
      fileContent: literalFile,
    });
    expect(actions.replaceImage).toMatchObject({
      available: true,
      target: { find: 'src="/hero.png"', currentSrc: "/hero.png", occurrence: 1, quote: '"' },
    });
  });

  it("blockerar bildbyte när src kommer från en variabel", () => {
    const actions = classifyInspectedElement({
      element: element({ tag: "img", src: "/optimized/hero.png" }),
      location: { filePath: FILE, lineNumber: 1 },
      fileContent: expressionFile,
    });
    expect(actions.replaceImage).toMatchObject({
      available: false,
      reason: "Bildens adress hämtas från en annan del av koden.",
    });
  });

  it("plockar inte data-src som bildens adress", () => {
    const actions = classifyInspectedElement({
      element: element({ tag: "img", src: "/b.png" }),
      location: { filePath: FILE, lineNumber: 1 },
      fileContent: '<img data-src="/a.png" src="/b.png" />',
    });
    expect(actions.replaceImage).toMatchObject({
      available: true,
      target: { find: 'src="/b.png"' },
    });
  });
});

describe("classifyInspectedElement — borttagning", () => {
  it("erbjuder borttagning i en JSX-fil och anger orsak i andra filer", () => {
    const inTsx = classifyInspectedElement({
      element: element({ tag: "section" }),
      location: { filePath: "app/page.tsx", lineNumber: 3 },
      fileContent: "<div>\n  <section>\n    <section>x</section>\n  </section>\n</div>",
    });
    expect(inTsx.deleteElement).toEqual({
      available: true,
      target: { filePath: "app/page.tsx", lineNumber: 3, tagName: "section" },
    });

    const inCss = classifyInspectedElement({
      element: element({ tag: "section" }),
      location: { filePath: "app/globals.css", lineNumber: 3 },
      fileContent: ".a { color: red }",
    });
    expect(inCss.deleteElement.available).toBe(false);
  });
});

describe("op-byggarna", () => {
  it("en literal textändring ger exakt en replace_text mot rätt fil och rad", () => {
    const file = [
      "export default function Page() {",
      "  return (",
      "    <section>",
      "      <h1>Välkommen hem</h1>",
      "    </section>",
      "  );",
      "}",
    ].join("\n");
    const actions = classifyInspectedElement({
      element: element({ ownText: "Välkommen hem", text: "Välkommen hem" }),
      location: { filePath: FILE, lineNumber: 4 },
      fileContent: file,
    });
    if (!actions.editText.available) throw new Error("förväntade en redigerbar text");

    const ops = buildTextEditOps(actions.editText.target, "  Hej och välkommen  ");

    expect(ops).toEqual([
      {
        kind: "replace_text",
        path: FILE,
        find: "Välkommen hem",
        replace: "Hej och välkommen",
        occurrence: 1,
      },
    ]);
    expect(actions.editText.target.lineNumber).toBe(4);
  });

  it("ger inga ops när texten är oförändrad", () => {
    const ops = buildTextEditOps(
      { filePath: FILE, lineNumber: 4, find: "Hej", occurrence: 1, current: "Hej" },
      "Hej",
    );
    expect(ops).toEqual([]);
  });

  it("byter bildadress med bevarat citattecken", () => {
    const ops = buildImageEditOps(
      {
        filePath: FILE,
        lineNumber: 1,
        find: 'src="/hero.png"',
        occurrence: 1,
        currentSrc: "/hero.png",
        quote: '"',
      },
      "/uploads/ny-bild.png",
    );
    expect(ops).toEqual([
      {
        kind: "replace_text",
        path: FILE,
        find: 'src="/hero.png"',
        replace: 'src="/uploads/ny-bild.png"',
        occurrence: 1,
      },
    ]);
  });

  it("bygger en delete_jsx_node-op för borttagning", () => {
    expect(
      buildDeleteElementOps({ filePath: FILE, lineNumber: 12, tagName: "section" }),
    ).toEqual([{ kind: "delete_jsx_node", path: FILE, lineNumber: 12, tagName: "section" }]);
  });
});

describe("indata-kontroller och felöversättning", () => {
  it("stoppar tecken som skulle göra koden trasig", () => {
    expect(validateInspectTextInput("Helt vanlig text")).toBeNull();
    expect(validateInspectTextInput("Pris < 100")).toBe("Tecknen < > { } går inte att använda här.");
    expect(validateInspectImageInput("", '"')).toBe("Bildadressen kan inte vara tom.");
    expect(validateInspectImageInput('/a"b.png', '"')).toContain("tecken som inte fungerar");
    expect(validateInspectImageInput("/uploads/bild.png", '"')).toBeNull();
  });

  it("översätter serverns avslag till klarspråk", () => {
    expect(describeInspectQuickEditError({ reason: "jsx_delete_unsupported" })).toBe(
      "Det här elementet går inte att ta bort härifrån.",
    );
    expect(describeInspectQuickEditError({ reason: "jsx_delete_unsafe" })).toBe(
      "Borttagningen hade gjort sidan trasig, så den utfördes inte.",
    );
    expect(describeInspectQuickEditError({ error: "HTTP 500" })).toBe("HTTP 500");
  });
});
