import { describe, expect, it } from "vitest";
import { fixLeakedMediaAliases } from "./media-alias-fixer";
import { expandUrls } from "@/lib/gen/url-compress";

describe("media-alias-fixer (M#oc1)", () => {
  it("replaces a leaked {{MEDIA_n}} alias with a placeholder URL", () => {
    const code = `<Image src="{{MEDIA_0}}" alt="Hero" fill />`;
    const result = fixLeakedMediaAliases(code);
    expect(result.count).toBe(1);
    expect(result.aliases).toEqual(["MEDIA_0"]);
    expect(result.code).toContain("/placeholder.svg?height=400&width=600&text=MEDIA_0");
    expect(result.code).not.toContain("{{");
  });

  it("tolerates whitespace and dash separators", () => {
    const code = `const og = "{{ MEDIA_3 }}"; const tw = "{{URL-2}}";`;
    const result = fixLeakedMediaAliases(code);
    expect(result.count).toBe(2);
    expect(result.code).toContain("text=MEDIA_3");
    expect(result.code).toContain("text=URL_2");
    expect(result.code).not.toMatch(/\{\{/);
  });

  it("counts every occurrence, not just unique aliases", () => {
    const code = `a="{{MEDIA_1}}" b="{{MEDIA_1}}" c="{{MEDIA_2}}"`;
    const result = fixLeakedMediaAliases(code);
    expect(result.count).toBe(3);
    expect(result.aliases).toEqual(["MEDIA_1", "MEDIA_2"]);
  });

  it("leaves unrelated double-brace content alone", () => {
    const code = `const tpl = "{{userName}}"; const style = "{{ color }}";`;
    const result = fixLeakedMediaAliases(code);
    expect(result.count).toBe(0);
    expect(result.code).toBe(code);
  });

  it("no-ops fast on content without braces", () => {
    const code = `export const x = 1;`;
    expect(fixLeakedMediaAliases(code).code).toBe(code);
  });
});

describe("expandUrls tolerant alias matching (M#oc1)", () => {
  it("expands spaced and dashed aliases via the urlMap", () => {
    const urlMap = { MEDIA_0: "https://example.com/very/long/image-url.jpg" };
    expect(expandUrls("src: {{ MEDIA_0 }}", urlMap)).toBe(
      "src: https://example.com/very/long/image-url.jpg",
    );
    expect(expandUrls("src: {{MEDIA-0}}", urlMap)).toBe(
      "src: https://example.com/very/long/image-url.jpg",
    );
  });

  it("still falls back to a placeholder for unresolved aliases", () => {
    expect(expandUrls("src: {{MEDIA_9}}", {})).toContain("/placeholder.svg");
  });
});
