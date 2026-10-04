import { describe, expect, it } from "vitest";

import type { CodeFile } from "@/lib/gen/parser";
import { rewriteDossierImportsForRenames } from "./canonical-imports";

function file(path: string, content: string, language: CodeFile["language"] = "ts"): CodeFile {
  return { path, content, language };
}

describe("rewriteDossierImportsForRenames", () => {
  it("rewrites only AST module specifiers across supported TypeScript forms", () => {
    const content = [
      'import { Notice } from "@/components/DB-config-notice";',
      'import type { Notice as ImportedType } from "@/components/DB-config-notice";',
      'import "@/components/DB-config-notice";',
      'export { Notice as Exported } from "@/components/DB-config-notice";',
      'export type { Notice as ExportedType } from "@/components/DB-config-notice";',
      'export * from "@/components/DB-config-notice";',
      'const dynamicValue = import("@/components/DB-config-notice");',
      'const requiredValue = require("@/components/DB-config-notice");',
      'import NoticeModule = require("@/components/DB-config-notice");',
      'type NoticeType = import("@/components/DB-config-notice").Notice;',
      'const unrelated = "@/components/DB-config-notice";',
      '// import("@/components/DB-config-notice")',
    ].join("\n");
    const result = rewriteDossierImportsForRenames(
      [file("app/page.ts", content)],
      [
        {
          fromPath: "components/DB-config-notice.tsx",
          toPath: "components/db-config-notice.tsx",
        },
      ],
    );
    expect(result.changed).toBe(true);
    expect(result.files[0]!.content.match(/@\/components\/db-config-notice/g)).toHaveLength(10);
    expect(result.files[0]!.content).toContain(
      'const unrelated = "@/components/DB-config-notice";',
    );
    expect(result.files[0]!.content).toContain(
      '// import("@/components/DB-config-notice")',
    );
  });

  it.each([
    ["app/page.ts", "ts"],
    ["app/page.tsx", "tsx"],
    ["app/page.js", "js"],
    ["app/page.jsx", "jsx"],
  ] as const)("parses the %s dialect", (path, language) => {
    const result = rewriteDossierImportsForRenames(
      [file(path, 'export { value } from "@/lib/Legacy";', language)],
      [{ fromPath: "lib/Legacy/index.ts", toPath: "lib/canonical/index.ts" }],
    );
    expect(result.files[0]!.content).toContain('from "@/lib/canonical"');
  });

  it.each([
    ["types/FOO.d.ts", "types/foo.d.ts", "@/types/FOO", "@/types/foo"],
    [
      "types/Cafe\u0301.d.mts",
      "types/Caf\u00e9.d.mts",
      "@/types/Cafe\u0301",
      "@/types/Caf\u00e9",
    ],
    ["types/FOO.d.cts", "types/foo.d.cts", "@/types/FOO", "@/types/foo"],
  ])(
    "strips the full declaration suffix from an extensionless type import %s",
    (fromPath, toPath, source, expected) => {
      const result = rewriteDossierImportsForRenames(
        [
          file("app/page.ts", `import type { Shape } from "${source}";`),
          file(fromPath, "export type Shape = {};"),
        ],
        [{ fromPath, toPath }],
      );
      expect(result.files[0]!.content).toContain(`from "${expected}"`);
    },
  );

  it("preserves explicit extensions and index omission", () => {
    const content = [
      'import "@/lib/Legacy";',
      'import "@/lib/Legacy/index.ts";',
    ].join("\n");
    const result = rewriteDossierImportsForRenames(
      [file("app/page.ts", content)],
      [{ fromPath: "lib/Legacy/index.ts", toPath: "lib/canonical/index.ts" }],
    );
    expect(result.files[0]!.content).toContain('import "@/lib/canonical";');
    expect(result.files[0]!.content).toContain('import "@/lib/canonical/index.ts";');
  });

  it("does not redirect an exact extension candidate to a portable sibling rename", () => {
    const files = [
      file("app/page.ts", 'import { exact } from "@/components/Foo";'),
      file("components/Foo.ts", "export const exact = true;"),
      file("components/FOO.tsx", "export const other = true;", "tsx"),
    ];
    const result = rewriteDossierImportsForRenames(files, [
      { fromPath: "components/FOO.tsx", toPath: "components/foo.tsx" },
    ]);
    expect(result.files[0]!.content).toContain('from "@/components/Foo"');
  });

  it("does not fuzzy-match a resolved extensionless file path to a renamed sibling", () => {
    const files = [
      file("app/page.ts", 'import { exact } from "@/components/Foo";'),
      file("components/Foo", "export const exact = true;"),
      file("components/FOO.ts", "export const other = true;"),
    ];
    const result = rewriteDossierImportsForRenames(files, [
      { fromPath: "components/FOO.ts", toPath: "components/other.ts" },
    ]);
    expect(result.files[0]!.content).toContain('from "@/components/Foo"');
  });

  it("does not evaluate ambiguous fuzzy spellings after a different exact target resolves", () => {
    const files = [
      file("app/page.ts", 'import { exact } from "@/components/Foo";'),
      file("components/Foo.ts", "export const exact = true;"),
      file("components/FOO.tsx", "export const one = true;", "tsx"),
      file("components/foo.js", "export const two = true;", "js"),
    ];
    const renames = [
      { fromPath: "components/FOO.tsx", toPath: "components/one.tsx" },
      { fromPath: "components/foo.js", toPath: "components/two.js" },
    ];
    expect(() => rewriteDossierImportsForRenames(files, renames)).not.toThrow();
    const result = rewriteDossierImportsForRenames(files, renames);
    expect(result.files[0]!.content).toContain('from "@/components/Foo"');
  });

  it("keeps an exact relative target while recomputing a moved importer", () => {
    const result = rewriteDossierImportsForRenames(
      [
        file("components/Old/consumer.ts", 'import { exact } from "../Foo";'),
        file("components/Foo.ts", "export const exact = true;"),
        file("components/FOO.tsx", "export const other = true;", "tsx"),
      ],
      [
        {
          fromPath: "components/Old/consumer.ts",
          toPath: "features/new/consumer.ts",
        },
        { fromPath: "components/FOO.tsx", toPath: "components/foo.tsx" },
      ],
    );
    expect(result.files[0]!.content).toContain('from "../../components/Foo"');
  });

  it("preserves explicit src aliases and implicit src-mirror aliases", () => {
    const content = [
      'import { explicit } from "@/src/Foo";',
      'import { mirrored } from "@/Foo";',
    ].join("\n");
    const result = rewriteDossierImportsForRenames(
      [file("app/page.ts", content), file("src/Foo.ts", "export const explicit = 1;")],
      [{ fromPath: "src/Foo.ts", toPath: "src/foo.ts" }],
    );
    expect(result.files[0]!.content).toContain('from "@/src/foo"');
    expect(result.files[0]!.content).toContain('from "@/foo"');
  });

  it("recomputes relative imports from the canonical importer parent directory", () => {
    const result = rewriteDossierImportsForRenames(
      [file("components/Old/consumer.ts", 'import { shared } from "../shared";')],
      [
        {
          fromPath: "components/Old/consumer.ts",
          toPath: "features/new/consumer.ts",
        },
        { fromPath: "components/shared.ts", toPath: "lib/shared.ts" },
      ],
    );
    expect(result.files[0]!.content).toContain('from "../../lib/shared"');
  });

  it("recomputes a verified unchanged relative target when only the importer moves", () => {
    const result = rewriteDossierImportsForRenames(
      [
        file("components/Old/consumer.ts", 'import { shared } from "../shared";'),
        file("components/shared.ts", "export const shared = true;"),
      ],
      [
        {
          fromPath: "components/Old/consumer.ts",
          toPath: "features/new/consumer.ts",
        },
      ],
    );
    expect(result.files[0]!.content).toContain('from "../../components/shared"');
  });

  it("uses one portable target match when exact case resolution misses", () => {
    const result = rewriteDossierImportsForRenames(
      [
        file("components/Old/consumer.ts", 'import { shared } from "../shared";'),
        file("components/Shared.ts", "export const shared = true;"),
      ],
      [
        {
          fromPath: "components/Old/consumer.ts",
          toPath: "features/new/consumer.ts",
        },
      ],
    );
    expect(result.files[0]!.content).toContain('from "../../components/Shared"');
  });

  it("fails atomically when portable target resolution is ambiguous", () => {
    const files = [
      file("components/Old/consumer.ts", 'import { shared } from "../shared";'),
      file("components/Shared.ts", "export const shared = true;"),
      file("components/SHARED.ts", "export const shared = false;"),
    ];
    expect(() =>
      rewriteDossierImportsForRenames(files, [
        {
          fromPath: "components/Old/consumer.ts",
          toPath: "features/new/consumer.ts",
        },
      ]),
    ).toThrow("import-rewrite-ambiguous");
    expect(files[0]!.content).toContain('from "../shared"');
  });

  it("uses portable case and Unicode identity while moving a relative importer", () => {
    const result = rewriteDossierImportsForRenames(
      [file("Components/Cafe\u0301/Consumer.ts", 'import { Foo } from "../Foo";')],
      [
        {
          fromPath: "Components/Cafe\u0301/Consumer.ts",
          toPath: "components/Caf\u00e9/consumer.ts",
        },
        { fromPath: "Components/Foo.ts", toPath: "components/foo.ts" },
      ],
    );
    expect(result.files[0]!.content).toContain('from "../foo"');
  });

  it("handles leading-slash file spellings and preserves quote style", () => {
    const result = rewriteDossierImportsForRenames(
      [file("/app/page.ts", "import { x } from '@/components/Old';")],
      [{ fromPath: "/components/Old.ts", toPath: "components/new.ts" }],
    );
    expect(result.files[0]!.content).toContain("from '@/components/new'");
  });

  it.each([
    "Components/Foo.ts ",
    ".//Components//Foo.ts",
    "/Components/Foo.ts",
    "Components\\Foo.ts",
  ])("normalizes importer spelling %j before applying the AST guard", (importerPath) => {
    const result = rewriteDossierImportsForRenames(
      [
        file(importerPath, 'import { shared } from "./shared";'),
        file("Components/shared.ts", "export const shared = true;"),
      ],
      [{ fromPath: "Components/Foo.ts", toPath: "components/foo.ts" }],
    );
    expect(result.files[0]!.content).toContain('from "../Components/shared"');
  });

  it("escapes the preserved quote delimiter in a canonical module path", () => {
    const result = rewriteDossierImportsForRenames(
      [file("app/page.ts", "import { x } from '@/components/Old';")],
      [{ fromPath: "components/Old.ts", toPath: "components/it's.ts" }],
    );
    expect(result.files[0]!.content).toContain("from '@/components/it\\'s'");
  });

  it("leaves packages and interpolated templates untouched", () => {
    const content = [
      'import React from "react";',
      'const dynamicPath = import(`@/components/${name}`);',
    ].join("\n");
    const files = [file("app/page.ts", content)];
    const result = rewriteDossierImportsForRenames(files, [
      { fromPath: "components/Old.ts", toPath: "components/new.ts" },
    ]);
    expect(result).toEqual({ files, changed: false });
  });

  it("keeps a backtick module specifier literal when the canonical path contains ${", () => {
    const result = rewriteDossierImportsForRenames(
      [file("app/page.ts", "const value = import(`@/components/Old`);")],
      [{ fromPath: "components/Old.ts", toPath: "components/${part}.ts" }],
    );
    expect(result.files[0]!.content).toContain("import(`@/components/\\${part}`)");
  });

  it("rewrites the first literal of dynamic import with an options argument", () => {
    const result = rewriteDossierImportsForRenames(
      [
        file(
          "app/page.ts",
          "const value = import('@/data/Old.json', { with: { type: 'json' } });",
        ),
      ],
      [{ fromPath: "data/Old.json", toPath: "data/new.json" }],
    );
    expect(result.files[0]!.content).toContain(
      "import('@/data/new.json', { with: { type: 'json' } })",
    );
  });

  it("fails atomically for ambiguous portable rename sources", () => {
    const files = [file("app/page.ts", 'import { x } from "@/components/Foo";')];
    expect(() =>
      rewriteDossierImportsForRenames(files, [
        { fromPath: "components/Foo.ts", toPath: "components/one.ts" },
        { fromPath: "components/foo.ts", toPath: "components/two.ts" },
      ]),
    ).toThrow("import-rewrite-ambiguous");
    expect(files[0]!.content).toContain("@/components/Foo");
  });

  it("fails atomically when a concrete rewrite target is in an invalid source file", () => {
    const files = [
      file("app/page.ts", 'import { x } from "@/components/Foo";\nconst broken = ;'),
    ];
    expect(() =>
      rewriteDossierImportsForRenames(files, [
        { fromPath: "components/Foo.ts", toPath: "components/foo.ts" },
      ]),
    ).toThrow("import-rewrite-unsafe");
    expect(files[0]!.content).toContain("@/components/Foo");
  });

  it("fails atomically when a moved importer has an unresolved relative literal", () => {
    const files = [file("components/Old/consumer.ts", 'import { missing } from "./missing";')];
    expect(() =>
      rewriteDossierImportsForRenames(files, [
        {
          fromPath: "components/Old/consumer.ts",
          toPath: "features/new/consumer.ts",
        },
      ]),
    ).toThrow("import-rewrite-unsafe");
    expect(files[0]!.content).toContain('from "./missing"');
  });

  it("returns the original file objects when no verified rename applies", () => {
    const files = [file("app/page.ts", 'import { x } from "@/lib/other";')];
    const result = rewriteDossierImportsForRenames(files, [
      { fromPath: "lib/Legacy.ts", toPath: "lib/canonical.ts" },
    ]);
    expect(result).toEqual({ files, changed: false });
    expect(result.files[0]).toBe(files[0]);
  });
});
