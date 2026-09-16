import { describe, expect, it } from "vitest";
import { getAllScaffolds } from "../scaffolds/registry";
import {
  countBracketPlaceholders,
  isScaffoldBracketPlaceholder,
} from "./bracket-placeholders";

describe("isScaffoldBracketPlaceholder", () => {
  it("recognizes the tokens #1425 added to portfolio and blog", () => {
    expect(isScaffoldBracketPlaceholder("Namn")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Författare")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Publikation")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Rubrik för publikationen")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Kort om vilka ämnen som publiceras här.")).toBe(true);
    expect(isScaffoldBracketPlaceholder("En mening om det utvalda arbetet")).toBe(true);
  });

  it("still recognizes the previous allowlist and numbered shop tokens", () => {
    expect(isScaffoldBracketPlaceholder("Butiksnamn")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Produktnamn")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Produktnamn 1")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Kundens namn")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Roll")).toBe(true);
    expect(isScaffoldBracketPlaceholder("Company Name")).toBe(true);
    expect(isScaffoldBracketPlaceholder("produkttyp")).toBe(true);
  });

  it("ignores Next.js params, Tailwind arbitrary values, and mapped types", () => {
    expect(isScaffoldBracketPlaceholder("slug")).toBe(false);
    expect(isScaffoldBracketPlaceholder("id")).toBe(false);
    expect(isScaffoldBracketPlaceholder("0.2em")).toBe(false);
    expect(isScaffoldBracketPlaceholder("title, items")).toBe(false);
    expect(isScaffoldBracketPlaceholder("Key in keyof T")).toBe(false);
    expect(isScaffoldBracketPlaceholder("K")).toBe(false);
  });
});

describe("countBracketPlaceholders", () => {
  it("counts leftover copy without flagging dynamic routes", () => {
    const content = [
      'title: "[Namn]"',
      'author: "[Författare]"',
      "<h1>[Publikation]</h1>",
      "<p>[Rubrik för publikationen]</p>",
      "const post = posts[slug];",
      "app/blog/[slug]/page.tsx",
      'className="tracking-[0.2em]"',
    ].join("\n");

    expect(countBracketPlaceholders(content)).toBe(4);
  });

  it("does not flag TypeScript index access or tuple-looking type params", () => {
    const content = [
      "type Value<T, K extends keyof T> = T[K];",
      "type FromFoo = Foo[Key];",
      "const value = records[Key];",
      "const nested = getMap()[Key];",
      "const optional = record?.[Key];",
      "type Pair = [Key, Value];",
      "export default function Page() { return <h1>[Namn]</h1>; }",
    ].join("\n");

    expect(countBracketPlaceholders(content)).toBe(1);
  });

  it("flags the new portfolio and blog leftovers in the real scaffold files", () => {
    const portfolioHome = getAllScaffolds()
      .find((scaffold) => scaffold.id === "portfolio")
      ?.files.find((file) => file.path === "app/page.tsx");
    const blogHome = getAllScaffolds()
      .find((scaffold) => scaffold.id === "blog")
      ?.files.find((file) => file.path === "app/page.tsx");

    expect(portfolioHome?.content).toContain("[Namn]");
    expect(blogHome?.content).toContain("[Författare]");
    expect(blogHome?.content).toContain("[Publikation]");
    expect(blogHome?.content).toContain("[Rubrik för publikationen]");
    expect(countBracketPlaceholders(portfolioHome?.content ?? "")).toBeGreaterThan(0);
    expect(countBracketPlaceholders(blogHome?.content ?? "")).toBeGreaterThan(0);
  });
});
