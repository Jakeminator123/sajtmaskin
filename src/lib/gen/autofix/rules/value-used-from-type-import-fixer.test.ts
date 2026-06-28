import { describe, expect, it } from "vitest";
import { fixValueUsedFromTypeImport } from "./value-used-from-type-import-fixer";

// Empirical case from 2026-04-23 (chat 341cdc37..., version f5ddfa39...).
// The LLM shipped `app/showcase/page.tsx` with `import type` for icons that
// were then used as JSX and as data values. Next bail'ed at build time with
// TS1361 and the page rendered blank until a 118s repair-pass fixed it.
const SHOWCASE_EMPIRICAL_CASE = `"use client";
import type { Building2, Camera, Car as CarFront } from "lucide-react";

const features = [
  { icon: Building2, label: "Garage" },
  { icon: Camera, label: "Inspection" },
];

export default function ShowcasePage() {
  return (
    <div>
      <CarFront className="h-4 w-4" />
      {features.map((f) => (
        <f.icon key={f.label} className="h-4 w-4" />
      ))}
    </div>
  );
}
`;

const JSX_TAG_CASE = `import type { Button } from "@/components/ui/button";

export default function Page() {
  return <Button>Click</Button>;
}
`;

const FUNCTION_CALL_CASE = `import type { cn } from "@/lib/utils";

const className = cn("a", "b");
`;

const NEW_OPERATOR_CASE = `import type { EventEmitter } from "events";

const ee = new EventEmitter();
`;

const TYPE_ONLY_ACTUALLY_CASE = `import type { User } from "@/types";

export type UserList = User[];
`;

const ALREADY_VALUE_IMPORT_CASE = `import { Button } from "@/components/ui/button";

export default function Page() {
  return <Button>Hi</Button>;
}
`;

// Mixed case — at least one binding (Star) is used in JSX (definitely value),
// the other (LucideIcon) only as a type. The fixer flips the whole block to
// value import; TypeScript still accepts value-imported types on the use site.
const MIXED_TYPE_AND_VALUE_BINDING_CASE = `import type { Star, LucideIcon } from "lucide-react";

type Feature = { icon: LucideIcon };
const features: Feature[] = [];

export function Icon() {
  return <Star className="h-4 w-4" />;
}
`;

const MEMBER_ACCESS_CASE = `import type { config } from "@/lib/config";

const apiUrl = config.apiUrl;
`;

describe("fixValueUsedFromTypeImport", () => {
  it("converts the empirical /showcase case (JSX + data value) back to value import", () => {
    const { code, fixed, fixes } = fixValueUsedFromTypeImport(
      SHOWCASE_EMPIRICAL_CASE,
      "app/showcase/page.tsx",
    );
    expect(fixed).toBe(true);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixer).toBe("value-used-from-type-import-fixer");
    expect(code).toContain(
      'import { Building2, Camera, Car as CarFront } from "lucide-react";',
    );
    expect(code).not.toContain("import type { Building2");
  });

  it("converts when binding is used as JSX tag", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(JSX_TAG_CASE, "app/page.tsx");
    expect(fixed).toBe(true);
    expect(code).toContain('import { Button } from "@/components/ui/button";');
  });

  it("converts when binding is called as function", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(FUNCTION_CALL_CASE, "lib/x.ts");
    expect(fixed).toBe(true);
    expect(code).toContain('import { cn } from "@/lib/utils";');
  });

  it("converts when binding is used with `new`", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(NEW_OPERATOR_CASE, "lib/x.ts");
    expect(fixed).toBe(true);
    expect(code).toContain('import { EventEmitter } from "events";');
  });

  it("does NOT convert when all bindings are type-only (legitimate import type)", () => {
    const result = fixValueUsedFromTypeImport(
      TYPE_ONLY_ACTUALLY_CASE,
      "types/list.ts",
    );
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(TYPE_ONLY_ACTUALLY_CASE);
  });

  it("no-op on plain value imports (only `import type` triggers this fixer)", () => {
    const result = fixValueUsedFromTypeImport(ALREADY_VALUE_IMPORT_CASE, "app/page.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(ALREADY_VALUE_IMPORT_CASE);
  });

  it("flips the whole block when at least one binding is used as a value (Star value, LucideIcon type)", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      MIXED_TYPE_AND_VALUE_BINDING_CASE,
      "lib/features.ts",
    );
    expect(fixed).toBe(true);
    expect(code).toContain('import { Star, LucideIcon } from "lucide-react";');
  });

  it("converts when binding is used via member access (config.apiUrl)", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(MEMBER_ACCESS_CASE, "lib/x.ts");
    expect(fixed).toBe(true);
    expect(code).toContain('import { config } from "@/lib/config";');
  });

  it("is idempotent — running twice gives no change on the second run", () => {
    const first = fixValueUsedFromTypeImport(JSX_TAG_CASE, "app/page.tsx");
    expect(first.fixed).toBe(true);
    const second = fixValueUsedFromTypeImport(first.code, "app/page.tsx");
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });

  // The prod gap: bindings used ONLY as object-literal values (`{ icon: X }`).
  // The leading `:` makes `classifyOccurrence` read them as a type annotation,
  // so the heuristic alone never flips them — yet tsc reports TS1361. The
  // diagnostic-driven caller passes the confirmed symbols to force the flip.
  const OBJECT_VALUE_ONLY_CASE = `import type { PawPrint, MoonStar } from "lucide-react";

const motifs = [
  { id: "paw", icon: PawPrint },
  { id: "moon", icon: MoonStar },
];
`;

  it("heuristic alone does NOT flip an object-literal-only value usage", () => {
    const result = fixValueUsedFromTypeImport(
      OBJECT_VALUE_ONLY_CASE,
      "components/motif-selector.tsx",
    );
    expect(result.fixed).toBe(false);
  });

  it("flips object-literal-only usage when the TS1361 symbol is confirmed", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      OBJECT_VALUE_ONLY_CASE,
      "components/motif-selector.tsx",
      new Set(["PawPrint", "MoonStar"]),
    );
    expect(fixed).toBe(true);
    expect(code).toContain('import { PawPrint, MoonStar } from "lucide-react";');
    expect(code).not.toContain("import type {");
  });

  const MULTILINE_TYPE_IMPORT_CASE = `import type {
  Clapperboard,
  Theater,
} from "lucide-react";

export default function Page() {
  return (
    <>
      <Clapperboard />
      <Theater />
    </>
  );
}
`;

  it("flips a multi-line `import type { … }` block (prod app/page.tsx shape)", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      MULTILINE_TYPE_IMPORT_CASE,
      "app/page.tsx",
    );
    expect(fixed).toBe(true);
    expect(code).not.toContain("import type {");
    expect(code).toContain('from "lucide-react"');
    expect(code).toContain("Clapperboard");
    expect(code).toContain("Theater");
  });

  it("is idempotent with a forced symbol set", () => {
    const first = fixValueUsedFromTypeImport(
      OBJECT_VALUE_ONLY_CASE,
      "components/motif-selector.tsx",
      new Set(["PawPrint", "MoonStar"]),
    );
    expect(first.fixed).toBe(true);
    const second = fixValueUsedFromTypeImport(
      first.code,
      "components/motif-selector.tsx",
      new Set(["PawPrint", "MoonStar"]),
    );
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });
});
