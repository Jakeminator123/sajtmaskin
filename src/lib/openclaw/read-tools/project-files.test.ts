import { describe, expect, it } from "vitest";
import type { CodeFile } from "@/lib/gen/parser";
import {
  listOpenClawProjectFiles,
  readOpenClawProjectFile,
  searchOpenClawProjectCode,
} from "./project-files";

const syntheticProviderToken = ["sk", "proj", "syntheticprojectcredential"].join("-");

const files: CodeFile[] = [
  {
    path: "app/page.tsx",
    language: "tsx",
    content: `export const apiKey = "${syntheticProviderToken}";\nexport default function Page() { return <main>Hello needle</main>; }`,
  },
  { path: ".env", language: "text", content: "DATABASE_URL=postgres://owner:secret@db/x" },
  { path: "package-lock.json", language: "json", content: '{"needle":"secret"}' },
  { path: "public/logo.png", language: "binary", content: "base64:iVBORw0KGgo=" },
  { path: "src/util.ts", language: "ts", content: "export const needle = 'safe';" },
];

describe("OpenClaw project-file tools", () => {
  it("lists bounded metadata while withholding sensitive and binary content", () => {
    const result = listOpenClawProjectFiles(files, { limit: 100 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.files.find((file) => file.path === ".env")?.contentAvailable).toBe(false);
    expect(
      result.data.files.find((file) => file.path === "package-lock.json")?.contentAvailable,
    ).toBe(false);
    expect(
      result.data.files.find((file) => file.path === "public/logo.png")?.contentAvailable,
    ).toBe(false);
  });

  it.each([".env", "package-lock.json", "public/logo.png"])(
    "never returns content for %s",
    (path) => {
      const result = readOpenClawProjectFile(files, { path });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(["restricted_path", "unsupported_file"]).toContain(result.code);
      }
    },
  );

  it("redacts secret literals from source reads", () => {
    const result = readOpenClawProjectFile(files, { path: "app/page.tsx" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.content).not.toContain(syntheticProviderToken);
    expect(result.data.content).toContain("[REDACTED]");
    expect(result.data.redacted).toBe(true);
  });

  it("distinguishes complete reads and explicit partial ranges from budget truncation", () => {
    const shortFile: CodeFile = {
      path: "src/short.ts",
      language: "ts",
      content: ["line 1", "line 2", "line 3"].join("\n"),
    };
    const complete = readOpenClawProjectFile([shortFile], { path: shortFile.path });
    expect(complete.ok).toBe(true);
    if (complete.ok) {
      expect(complete.data.content).toBe(shortFile.content);
      expect(complete.data.truncated).toBe(false);
    }

    const partial = readOpenClawProjectFile([shortFile], {
      path: shortFile.path,
      startLine: 1,
      endLine: 2,
    });
    expect(partial.ok).toBe(true);
    if (partial.ok) {
      expect(partial.data.content).toBe("line 1\nline 2");
      expect(partial.data.truncated).toBe(false);
    }

    const budgetLimited: CodeFile = {
      path: "src/budget-limited.ts",
      language: "ts",
      content: Array.from({ length: 251 }, (_, index) => `line ${index + 1}`).join("\n"),
    };
    const capped = readOpenClawProjectFile([budgetLimited], { path: budgetLimited.path });
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.data.endLine).toBe(250);
      expect(capped.data.truncated).toBe(true);
    }
  });

  it("skips sensitive files during code search and scrubs matching lines", () => {
    const result = searchOpenClawProjectCode(files, { query: "needle", limit: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.matches.map((match) => match.path)).toEqual(["app/page.tsx", "src/util.ts"]);
    expect(result.data.matches.some((match) => match.path === "package-lock.json")).toBe(false);
  });

  it("enforces line, character, result and pagination bounds", () => {
    const longFile: CodeFile = {
      path: "src/long.ts",
      language: "ts",
      content: Array.from({ length: 400 }, (_, index) => `line ${index} needle`).join("\n"),
    };
    const read = readOpenClawProjectFile([longFile], {
      path: longFile.path,
      startLine: 1,
      endLine: 100_000,
    });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.data.endLine - read.data.startLine + 1).toBeLessThanOrEqual(250);
      expect(read.data.content.length).toBeLessThanOrEqual(20_000);
      expect(read.data.truncated).toBe(true);
    }

    const search = searchOpenClawProjectCode([longFile], { query: "needle", limit: 3 });
    expect(search.ok).toBe(true);
    if (search.ok) {
      expect(search.data.matches).toHaveLength(3);
      expect(search.data.resultTruncated).toBe(true);
    }

    const list = listOpenClawProjectFiles(files, { limit: 2 });
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.data.files).toHaveLength(2);
      expect(list.data.nextCursor).toBe("v1:2");
    }
  });
});
