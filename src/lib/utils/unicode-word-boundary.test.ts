import { describe, expect, it } from "vitest";
import {
  UNICODE_WB_LEFT,
  UNICODE_WB_RIGHT,
  containsUnicodeWord,
  escapeRegexLiteral,
  uWord,
  uWordRegex,
} from "./unicode-word-boundary";

describe("unicode-word-boundary", () => {
  describe("regression: where ASCII \\b silently fails", () => {
    it("matches Swedish words starting with ä/ö/å where \\b fails", () => {
      expect(uWordRegex("ändra").test("Ändra rubriken")).toBe(true);
      expect(uWordRegex("öka").test("Öka textstorleken")).toBe(true);
      expect(uWordRegex("återställ").test("Nu får du återställ allt")).toBe(true);

      expect(/\bändra\b/i.test("Ändra rubriken")).toBe(false);
      expect(/\böka\b/i.test("Öka textstorleken")).toBe(false);
    });

    it("matches Swedish words ending with ä/ö/å where \\b fails", () => {
      expect(uWordRegex("naturmiljö").test("en vacker naturmiljö här")).toBe(true);
      expect(uWordRegex("klippmiljö").test("visa klippmiljö i bild")).toBe(true);

      expect(/\bnaturmiljö\b/i.test("en vacker naturmiljö här")).toBe(false);
      expect(/\bklippmiljö\b/i.test("visa klippmiljö i bild")).toBe(false);
    });
  });

  describe("uWord (source-string helper)", () => {
    it("wraps an inner pattern with both lookarounds", () => {
      expect(uWord("foo")).toBe(`${UNICODE_WB_LEFT}(?:foo)${UNICODE_WB_RIGHT}`);
    });

    it("supports alternation and optional subpatterns inside", () => {
      const src = uWord("ändra|byt|lägg\\s+till");
      const rx = new RegExp(src, "iu");
      expect(rx.test("Byt rubriken till Hej")).toBe(true);
      expect(rx.test("Lägg    till en sektion")).toBe(true);
      expect(rx.test("Ändra texten")).toBe(true);
      expect(rx.test("överändrat")).toBe(false);
    });
  });

  describe("uWordRegex (compiled helper)", () => {
    it("always enforces the u-flag so \\p{L} works", () => {
      expect(uWordRegex("ändra", "i").flags).toContain("u");
      expect(uWordRegex("ändra", "gi").flags).toContain("u");
      expect(uWordRegex("ändra", "iu").flags).toBe("iu");
    });

    it("anchors on word boundaries in both directions", () => {
      const rx = uWordRegex("ändra", "iu");
      expect(rx.test("Ändra")).toBe(true);
      expect(rx.test("ändra nu")).toBe(true);
      expect(rx.test("överändra")).toBe(false);
      expect(rx.test("ändrade")).toBe(false);
    });

    it("does not match across a trailing digit, underscore, or letter", () => {
      const rx = uWordRegex("färg", "iu");
      expect(rx.test("välj färg")).toBe(true);
      expect(rx.test("färg1")).toBe(false);
      expect(rx.test("färger")).toBe(false);
      expect(rx.test("färg_primary")).toBe(false);
    });
  });

  describe("containsUnicodeWord", () => {
    it("returns true when any alternative matches", () => {
      expect(
        containsUnicodeWord("Byt rubriken till Hej", ["ändra", "byt", "fixa"]),
      ).toBe(true);
    });

    it("returns false when none match", () => {
      expect(
        containsUnicodeWord("nothing to see here", ["ändra", "byt"]),
      ).toBe(false);
    });

    it("returns false for empty inputs without throwing", () => {
      expect(containsUnicodeWord("", ["ändra"])).toBe(false);
      expect(containsUnicodeWord("text", [])).toBe(false);
    });
  });

  describe("escapeRegexLiteral", () => {
    it("escapes regex metacharacters so user input stays literal", () => {
      const needle = "a.b+c(d)";
      const rx = uWordRegex(escapeRegexLiteral(needle));
      expect(rx.test("say a.b+c(d) now")).toBe(true);
      expect(rx.test("say axbxcxdx now")).toBe(false);
    });
  });
});
