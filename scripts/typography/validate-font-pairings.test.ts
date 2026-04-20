import { describe, expect, it } from "vitest";

import {
  buildKnownFontNameSet,
  validateVariantFonts,
  type VariantInput,
} from "./validate-font-pairings";

const FAKE_REGISTRY = {
  Inter: { displayName: "Inter", variable: "--font-sans", category: "sans-serif" as const },
  Plus_Jakarta_Sans: {
    displayName: "Plus Jakarta Sans",
    variable: "--font-sans",
    category: "sans-serif" as const,
  },
  JetBrains_Mono: {
    displayName: "JetBrains Mono",
    variable: "--font-mono",
    category: "mono" as const,
  },
};

const FAKE_IMPORT_NAMES = new Set(Object.keys(FAKE_REGISTRY));

describe("validateVariantFonts", () => {
  it("returns no violations when every referenced font is known", () => {
    const known = buildKnownFontNameSet(FAKE_REGISTRY, FAKE_IMPORT_NAMES);
    const variants: VariantInput[] = [
      {
        filePath: "config/scaffold-variants/x/ok.json",
        pairings: [
          { heading: "Plus Jakarta Sans", body: "Inter" },
          { heading: "JetBrains Mono", body: "Inter" },
        ],
      },
    ];

    expect(validateVariantFonts(variants, known)).toEqual([]);
  });

  it("flags an unknown font with a precise location", () => {
    const known = buildKnownFontNameSet(FAKE_REGISTRY, FAKE_IMPORT_NAMES);
    const variants: VariantInput[] = [
      {
        filePath: "config/scaffold-variants/x/bad.json",
        pairings: [
          { heading: "Inter", body: "Inter" },
          { heading: "Made Up Font", body: "Inter" },
        ],
      },
    ];

    const violations = validateVariantFonts(variants, known);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      variantFile: "config/scaffold-variants/x/bad.json",
      pairingIndex: 1,
      fontField: "heading",
      fontName: "Made Up Font",
    });
  });

  it("accepts the import-key form (e.g. Plus_Jakarta_Sans) as well as the displayName", () => {
    const known = buildKnownFontNameSet(FAKE_REGISTRY, FAKE_IMPORT_NAMES);
    const variants: VariantInput[] = [
      {
        filePath: "config/scaffold-variants/x/import-key.json",
        pairings: [{ heading: "Plus_Jakarta_Sans", body: "Inter" }],
      },
    ];

    expect(validateVariantFonts(variants, known)).toEqual([]);
  });

  it("ignores variants whose pairings field is missing or malformed", () => {
    const known = buildKnownFontNameSet(FAKE_REGISTRY, FAKE_IMPORT_NAMES);
    const variants: VariantInput[] = [
      { filePath: "a.json", pairings: undefined },
      { filePath: "b.json", pairings: "not-an-array" },
      { filePath: "c.json", pairings: [null, { heading: 42, body: "" }] },
    ];

    expect(validateVariantFonts(variants, known)).toEqual([]);
  });
});
