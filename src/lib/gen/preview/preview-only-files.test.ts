import { describe, expect, it } from "vitest";
import type { CodeFile } from "../parser";
import { buildPreviewHtml } from "./build-preview-document";
import { applyPreviewOnlyRulesToFiles } from "./preview-only-files";

const PAGE_WITH_SERVER_IMPORT = [
  'import { headers } from "next/headers";',
  'import "server-only";',
  "",
  "export default function Page() {",
  "  return <main>Hej</main>;",
  "}",
  "",
].join("\n");

function file(path: string, content: string, language = "tsx"): CodeFile {
  return { path, content, language };
}

describe("applyPreviewOnlyRulesToFiles", () => {
  it("strippar serverimporter i previewkopian men rör inte originalet", () => {
    const files = [file("app/page.tsx", PAGE_WITH_SERVER_IMPORT)];

    const previewFiles = applyPreviewOnlyRulesToFiles(files);

    expect(files[0].content).toContain('import { headers } from "next/headers"');
    expect(previewFiles[0].content).toContain("(stripped for preview compatibility)");
    expect(previewFiles[0].content).not.toMatch(/^import \{ headers \}/m);
  });

  it("lämnar filer utan serverimporter identiska", () => {
    const files = [file("app/page.tsx", "export default function Page() {}\n")];
    expect(applyPreviewOnlyRulesToFiles(files)[0]).toBe(files[0]);
  });

  it("rör inte filer som inte transpileras", () => {
    const files = [file("app/globals.css", 'import "next/headers";\n', "css")];
    expect(applyPreviewOnlyRulesToFiles(files)[0]).toBe(files[0]);
  });
});

describe("buildPreviewHtml", () => {
  // F4: sparade filer behåller `next/headers` sedan regeluppsättningarna
  // delades. Shim-lanen har ingen modul för dem — utan egen strippning blir
  // bindningen odefinierad och sidan kraschar vid rendering. Detta låser att
  // lanen kör preview-reglerna själv, inte att den råkar få strippad indata.
  it("kör preview-reglerna på sidor som importerar next/headers", () => {
    const html = buildPreviewHtml([file("app/page.tsx", PAGE_WITH_SERVER_IMPORT)]);

    expect(html).toBeTruthy();
    expect(html).toContain("stripped for preview compatibility");
    expect(html).not.toMatch(/(^|\n)\s*import\s+\{\s*headers\s*\}\s+from/);
  });
});
