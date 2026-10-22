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
 *      authenticated proxy; hot patch lands in the guest; hibernate stops the
 *      machine; resume restarts it; destroy deletes it.
 *   3. Fail-closed: missing isolation config → boot error, no machine, no
 *      local fallback. Identity mismatch → machine destroyed, boot error.
 *   4. Verify runs in the guest, in a separate workspace that is removed after.
 *
 * Plain node: node scripts/test-machine-isolation.mjs
 */
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeFlyMachinesApi } from "./lib/fake-fly-machines-api.mjs";

const tmp = mkdtempSync(join(tmpdir(), "preview-host-isolation-"));
const dataDir = join(tmp, "host-data");
const guestsDir = join(tmp, "guests");
const HOST_API_KEY = "host-secret-must-not-leak-0001";
const FLY_TOKEN = "fake-fly-token";
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

  // --- Hibernate parks the machine; resume restarts it ---
  const hibernated = await api("POST", "/preview/session/hibernate", { previewSessionId: psA, lifecycleToken: tokenA });
  check("hibernate accepted", hibernated.status === 200);
  await new Promise((resolve) => setTimeout(resolve, 300));
  check("hibernate stopped the guest machine", fake.callsFor("POST", /\/stop$/).length === 1 && machineA.state === "stopped");
  const resumed = await api("POST", "/preview/session/start", {
    chatId: chatA,
    versionId: "v3",
    changeClass: "light",
    filesJson: projectFiles("hello-v3"),
  });
  check("resume start accepted", resumed.status === 201);
  const readyResumed = await waitForStatus(resumed.body.previewSessionId, (s) => s?.httpReady === true || s?.status === "error");
  check(`resume boots again (${readyResumed?.readinessState}: ${readyResumed?.readinessError ?? ""})`, readyResumed?.httpReady === true);
  check("resume started the same machine instead of creating a new one", fake.callsFor("POST", /\/start$/).length === 1 && fake.callsFor("POST", /\/machines$/).length === 1);
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

  // --- Destroy deletes the machine ---
  const destroyed = await api("POST", "/preview/session/destroy", {
    previewSessionId: resumed.body.previewSessionId,
    lifecycleToken: resumed.body.lifecycleToken,
  });
  check("destroy accepted", destroyed.status === 200);
  check("destroy deleted the guest machine", fake.callsFor("DELETE", /\/machines\/[^/]+$/).length === 1 && !fake.machines.has(machineA.id));
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

  // --- Fail-closed: identity mismatch ---
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
  check("mismatched machine was destroyed", fake.callsFor("DELETE", /\/machines\/[^/]+$/).length === 2 && runtime.__testing.readMachineRecord(chatC) === null);
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
