import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  listProjectFiles,
  readProjectFile,
  searchProjectFiles,
  type ProjectFile,
} from "./project-files";

function file(path: string, content = `${path}\n`, language?: string): ProjectFile {
  return language ? { path, content, language } : { path, content };
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

describe("listProjectFiles", () => {
  it("lists a page, continues from a v1 cursor, and filters by prefix", () => {
    const files = [
      file("src/b.ts", "b", "ts"),
      file("README.md", "# hi", "md"),
      file("src/a.ts", "a", "ts"),
      file("src/c.ts", "c", "ts"),
      file("docs/note.md", "n", "md"),
    ];

    const first = listProjectFiles({ files, prefix: "src", limit: 2 });
    expect(first.files.map((entry) => entry.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(first.nextCursor).toBe("v1:2");
    expect(first.files[0]).toEqual({
      path: "src/a.ts",
      bytes: Buffer.byteLength("a", "utf8"),
      language: "ts",
      sha256: sha256("a"),
    });

    const second = listProjectFiles({ files, prefix: "src", cursor: "v1:2", limit: 2 });
    expect(second.files.map((entry) => entry.path)).toEqual(["src/c.ts"]);
    expect(second.nextCursor).toBeNull();

    const allSrc = listProjectFiles({ files, prefix: "src/" });
    expect(allSrc.files.map((entry) => entry.path)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(allSrc.nextCursor).toBeNull();
  });

  it("omits restricted files so list never leaks that they exist", () => {
    const files = [
      file("src/app.ts", "export {}", "ts"),
      file(".env", "SECRET=1"),
      file(".env.local", "SECRET=2"),
      file("certs/site.pem", "-----BEGIN-----"),
      file("keys/id_rsa", "-----BEGIN-----"),
      file("package-lock.json", "{}"),
      file("pnpm-lock.yaml", "lockfileVersion: 9"),
      file("yarn.lock", "# yarn"),
      file(".npmrc", "registry=https://example.invalid"),
      file("service-account.json", "{}"),
      file("config/credentials.json", "{}"),
      file("lib/api-secret.ts", "nope"),
    ];

    const listed = listProjectFiles({ files });
    expect(listed.files.map((entry) => entry.path)).toEqual(["src/app.ts"]);
  });

  it("returns an empty page when the cursor is at or past the list end", () => {
    const files = [file("a.ts", "a"), file("b.ts", "b")];
    expect(listProjectFiles({ files, cursor: "v1:2" })).toEqual({ files: [], nextCursor: null });
    expect(listProjectFiles({ files, cursor: "v1:99" })).toEqual({ files: [], nextCursor: null });
  });

  it("fails closed on a malformed cursor", () => {
    const files = [file("a.ts", "a"), file("b.ts", "b")];
    expect(listProjectFiles({ files, cursor: "v2:0" })).toEqual({ files: [], nextCursor: null });
    expect(listProjectFiles({ files, cursor: "v1:-1" })).toEqual({ files: [], nextCursor: null });
    expect(listProjectFiles({ files, cursor: "nope" })).toEqual({ files: [], nextCursor: null });
  });

  it("caps the page size at 100 and defaults to 50", () => {
    const files = Array.from({ length: 120 }, (_, i) => file(`f${String(i).padStart(3, "0")}.ts`, "x"));
    const defaultPage = listProjectFiles({ files });
    expect(defaultPage.files).toHaveLength(50);
    expect(defaultPage.nextCursor).toBe("v1:50");

    const oversized = listProjectFiles({ files, limit: 500 });
    expect(oversized.files).toHaveLength(100);
    expect(oversized.nextCursor).toBe("v1:100");
  });
});

describe("readProjectFile", () => {
  it("reads a file and a requested line range", () => {
    const content = ["one", "two", "three", "four"].join("\n");
    const files = [file("src/app.ts", content, "ts")];

    expect(readProjectFile({ files, path: "src/app.ts" })).toEqual({
      ok: true,
      path: "src/app.ts",
      content,
      startLine: 1,
      endLine: 4,
      truncated: false,
    });

    expect(readProjectFile({ files, path: "src/app.ts", startLine: 2, endLine: 3 })).toEqual({
      ok: true,
      path: "src/app.ts",
      content: "two\nthree",
      startLine: 2,
      endLine: 3,
      truncated: false,
    });
  });

  it("truncates oversized line and character windows instead of throwing", () => {
    const manyLines = Array.from({ length: 300 }, (_, i) => `L${i + 1}`).join("\n");
    const longLine = "x".repeat(25_000);
    const files = [file("src/long.ts", manyLines), file("src/wide.ts", longLine)];

    const lined = readProjectFile({ files, path: "src/long.ts" });
    expect(lined.ok).toBe(true);
    if (lined.ok) {
      expect(lined.startLine).toBe(1);
      expect(lined.endLine).toBe(250);
      expect(lined.truncated).toBe(true);
      expect(lined.content.split("\n")).toHaveLength(250);
    }

    const wide = readProjectFile({ files, path: "src/wide.ts" });
    expect(wide.ok).toBe(true);
    if (wide.ok) {
      expect(wide.truncated).toBe(true);
      expect(wide.content).toHaveLength(20_000);
    }
  });

  it("rejects path traversal, absolute paths, and backslashes", () => {
    const files = [file("src/app.ts", "ok")];
    expect(readProjectFile({ files, path: "../secret" })).toEqual({ ok: false, code: "invalid_path" });
    expect(readProjectFile({ files, path: "/etc/passwd" })).toEqual({ ok: false, code: "invalid_path" });
    expect(readProjectFile({ files, path: "foo\\bar" })).toEqual({ ok: false, code: "invalid_path" });
    expect(readProjectFile({ files, path: "foo/../../etc/passwd" })).toEqual({
      ok: false,
      code: "invalid_path",
    });
    expect(readProjectFile({ files, path: "" })).toEqual({ ok: false, code: "invalid_path" });
    expect(readProjectFile({ files, path: "." })).toEqual({ ok: false, code: "invalid_path" });
    expect(readProjectFile({ files, path: "foo//bar" })).toEqual({ ok: false, code: "invalid_path" });
  });

  it("denies restricted env and pem paths without leaking existence", () => {
    const files = [file(".env", "SECRET=1"), file("certs/site.pem", "-----BEGIN-----")];
    expect(readProjectFile({ files, path: ".env" })).toEqual({ ok: false, code: "restricted_path" });
    expect(readProjectFile({ files, path: "certs/site.pem" })).toEqual({
      ok: false,
      code: "restricted_path",
    });
    expect(readProjectFile({ files: [], path: ".env.production" })).toEqual({
      ok: false,
      code: "restricted_path",
    });
  });

  it("rejects binary content that contains NUL", () => {
    const files = [file("src/blob.bin", "hello\0world")];
    expect(readProjectFile({ files, path: "src/blob.bin" })).toEqual({
      ok: false,
      code: "unsupported_file",
    });
  });

  it("returns ambiguous_path when two snapshot entries share a normalized path", () => {
    const files = [file("src/app.ts", "a"), file("src/app.ts", "b")];
    expect(readProjectFile({ files, path: "src/app.ts" })).toEqual({
      ok: false,
      code: "ambiguous_path",
    });
  });

  it("returns file_not_found for a safe path that is not in the snapshot", () => {
    expect(readProjectFile({ files: [file("src/app.ts", "ok")], path: "src/missing.ts" })).toEqual({
      ok: false,
      code: "file_not_found",
    });
  });
});

describe("searchProjectFiles", () => {
  const files = [
    file("src/a.ts", "Hello World\n consola.debug('x')"),
    file("src/b.ts", "hello world"),
    file("docs/note.md", "Hello there"),
    file(".env", "Hello=secret"),
    file("bin/data.bin", "Hello\0World"),
  ];

  it("searches literally, folds case, and honors a path prefix", () => {
    const literal = searchProjectFiles({ files, query: "Hello World", caseSensitive: true });
    expect(literal).toEqual({
      ok: true,
      truncated: false,
      matches: [{ path: "src/a.ts", line: 1, text: "Hello World" }],
    });

    const folded = searchProjectFiles({ files, query: "hello world" });
    expect(folded.ok).toBe(true);
    if (folded.ok) {
      expect(folded.matches).toEqual([
        { path: "src/a.ts", line: 1, text: "Hello World" },
        { path: "src/b.ts", line: 1, text: "hello world" },
      ]);
    }

    const prefixed = searchProjectFiles({ files, query: "Hello", pathPrefix: "docs" });
    expect(prefixed).toEqual({
      ok: true,
      truncated: false,
      matches: [{ path: "docs/note.md", line: 1, text: "Hello there" }],
    });

    const notRegex = searchProjectFiles({ files, query: "Hel.o", caseSensitive: true });
    expect(notRegex).toEqual({ ok: true, matches: [], truncated: false });
  });

  it("rejects a query shorter than two characters", () => {
    expect(searchProjectFiles({ files, query: "H" })).toEqual({ ok: false, code: "invalid_query" });
    expect(searchProjectFiles({ files, query: "" })).toEqual({ ok: false, code: "invalid_query" });
  });

  it("skips restricted and binary files and clips long match text", () => {
    const long = `prefix ${"m".repeat(250)}`;
    const result = searchProjectFiles({
      files: [...files, file("src/long.ts", long)],
      query: "prefix",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matches.some((match) => match.path === ".env")).toBe(false);
      expect(result.matches.some((match) => match.path === "bin/data.bin")).toBe(false);
      const clipped = result.matches.find((match) => match.path === "src/long.ts");
      expect(clipped?.text).toHaveLength(200);
    }
  });

  it("caps returned matches and reports truncation", () => {
    const many = Array.from({ length: 40 }, (_, i) => file(`src/f${i}.ts`, "token here"));
    const result = searchProjectFiles({ files: many, query: "token", limit: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matches).toHaveLength(30);
      expect(result.truncated).toBe(true);
    }
  });
});
