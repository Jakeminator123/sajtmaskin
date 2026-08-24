import { describe, expect, it } from "vitest";

import {
  MAX_CHANGED_FILES,
  MAX_FILE_CHARS,
  MAX_OVERLAY_BYTES,
  applyCandidatePatch,
  diffCandidate,
  replaceCandidateFiles,
} from "./candidate-patch";

const BASE = {
  "src/app.ts": "export const app = 1;\n",
  "src/lib/util.ts": "export const util = 2;\n",
} as const;

describe("applyCandidatePatch / replaceCandidateFiles", () => {
  it("adds a new file and modifies an existing one without mutating inputs", () => {
    const overlay: Record<string, string> = {};
    const hunks = [
      { path: "src/new.ts", content: "export const created = true;\n" },
      { path: "src/app.ts", content: "export const app = 2;\n" },
    ];

    const applied = applyCandidatePatch({ base: { ...BASE }, overlay, hunks });
    expect(applied).toEqual({
      ok: true,
      overlay: {
        "src/app.ts": "export const app = 2;\n",
        "src/new.ts": "export const created = true;\n",
      },
      changedPaths: ["src/app.ts", "src/new.ts"],
    });
    expect(overlay).toEqual({});

    const replaced = replaceCandidateFiles({
      base: { ...BASE },
      overlay: {},
      files: hunks,
    });
    expect(replaced).toEqual(applied);
  });

  it("replaces an overlay entry in place without counting it twice", () => {
    const first = applyCandidatePatch({
      base: { ...BASE },
      overlay: { "src/app.ts": "export const app = 2;\n" },
      hunks: [{ path: "src/app.ts", content: "export const app = 3;\n" }],
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(Object.keys(first.overlay)).toEqual(["src/app.ts"]);
      expect(first.changedPaths).toEqual(["src/app.ts"]);
    }
  });

  it("rejects restricted basenames", () => {
    const cases = [
      ".env",
      ".env.local",
      "certs/site.pem",
      "keys/app.key",
      "package-lock.json",
      "keys/id_rsa",
      "config/credentials.json",
    ];
    for (const path of cases) {
      expect(
        applyCandidatePatch({
          base: { ...BASE },
          overlay: {},
          hunks: [{ path, content: "nope" }],
        }),
      ).toEqual({ ok: false, code: "restricted_path" });
    }
  });

  it("rejects path traversal, absolute paths, and backslashes", () => {
    const cases = ["../secret", "foo/../../etc/passwd", "/etc/passwd", "foo\\bar", "C:/windows", "", ".", "foo//bar"];
    for (const path of cases) {
      expect(
        applyCandidatePatch({
          base: { ...BASE },
          overlay: {},
          hunks: [{ path, content: "x" }],
        }),
      ).toEqual({ ok: false, code: "invalid_path" });
    }
  });

  it("rejects a single file over the char cap and an overlay over the byte cap", () => {
    expect(
      applyCandidatePatch({
        base: { ...BASE },
        overlay: {},
        hunks: [{ path: "src/huge.ts", content: "x".repeat(MAX_FILE_CHARS + 1) }],
      }),
    ).toEqual({ ok: false, code: "too_large" });

    const oversizedOverlay: Record<string, string> = {};
    const fileBytes = 200_000;
    const fileCount = Math.ceil((MAX_OVERLAY_BYTES + 1) / fileBytes);
    expect(fileCount).toBeLessThanOrEqual(MAX_CHANGED_FILES);
    for (let i = 0; i < fileCount; i++) {
      oversizedOverlay[`src/chunk-${i}.ts`] = "y".repeat(fileBytes);
    }
    expect(
      applyCandidatePatch({
        base: { ...BASE },
        overlay: oversizedOverlay,
        hunks: [],
      }),
    ).toEqual({ ok: false, code: "too_large" });
  });

  it("rejects more than 80 overlay files after apply", () => {
    const overlay: Record<string, string> = {};
    for (let i = 0; i < MAX_CHANGED_FILES; i++) {
      overlay[`src/f${String(i).padStart(2, "0")}.ts`] = "x";
    }
    expect(
      applyCandidatePatch({
        base: { ...BASE },
        overlay,
        hunks: [{ path: "src/extra.ts", content: "y" }],
      }),
    ).toEqual({ ok: false, code: "too_many_files" });

    expect(
      applyCandidatePatch({
        base: { ...BASE },
        overlay,
        hunks: [{ path: "src/f00.ts", content: "replaced" }],
      }),
    ).toMatchObject({ ok: true, changedPaths: ["src/f00.ts"] });
  });

  it("rejects secret patterns in new content", () => {
    const secrets = [
      "Authorization: Bearer abc.def",
      "openai key sk-proj-example",
      "-----BEGIN PRIVATE KEY-----\nMIIB",
    ];
    for (const content of secrets) {
      expect(
        applyCandidatePatch({
          base: { ...BASE },
          overlay: {},
          hunks: [{ path: "src/secrets.ts", content }],
        }),
      ).toEqual({ ok: false, code: "invalid_input" });
    }
  });

  it("rejects malformed input without writing", () => {
    expect(
      applyCandidatePatch({
        base: { ...BASE },
        overlay: {},
        hunks: null as unknown as [],
      }),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      applyCandidatePatch({
        base: { ...BASE },
        overlay: { "src/app.ts": 1 as unknown as string },
        hunks: [],
      }),
    ).toEqual({ ok: false, code: "invalid_input" });
  });
});

describe("diffCandidate", () => {
  it("lists added and modified paths only, without file bodies", () => {
    const result = diffCandidate({
      base: { ...BASE },
      overlay: {
        "src/app.ts": "export const app = 2;\n",
        "src/lib/util.ts": BASE["src/lib/util.ts"],
        "src/new.ts": "export const created = true;\n",
      },
    });

    expect(result).toEqual({
      ok: true,
      changed: [
        { path: "src/app.ts", kind: "modified" },
        { path: "src/new.ts", kind: "added" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("export const");
    expect(JSON.stringify(result)).not.toContain("created");
  });

  it("returns invalid_input when maps are not string records", () => {
    expect(
      diffCandidate({
        base: null as unknown as Record<string, string>,
        overlay: {},
      }),
    ).toEqual({ ok: false, code: "invalid_input" });
  });
});
