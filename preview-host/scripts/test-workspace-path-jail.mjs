/**
 * Defense-in-depth jail for direct workspace write/rm. A traversal key must
 * not write or delete a sibling workspace. The HTTP API already rejects these
 * paths; this covers internal callers and a poisoned previous-files manifest.
 *
 * Run with: `node scripts/test-workspace-path-jail.mjs`
 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "preview-host-workspace-path-jail-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;

const require = createRequire(import.meta.url);
const { patchWorkspaceFiles, writeFilesIntoWorkspace } = require(
  "../src/runtime/workspace-files.js",
);
const { isSafeRelativePath } = require("../src/validate.js");

const siblingRoot = join(dataDir, "siblings");
const workspaceA = join(siblingRoot, "A");
const workspaceB = join(siblingRoot, "B");
const secretPath = join(workspaceB, "secret.txt");
const pwnedPath = join(workspaceB, "pwned.txt");

function seedSiblings() {
  mkdirSync(workspaceA, { recursive: true });
  mkdirSync(workspaceB, { recursive: true });
  writeFileSync(secretPath, "B-SECRET", "utf8");
  if (existsSync(pwnedPath)) rmSync(pwnedPath, { force: true });
}

function assertBUntouched() {
  assert.equal(readFileSync(secretPath, "utf8"), "B-SECRET");
  assert.equal(existsSync(pwnedPath), false);
}

function assertUnsafe(fn, label) {
  assert.throws(fn, /Unsafe workspace path/, label);
  assertBUntouched();
}

try {
  assert.equal(isSafeRelativePath("../B/pwned.txt"), false);
  assert.equal(isSafeRelativePath("..\\B\\pwned.txt"), false);
  assert.equal(isSafeRelativePath("app/page.tsx"), true);

  seedSiblings();

  writeFilesIntoWorkspace(workspaceA, {
    "app/page.tsx": "export default function Page(){return <main>ok</main>;}",
    "public/nested/ok.txt": "hello",
  });
  assert.equal(
    readFileSync(join(workspaceA, "app/page.tsx"), "utf8"),
    "export default function Page(){return <main>ok</main>;}",
  );
  assert.equal(readFileSync(join(workspaceA, "public/nested/ok.txt"), "utf8"), "hello");
  assertBUntouched();

  assertUnsafe(
    () => writeFilesIntoWorkspace(workspaceA, { "../B/pwned.txt": "PWNED-BY-A" }),
    "posix traversal write",
  );
  assertUnsafe(
    () => writeFilesIntoWorkspace(workspaceA, { "..\\B\\pwned.txt": "PWNED-BY-A" }),
    "windows-separator traversal write",
  );
  assertUnsafe(
    () =>
      writeFilesIntoWorkspace(workspaceA, {
        "app/page.tsx": "mixed",
        "../B/pwned.txt": "PWNED-BY-A",
      }),
    "mixed happy-path plus traversal write",
  );
  assert.equal(
    readFileSync(join(workspaceA, "app/page.tsx"), "utf8"),
    "export default function Page(){return <main>ok</main>;}",
    "failed write must not apply the rest of the payload",
  );

  writeFileSync(
    join(workspaceA, ".preview-host-files.json"),
    JSON.stringify({ files: ["app/page.tsx", "public/nested/ok.txt", "../B/secret.txt"] }, null, 2),
    "utf8",
  );
  assertUnsafe(
    () => writeFilesIntoWorkspace(workspaceA, { "app/page.tsx": "v2" }),
    "poisoned previousFiles rm",
  );
  assert.equal(
    readFileSync(join(workspaceA, "app/page.tsx"), "utf8"),
    "export default function Page(){return <main>ok</main>;}",
    "failed removal must not rewrite remaining files",
  );

  writeFileSync(
    join(workspaceA, ".preview-host-files.json"),
    JSON.stringify({ files: ["app/page.tsx", "public/nested/ok.txt"] }, null, 2),
    "utf8",
  );
  writeFilesIntoWorkspace(workspaceA, {
    "app/page.tsx": "v2",
    "public/nested/ok.txt": "hello",
  });
  assert.equal(readFileSync(join(workspaceA, "app/page.tsx"), "utf8"), "v2");
  assertBUntouched();

  const patchChatA = "ws-a";
  const patchChatB = "ws-b";
  const patchA = join(dataDir, "workspaces", patchChatA);
  const patchB = join(dataDir, "workspaces", patchChatB);
  const patchSecret = join(patchB, "secret.txt");
  const patchPwned = join(patchB, "pwned.txt");

  writeFilesIntoWorkspace(patchA, {
    "app/page.tsx": "patch-ok",
    "public/nested/ok.txt": "keep",
  });
  mkdirSync(patchB, { recursive: true });
  writeFileSync(patchSecret, "PATCH-B-SECRET", "utf8");

  function assertPatchBUntouched() {
    assert.equal(readFileSync(patchSecret, "utf8"), "PATCH-B-SECRET");
    assert.equal(existsSync(patchPwned), false);
  }

  assert.throws(
    () => patchWorkspaceFiles(patchChatA, { "../ws-b/pwned.txt": "PWNED-BY-A" }),
    /Unsafe workspace path/,
    "patch traversal write",
  );
  assertPatchBUntouched();
  assert.throws(
    () => patchWorkspaceFiles(patchChatA, { "..\\ws-b\\pwned.txt": "PWNED-BY-A" }),
    /Unsafe workspace path/,
    "patch windows-separator traversal write",
  );
  assertPatchBUntouched();
  assert.throws(
    () => patchWorkspaceFiles(patchChatA, {}, ["../ws-b/secret.txt"]),
    /Unsafe workspace path/,
    "patch traversal remove",
  );
  assertPatchBUntouched();
  assert.throws(
    () =>
      patchWorkspaceFiles(patchChatA, { "app/page.tsx": "should-not-land" }, [
        "..\\ws-b\\secret.txt",
      ]),
    /Unsafe workspace path/,
    "patch mixed write plus traversal remove",
  );
  assertPatchBUntouched();
  assert.equal(
    readFileSync(join(patchA, "app/page.tsx"), "utf8"),
    "patch-ok",
    "failed patch must not apply sibling writes",
  );

  patchWorkspaceFiles(patchChatA, { "app/page.tsx": "patched" }, ["public/nested/ok.txt"]);
  assert.equal(readFileSync(join(patchA, "app/page.tsx"), "utf8"), "patched");
  assert.equal(existsSync(join(patchA, "public/nested/ok.txt")), false);
  assertPatchBUntouched();

  console.log("OK   workspace path jail (sibling write/rm blocked, happy-path intact)");
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}
