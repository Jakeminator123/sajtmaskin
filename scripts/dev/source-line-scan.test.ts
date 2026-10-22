import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SOURCE_SCAN_DIRS, findLineOffenders } from "./source-line-scan.mjs";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
// Built at runtime so this file never matches the guard it tests.
const BAD_CALL = "p.incl" + 'udes("..")';
const DANGEROUS = /\.includes\("\.\."\)/;
const ALLOW = /scan-allow/;

const tempRoots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-line-scan-"));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("source-line-scan", () => {
  it("scans only directories that exist in the repo", () => {
    for (const dir of SOURCE_SCAN_DIRS) {
      expect(fs.existsSync(path.join(REPO_ROOT, dir)), dir).toBe(true);
    }
  });

  it("reports matching lines and skips comments, allow markers and allowlisted files", () => {
    const root = fixture({
      "src/a.ts": `const ok = 1;\nif (${BAD_CALL}) throw 1;\n// ${BAD_CALL} in a comment\nif (${BAD_CALL}) x(); // scan-allow\n`,
      "src/allowed.ts": `if (${BAD_CALL}) throw 1;\n`,
      "src/readme.md": `${BAD_CALL}\n`,
    });
    const offenders = findLineOffenders({
      repoRoot: root,
      dangerous: DANGEROUS,
      allowComment: ALLOW,
      allowlistFiles: ["src/allowed.ts"],
      scanDirs: ["src"],
    });
    expect(offenders).toEqual([{ file: "src/a.ts", line: 2, snippet: `if (${BAD_CALL}) throw 1;` }]);
  });

  it("fails closed when a scan directory is missing", () => {
    const root = fixture({ "src/a.ts": "const ok = 1;\n" });
    expect(() =>
      findLineOffenders({
        repoRoot: root,
        dangerous: DANGEROUS,
        allowComment: ALLOW,
        scanDirs: ["src", "services"],
      }),
    ).toThrow(/scan directory "services" does not exist/);
  });
});
