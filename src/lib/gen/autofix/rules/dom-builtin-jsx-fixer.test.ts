import { describe, expect, it } from "vitest";
import { fixDomBuiltinJsxTags, resolveHtmlInterfaceTag } from "./dom-builtin-jsx-fixer";

const PAIRED_FORM_CASE = `"use client";

export function ContactFormSection() {
  function handleSubmit() {}
  return (
    <HTMLFormElement onSubmit={handleSubmit} className="grid gap-4">
      <input name="email" />
      <button type="submit">Send</button>
    </HTMLFormElement>
  );
}
`;

const SELF_CLOSING_INPUT_CASE = `<HTMLInputElement name="email" type="email" />`;

const NESTED_CASE = `<HTMLDivElement className="wrap"><HTMLSpanElement>hi</HTMLSpanElement></HTMLDivElement>`;

const NO_MATCH_CASE = `function foo(e: React.FormEvent<HTMLFormElement>) {}`;

const UNKNOWN_INTERFACE_CASE = `<HTMLFooBarElement>fallback me</HTMLFooBarElement>`;

describe("fixDomBuiltinJsxTags", () => {
  it("rewrites the empirical <HTMLFormElement> case to lowercase <form>", () => {
    const { code, fixed, fixes } = fixDomBuiltinJsxTags(
      PAIRED_FORM_CASE,
      "components/contact-form-section.tsx",
    );
    expect(fixed).toBe(true);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].fixer).toBe("dom-builtin-jsx-fixer");
    expect(code).toContain("<form onSubmit={handleSubmit}");
    expect(code).toContain("</form>");
    expect(code).not.toContain("HTMLFormElement");
  });

  it("handles self-closing <HTMLInputElement />", () => {
    const { code, fixed } = fixDomBuiltinJsxTags(SELF_CLOSING_INPUT_CASE, "x.tsx");
    expect(fixed).toBe(true);
    expect(code).toBe('<input name="email" type="email" />');
  });

  it("handles multiple/nested interface tags in one pass", () => {
    const { code, fixed } = fixDomBuiltinJsxTags(NESTED_CASE, "x.tsx");
    expect(fixed).toBe(true);
    expect(code).toBe('<div className="wrap"><span>hi</span></div>');
  });

  it("does NOT touch TypeScript generic uses like React.FormEvent<HTMLFormElement>", () => {
    const { code, fixed } = fixDomBuiltinJsxTags(NO_MATCH_CASE, "x.tsx");
    expect(fixed).toBe(false);
    expect(code).toBe(NO_MATCH_CASE);
  });

  it("falls back to <div> for unknown HTMLxxxElement names and warns", () => {
    const { code, fixed, warnings } = fixDomBuiltinJsxTags(UNKNOWN_INTERFACE_CASE, "x.tsx");
    expect(fixed).toBe(true);
    expect(code).toBe("<div>fallback me</div>");
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("HTMLFooBarElement");
  });

  it("is idempotent", () => {
    const first = fixDomBuiltinJsxTags(PAIRED_FORM_CASE, "x.tsx");
    expect(first.fixed).toBe(true);
    const second = fixDomBuiltinJsxTags(first.code, "x.tsx");
    expect(second.fixed).toBe(false);
    expect(second.code).toBe(first.code);
  });
});

describe("resolveHtmlInterfaceTag", () => {
  it("maps known HTML interfaces to their lowercase tag", () => {
    expect(resolveHtmlInterfaceTag("HTMLFormElement")).toBe("form");
    expect(resolveHtmlInterfaceTag("HTMLInputElement")).toBe("input");
    expect(resolveHtmlInterfaceTag("HTMLAnchorElement")).toBe("a");
  });

  it("falls back to div for unknown HTML*Element names", () => {
    expect(resolveHtmlInterfaceTag("HTMLFooBarElement")).toBe("div");
  });

  it("returns null for identifiers that are not DOM interface names", () => {
    expect(resolveHtmlInterfaceTag("Hero")).toBeNull();
    expect(resolveHtmlInterfaceTag("Box")).toBeNull();
    expect(resolveHtmlInterfaceTag("Cuboid")).toBeNull();
    expect(resolveHtmlInterfaceTag("HTMLFormElementWrapper")).toBeNull();
  });
});
