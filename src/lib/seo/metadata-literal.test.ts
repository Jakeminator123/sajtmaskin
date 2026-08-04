/**
 * The metadata literal reader/writer is the one place in the SEO pass where a
 * mistake ships a project that does not compile, so these tests are written
 * against the shapes that actually broke the regex it replaced.
 */

import { describe, expect, it } from "vitest";

import {
  findMetadataObject,
  readMetadataString,
  toSafeStringLiteral,
  writeMetadataString,
} from "./metadata-literal";

const LAYOUT = `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hem",
  description: "Frisör.",
  openGraph: {
    title: "OG-titel",
    locale: "sv_SE",
  },
};

export default function RootLayout() { return null; }
`;

describe("readMetadataString", () => {
  it("reads the top-level key, not a nested one with the same name", () => {
    expect(readMetadataString(LAYOUT, "title")).toEqual({ kind: "literal", value: "Hem" });
  });

  it("decodes escapes instead of measuring the source text", () => {
    // `title-too-long` is decided on length, so the audit must count the
    // characters a reader sees, not the backslashes the file happens to carry.
    const source = 'export const metadata = {\n  title: "He said \\"hi\\"",\n};';
    expect(readMetadataString(source, "title")).toEqual({
      kind: "literal",
      value: 'He said "hi"',
    });
  });

  it("reports a computed value as dynamic, not as missing", () => {
    const source = "export const metadata = {\n  title: getTitle(),\n};";
    expect(readMetadataString(source, "title")).toEqual({ kind: "dynamic" });
  });

  it("treats a template with a hole as dynamic", () => {
    const source = "export const metadata = {\n  title: `${brand} — Hem`,\n};";
    expect(readMetadataString(source, "title")).toEqual({ kind: "dynamic" });
  });

  it("reads a template without holes as the literal it is", () => {
    const source = "export const metadata = {\n  title: `Hem`,\n};";
    expect(readMetadataString(source, "title")).toEqual({ kind: "literal", value: "Hem" });
  });

  it("finds metadata returned from generateMetadata", () => {
    const source = [
      "export async function generateMetadata() {",
      "  return { title: 'Hem', description: 'Kort.' };",
      "}",
    ].join("\n");
    expect(readMetadataString(source, "description")).toEqual({
      kind: "literal",
      value: "Kort.",
    });
  });

  it("does not match a key that is only a suffix of another", () => {
    const source = 'export const metadata = {\n  pageTitle: "Fel",\n};';
    expect(readMetadataString(source, "title")).toEqual({ kind: "missing" });
  });

  it("ignores a key that only appears in a comment", () => {
    const source = 'export const metadata = {\n  // title: "kommentar"\n  description: "D",\n};';
    expect(readMetadataString(source, "title")).toEqual({ kind: "missing" });
  });

  it("answers missing when there is no metadata export at all", () => {
    expect(readMetadataString('const a = { title: "one" };', "title")).toEqual({
      kind: "missing",
    });
  });
});

describe("findMetadataObject", () => {
  it("spans the whole object including nested braces", () => {
    const object = findMetadataObject(LAYOUT);
    expect(object).not.toBeNull();
    const text = LAYOUT.slice(object!.start, object!.end);
    expect(text.startsWith("{")).toBe(true);
    expect(text.endsWith("}")).toBe(true);
    expect(text).toContain("openGraph");
  });
});

describe("toSafeStringLiteral", () => {
  it("encodes a newline as an escape rather than a real line break", () => {
    // This is the bug that shipped non-compiling layouts: a model reply with a
    // line break used to be spliced in verbatim, ending the string literal.
    expect(toSafeStringLiteral("rad1\nrad2")).toBe('"rad1\\nrad2"');
  });

  it("encodes quotes, backslashes and template holes as text", () => {
    expect(toSafeStringLiteral('a "b" \\ ${c}')).toBe('"a \\"b\\" \\\\ ${c}"');
  });

  it("escapes the line separators that older toolchains still reject", () => {
    expect(toSafeStringLiteral("a\u2028b")).toBe('"a\\u2028b"');
  });
});

describe("writeMetadataString", () => {
  it("rewrites the top-level title and leaves the Open Graph one alone", () => {
    const out = writeMetadataString(LAYOUT, "title", "Ny titel");
    expect(out).toContain('title: "Ny titel"');
    expect(out).toContain('title: "OG-titel"');
  });

  it("survives a value that would have broken the old regex", () => {
    const out = writeMetadataString(LAYOUT, "title", 'Vi kallar det "drop-in"\nalltid');
    expect(out).toContain('title: "Vi kallar det \\"drop-in\\"\\nalltid"');
    // The rest of the file must be untouched and still balanced.
    expect(out).toContain('description: "Frisör."');
    expect(out.split("\n")).toHaveLength(LAYOUT.split("\n").length);
  });

  it("replaces an already-escaped literal in full, not a truncated span", () => {
    const source = 'export const metadata = {\n  title: "He said \\"hi\\"",\n};';
    const out = writeMetadataString(source, "title", "Ren titel");
    expect(out).toBe('export const metadata = {\n  title: "Ren titel",\n};');
  });

  it("refuses to overwrite a computed value", () => {
    const source = "export const metadata = {\n  title: getTitle(),\n};";
    expect(writeMetadataString(source, "title", "Ny")).toBe(source);
  });

  it("refuses to overwrite a template literal with a hole", () => {
    const source = "export const metadata = {\n  title: `${brand} — Hem`,\n};";
    expect(writeMetadataString(source, "title", "Ny")).toBe(source);
  });

  it("returns the source unchanged when there is no metadata export", () => {
    const source = 'const a = { title: "one" };\nconst b = { title: "two" };';
    expect(writeMetadataString(source, "title", "ny")).toBe(source);
  });

  it("inserts a missing top-level key into an existing metadata object", () => {
    const source = 'export const metadata: Metadata = {\n  description: "x"\n};';
    const out = writeMetadataString(source, "title", "My Title");
    expect(out).toContain('title: "My Title"');
    expect(out).toContain('description: "x"');
    expect(readMetadataString(out, "title")).toEqual({
      kind: "literal",
      value: "My Title",
    });
  });

  it("inserts a missing key into an empty metadata object", () => {
    const source = "export const metadata = {\n};";
    const out = writeMetadataString(source, "title", "My Title");
    expect(out).toContain('title: "My Title"');
    expect(readMetadataString(out, "title")).toEqual({
      kind: "literal",
      value: "My Title",
    });
  });

  it("does not let a trailing line comment swallow the separating comma", () => {
    // Appending after the last property would put the comma inside `// viktig`
    // and ship a layout that no longer parses.
    const source = 'export const metadata = {\n  description: "x" // viktig\n};';
    const out = writeMetadataString(source, "title", "My Title");
    expect(out).toBe(
      'export const metadata = {\n  title: "My Title",\n  description: "x" // viktig\n};',
    );
  });

  it("inserts next to a multiline template literal without corrupting it", () => {
    const source = "export const metadata = {\n  description: `line1\nline2`\n};";
    const out = writeMetadataString(source, "title", "My Title");
    expect(readMetadataString(out, "title")).toEqual({
      kind: "literal",
      value: "My Title",
    });
    expect(out).toContain("`line1\nline2`");
  });
});
