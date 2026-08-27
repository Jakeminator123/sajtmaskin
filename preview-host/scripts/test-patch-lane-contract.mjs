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

const store = require("../src/store.js");
const runtime = require("../src/runtime.js");
const queuedBoots = [];
runtime.queueRuntimeBoot = (chatId, options = {}) => queuedBoots.push({ chatId, options });
// server.js destructures applyRuntimePatch at require time, so the stub reads a
// mutable outcome instead of being reassigned mid-run.
let nextPatchOutcome = { mode: "patched", reason: null };
runtime.applyRuntimePatch = () => nextPatchOutcome;
// The readiness re-probe does real HTTP against the dev port; stub it and
// record the arguments instead. Must be assigned BEFORE the server require,
// which destructures it.
const readinessProbes = [];
runtime.probeReadinessAfterPatch = async (args) => {
  readinessProbes.push(args);
};
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
  const lifecycleToken = started.body.lifecycleToken;

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
    lifecycleToken,
    versionId: "ver_2",
    expectedBaseVersionId: "ver_1",
    files: { "app/page.tsx": PAGE_V2 },
    removedPaths: ["app/about/page.tsx"],
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.versionId, "ver_2");
  assert.equal(
    patched.body.mutationRevision,
    started.body.mutationRevision + 1,
    "patch response advances the host mutation receipt exactly once",
  );

  const afterPatch = await manifestFor(previewSessionId);
  assert.equal(afterPatch.body.versionId, "ver_2");
  assert.equal(afterPatch.body.fileCount, 2);
  assert.equal(afterPatch.body.files["app/page.tsx"], sha256(PAGE_V2));
  assert.equal(afterPatch.body.files["app/about/page.tsx"], undefined);

  // Version binding (b): a /status poll after the patch must report the NEW
  // version, otherwise the app's version-pinned resume would refuse a session
  // that is in fact serving the patched revision.
  const statusAfterPatch = await request(
    `/preview/session/${encodeURIComponent(previewSessionId)}/status`,
  );
  assert.equal(statusAfterPatch.status, 200);
  assert.equal(statusAfterPatch.body.versionId, "ver_2");
  assert.equal(statusAfterPatch.body.mutationRevision, patched.body.mutationRevision);
  assert.equal(statusAfterPatch.body.running, true);

  // Readiness is a per-version verdict, and a hot patch advances the version
  // without booting — so the previous boot's "ready" must not survive it. The
  // flip happens inside the same store-lock mutation as the version advance,
  // and a fresh version-bound probe is what resolves it.
  {
    const patchedSession = store.readStoreSync().sessions[started.body.sessionId];
    assert.equal(
      patchedSession.readinessState,
      "starting",
      "hot patch must reset readiness for the new version",
    );
    assert.equal(patchedSession.readinessError, null, "stale readiness error must be cleared");
    const probe = readinessProbes[readinessProbes.length - 1];
    assert.ok(probe, "a hot patch must start a new readiness probe");
    assert.equal(probe.versionId, "ver_2", "the probe must be bound to the patched version");
    assert.equal(probe.sessionId, started.body.sessionId);
    assert.equal(probe.previewSessionId, previewSessionId);
    assert.equal(
      probe.lifecycleToken,
      lifecycleToken,
      "the probe must be bound to the patched lifecycle, not only version/session id",
    );
    assert.equal(
      probe.mutationRevision,
      patched.body.mutationRevision,
      "the probe must be bound to the exact patch mutation receipt",
    );
  }

  // Version binding (a): a patch that fails mid-way must never leave the host
  // claiming the new version. The session rolls back to its pre-patch snapshot
  // so /status, the manifest and a later resume all still say ver_2 — a
  // half-applied revision can never approve ver_3.
  nextPatchOutcome = { mode: "error", reason: "ENOSPC simulated" };
  const failedPatch = await request("/preview/session/patch", {
    previewSessionId,
    lifecycleToken,
    versionId: "ver_3",
    expectedBaseVersionId: "ver_2",
    files: { "app/nyhet/page.tsx": "export default function N(){return <main>N</main>;}" },
  });
  assert.equal(failedPatch.status, 500);
  assert.equal(failedPatch.body.error, "patch_failed");
  // Readiness is part of the rollback snapshot: a patch whose workspace write
  // never landed must not leave the session advertising readiness for a version
  // it does not serve. And no probe may be started for it.
  {
    const probesBefore = readinessProbes.length;
    const rolledBack = store.readStoreSync().sessions[started.body.sessionId];
    assert.equal(rolledBack.versionId, "ver_2");
    assert.equal(
      rolledBack.readinessState,
      "starting",
      "rollback must restore the pre-patch readiness state",
    );
    assert.equal(probesBefore, readinessProbes.length, "a failed patch must not probe readiness");
  }
  nextPatchOutcome = { mode: "patched", reason: null };

  const afterFailure = await manifestFor(previewSessionId);
  assert.equal(afterFailure.body.versionId, "ver_2", "failed patch must not claim ver_3");
  assert.equal(afterFailure.body.files["app/nyhet/page.tsx"], undefined);
  assert.equal(afterFailure.body.fileCount, 2);
  const statusAfterFailure = await request(
    `/preview/session/${encodeURIComponent(previewSessionId)}/status`,
  );
  assert.equal(statusAfterFailure.body.versionId, "ver_2");
  // And the rolled-back base is still the only base a patch may build on.
  const patchOnRolledBackBase = await request("/preview/session/patch", {
    previewSessionId,
    lifecycleToken,
    versionId: "ver_4",
    expectedBaseVersionId: "ver_3",
    files: { "app/page.tsx": PAGE_V2 },
  });
  assert.equal(patchOnRolledBackBase.status, 409);
  assert.equal(patchOnRolledBackBase.body.error, "base_mismatch");
  assert.equal((await manifestFor(previewSessionId)).body.versionId, "ver_2");

  // A session with NO known version is unknown ground, not a silent match: the
  // check is strict equality, so a missing version is refused with the same 409
  // rather than letting a partial diff merge into a workspace we cannot
  // identify.
  {
    const missingVersionStore = store.readStoreSync();
    missingVersionStore.sessions[started.body.sessionId].versionId = null;
    store.writeStoreAtomicSync(missingVersionStore);
  }
  const patchOnUnknownBase = await request("/preview/session/patch", {
    previewSessionId,
    lifecycleToken,
    versionId: "ver_5",
    expectedBaseVersionId: "ver_2",
    files: { "app/page.tsx": PAGE_V2 },
  });
  assert.equal(patchOnUnknownBase.status, 409);
  assert.equal(patchOnUnknownBase.body.error, "base_mismatch");
  assert.equal(patchOnUnknownBase.body.versionId, null);
  assert.match(patchOnUnknownBase.body.message, /no known version/i);
  {
    const restoredStore = store.readStoreSync();
    restoredStore.sessions[started.body.sessionId].versionId = "ver_2";
    store.writeStoreAtomicSync(restoredStore);
  }
  assert.equal((await manifestFor(previewSessionId)).body.versionId, "ver_2");

  // /update is the other route that advances the session's version, and
  // readiness is a per-version verdict there too. The route only QUEUES a boot,
  // and the boot writes "starting" after install/spawn — so without the flip in
  // the same store-lock mutation, /status keeps answering with the previous
  // version's verdict ("ready" for files Next has not compiled, or an error the
  // new version never produced) for the whole install window.
  {
    const seeded = store.readStoreSync();
    seeded.sessions[started.body.sessionId].readinessState = "ready";
    seeded.sessions[started.body.sessionId].readinessError = "stale error from ver_2";
    seeded.sessions[started.body.sessionId].runtimeCleanExitVersionId = "ver_2";
    seeded.sessions[started.body.sessionId].runtimeCleanExitTimestamps = [
      Date.now() - 2_000,
      Date.now() - 1_000,
    ];
    store.writeStoreAtomicSync(seeded);

    const updated = await request("/preview/session/update", {
      previewSessionId,
      lifecycleToken,
      versionId: "ver_6",
      filesJson: { "app/page.tsx": PAGE_V2 },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.versionId, "ver_6");
    assert.ok(
      updated.body.mutationRevision > patched.body.mutationRevision,
      "update must advance past every prior host mutation receipt",
    );

    const updatedSession = store.readStoreSync().sessions[started.body.sessionId];
    assert.equal(
      updatedSession.readinessState,
      "starting",
      "update must reset readiness for the new version",
    );
    assert.equal(
      updatedSession.readinessError,
      null,
      "update must clear the previous version's readiness error",
    );
    assert.equal(updatedSession.runtimeCleanExitVersionId, "ver_6");
    assert.deepEqual(
      updatedSession.runtimeCleanExitTimestamps,
      [],
      "an explicit update must receive a fresh clean-exit budget",
    );
    const statusAfterUpdate = await request(
      `/preview/session/${encodeURIComponent(previewSessionId)}/status`,
    );
    assert.equal(statusAfterUpdate.body.versionId, "ver_6");
    assert.equal(statusAfterUpdate.body.readinessState, "starting");
    assert.equal(
      statusAfterUpdate.body.httpReady,
      false,
      "a session whose version just advanced is not http-ready",
    );
    assert.equal(statusAfterUpdate.body.readinessError, null);

    // Rewriting the SAME version is also explicit repair work. This is the
    // files-revision-only path used when a mutable version id is persisted
    // again, so it must not inherit two prior exits and fail on its first boot.
    const sameVersionSeed = store.readStoreSync();
    sameVersionSeed.sessions[started.body.sessionId].runtimeCleanExitVersionId = "ver_6";
    sameVersionSeed.sessions[started.body.sessionId].runtimeCleanExitTimestamps = [
      Date.now() - 2_000,
      Date.now() - 1_000,
    ];
    // Same for the install/boot-failure budget: a capped session that gets new
    // content must boot again, otherwise fixing the project cannot recover it.
    sameVersionSeed.sessions[started.body.sessionId].runtimeBootFailureVersionId = "ver_6";
    sameVersionSeed.sessions[started.body.sessionId].runtimeBootFailureTimestamps = [
      Date.now() - 3_000,
      Date.now() - 2_000,
      Date.now() - 1_000,
    ];
    store.writeStoreAtomicSync(sameVersionSeed);
    const sameVersionUpdate = await request("/preview/session/update", {
      previewSessionId,
      lifecycleToken,
      versionId: "ver_6",
      filesJson: { "app/page.tsx": `${PAGE_V2}\n// repair` },
    });
    assert.equal(sameVersionUpdate.status, 200);
    assert.equal(
      sameVersionUpdate.body.mutationRevision,
      updated.body.mutationRevision + 1,
      "same-version update must still receive a later mutation receipt",
    );
    const afterSameVersionUpdate = store.readStoreSync().sessions[started.body.sessionId];
    assert.equal(afterSameVersionUpdate.runtimeCleanExitVersionId, "ver_6");
    assert.deepEqual(
      afterSameVersionUpdate.runtimeCleanExitTimestamps,
      [],
      "same-version update must reset the clean-exit budget",
    );
    assert.deepEqual(
      afterSameVersionUpdate.runtimeBootFailureTimestamps,
      [],
      "same-version update must reset the boot-failure budget so a fixed project can boot",
    );
  }

  // A stored entry that is not a string still gets listed, with a marker that
  // can never equal a sha256 digest — the app must then rewrite or remove that
  // path rather than treat a missing entry as "not on the host".
  const storeData = store.readStoreSync();
  storeData.sessions[started.body.sessionId].filesJson["public/logo.bin"] = 42;
  store.writeStoreAtomicSync(storeData);
  const withUnhashable = await manifestFor(previewSessionId);
  assert.equal(withUnhashable.body.files["public/logo.bin"], "unhashable");
  assert.doesNotMatch(withUnhashable.body.files["public/logo.bin"], /^[0-9a-f]{64}$/);

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
  const revisionBeforeDestroy =
    store.readStoreSync().sessions[started.body.sessionId].mutationRevision;
  await request("/preview/session/destroy", {
    previewSessionId,
    lifecycleToken: started.body.lifecycleToken,
  });
  assert.equal((await manifestFor(previewSessionId)).status, 404);

  const replacement = await request("/preview/session/start", {
    chatId: "chat-manifest",
    versionId: "ver_replacement",
    filesJson: files,
  });
  assert.equal(replacement.status, 201);
  assert.ok(
    replacement.body.mutationRevision > revisionBeforeDestroy,
    "destroy/recreate must preserve the per-chat mutation order",
  );
  await request("/preview/session/destroy", {
    previewSessionId: replacement.body.previewSessionId,
    lifecycleToken: replacement.body.lifecycleToken,
  });

  console.log("[test-patch-lane-contract] All guards green.");
} finally {
  await new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
  rmSync(dataDir, { recursive: true, force: true });
}
