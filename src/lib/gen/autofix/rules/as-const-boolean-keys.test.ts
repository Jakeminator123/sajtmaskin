import { describe, expect, it } from "vitest";
import { fixAsConstBooleanKeys } from "./as-const-boolean-keys";

const CCC_LIKE = `export const navigation = [
  { label: "Hem", href: "/#hem", featured: true },
  { label: "Meny", href: "/#menu" },
  { label: "Öppettider", href: "/#oppettider" },
  { label: "Kontakt", href: "/#kontakt" },
] as const;
`;

describe("fixAsConstBooleanKeys", () => {
  it("pads missing boolean keys on navigation as const array (ccc-like)", () => {
    const { code, fixed, fixes } = fixAsConstBooleanKeys(CCC_LIKE, "lib/site.ts");
    expect(fixed).toBe(true);
    expect(fixes.length).toBeGreaterThan(0);
    expect(code).toContain("featured: false");
    expect(code).toMatch(/Meny[\s\S]*featured: false/);
    expect(code).toMatch(/Öppettider[\s\S]*featured: false/);
    expect(code).toMatch(/Kontakt[\s\S]*featured: false/);
  });

  it("is idempotent on already padded arrays", () => {
    const first = fixAsConstBooleanKeys(CCC_LIKE, "lib/a.ts");
    expect(first.fixed).toBe(true);
    const second = fixAsConstBooleanKeys(first.code, "lib/a.ts");
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });

  it("does not touch arrays of strings (links name)", () => {
    const src = `export const links = [ "/a", "/b" ] as const;\n`;
    const { fixed, code } = fixAsConstBooleanKeys(src, "lib/x.ts");
    expect(fixed).toBe(false);
    expect(code).toBe(src);
  });

  it("pads disabled when mixed across objects", () => {
    const src = `export const navItems = [
  { label: "A", href: "/", disabled: true },
  { label: "B", href: "/b" },
] as const;
`;
    const { code, fixed } = fixAsConstBooleanKeys(src, "lib/n.ts");
    expect(fixed).toBe(true);
    expect(code).toContain("disabled: false");
  });
});
