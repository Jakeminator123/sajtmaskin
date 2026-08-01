/**
 * Route contract tests for the Fast Edit Lane's read side:
 * `GET /preview/session/:previewSessionId/files-manifest`.
 *
 * The app diffs a new version against this manifest to decide whether a
 * follow-up can be pushed as a partial `/preview/session/patch` instead of a
 * full `/update` + Next dev restart, so the manifest must be:
 *
 *   1. an exact sha256-per-path view of the session's stored file set,
 *   2. honest about `versionId` and public `running` (a prewarm skeleton is
 *      never "running"), so the app cannot patch the wrong base,
 *   3. side-effect free — unlike `/status` it must never queue a boot,
 *   4. in sync with `/patch` (merged writes + removals land in the manifest).
 *
 * Runs with plain node (preview-host has no test framework):
 *   node scripts/test-patch-lane-contract.mjs
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// CI/package guard: preview-host/package.json `test:guards` must keep this
// script in the same blocking chain as the other guard scripts.
const require = createRequire(import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), "preview-host-patch-lane-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";

const runtime = require("../src/runtime.js");
const queuedBoots = [];
runtime.queueRuntimeBoot = (chatId, options = {}) => queuedBoots.push({ chatId, options });
runtime.applyRuntimePatch = () => ({ mode: "patched", reason: null });
const { createServer } = require("../src/server.js");
const server = createServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");

const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: payload === undefined ? undefined : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

function manifestFor(previewSessionId) {
  return request(`/preview/session/${encodeURIComponent(previewSessionId)}/files-manifest`);
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

const PAGE_V1 = "export default function Page(){return <main>v1</main>;}";
const PAGE_V2 = "export default function Page(){return <main>v2</main>;}";
const ABOUT = "export default function About(){return <main>about</main>;}";
const files = {
  "package.json": JSON.stringify({ name: "manifest-demo", private: true }),
  "app/page.tsx": PAGE_V1,
  "app/about/page.tsx": ABOUT,
};

try {
  // Unknown session -> 404 so the app falls back to update/start.
  assert.equal((await manifestFor("ps_does_not_exist")).status, 404);

  const started = await request("/preview/session/start", {
    chatId: "chat-manifest",
    versionId: "ver_1",
    filesJson: files,
  });
  assert.equal(started.status, 201);
  const previewSessionId = started.body.previewSessionId;

  // Exact hash view of the stored file set, and no boot side effect.
  const bootsBeforeManifest = queuedBoots.length;
  const manifest = await manifestFor(previewSessionId);
  assert.equal(manifest.status, 200);
  assert.equal(manifest.body.ok, true);
  assert.equal(manifest.body.versionId, "ver_1");
  assert.equal(manifest.body.hashAlgorithm, "sha256");
  assert.equal(manifest.body.fileCount, 3);
  assert.deepEqual(Object.keys(manifest.body.files).sort(), [
    "app/about/page.tsx",
    "app/page.tsx",
    "package.json",
  ]);
  assert.equal(manifest.body.files["app/page.tsx"], sha256(PAGE_V1));
  assert.equal(manifest.body.files["package.json"], sha256(files["package.json"]));
  assert.equal(queuedBoots.length, bootsBeforeManifest, "files-manifest must not queue a boot");

  // A session whose runtime is not up reports running:false — the app must not
  // hot-patch a workspace nobody is serving.
  assert.equal(manifest.body.running, false);

  runtime.__testing.setRuntimeStateForTesting({
    chatId: "chat-manifest",
    sessionId: started.body.sessionId,
    previewSessionId,
    runtimePort: 4321,
    running: true,
    booting: false,
  });
  assert.equal((await manifestFor(previewSessionId)).body.running, true);

  // /patch is the write side of the same contract: merged file + removal +
  // new versionId must all be visible in the next manifest read.
  const patched = await request("/preview/session/patch", {
    previewSessionId,
    versionId: "ver_2",
    expectedBaseVersionId: "ver_1",
    files: { "app/page.tsx": PAGE_V2 },
    removedPaths: ["app/about/page.tsx"],
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.versionId, "ver_2");

  const afterPatch = await manifestFor(previewSessionId);
  assert.equal(afterPatch.body.versionId, "ver_2");
  assert.equal(afterPatch.body.fileCount, 2);
  assert.equal(afterPatch.body.files["app/page.tsx"], sha256(PAGE_V2));
  assert.equal(afterPatch.body.files["app/about/page.tsx"], undefined);

  runtime.__testing.clearRuntimeStateForTesting("chat-manifest", started.body.sessionId);

  // A prewarm skeleton is never publicly running, so a follow-up can never
  // diff against (and patch onto) an unclaimed prewarm workspace.
  const prewarm = await request("/preview/session/start", {
    chatId: "chat-manifest-prewarm",
    versionId: "ver_prewarm",
    filesJson: files,
    prewarm: true,
    prewarmLeaseKey: "a".repeat(64),
  });
  assert.equal(prewarm.status, 201);
  runtime.__testing.setRuntimeStateForTesting({
    chatId: "chat-manifest-prewarm",
    sessionId: prewarm.body.sessionId,
    previewSessionId: prewarm.body.previewSessionId,
    runtimePort: 4322,
    running: true,
    booting: false,
  });
  const prewarmManifest = await manifestFor(prewarm.body.previewSessionId);
  assert.equal(prewarmManifest.status, 200);
  assert.equal(prewarmManifest.body.running, false);
  runtime.__testing.clearRuntimeStateForTesting(
    "chat-manifest-prewarm",
    prewarm.body.sessionId,
  );

  // A destroyed session is not usable -> 404 (same rule as /status).
  await request("/preview/session/destroy", { previewSessionId });
  assert.equal((await manifestFor(previewSessionId)).status, 404);

  console.log("[test-patch-lane-contract] All guards green.");
} finally {
  await new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
  rmSync(dataDir, { recursive: true, force: true });
}
