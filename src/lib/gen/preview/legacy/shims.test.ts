import { describe, expect, it } from "vitest";

import { buildPreviewPrelude } from "./shims";
import type { ParsedImport, PreparedModule } from "../types";

function moduleWithImports(imports: ParsedImport[]): PreparedModule {
  return {
    file: { path: "app/page.tsx", content: "" },
    transformedCode: "",
    imports,
    defaultExportName: "Page",
    transpileErrors: [],
  } as unknown as PreparedModule;
}

function imp(
  source: string,
  named: string[],
  opts?: { defaultImport?: string },
): ParsedImport {
  return {
    source,
    defaultImport: opts?.defaultImport ?? null,
    namespaceImport: null,
    namedImports: named.map((n) => ({ imported: n, local: n })),
  };
}

// Regression guard for PR #268: the 4 utilities added to PREVIEW_BUILTIN_SOURCES
// must have shim bindings, otherwise preview transpilation strips their require()
// and the iframe crashes with a ReferenceError (Bugbot MEDIUM finding).
describe("buildPreviewPrelude — PR #268 baseline-util builtins", () => {
  it("binds canvas-confetti default export + the create named export", () => {
    const prelude = buildPreviewPrelude(
      [
        moduleWithImports([
          imp("canvas-confetti", ["create"], { defaultImport: "confetti" }),
        ]),
      ],
      "/",
    );
    expect(prelude).toContain("var confetti = function() { return Promise.resolve(); };");
    expect(prelude).toContain("var confetti = confetti;");
    expect(prelude).toContain("var create = confetti.create;");
  });

  it("binds react-error-boundary ErrorBoundary/useErrorBoundary/withErrorBoundary", () => {
    const prelude = buildPreviewPrelude(
      [
        moduleWithImports([
          imp("react-error-boundary", [
            "ErrorBoundary",
            "useErrorBoundary",
            "withErrorBoundary",
          ]),
        ]),
      ],
      "/",
    );
    expect(prelude).toContain("var ErrorBoundary = ErrorBoundary;");
    expect(prelude).toContain("var useErrorBoundary = useErrorBoundary;");
    expect(prelude).toContain("var withErrorBoundary = withErrorBoundary;");
  });

  it("maps react-intersection-observer useInView to the object-returning shim (not framer-motion's boolean)", () => {
    const prelude = buildPreviewPrelude(
      [moduleWithImports([imp("react-intersection-observer", ["useInView", "InView"])])],
      "/",
    );
    // useInView from this package must return { ref, inView, entry } so that
    // `const { ref, inView } = useInView()` does not throw a TypeError.
    expect(prelude).toContain(
      "var __rioUseInView = function() { return { ref: function(){}, inView: true, entry: undefined }; };",
    );
    expect(prelude).toContain("var useInView = __rioUseInView;");
    expect(prelude).toContain("var InView = __rioInView;");
  });

  it("binds @tanstack/react-virtual useVirtualizer/useWindowVirtualizer", () => {
    const prelude = buildPreviewPrelude(
      [
        moduleWithImports([
          imp("@tanstack/react-virtual", ["useVirtualizer", "useWindowVirtualizer"]),
        ]),
      ],
      "/",
    );
    expect(prelude).toContain("var useVirtualizer = function(options) { return __makeVirtualizer(options); };");
    expect(prelude).toContain("var useVirtualizer = useVirtualizer;");
    expect(prelude).toContain("var useWindowVirtualizer = useWindowVirtualizer;");
  });
});
