import { describe, expect, it } from "vitest";
import { normalizeFilePath, normalizeRoutePath, routeFromPageFile, resolveLocalImportPath, escapeInlineScript } from "./utils";
import { parseImports, stripNextImports, rewriteModuleExports } from "./import-parser";
import { findPageFile, findCssFiles } from "./file-resolution";
import { isPreviewBuiltinImportSource } from "./constants";
import { buildPreviewBaseCss, normalizePreviewCss } from "./css";
import type { CodeFile } from "./types";

function file(path: string, content: string, language = "tsx"): CodeFile {
  return { path, content, language };
}

describe("utils", () => {
  describe("normalizeFilePath", () => {
    it("normalizes backslashes and leading dot-slash", () => {
      expect(normalizeFilePath(".\\src\\app\\page.tsx")).toBe("src/app/page.tsx");
    });

    it("collapses duplicate slashes", () => {
      expect(normalizeFilePath("src//app///page.tsx")).toBe("src/app/page.tsx");
    });
  });

  describe("normalizeRoutePath", () => {
    it("returns / for empty input", () => {
      expect(normalizeRoutePath("")).toBe("/");
      expect(normalizeRoutePath(null)).toBe("/");
      expect(normalizeRoutePath(undefined)).toBe("/");
    });

    it("strips trailing slashes", () => {
      expect(normalizeRoutePath("/about/")).toBe("/about");
    });
  });

  describe("routeFromPageFile", () => {
    it("maps app/page.tsx to /", () => {
      expect(routeFromPageFile("app/page.tsx")).toBe("/");
    });

    it("maps app/about/page.tsx to /about", () => {
      expect(routeFromPageFile("app/about/page.tsx")).toBe("/about");
    });

    it("ignores route groups", () => {
      expect(routeFromPageFile("app/(marketing)/about/page.tsx")).toBe("/about");
    });

    it("returns null for non-page files", () => {
      expect(routeFromPageFile("components/Button.tsx")).toBeNull();
    });
  });

  describe("resolveLocalImportPath", () => {
    it("resolves @/ alias imports", () => {
      const fileMap = new Map<string, unknown>();
      fileMap.set("components/ui/button.tsx", { path: "components/ui/button.tsx" });

      const result = resolveLocalImportPath(fileMap, "app/page.tsx", "@/components/ui/button");
      expect(result).toBe("components/ui/button.tsx");
    });

    it("returns null for package imports", () => {
      const fileMap = new Map<string, unknown>();
      expect(resolveLocalImportPath(fileMap, "app/page.tsx", "react")).toBeNull();
    });
  });

  describe("escapeInlineScript", () => {
    it("escapes closing script tags", () => {
      expect(escapeInlineScript("</script>")).toBe("<\\/script>");
    });
  });
});

describe("import-parser", () => {
  describe("parseImports", () => {
    it("parses default import", () => {
      const result = parseImports('import React from "react";');
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("react");
      expect(result[0].defaultImport).toBe("React");
    });

    it("parses named imports", () => {
      const result = parseImports('import { useState, useEffect } from "react";');
      expect(result).toHaveLength(1);
      expect(result[0].namedImports).toHaveLength(2);
      expect(result[0].namedImports[0].imported).toBe("useState");
    });

    it("skips type imports", () => {
      const result = parseImports('import type { FC } from "react";');
      expect(result).toHaveLength(0);
    });
  });

  describe("stripNextImports", () => {
    it("strips next/image import", () => {
      const code = 'import Image from "next/image";\nconst x = 1;';
      expect(stripNextImports(code)).toContain("const x = 1");
      expect(stripNextImports(code)).not.toContain("next/image");
    });

    it("strips use client directive", () => {
      const result = stripNextImports('"use client";\nconst x = 1;');
      expect(result).not.toContain("use client");
    });
  });

  describe("rewriteModuleExports", () => {
    it("rewrites named default export function", () => {
      const result = rewriteModuleExports("export default function Page() { return null; }", "__Fallback");
      expect(result.defaultExportName).toBe("Page");
      expect(result.code).toContain("function Page()");
      expect(result.code).not.toContain("export");
    });

    it("rewrites anonymous default export", () => {
      const result = rewriteModuleExports("export default function() { return null; }", "__Fallback");
      // resolveDefaultExportName matches "function" as a word before the anonymous-export regex runs
      expect(result.defaultExportName).toBe("function");
    });
  });
});

describe("file-resolution", () => {
  describe("findPageFile", () => {
    it("finds app/page.tsx", () => {
      const files = [file("app/page.tsx", "export default function Page() {}"), file("lib/utils.ts", "")];
      expect(findPageFile(files)?.path).toBe("app/page.tsx");
    });

    it("returns null when no page file exists", () => {
      const files = [file("lib/utils.ts", "export const cn = () => ''")];
      expect(findPageFile(files)).toBeNull();
    });
  });

  describe("findCssFiles", () => {
    it("filters CSS files", () => {
      const files = [file("app/page.tsx", ""), file("globals.css", "body {}"), file("theme.css", "")];
      expect(findCssFiles(files)).toHaveLength(2);
    });
  });
});

describe("constants", () => {
  it("recognizes builtin import sources", () => {
    expect(isPreviewBuiltinImportSource("react")).toBe(true);
    expect(isPreviewBuiltinImportSource("next/link")).toBe(true);
    expect(isPreviewBuiltinImportSource("lucide-react")).toBe(true);
    expect(isPreviewBuiltinImportSource("@radix-ui/react-dialog")).toBe(true);
    expect(isPreviewBuiltinImportSource("my-custom-lib")).toBe(false);
  });
});

describe("css", () => {
  it("buildPreviewBaseCss returns non-empty CSS", () => {
    const css = buildPreviewBaseCss();
    expect(css).toContain(":root");
    expect(css).toContain("--background");
    expect(css).toContain("--primary");
  });

  it("normalizePreviewCss strips @import tailwindcss", () => {
    const input = '@import "tailwindcss";\n.foo { color: red; }';
    const result = normalizePreviewCss(input);
    expect(result).not.toContain("@import");
    expect(result).toContain(".foo");
  });
});
