/**
 * End-to-end guard for SM-080 machine isolation, with the real preview-host
 * server, the real guest agent and a fake Fly Machines API
 * (`scripts/lib/fake-fly-machines-api.mjs`). Every "machine" is a real agent
 * process on its own loopback address, so file sync, install, dev start,
 * proxying, hot patch, hibernate/resume, destroy and verify all run over the
 * same HTTP contracts as on Fly. What is NOT proven here: the Fly network
 * boundary itself (that is the pilot's acceptance test in preview-host/README).
 *
 * Invariants locked:
 *   1. In machine mode the host never materializes a project workspace or
 *      spawns project processes locally; the guest gets no host secret.
 *   2. The browser path (/<chatId>/) is served through the guest's
 *      authenticated proxy; hot patch lands in the guest; hibernate keeps the
 *      machine running (never a stop); resume reuses it; destroy deletes it.
 *   3. Fail-closed: missing isolation config → boot error, no machine, no
 *      local fallback. Identity mismatch → machine destroyed, boot error.
 *   4. Verify runs in the guest, in a separate workspace that is removed after.
 *      The verify queue is per chat: different chats run in parallel, the
 *      same chat stays serialized, identical requests dedupe.
 *   5. Idle destroy: a guest with no boot, verify, live dev process or open
 *      preview socket is destroyed after PREVIEW_GUEST_IDLE_DESTROY_MS, also
 *      without a tracked runtime; the next visit creates a new one.
 *   6. Create retries 429/5xx/capacity with backoff, at most
 *      CREATE_MAX_ATTEMPTS, and never retries other errors.
 *
 * Plain node: node scripts/test-machine-isolation.mjs
 */
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeFlyMachinesApi } from "./lib/fake-fly-machines-api.mjs";

const tmp = mkdtempSync(join(tmpdir(), "preview-host-isolation-"));
const dataDir = join(tmp, "host-data");
const guestsDir = join(tmp, "guests");
const HOST_API_KEY = "host-secret-must-not-leak-0001";
// Shaped like a `fly tokens create deploy` macaroon so the FlyV1 path is exercised.
const FLY_TOKEN = "FlyV1 fm2_fake-guest-app-deploy-token";
const APP_NAME = "guests-test";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const agentPort = await freePort();
const fake = await startFakeFlyMachinesApi({
  apiToken: FLY_TOKEN,
  appName: APP_NAME,
  agentScript: join(process.cwd(), "guest", "agent.js"),
  rootDir: guestsDir,
});

process.env.PREVIEW_HOST_DATA_DIR = dataDir;
process.env.HOST = "127.0.0.1";
process.env.PREVIEW_BASE_URL = "http://127.0.0.1:0000";
process.env.PREVIEW_HOST_API_KEY = HOST_API_KEY;
process.env.PREVIEW_HOST_ISOLATION = "machine";
process.env.PREVIEW_GUEST_FLY_API_TOKEN = FLY_TOKEN;
process.env.PREVIEW_GUEST_FLY_APP = APP_NAME;
process.env.PREVIEW_GUEST_IMAGE = "registry.fly.io/guests-test:test";
process.env.PREVIEW_GUEST_MACHINES_API_BASE = fake.baseUrl;
process.env.PREVIEW_GUEST_AGENT_PORT = String(agentPort);
process.env.PREVIEW_GUEST_AGENT_READY_TIMEOUT_MS = "20000";
process.env.PREVIEW_GUEST_MACHINE_START_TIMEOUT_MS = "10000";
process.env.PREVIEW_HOST_RUNTIME_READY_MAX_MS = "45000";
process.env.PREVIEW_HOST_RUNTIME_READY_CONNECT_MAX_MS = "30000";
process.env.PREVIEW_HOST_INSTALL_TIMEOUT_MS = "120000";
process.env.PREVIEW_HOST_RUNTIME_IDLE_STOP_MS = "0";

const require = createRequire(import.meta.url);
const runtime = require("../src/runtime.js");
const { createServer } = require("../src/server/create-server.js");
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const auth = { authorization: `Bearer ${HOST_API_KEY}` };

let failures = 0;
function check(label, condition) {
  if (condition) console.log(`  OK    ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

// Fly auth scheme (found in the pilot 2026-10-22): macaroons need FlyV1.
{
  const { flyAuthorizationHeader } = require("../src/machines/fly-machines-client.js");
  check("FlyV1-prefixed macaroon is sent as FlyV1", flyAuthorizationHeader("FlyV1 fm2_abc") === "FlyV1 fm2_abc");
  check("bare fm2_ macaroon gets the FlyV1 scheme", flyAuthorizationHeader("fm2_abc") === "FlyV1 fm2_abc");
  check("flyctl auth token stays Bearer", flyAuthorizationHeader("abc123") === "Bearer abc123");
}

// Which create failures are worth a retry.
{
  const { FlyMachinesError } = require("../src/machines/fly-machines-client.js");
  const err = (status, message = "x") => new FlyMachinesError(message, { status });
  check("create retry: 429 is retryable", err(429).retryableCreate === true);
  check("create retry: 5xx is retryable", err(503).retryableCreate === true && err(500).retryableCreate === true);
  check(
    "create retry: a capacity miss is retryable whatever its status",
    err(412, "could not reserve resource for machine: insufficient memory available to fulfill request").retryableCreate === true,
  );
  check("create retry: a plain 4xx is not retryable", err(422, "invalid config").retryableCreate === false && err(401).retryableCreate === false);
  check("create retry: a transport error (no status) is not retried", err(null, "fetch failed").retryableCreate === false);
}

const MINUTE_MS = 60_000;
const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));
const deleteCalls = () => fake.callsFor("DELETE", /\/machines\/[^/]+$/).length;
const createCalls = () => fake.callsFor("POST", /\/machines$/).length;
// Fast backoff for the retry checks; production uses a 1 s base.
runtime.__testing.setMachineClientsForTesting({ createRetryBaseMs: 10 });

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...auth, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, text };
}

async function page(chatId) {
  const res = await fetch(`${base}/${encodeURIComponent(chatId)}/`, {
    headers: { accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" },
  });
  return { status: res.status, text: await res.text() };
}

async function waitForStatus(previewSessionId, predicate, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await api("GET", `/preview/session/${previewSessionId}/status`);
    if (predicate(last.body)) return last.body;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return last?.body ?? null;
}

function projectFiles(message) {
  return {
    "package.json": JSON.stringify({ name: "iso-demo", private: true, scripts: { dev: "node server.js" } }, null, 2),
    "server.js": [
      "const http = require('node:http');",
      "const fs = require('node:fs');",
      "const port = Number(process.env.PORT || 3000);",
      "const host = process.env.HOSTNAME || '127.0.0.1';",
      "http.createServer((req, res) => {",
      "  // Same trailing-slash policy as next dev: /<chatId>/ -> 308 /<chatId>.",
      "  // Readiness must follow that root-relative redirect THROUGH the guest's",
      "  // /proxy prefix (Fly pilot finding 2026-10-22).",
      "  if (req.url.length > 1 && req.url.endsWith('/')) {",
      "    res.writeHead(308, { location: req.url.slice(0, -1) });",
      "    res.end();",
      "    return;",
      "  }",
      "  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
      "  res.end(`<html><body><h1>${fs.readFileSync('message.txt', 'utf8')}</h1><p>${req.url}</p><p>Readiness filler so the visible body text exceeds the preview-host threshold.</p></body></html>`);",
      "}).listen(port, host);",
    ].join("\n"),
    "message.txt": message,
    ".env.local": "CUSTOMER_SECRET=only-for-this-project\n",
  };
}

const chatA = "chat_iso_a";
try {
  const health = await api("GET", "/health");
  check("health reports machine isolation configured", health.body.isolation?.mode === "machine" && health.body.isolation?.configured === true);

  // --- Boot A through the real route ---
  const started = await api("POST", "/preview/session/start", {
    chatId: chatA,
    versionId: "v1",
    changeClass: "fresh",
    filesJson: projectFiles("hello-v1"),
  });
  check("start accepted", started.status === 201);
  const psA = started.body.previewSessionId;
  const tokenA = started.body.lifecycleToken;
  const ready = await waitForStatus(psA, (s) => s?.httpReady === true || s?.status === "error");
  check(`boot A reaches httpReady (${ready?.status}/${ready?.readinessState}: ${ready?.readinessError ?? ""})`, ready?.httpReady === true);

  const creates = fake.callsFor("POST", /\/machines$/);
  check("exactly one machine was created for A", creates.length === 1);
  const machineA = [...fake.machines.values()][0];
  check("machine metadata carries the chatId", machineA?.config?.metadata?.sajtmaskin_chat === chatA);
  const guestEnvValues = JSON.stringify(machineA?.config?.env ?? {});
  check("guest env contains no host API key", !guestEnvValues.includes(HOST_API_KEY) && !guestEnvValues.includes(FLY_TOKEN));
  check("guest env carries only token/chat/ports", Object.keys(machineA?.config?.env ?? {}).sort().join(",") === "SAJTMASKIN_GUEST_CHAT_ID,SAJTMASKIN_GUEST_DEV_PORT,SAJTMASKIN_GUEST_PORT,SAJTMASKIN_GUEST_TOKEN");
  check("no project workspace was written on the host", !existsSync(join(dataDir, "workspaces", chatA)));
  check("project files (incl. .env.local) live in the guest root", existsSync(join(machineA.agentEnv.root, "live", ".env.local")));
  const record = runtime.__testing.readMachineRecord(chatA);
  check("store holds the machine record", record?.machineId === machineA.id);
  check("admin/machines hides the token", JSON.stringify((await api("GET", "/admin/machines")).body).includes(record.token) === false);

  const served = await page(chatA);
  check("browser path is served through the guest proxy", served.status === 200 && served.text.includes("hello-v1"));

  // --- Hot patch ---
  const patched = await api("POST", "/preview/session/patch", {
    previewSessionId: psA,
    lifecycleToken: tokenA,
    versionId: "v2",
    expectedBaseVersionId: "v1",
    files: { "message.txt": "hello-v2" },
    removedPaths: [],
  });
  check(`hot patch is applied in the guest (${patched.body.patchMode}/${patched.body.patchReason})`, patched.status === 200 && patched.body.patchMode === "patched");
  const afterPatch = await page(chatA);
  check("patched file is served", afterPatch.text.includes("hello-v2"));
  const readyAfterPatch = await waitForStatus(psA, (s) => s?.readinessState !== "starting", 30_000);
  check("readiness re-probed after hot patch", readyAfterPatch?.readinessState === "ready");

  // --- Hibernate keeps the guest running; resume reuses it ---
  const hibernated = await api("POST", "/preview/session/hibernate", { previewSessionId: psA, lifecycleToken: tokenA });
  check("hibernate accepted", hibernated.status === 200);
  await tick(300);
  check(
    "hibernate neither stops nor destroys the guest",
    fake.callsFor("POST", /\/stop$/).length === 0 && deleteCalls() === 0 && machineA.state === "started",
  );
  const justUsed = await runtime.sweepIdleRuntimes(Date.now());
  check("idle sweep keeps a guest that was just used", justUsed.destroyedGuestMachines === 0 && fake.machines.has(machineA.id));
  const resumed = await api("POST", "/preview/session/start", {
    chatId: chatA,
    versionId: "v3",
    changeClass: "light",
    filesJson: projectFiles("hello-v3"),
  });
  check("resume start accepted", resumed.status === 201);
  const readyResumed = await waitForStatus(resumed.body.previewSessionId, (s) => s?.httpReady === true || s?.status === "error");
  check(`resume boots again (${readyResumed?.readinessState}: ${readyResumed?.readinessError ?? ""})`, readyResumed?.httpReady === true);
  check("resume reuses the running guest (no create, no start)", fake.callsFor("POST", /\/start$/).length === 0 && createCalls() === 1);
  check("resumed page serves the new snapshot", (await page(chatA)).text.includes("hello-v3"));

  // --- Verify in the guest ---
  const verify = await api("POST", "/preview/verify", {
    chatId: chatA,
    versionId: "v3",
    filesJson: projectFiles("hello-v3"),
    checks: ["typecheck"],
  });
  const installCheck = verify.body.results?.find((r) => r.check === "install");
  const typecheck = verify.body.results?.find((r) => r.check === "typecheck");
  check("verify install passes in the guest", verify.status === 200 && installCheck?.passed === true);
  check("verify typecheck is a tooling failure (no typescript installed)", typecheck?.passed === false && typecheck?.failureKind === "tooling");
  const guestEntries = readdirSync(machineA.agentEnv.root);
  check("verify workspace removed from the guest afterwards", guestEntries.every((name) => !name.startsWith("verify-")));
  check("verify did not touch the live workspace", (await page(chatA)).text.includes("hello-v3"));

  // --- Verify queue: per chat in machine mode ---
  {
    const { setVerifyRunnersForTesting } = runtime.__testing;
    const started = [];
    const releases = new Map();
    setVerifyRunnersForTesting({
      jobRunner: (params) =>
        new Promise((resolve) => {
          started.push(params.verifyId);
          releases.set(params.verifyId, () => resolve({ verifyId: params.verifyId, results: [] }));
        }),
    });
    const job = (verifyId, chatId, versionId) =>
      runtime.runQueuedVerifyJob({ verifyId, chatId, versionId, filesJson: { "a.txt": versionId }, checks: ["typecheck"] });
    try {
      const a1 = job("q-a1", "chat_q_a", "v1");
      const a1Duplicate = job("q-a1-again", "chat_q_a", "v1");
      const a2 = job("q-a2", "chat_q_a", "v2");
      const b1 = job("q-b1", "chat_q_b", "v1");
      await tick();
      check("verify: different chats run in parallel in machine mode", started.includes("q-a1") && started.includes("q-b1"));
      check("verify: the same chat stays serialized", !started.includes("q-a2"));
      check("verify: an identical request dedupes to the in-flight job", !started.includes("q-a1-again"));
      releases.get("q-a1")();
      await a1;
      await tick();
      check("verify: the chat's next job starts when the previous one ends", started.includes("q-a2"));
      releases.get("q-a2")();
      releases.get("q-b1")();
      const [duplicateResult] = await Promise.all([a1Duplicate, a2, b1]);
      check("verify: the deduped caller gets the original job's result", duplicateResult?.verifyId === "q-a1");
    } finally {
      setVerifyRunnersForTesting();
    }
  }

  // --- Idle destroy ---
  // Synthetic clock: each busy sweep stamps activity at its own `now`, so every
  // following sweep is placed more than one idle window later.
  const t0 = Date.now();
  const liveRuntime = await runtime.sweepIdleRuntimes(t0 + 26 * MINUTE_MS);
  check("idle sweep never destroys a guest with a live dev process", liveRuntime.destroyedGuestMachines === 0 && fake.machines.has(machineA.id));
  const hibernatedAgain = await api("POST", "/preview/session/hibernate", {
    previewSessionId: resumed.body.previewSessionId,
    lifecycleToken: resumed.body.lifecycleToken,
  });
  check("second hibernate accepted", hibernatedAgain.status === 200);

  const viewerSocket = new EventEmitter();
  runtime.__testing.registerPreviewSocket(chatA, viewerSocket, {});
  const withSocket = await runtime.sweepIdleRuntimes(t0 + 26 * MINUTE_MS);
  check("idle sweep never destroys a guest with an open preview socket", withSocket.destroyedGuestMachines === 0 && fake.machines.has(machineA.id));
  viewerSocket.emit("close");

  let releaseIdleVerify = () => {};
  runtime.__testing.setVerifyRunnersForTesting({
    jobRunner: () => new Promise((resolve) => { releaseIdleVerify = () => resolve({ results: [] }); }),
  });
  const pendingVerify = runtime.runQueuedVerifyJob({
    verifyId: "idle-verify",
    chatId: chatA,
    versionId: "v-idle",
    filesJson: projectFiles("idle"),
    checks: ["typecheck"],
  });
  await tick();
  const duringVerify = await runtime.sweepIdleRuntimes(t0 + 52 * MINUTE_MS);
  check("idle sweep never destroys a guest during a verify", duringVerify.destroyedGuestMachines === 0 && fake.machines.has(machineA.id));
  releaseIdleVerify();
  await pendingVerify;
  runtime.__testing.setVerifyRunnersForTesting();

  runtime.__testing.setRuntimeStateForTesting({ chatId: chatA, booting: true });
  const duringBoot = await runtime.sweepIdleRuntimes(t0 + 78 * MINUTE_MS);
  check("idle sweep never destroys a guest during a boot", duringBoot.destroyedGuestMachines === 0 && fake.machines.has(machineA.id));
  runtime.__testing.setRuntimeStateForTesting({ chatId: chatA, booting: false });

  const deletesBeforeIdle = deleteCalls();
  const idle = await runtime.sweepIdleRuntimes(t0 + 104 * MINUTE_MS);
  check(
    "an idle guest without a tracked runtime is destroyed",
    idle.destroyedGuestMachines === 1 && deleteCalls() === deletesBeforeIdle + 1 && !fake.machines.has(machineA.id),
  );
  check("idle destroy removes the machine record", runtime.__testing.readMachineRecord(chatA) === null);
  check("no guest was ever stopped", fake.callsFor("POST", /\/stop$/).length === 0);

  // --- Next visit creates a new guest, retrying a busy region ---
  const createsBeforeRevisit = createCalls();
  fake.options.createFailures.push(
    { status: 429 },
    { status: 412, error: "could not reserve resource for machine: insufficient memory available to fulfill request" },
  );
  const revisit = await api("POST", "/preview/session/start", {
    chatId: chatA,
    versionId: "v4",
    changeClass: "light",
    filesJson: projectFiles("hello-v4"),
  });
  check("revisit start accepted", revisit.status === 201);
  const readyRevisit = await waitForStatus(revisit.body.previewSessionId, (s) => s?.httpReady === true || s?.status === "error");
  check(`revisit after idle destroy boots a new guest (${readyRevisit?.readinessState}: ${readyRevisit?.readinessError ?? ""})`, readyRevisit?.httpReady === true);
  check("create was retried past a 429 and a capacity miss (3 attempts)", createCalls() === createsBeforeRevisit + 3);
  const machineA2 = [...fake.machines.values()].find((machine) => machine.config?.metadata?.sajtmaskin_chat === chatA);
  check("the new guest has a new machine id", Boolean(machineA2) && machineA2.id !== machineA.id);
  check("revisited page serves the new snapshot", (await page(chatA)).text.includes("hello-v4"));

  // --- Destroy deletes the machine ---
  const deletesBeforeDestroy = deleteCalls();
  const destroyed = await api("POST", "/preview/session/destroy", {
    previewSessionId: revisit.body.previewSessionId,
    lifecycleToken: revisit.body.lifecycleToken,
  });
  check("destroy accepted", destroyed.status === 200);
  check("destroy deleted the guest machine", deleteCalls() === deletesBeforeDestroy + 1 && !fake.machines.has(machineA2?.id));
  check("machine record removed from the store", runtime.__testing.readMachineRecord(chatA) === null);

  // --- Fail-closed: missing config ---
  const savedToken = process.env.PREVIEW_GUEST_FLY_API_TOKEN;
  delete process.env.PREVIEW_GUEST_FLY_API_TOKEN;
  const createsBefore = fake.callsFor("POST", /\/machines$/).length;
  const chatB = "chat_iso_b";
  const startB = await api("POST", "/preview/session/start", {
    chatId: chatB,
    versionId: "v1",
    changeClass: "fresh",
    filesJson: projectFiles("never"),
  });
  const failedB = await waitForStatus(startB.body.previewSessionId, (s) => s?.status === "error" || s?.httpReady === true, 30_000);
  check("missing isolation config fails the boot", failedB?.status === "error" && /isolation is required but not available/i.test(failedB?.readinessError ?? ""));
  check("missing config created no machine", fake.callsFor("POST", /\/machines$/).length === createsBefore);
  check("missing config ran nothing on the host", !existsSync(join(dataDir, "workspaces", chatB)));
  process.env.PREVIEW_GUEST_FLY_API_TOKEN = savedToken;
  await api("POST", "/preview/session/destroy", { previewSessionId: startB.body.previewSessionId, lifecycleToken: startB.body.lifecycleToken });

  // --- Create gives up after CREATE_MAX_ATTEMPTS retryable failures ---
  const maxAttempts = runtime.__testing.CREATE_MAX_ATTEMPTS;
  for (let i = 0; i < maxAttempts; i += 1) fake.options.createFailures.push({ status: 503 });
  const createsBeforeExhaust = createCalls();
  const chatD = "chat_iso_d";
  const startD = await api("POST", "/preview/session/start", {
    chatId: chatD,
    versionId: "v1",
    changeClass: "fresh",
    filesJson: projectFiles("never"),
  });
  const failedD = await waitForStatus(startD.body.previewSessionId, (s) => s?.status === "error" || s?.httpReady === true, 30_000);
  check("exhausted create retries fail the boot", failedD?.status === "error" && /HTTP 503/.test(failedD?.readinessError ?? ""));
  check(`create stops after ${maxAttempts} attempts`, createCalls() === createsBeforeExhaust + maxAttempts && runtime.__testing.readMachineRecord(chatD) === null);
  fake.options.createFailures.length = 0;
  await api("POST", "/preview/session/destroy", { previewSessionId: startD.body.previewSessionId, lifecycleToken: startD.body.lifecycleToken });

  // --- Fail-closed: identity mismatch ---
  const deletesBeforeMismatch = deleteCalls();
  fake.options.chatIdOverride = () => "someone-elses-chat";
  const chatC = "chat_iso_c";
  const startC = await api("POST", "/preview/session/start", {
    chatId: chatC,
    versionId: "v1",
    changeClass: "fresh",
    filesJson: projectFiles("never"),
  });
  const failedC = await waitForStatus(startC.body.previewSessionId, (s) => s?.status === "error" || s?.httpReady === true, 60_000);
  check("identity mismatch fails the boot", failedC?.status === "error" && /identity mismatch/i.test(failedC?.readinessError ?? ""));
  check("mismatched machine was destroyed", deleteCalls() === deletesBeforeMismatch + 1 && runtime.__testing.readMachineRecord(chatC) === null);
  fake.options.chatIdOverride = null;
  await api("POST", "/preview/session/destroy", { previewSessionId: startC.body.previewSessionId, lifecycleToken: startC.body.lifecycleToken });

  // --- Reconcile is safe to run ---
  const cleanup = await runtime.cleanupPreviewHostStorage();
  check("storage cleanup reconciles guests without error", typeof cleanup.destroyedGuestMachines === "number");
} catch (error) {
  failures += 1;
  console.error(`  FAIL  unexpected error: ${error instanceof Error ? error.stack : error}`);
  for (const machine of fake.machines.values()) {
    console.error(`--- agent ${machine.id} output ---\n${(machine.agentOutput ?? []).join("\n")}`);
  }
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
  await fake.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} machine-isolation guard(s) failed`);
  process.exit(1);
}
console.log("\nmachine-isolation guards passed");
process.exit(0);
