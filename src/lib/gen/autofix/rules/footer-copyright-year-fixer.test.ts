import { describe, expect, it } from "vitest";
import { fixFooterCopyrightYear } from "./footer-copyright-year-fixer";

const FOOTER_WITH_LIVE_YEAR = `export function SiteFooter() {
  return (
    <footer>
      <p>&copy; {new Date().getFullYear()} Bolaget. Alla rättigheter förbehållna.</p>
    </footer>
  );
}
`;

describe("fixFooterCopyrightYear", () => {
  it("fails before the rewrite (live new Date() still present) and passes after", () => {
    expect(FOOTER_WITH_LIVE_YEAR).toMatch(/\bnew\s+Date\s*\(\s*\)/);

    const result = fixFooterCopyrightYear(
      FOOTER_WITH_LIVE_YEAR,
      "components/site-footer.tsx",
      2026,
    );

    expect(result.fixed).toBe(true);
    expect(result.fixes[0]?.fixer).toBe("footer-copyright-year-fixer");
    expect(result.code).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
    expect(result.code).toContain("{2026}");
    expect(result.code).toContain("Bolaget");
  });

  it("rewrites a const year = new Date().getFullYear() in the footer file", () => {
    const src = `export function SiteFooter() {
  const year = new Date().getFullYear();
  return <footer>© {year}</footer>;
}
`;
    const result = fixFooterCopyrightYear(src, "src/components/site-footer.tsx", 2026);
    expect(result.fixed).toBe(true);
    expect(result.code).toContain("const year = 2026;");
    expect(result.code).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
  });

  it("rewrites .toString() to a string literal so 2026.toString() is not emitted", () => {
    const src = `export function SiteFooter() {
  return <footer>© {new Date().getFullYear().toString()}</footer>;
}
`;
    const result = fixFooterCopyrightYear(src, "components/site-footer.tsx", 2026);
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('{"2026"}');
    expect(result.code).not.toContain("toString");
    expect(result.code).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
  });

  it("is a no-op on non-footer files even when they contain the same call", () => {
    const src = `export function Clock() {
  return <time>{new Date().getFullYear()}</time>;
}
`;
    const result = fixFooterCopyrightYear(src, "components/hero.tsx", 2026);
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(src);
  });

  it("does not rewrite new Date(arg).getFullYear() or other Date methods", () => {
    const src = `export function SiteFooter() {
  const founded = new Date("2020-01-01").getFullYear();
  const iso = new Date().toISOString();
  return <footer>{founded} {iso}</footer>;
}
`;
    const result = fixFooterCopyrightYear(src, "components/site-footer.tsx", 2026);
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(src);
  });

  it("accepts Windows paths and is idempotent after the rewrite", () => {
    const first = fixFooterCopyrightYear(
      FOOTER_WITH_LIVE_YEAR,
      "components\\site-footer.tsx",
      2026,
    );
    expect(first.fixed).toBe(true);
    const second = fixFooterCopyrightYear(first.code, "components\\site-footer.tsx", 2026);
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });
});
