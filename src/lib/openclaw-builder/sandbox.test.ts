import { describe, expect, it } from "vitest";

import {
  MAX_SANDBOX_FILE_CHARS,
  MAX_SANDBOX_FILES,
  MAX_SANDBOX_PATH_LENGTH,
  createSandbox,
  listSandboxPaths,
  readSandboxFile,
  type SandboxFile,
} from "./sandbox";

function file(path: string, content = `${path}\n`): SandboxFile {
  return { path, content };
}

function createOk(files: SandboxFile[], jobId = "job-1", baseFilesRevision = "rev-1") {
  const created = createSandbox({ jobId, baseFilesRevision, baseFiles: files });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("expected createSandbox to succeed");
  return created.sandbox;
}

describe("createSandbox", () => {
  it("hydrates from a base snapshot and reads those files as source=base", () => {
    const handle = createOk([
      file("src/app.ts", "export const n = 1;\n"),
      file("README.md", "# site\n"),
    ]);

    expect(handle).toEqual({
      jobId: "job-1",
      baseFilesRevision: "rev-1",
      fileCount: 2,
    });

    expect(readSandboxFile(handle, "src/app.ts")).toEqual({
      ok: true,
      content: "export const n = 1;\n",
      source: "base",
    });
    expect(readSandboxFile(handle, "README.md")).toEqual({
      ok: true,
      content: "# site\n",
      source: "base",
    });
  });

  it("rejects an empty jobId or revision", () => {
    const files = [file("a.ts", "a")];
    expect(createSandbox({ jobId: "", baseFilesRevision: "rev-1", baseFiles: files })).toEqual({
      ok: false,
      code: "invalid_base",
    });
    expect(createSandbox({ jobId: "job-1", baseFilesRevision: "", baseFiles: files })).toEqual({
      ok: false,
      code: "invalid_base",
    });
  });

  it("rejects duplicate base paths", () => {
    expect(
      createSandbox({
        jobId: "job-1",
        baseFilesRevision: "rev-1",
        baseFiles: [file("src/app.ts", "a"), file("src/app.ts", "b")],
      }),
    ).toEqual({ ok: false, code: "invalid_base" });
  });

  it("rejects more than 500 files or a file over 200_000 chars", () => {
    const tooMany = Array.from({ length: MAX_SANDBOX_FILES + 1 }, (_, i) =>
      file(`f${String(i).padStart(3, "0")}.ts`, "x"),
    );
    expect(
      createSandbox({ jobId: "job-1", baseFilesRevision: "rev-1", baseFiles: tooMany }),
    ).toEqual({ ok: false, code: "invalid_base" });

    expect(
      createSandbox({
        jobId: "job-1",
        baseFilesRevision: "rev-1",
        baseFiles: [file("src/huge.ts", "x".repeat(MAX_SANDBOX_FILE_CHARS + 1))],
      }),
    ).toEqual({ ok: false, code: "invalid_base" });
  });

  it("rejects an invalid path in the base snapshot", () => {
    expect(
      createSandbox({
        jobId: "job-1",
        baseFilesRevision: "rev-1",
        baseFiles: [file("../secret", "nope")],
      }),
    ).toEqual({ ok: false, code: "invalid_base" });
  });
});

describe("readSandboxFile", () => {
  it("returns not_found for a missing safe path", () => {
    const handle = createOk([file("src/app.ts", "ok")]);
    expect(readSandboxFile(handle, "src/missing.ts")).toEqual({
      ok: false,
      code: "not_found",
    });
  });

  it("rejects traversal, absolute paths, and overlong paths", () => {
    const handle = createOk([file("src/app.ts", "ok")]);
    expect(readSandboxFile(handle, "../secret")).toEqual({ ok: false, code: "invalid_path" });
    expect(readSandboxFile(handle, "/etc/passwd")).toEqual({ ok: false, code: "invalid_path" });
    expect(readSandboxFile(handle, "foo\\bar")).toEqual({ ok: false, code: "invalid_path" });
    expect(readSandboxFile(handle, "foo/../../etc/passwd")).toEqual({
      ok: false,
      code: "invalid_path",
    });
    expect(readSandboxFile(handle, "")).toEqual({ ok: false, code: "invalid_path" });
    expect(readSandboxFile(handle, ".")).toEqual({ ok: false, code: "invalid_path" });
    expect(readSandboxFile(handle, "foo//bar")).toEqual({ ok: false, code: "invalid_path" });
    expect(readSandboxFile(handle, "a".repeat(MAX_SANDBOX_PATH_LENGTH + 1))).toEqual({
      ok: false,
      code: "invalid_path",
    });
  });

  it("returns invalid_sandbox for a lookalike or forged handle", () => {
    const handle = createOk([file("src/app.ts", "ok")]);
    expect(readSandboxFile(null, "src/app.ts")).toEqual({ ok: false, code: "invalid_sandbox" });
    expect(readSandboxFile({ ...handle }, "src/app.ts")).toEqual({
      ok: false,
      code: "invalid_sandbox",
    });
    expect(readSandboxFile({ jobId: "job-1", baseFilesRevision: "rev-1", fileCount: 1 }, "src/app.ts")).toEqual({
      ok: false,
      code: "invalid_sandbox",
    });
  });
});

describe("sandbox handle isolation", () => {
  it("stringifies the public handle without leaking file contents or overlay identity", () => {
    const secret = "UNIQUE_SANDBOX_SECRET_CONTENT_42";
    const handle = createOk([file("src/secret.ts", secret), file("README.md", "# hi")]);

    const json = JSON.stringify(handle);
    expect(json).toBe(
      JSON.stringify({ jobId: "job-1", baseFilesRevision: "rev-1", fileCount: 2 }),
    );
    expect(json).not.toContain(secret);
    expect(json).not.toContain("src/secret.ts");
    expect(json).not.toContain("overlay");
    expect(Object.keys(handle).sort()).toEqual(["baseFilesRevision", "fileCount", "jobId"]);
    expect("overlay" in handle).toBe(false);
    expect((handle as { overlay?: unknown }).overlay).toBeUndefined();
  });
});

describe("listSandboxPaths", () => {
  it("lists sorted unique paths", () => {
    const handle = createOk([
      file("src/b.ts", "b"),
      file("README.md", "# hi"),
      file("src/a.ts", "a"),
    ]);

    expect(listSandboxPaths(handle)).toEqual({
      ok: true,
      paths: ["README.md", "src/a.ts", "src/b.ts"],
    });
  });

  it("returns invalid_sandbox for an unknown handle", () => {
    expect(listSandboxPaths({})).toEqual({ ok: false, code: "invalid_sandbox" });
    expect(listSandboxPaths(undefined)).toEqual({ ok: false, code: "invalid_sandbox" });
  });
});
