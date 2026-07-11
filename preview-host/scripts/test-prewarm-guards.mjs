import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// CI/package guard: preview-host/package.json `test:guards` must keep this
// script and `test:proxy-contract` in the same blocking chain.
const require = createRequire(import.meta.url);
const dataDir = mkdtempSync(join(tmpdir(), "preview-host-prewarm-guard-"));
process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";
process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS = "10000";

const store = require("../src/store.js");
const runtime = require("../src/runtime.js");
const { acquirePrewarmLease } = require("../src/prewarm-leases.js");
const queuedBoots = [];
// Route-level contract tests control boot completion explicitly below.
runtime.queueRuntimeBoot = (chatId, options = {}) => queuedBoots.push({ chatId, options });
runtime.applyRuntimePatch = () => ({ mode: "patched", reason: null });
const { createServer } = require("../src/server.js");
const server = createServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");

const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;
const key = (char) => char.repeat(64);
const files = (name) => ({
  "package.json": JSON.stringify({ name, private: true }),
  "app/page.tsx": `export default function Page(){return <main>${name}</main>;}`,
});
const runtimeFiles = (name) => ({
  "package.json": JSON.stringify({
    name: name.toLowerCase(),
    private: true,
    scripts: { dev: "node server.js" },
  }),
  "server.js": [
    "const http = require('node:http');",
    "const port = Number(process.env.PORT);",
    "const host = process.env.HOSTNAME || '127.0.0.1';",
    `http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<html><body><h1>${name}</h1><p>Readiness body contains enough visible text for the preview host contract.</p></body></html>')}).listen(port,host);`,
  ].join("\n"),
});

async function request(pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: payload === undefined ? undefined : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

async function startPrewarm(chatId, leaseKey, extra = {}) {
  return request("/preview/session/start", {
    chatId,
    versionId: `${chatId}-prewarm`,
    filesJson: files(`${chatId}-skeleton`),
    prewarm: true,
    prewarmLeaseKey: leaseKey,
    ...extra,
  });
}

function readStore() {
  return store.readStoreSync();
}

function storedSession(sessionId) {
  return readStore().sessions[sessionId];
}

function leaseExistsForChat(chatId) {
  return Object.values(readStore().prewarmLeases).some((lease) => lease?.chatId === chatId);
}

async function waitUntil(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Timed out waiting for guard condition.");
}

try {
  // Idempotent prewarm recovers a process-lost boot instead of returning a
  // potentially dead persisted session.
  const initial = await startPrewarm("chat-idempotent", key("a"));
  assert.equal(initial.status, 201);
  const storageTelemetry = await request("/admin/storage");
  assert.equal(storageTelemetry.status, 200);
  assert.ok(storageTelemetry.body.storage.prewarmLeases.activeCount >= 1);
  assert.match(
    storageTelemetry.body.storage.prewarmLeases.earliestExpiresAt,
    /^\d{4}-\d{2}-\d{2}T/,
  );
  assert.equal(storageTelemetry.body.storage.prewarmLeases.maxEntries, 4096);
  assert.doesNotMatch(JSON.stringify(storageTelemetry.body.storage), new RegExp(key("a")));
  const queuesBeforeRetry = queuedBoots.length;
  const idempotent = await startPrewarm("chat-idempotent", key("a"));
  assert.equal(idempotent.status, 200);
  assert.equal(queuedBoots.length, queuesBeforeRetry + 1);
  assert.equal(queuedBoots.at(-1)?.chatId, "chat-idempotent");
  assert.equal(queuedBoots.at(-1)?.options?.restart, true);

  runtime.__testing.setRuntimeStateForTesting({
    chatId: "chat-idempotent",
    sessionId: initial.body.sessionId,
    previewSessionId: initial.body.previewSessionId,
    runtimePort: 4999,
    running: true,
    booting: false,
  });
  const queuesBeforeHealthyRetry = queuedBoots.length;
  assert.equal((await startPrewarm("chat-idempotent", key("a"))).status, 200);
  assert.equal(queuedBoots.length, queuesBeforeHealthyRetry);
  runtime.__testing.clearRuntimeStateForTesting(
    "chat-idempotent",
    initial.body.sessionId,
  );

  // A persisted status:"starting" after host restart is not treated as a live
  // in-flight boot; status polling requeues it.
  const stale = await request("/preview/session/start", {
    chatId: "chat-stale-starting",
    versionId: "version-stale",
    filesJson: files("stale"),
  });
  queuedBoots.length = 0;
  const staleStatus = await request(
    `/preview/session/${encodeURIComponent(stale.body.previewSessionId)}/status`,
  );
  assert.equal(staleStatus.status, 200);
  assert.equal(queuedBoots.length, 1);
  assert.equal(queuedBoots[0].chatId, "chat-stale-starting");

  // Real start claims ownership under the store lock, releases the subject
  // lease, and keeps an explicit traffic hold until the real boot succeeds.
  await startPrewarm("chat-claim", key("b"));
  const claimed = await request("/preview/session/start", {
    chatId: "chat-claim",
    versionId: "version-real",
    filesJson: runtimeFiles("REAL VERSION"),
  });
  assert.equal(claimed.status, 201);
  assert.equal(storedSession(claimed.body.sessionId).prewarm, false);
  assert.equal(storedSession(claimed.body.sessionId).prewarmReplacementPending, true);
  assert.equal(leaseExistsForChat("chat-claim"), false);
  const delayed = await startPrewarm("chat-claim", key("b"));
  assert.equal(delayed.status, 409);
  assert.equal(delayed.body.error, "prewarm_superseded");
  assert.equal(storedSession(claimed.body.sessionId).versionId, "version-real");

  // The released lease allows a legitimate next chat for the same subject.
  const sequential = await startPrewarm("chat-after-claim", key("b"));
  assert.equal(sequential.status, 201);

  // A successful real readiness transition is the only event that clears the
  // replacement traffic hold.
  const claimedSession = storedSession(claimed.body.sessionId);
  await runtime.__testing.bootRuntimeForSession(claimedSession, { restart: true });
  assert.equal(storedSession(claimed.body.sessionId).prewarmReplacementPending, false);
  await runtime.stopRuntimeForSession(storedSession(claimed.body.sessionId));

  // Update and patch both claim prewarm ownership and release the SAME-chat
  // lease. Patch forces a real restart rather than hot-patching a skeleton.
  const updatePrewarm = await startPrewarm("chat-update", key("c"));
  const update = await request("/preview/session/update", {
    previewSessionId: updatePrewarm.body.previewSessionId,
    versionId: "version-update-real",
    replaceFiles: true,
    filesJson: files("update-real"),
  });
  assert.equal(update.status, 200);
  assert.equal(storedSession(updatePrewarm.body.sessionId).prewarmReplacementPending, true);
  assert.equal(leaseExistsForChat("chat-update"), false);
  assert.equal((await startPrewarm("chat-after-update", key("c"))).status, 201);

  const patchPrewarm = await startPrewarm("chat-patch", key("d"));
  const patch = await request("/preview/session/patch", {
    previewSessionId: patchPrewarm.body.previewSessionId,
    versionId: "version-patch-real",
    files: { "app/page.tsx": "export default function Page(){return <main>real</main>}" },
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.patchMode, "restarted");
  assert.equal(patch.body.patchReason, "prewarm_replacement");
  assert.equal(leaseExistsForChat("chat-patch"), false);
  assert.equal((await startPrewarm("chat-after-patch", key("d"))).status, 201);

  // Destroy releases a lease immediately.
  const destroyPrewarm = await startPrewarm("chat-destroy", key("e"));
  const destroyed = await request("/preview/session/destroy", {
    previewSessionId: destroyPrewarm.body.previewSessionId,
  });
  assert.equal(destroyed.status, 200);
  assert.equal(leaseExistsForChat("chat-destroy"), false);
  assert.equal((await startPrewarm("chat-after-destroy", key("e"))).status, 201);

  // Hibernate is reversible, not terminal cleanup, so it intentionally keeps
  // the abuse cooldown. A later destroy releases it.
  const hibernatePrewarm = await startPrewarm("chat-hibernate", key("9"));
  assert.equal(
    (
      await request("/preview/session/hibernate", {
        previewSessionId: hibernatePrewarm.body.previewSessionId,
      })
    ).status,
    200,
  );
  assert.equal(leaseExistsForChat("chat-hibernate"), true);
  await request("/preview/session/destroy", {
    previewSessionId: hibernatePrewarm.body.previewSessionId,
  });
  assert.equal(leaseExistsForChat("chat-hibernate"), false);

  // Expiry is pruned on the next acquire, keys are normalized, and stale
  // sessions do not make the lease map grow without bound.
  const expiry = await startPrewarm("chat-expiry", key("F"));
  assert.equal(expiry.status, 201);
  const expiryStore = readStore();
  assert.ok(expiryStore.prewarmLeases[key("f")]);
  expiryStore.prewarmLeases[key("f")].expiresAt = new Date(Date.now() - 1).toISOString();
  store.writeStoreAtomicSync(expiryStore);
  assert.equal((await startPrewarm("chat-after-expiry", key("f"))).status, 201);

  // Background/admin cleanup releases the lease for a removed session.
  const cleanupPrewarm = await startPrewarm("chat-cleanup", key("1"));
  const cleanupStore = readStore();
  cleanupStore.sessions[cleanupPrewarm.body.sessionId].sessionExpiresAt =
    new Date(Date.now() - 1).toISOString();
  store.writeStoreAtomicSync(cleanupStore);
  const cleanup = await request("/admin/cleanup", {});
  assert.equal(cleanup.status, 200);
  assert.ok(cleanup.body.removedPrewarmLeases >= 1);
  assert.equal((await startPrewarm("chat-after-cleanup", key("1"))).status, 201);

  // A failed prewarm boot retains its cooldown lease: same-chat idempotent
  // recovery is allowed, but sequential install spray to another chat is not.
  const failedPrewarm = await startPrewarm("chat-boot-fail", key("2"), {
    filesJson: {
      "package.json": "{",
      "app/page.tsx": "export default function Page(){return null}",
    },
  });
  await assert.rejects(
    runtime.__testing.bootRuntimeForSession(storedSession(failedPrewarm.body.sessionId), {
      restart: true,
    }),
  );
  assert.equal(storedSession(failedPrewarm.body.sessionId).status, "error");
  assert.equal(leaseExistsForChat("chat-boot-fail"), true);
  const sprayedAfterFailure = await startPrewarm("chat-after-boot-fail", key("2"));
  assert.equal(sprayedAfterFailure.status, 429);
  assert.equal(sprayedAfterFailure.body.error, "prewarm_rate_limited");
  const recoveredPrewarm = await startPrewarm("chat-boot-fail", key("2"));
  assert.equal(recoveredPrewarm.status, 200);
  assert.equal(leaseExistsForChat("chat-boot-fail"), true);

  const exitedPrewarm = await startPrewarm("chat-runtime-exit", key("6"), {
    filesJson: {
      "package.json": JSON.stringify({
        name: "runtime-exit",
        private: true,
        scripts: { dev: "node server.js" },
      }),
      "server.js": "process.exit(1);",
    },
  });
  await runtime.__testing.bootRuntimeForSession(
    storedSession(exitedPrewarm.body.sessionId),
    { restart: true },
  );
  await waitUntil(
    () =>
      storedSession(exitedPrewarm.body.sessionId).status === "stopped" &&
      leaseExistsForChat("chat-runtime-exit"),
  );

  // A failed REAL replacement never clears the traffic hold or reopens
  // prewarm ownership; HTTP can honestly retry/show starting rather than the
  // skeleton becoming public.
  const replacementFailurePrewarm = await startPrewarm(
    "chat-replacement-fail",
    key("5"),
  );
  const replacementFailure = await request("/preview/session/start", {
    chatId: "chat-replacement-fail",
    versionId: "version-replacement-fail",
    filesJson: {
      "package.json": "{",
      "app/page.tsx": "export default function Page(){return null}",
    },
  });
  await assert.rejects(
    runtime.__testing.bootRuntimeForSession(
      storedSession(replacementFailurePrewarm.body.sessionId),
      { restart: true },
    ),
  );
  const failedReplacementSession = storedSession(replacementFailure.body.sessionId);
  assert.equal(failedReplacementSession.prewarm, false);
  assert.equal(failedReplacementSession.prewarmReplacementPending, true);
  assert.equal(failedReplacementSession.status, "error");
  assert.equal(
    (await startPrewarm("chat-replacement-fail", key("5"))).body.error,
    "prewarm_superseded",
  );
  const queuesBeforeExplicitRetry = queuedBoots.length;
  const explicitRetry = await request("/preview/session/start", {
    chatId: "chat-replacement-fail",
    versionId: "version-replacement-retry",
    filesJson: runtimeFiles("RETRY VERSION"),
  });
  assert.equal(explicitRetry.status, 201);
  assert.equal(storedSession(explicitRetry.body.sessionId).status, "starting");
  assert.equal(
    storedSession(explicitRetry.body.sessionId).prewarmReplacementPending,
    true,
  );
  assert.equal(queuedBoots.length, queuesBeforeExplicitRetry + 1);
  assert.equal(queuedBoots.at(-1)?.options?.restart, true);

  // Admin reset removes both sessions and any remaining active-subject leases.
  await startPrewarm("chat-admin-reset", key("3"));
  const reset = await request("/admin/destroy-all", {});
  assert.equal(reset.status, 200);
  assert.ok(reset.body.resetPrewarmLeases >= 1);
  assert.equal(Object.keys(readStore().prewarmLeases).length, 0);
  assert.equal((await startPrewarm("chat-after-reset", key("3"))).status, 201);

  const cappedStore = { prewarmLeases: {} };
  assert.equal(
    acquirePrewarmLease(cappedStore, {
      key: key("7"),
      chatId: "capacity-one",
      nowMs: Date.now(),
      leaseMs: 60_000,
      maxLeases: 1,
    }).type,
    "acquired",
  );
  assert.equal(
    acquirePrewarmLease(cappedStore, {
      key: key("8"),
      chatId: "capacity-two",
      nowMs: Date.now(),
      leaseMs: 60_000,
      maxLeases: 1,
    }).type,
    "capacity",
  );

  console.log("[test-prewarm-guards] All guards green.");
} finally {
  await new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
  rmSync(dataDir, { recursive: true, force: true });
}
