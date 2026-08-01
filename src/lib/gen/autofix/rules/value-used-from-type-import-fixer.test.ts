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

// Empirical case from 2026-07-31 (chat 6fb29f8a..., version 636e2aca...).
// The sanity-cms dossier's seed-fallback file imported its two seed collections
// with `import type` and then spread them into an exported object literal. The
// bare `:` before each binding read as a type annotation, so the fixer left the
// file alone and the verifier reported it as a blocking runtime break.
const SEED_CONTENT_OBJECT_LITERAL_CASE = `import type { allCategories, blogPosts } from "@/lib/blog-data";
export const seedContent = {
  mode: "preview-seed",
  description:
    "Lokalt demoarkiv för F2-förhandsvisningen. Ett riktigt CMS kan kopplas in i integrationssteget.",
  posts: blogPosts,
  categories: allCategories,
} as const;
`;

// The mirror of the case above: the same `key: Binding` shape inside a type
// body must stay type-only, or the two import fixers start fighting.
const INTERFACE_MEMBER_CASE = `import type { BlogPost } from "@/lib/blog-data";

export interface Archive {
  posts: BlogPost;
}
`;

// The two shapes that defeat any lookbehind-based classifier. Both have a
// `key:` immediately to the left of the binding; only the enclosing structure
// tells them apart, and the enclosing structure is itself nested. The brace
// walk that preceded the AST got BOTH backwards — it read `nested: {` as a
// type annotation and the `,` in `Record<string, {` as a value position.
const NESTED_OBJECT_LITERAL_CASE = `import type { blogPosts } from "@/lib/blog-data";

export const seed = {
  nested: {
    posts: blogPosts,
  },
};
`;

const NESTED_TYPE_LITERAL_CASE = `import type { BlogPost } from "@/lib/blog-data";

export type Archive = Record<string, {
  posts: BlogPost;
}>;
`;

// Generic type arguments, tuples and a `typeof` inside a type are all
// compile-time references. A `typeof` in an EXPRESSION is not — same keyword,
// opposite answer, which is precisely what the parser resolves for free.
const GENERIC_AND_TUPLE_TYPE_CASE = `import type { BlogPost, Category } from "@/lib/blog-data";

export type Pair = [BlogPost, Category];
export type Lookup = Map<string, BlogPost>;
export type Snapshot = typeof Category;
`;

// Braces and colons inside strings and comments must not shift the verdict.
const BRACES_IN_STRINGS_CASE = `import type { blogPosts } from "@/lib/blog-data";

// A comment with a stray brace { posts: BlogPost
const template = "{ posts: BlogPost }";

export const seed = { posts: blogPosts, template };
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

  it("converts the empirical seed-content case (object-literal property values)", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      SEED_CONTENT_OBJECT_LITERAL_CASE,
      "lib/sanity/seed-content.ts",
    );
    expect(fixed).toBe(true);
    expect(code).toContain('import { allCategories, blogPosts } from "@/lib/blog-data";');
    expect(code).not.toContain("import type { allCategories");
  });

  it("leaves an interface member as a type import", () => {
    const result = fixValueUsedFromTypeImport(INTERFACE_MEMBER_CASE, "lib/archive.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(INTERFACE_MEMBER_CASE);
  });

  it("converts a value nested two object literals deep", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      NESTED_OBJECT_LITERAL_CASE,
      "lib/seed.ts",
    );
    expect(fixed).toBe(true);
    expect(code).toContain('import { blogPosts } from "@/lib/blog-data";');
  });

  it("leaves a type nested inside a generic type literal alone", () => {
    const result = fixValueUsedFromTypeImport(NESTED_TYPE_LITERAL_CASE, "lib/archive.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(NESTED_TYPE_LITERAL_CASE);
  });

  it("leaves generics, tuples and a type-position `typeof` alone", () => {
    const result = fixValueUsedFromTypeImport(
      GENERIC_AND_TUPLE_TYPE_CASE,
      "lib/archive.ts",
    );
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(GENERIC_AND_TUPLE_TYPE_CASE);
  });

  it("ignores braces and colons that only appear in strings and comments", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      BRACES_IN_STRINGS_CASE,
      "lib/seed.ts",
    );
    expect(fixed).toBe(true);
    expect(code).toContain('import { blogPosts } from "@/lib/blog-data";');
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

  // Bindings used ONLY as object-literal values (`{ icon: X }`). The leading
  // `:` used to read as a type annotation, so the heuristic left these alone
  // and only the diagnostic-driven caller could flip them — which meant the
  // fix never arrived when the verify lane failed before typecheck ran (a
  // disk-full install, 2026-07-31). The classifier now checks the enclosing
  // block: an object literal is a value position, an interface body is not.
  const OBJECT_VALUE_ONLY_CASE = `import type { PawPrint, MoonStar } from "lucide-react";

const motifs = [
  { id: "paw", icon: PawPrint },
  { id: "moon", icon: MoonStar },
];
`;

  it("flips an object-literal-only value usage from the heuristic alone", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      OBJECT_VALUE_ONLY_CASE,
      "components/motif-selector.tsx",
    );
    expect(fixed).toBe(true);
    expect(code).toContain('import { PawPrint, MoonStar } from "lucide-react";');
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

// Lokal shadowing: en deklaration i filen återanvänder det importerade namnet,
// så värdereferensen pekar med all sannolikhet på SKUGGAN, inte på importen.
// Att ändå promota `import type` till en värdeimport drar in ett
// runtime-beroende (och kör modulens sidoeffekter) i en fil som aldrig bad om
// det. Analysen räknar därför skuggan som `unknown`, och `unknown` blockerar.
describe("fixValueUsedFromTypeImport — lokal shadowing blockerar konverteringen", () => {
  const SHADOWED_CONST_CASE = `import type { Badge } from "@/components/ui/badge";

export function List() {
  const Badge = () => <span />;
  return <Badge />;
}
`;

  const SHADOWED_PARAM_CASE = `import type { Icon } from "@/lib/icons";

export function render(Icon: () => string) {
  return Icon();
}
`;

  it("konverterar inte när ett lokalt const skuggar det importerade namnet", () => {
    const result = fixValueUsedFromTypeImport(SHADOWED_CONST_CASE, "app/list.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(SHADOWED_CONST_CASE);
  });

  it("konverterar inte när en parameter skuggar det importerade namnet", () => {
    const result = fixValueUsedFromTypeImport(SHADOWED_PARAM_CASE, "lib/render.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(SHADOWED_PARAM_CASE);
  });

  // Escape-hatchen ska överleva grinden: TS1361 från kompilatorn är bevis på
  // att just den importen används som värde, till skillnad från den lokala
  // gissningen ovan.
  it("låter compiler-bekräftad TS1361 vinna över skuggningen", () => {
    const result = fixValueUsedFromTypeImport(
      SHADOWED_CONST_CASE,
      "app/list.tsx",
      new Set(["Badge"]),
    );
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('import { Badge } from "@/components/ui/badge";');
  });
});

// Inline-specifier-formen (prod chat 85f8db72, 2026-07-29): booking-form
// type-only-importerade `sv` och använde det som `locale:`-värde. Bara
// statement-formen (`import type { … }`) täcktes, så reparationen gav upp.
describe("fixValueUsedFromTypeImport — inline `{ type X }`-specifier", () => {
  const INLINE_TYPE_VALUE_CASE = `"use client";

import { format, type sv } from "date-fns";

export function BookingForm({ date }: { date: Date }) {
  return <p>{format(date, "PPP", { locale: sv })}</p>;
}
`;

  const INLINE_TYPE_ONLY_CASE = `import { useState, type FC } from "react";

export const Page: FC = () => {
  const [n] = useState(0);
  return <span>{n}</span>;
};
`;

  const INLINE_ALIAS_CASE = `import { format, type Locale as AppLocale } from "date-fns";

export const locale = AppLocale;
export const label = format(new Date(), "PPP");
`;

  it("tar bort `type`-nyckelordet från exakt den värde-använda specifiern", () => {
    const { code, fixed, convertedSymbols } = fixValueUsedFromTypeImport(
      INLINE_TYPE_VALUE_CASE,
      "components/booking-form.tsx",
    );
    expect(fixed).toBe(true);
    expect(convertedSymbols).toEqual(["sv"]);
    expect(code).toContain('import { format, sv } from "date-fns";');
    expect(code).not.toContain("type sv");
  });

  it("tar bort `type` för compiler-bekräftad symbol (forceValueSymbols)", () => {
    const { code, fixed } = fixValueUsedFromTypeImport(
      INLINE_TYPE_VALUE_CASE,
      "components/booking-form.tsx",
      new Set(["sv"]),
    );
    expect(fixed).toBe(true);
    expect(code).toContain('import { format, sv } from "date-fns";');
  });

  it("lämnar en genuint type-only inline-specifier orörd", () => {
    const result = fixValueUsedFromTypeImport(
      INLINE_TYPE_ONLY_CASE,
      "app/page.tsx",
    );
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(INLINE_TYPE_ONLY_CASE);
  });

  it("hanterar aliasade inline-specifiers (`type X as Y`)", () => {
    const { code, fixed, convertedSymbols } = fixValueUsedFromTypeImport(
      INLINE_ALIAS_CASE,
      "lib/locale.ts",
    );
    expect(fixed).toBe(true);
    expect(convertedSymbols).toEqual(["AppLocale"]);
    expect(code).toContain(
      'import { format, Locale as AppLocale } from "date-fns";',
    );
  });

  it("är idempotent på inline-formen", () => {
    const first = fixValueUsedFromTypeImport(
      INLINE_TYPE_VALUE_CASE,
      "components/booking-form.tsx",
    );
    expect(first.fixed).toBe(true);
    const second = fixValueUsedFromTypeImport(
      first.code,
      "components/booking-form.tsx",
    );
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });
});
