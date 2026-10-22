"use strict";

// Per-project guest machines (SM-080). One Fly Machine per chatId, created
// from the guest image with a fresh bearer token. The record lives in the
// control plane's store (`data.machines[chatId]`), never on the guest.
//
// Identity is proven before any project code reaches a machine: the agent's
// /health must answer with the exact chatId the machine was created for, over
// the token minted for that machine. Any mismatch, timeout or API failure is
// fail-closed — the boot errors; nothing runs on the shared host instead.

const { createHash, randomBytes } = require("node:crypto");

const { readStoreSync, withStoreLock } = require("../store.js");
const { assertMachineIsolationReady, machineIsolationConfig } = require("./isolation-config.js");
const { FlyMachinesError, createFlyMachinesClient } = require("./fly-machines-client.js");
const { createGuestClient, guestBaseUrl } = require("./guest-client.js");

const METADATA_ROLE_KEY = "sajtmaskin_role";
const METADATA_ROLE = "preview-guest";
const METADATA_CHAT_KEY = "sajtmaskin_chat";
const METADATA_HOST_KEY = "sajtmaskin_host";
const AGENT_NAME = "sajtmaskin-preview-guest";

const opsByChat = new Map();
let flyClientForTesting = null;
let guestClientFactoryForTesting = null;

function withMachineLock(chatId, operation) {
  const previous = opsByChat.get(chatId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(operation);
  const tail = run.catch(() => undefined);
  opsByChat.set(chatId, tail);
  tail.then(() => {
    if (opsByChat.get(chatId) === tail) opsByChat.delete(chatId);
  });
  return run;
}

function flyClient(config) {
  if (flyClientForTesting) return flyClientForTesting;
  return createFlyMachinesClient({
    apiBase: config.apiBase,
    apiToken: config.apiToken,
    appName: config.appName,
  });
}

function guestClientFor(record, config) {
  const baseUrl = guestBaseUrl(record.privateIp, record.agentPort ?? config.agentPort);
  if (guestClientFactoryForTesting) return guestClientFactoryForTesting({ baseUrl, token: record.token, record });
  return createGuestClient({ baseUrl, token: record.token });
}

function machineNameFor(chatId) {
  const digest = createHash("sha256").update(chatId, "utf8").digest("hex").slice(0, 10);
  return `pg-${digest}-${randomBytes(2).toString("hex")}`;
}

function readMachineRecord(chatId) {
  const data = readStoreSync();
  const record = data.machines?.[chatId];
  return record && typeof record === "object" ? record : null;
}

async function writeMachineRecord(chatId, record) {
  await withStoreLock((data) => {
    if (!data.machines || typeof data.machines !== "object") data.machines = {};
    if (record) data.machines[chatId] = record;
    else delete data.machines[chatId];
  });
}

function publicRecord(record) {
  if (!record) return null;
  const { token, ...rest } = record;
  void token;
  return rest;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function machineConfigPayload(config, { chatId, token }) {
  return {
    name: machineNameFor(chatId),
    region: config.region,
    config: {
      image: config.image,
      env: {
        SAJTMASKIN_GUEST_TOKEN: token,
        SAJTMASKIN_GUEST_CHAT_ID: chatId,
        SAJTMASKIN_GUEST_PORT: String(config.agentPort),
        SAJTMASKIN_GUEST_DEV_PORT: String(config.devPort),
      },
      guest: {
        cpu_kind: config.cpuKind,
        cpus: config.cpus,
        memory_mb: config.memoryMb,
      },
      metadata: {
        [METADATA_ROLE_KEY]: METADATA_ROLE,
        [METADATA_CHAT_KEY]: chatId,
        [METADATA_HOST_KEY]: config.hostIdentity,
      },
      // The control plane owns the lifecycle: a crashed agent is restarted by
      // the next boot, not by Fly; a stopped machine stays around for resume.
      auto_destroy: false,
      restart: { policy: "no" },
    },
  };
}

async function waitForAgentIdentity(guest, { chatId, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "agent not reachable yet";
  while (Date.now() < deadline) {
    try {
      const health = await guest.health({ timeoutMs: 5000 });
      if (health?.ok === true && health.agent === AGENT_NAME && health.chatId === chatId) {
        return health;
      }
      const error = new Error(
        `Guest identity mismatch: agent reported chatId "${health?.chatId ?? "?"}" ` +
          `(agent "${health?.agent ?? "?"}") for machine created for "${chatId}".`,
      );
      error.code = "PREVIEW_GUEST_IDENTITY_MISMATCH";
      throw error;
    } catch (error) {
      if (error?.code === "PREVIEW_GUEST_IDENTITY_MISMATCH") throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  const error = new Error(`Guest agent did not become ready within ${timeoutMs}ms: ${lastError}`);
  error.code = "PREVIEW_GUEST_NOT_READY";
  throw error;
}

async function destroyMachineQuietly(fly, machineId) {
  try {
    await fly.destroyMachine(machineId, { force: true });
  } catch (error) {
    if (!(error instanceof FlyMachinesError && error.notFound)) {
      // Best effort; the reconcile sweep catches leftovers tagged with our host identity.
    }
  }
}

async function createFreshMachine(fly, config, chatId, log) {
  const token = randomBytes(32).toString("base64url");
  const created = await fly.createMachine(machineConfigPayload(config, { chatId, token }));
  const machineId = created?.id;
  if (!machineId) throw new Error("Fly Machines create returned no machine id.");
  const record = {
    machineId,
    appName: config.appName,
    image: config.image,
    region: created.region ?? config.region,
    privateIp: created.private_ip ?? null,
    agentPort: config.agentPort,
    devPort: config.devPort,
    token,
    createdAt: new Date().toISOString(),
    lastStartedAt: new Date().toISOString(),
    state: created.state ?? "created",
  };
  await writeMachineRecord(chatId, record);
  await log?.(`Created guest machine ${machineId} (${config.cpuKind}-${config.cpus}x/${config.memoryMb}MB) for chat ${chatId}.`);
  return record;
}

/**
 * Fly's `/wait` blocks at most 60 s per call (the API maximum). Loop in ≤60 s
 * slices until our own deadline so a slow cold start never turns into a
 * rejected request that would make the caller destroy a healthy machine.
 */
async function waitForMachineState(fly, machineId, state, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  do {
    const remainingSeconds = Math.ceil((deadline - Date.now()) / 1000);
    const timeoutSeconds = Math.max(1, Math.min(60, remainingSeconds));
    try {
      const wait = await fly.waitForMachine(machineId, { state, timeoutSeconds });
      if (wait?.ok !== false) return wait;
      lastError = `state ${wait?.state ?? "unknown"}`;
    } catch (error) {
      if (error instanceof FlyMachinesError && error.notFound) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  } while (Date.now() < deadline);
  throw new Error(`Guest machine ${machineId} did not reach ${state} within ${timeoutMs}ms (${lastError}).`);
}

async function ensureStarted(fly, config, record, log) {
  await waitForMachineState(fly, record.machineId, "started", config.machineStartTimeoutMs);
  const machine = await fly.getMachine(record.machineId);
  if (machine?.state && machine.state !== "started") {
    throw new Error(`Guest machine ${record.machineId} is in state ${machine.state}, expected started.`);
  }
  if (machine?.private_ip && machine.private_ip !== record.privateIp) {
    // 6PN addresses can change across reboots; the record follows the machine.
    record.privateIp = machine.private_ip;
  }
  if (!record.privateIp) throw new Error(`Guest machine ${record.machineId} has no private IP.`);
  record.state = "started";
  record.lastStartedAt = new Date().toISOString();
  await log?.(`Guest machine ${record.machineId} started at ${record.privateIp}.`);
}

/**
 * Returns `{ record, guest }` for a started, identity-proven machine owned by
 * `chatId`. Creates one when missing or destroyed, starts a stopped one, and
 * replaces any machine whose agent answers for a different chat.
 *
 * `allowReplace` (boot path only): also replace a machine created from an
 * older guest image. Verify passes `false` — it shares the machine with a
 * possibly live preview and must never tear that preview down. The boot path
 * only reaches this with no live tracked child (restart stops it first).
 */
function ensureProjectMachine(chatId, { log, allowReplace = true } = {}) {
  return withMachineLock(chatId, async () => {
    const config = assertMachineIsolationReady();
    const fly = flyClient(config);
    let record = readMachineRecord(chatId);

    if (record) {
      let machine = null;
      try {
        machine = await fly.getMachine(record.machineId);
      } catch (error) {
        if (error instanceof FlyMachinesError && error.notFound) machine = null;
        else throw error;
      }
      const replace = async (reason) => {
        await log?.(`Guest machine ${record.machineId} ${reason}; replacing it.`);
        await destroyMachineQuietly(fly, record.machineId);
        await writeMachineRecord(chatId, null);
        record = null;
      };
      if (!machine || machine.state === "destroyed" || machine.state === "destroying") {
        await log?.(`Guest machine ${record.machineId} is gone; creating a new one.`);
        await writeMachineRecord(chatId, null);
        record = null;
      } else if (allowReplace && record.image && record.image !== config.image) {
        // Image rolled: compare against what WE created the machine with, not
        // Fly's echoed/normalized config string.
        await replace("runs an old image");
      } else if (machine.state === "stopping") {
        // `stop` returns before the machine is down; a quick resume must not
        // throw away node_modules and the fingerprint by recreating it.
        await waitForMachineState(fly, record.machineId, "stopped", 60_000);
        await fly.startMachine(record.machineId);
      } else if (machine.state === "stopped" || machine.state === "suspended" || machine.state === "created") {
        await fly.startMachine(record.machineId);
      } else if (machine.state !== "started" && machine.state !== "starting") {
        if (!allowReplace) {
          throw new Error(`Guest machine ${record.machineId} is in state ${machine.state}; refusing to replace it from a non-boot path.`);
        }
        await replace(`is ${machine.state}`);
      }
    }

    if (!record) record = await createFreshMachine(fly, config, chatId, log);

    try {
      await ensureStarted(fly, config, record, log);
      const guest = guestClientFor(record, config);
      await waitForAgentIdentity(guest, { chatId, timeoutMs: config.agentReadyTimeoutMs });
      await writeMachineRecord(chatId, record);
      return { record, guest, config };
    } catch (error) {
      // Fail-closed means the CALLER fails; it does not mean every error
      // destroys the machine. Destroy only when the machine itself is the
      // problem: it answers for another chat, or (boot path) it never became
      // ready. A transient Machines-API/network error during a verify must
      // never take down the machine that is serving the live preview.
      const identityMismatch = error?.code === "PREVIEW_GUEST_IDENTITY_MISMATCH";
      const neverReady = error?.code === "PREVIEW_GUEST_NOT_READY";
      if (identityMismatch || (allowReplace && neverReady)) {
        await destroyMachineQuietly(fly, record.machineId);
        await writeMachineRecord(chatId, null);
        await log?.(
          `Guest machine ${record.machineId} rejected and destroyed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      } else {
        await log?.(
          `Guest machine ${record.machineId} not usable right now (kept): ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
      throw error;
    }
  });
}

/** Guest client for an existing, previously proven machine (no API calls). */
function guestForChat(chatId) {
  const record = readMachineRecord(chatId);
  if (!record || !record.privateIp) return null;
  return guestClientFor(record, machineIsolationConfig());
}

function stopProjectMachine(chatId, { log } = {}) {
  return withMachineLock(chatId, async () => {
    const record = readMachineRecord(chatId);
    if (!record) return false;
    const config = assertMachineIsolationReady();
    const fly = flyClient(config);
    try {
      await fly.stopMachine(record.machineId);
      record.state = "stopped";
      await writeMachineRecord(chatId, record);
      await log?.(`Guest machine ${record.machineId} stopped.`);
      return true;
    } catch (error) {
      if (error instanceof FlyMachinesError && error.notFound) {
        await writeMachineRecord(chatId, null);
        return false;
      }
      throw error;
    }
  });
}

function destroyProjectMachine(chatId, { log } = {}) {
  return withMachineLock(chatId, async () => {
    const record = readMachineRecord(chatId);
    if (!record) return false;
    const config = assertMachineIsolationReady();
    const fly = flyClient(config);
    await destroyMachineQuietly(fly, record.machineId);
    await writeMachineRecord(chatId, null);
    await log?.(`Guest machine ${record.machineId} destroyed.`);
    return true;
  });
}

function listProjectMachineRecords() {
  const data = readStoreSync();
  return Object.entries(data.machines ?? {}).map(([chatId, record]) => ({
    chatId,
    ...publicRecord(record),
  }));
}

/**
 * Destroy guests this control plane owns that no usable session or active
 * verify references any more, including machines whose store record was lost.
 * Only machines tagged with OUR host identity are touched.
 */
function isSessionUsableNow(session, nowMs) {
  if (!session || session.status === "destroyed") return false;
  const exp = Date.parse(session.sessionExpiresAt ?? "");
  return !(Number.isFinite(exp) && nowMs > exp);
}

/** Chats with a usable session right now, read fresh (not from a stale sweep snapshot). */
function liveChatIdsFromStore() {
  const nowMs = Date.now();
  const keep = new Set();
  for (const session of Object.values(readStoreSync().sessions ?? {})) {
    if (!isSessionUsableNow(session, nowMs)) continue;
    const chatId = typeof session.chatId === "string" && session.chatId.trim()
      ? session.chatId.trim()
      : typeof session.projectId === "string" ? session.projectId.trim() : "";
    if (chatId) keep.add(chatId);
  }
  return keep;
}

const ORPHAN_GRACE_MS = 10 * 60 * 1000;

async function reconcileProjectMachines({ keepChatIds }) {
  const config = assertMachineIsolationReady();
  const fly = flyClient(config);
  const keep = new Set(keepChatIds instanceof Set ? keepChatIds : keepChatIds ?? []);
  const destroyed = [];
  const records = readStoreSync().machines ?? {};
  for (const chatId of Object.keys(records)) {
    if (keep.has(chatId)) continue;
    await withMachineLock(chatId, async () => {
      // Re-check under the machine lock with a fresh store read: a session
      // (and its machine) created after the sweep snapshot must survive.
      if (liveChatIdsFromStore().has(chatId)) return;
      const current = readMachineRecord(chatId);
      if (!current) return;
      await destroyMachineQuietly(fly, current.machineId);
      await writeMachineRecord(chatId, null);
      destroyed.push({ chatId, machineId: current.machineId, reason: "no_session" });
    });
  }
  let listed = [];
  try {
    listed = await fly.listMachines({
      metadata: { [METADATA_ROLE_KEY]: METADATA_ROLE, [METADATA_HOST_KEY]: config.hostIdentity },
    });
  } catch {
    listed = [];
  }
  const nowMs = Date.now();
  for (const machine of Array.isArray(listed) ? listed : []) {
    const chatId = machine?.config?.metadata?.[METADATA_CHAT_KEY];
    if (!machine?.id) continue;
    if (machine.state === "destroyed" || machine.state === "destroying") continue;
    // A create that returned moments ago may not have its record written yet;
    // leave young machines alone and let a later sweep decide.
    const createdAt = Date.parse(machine.created_at ?? "");
    if (Number.isFinite(createdAt) && nowMs - createdAt < ORPHAN_GRACE_MS) continue;
    const decided = await withMachineLock(chatId ?? `orphan:${machine.id}`, async () => {
      const known = new Set(Object.values(readStoreSync().machines ?? {}).map((record) => record.machineId));
      if (known.has(machine.id)) return false;
      // Orphan: no record means no token we know, so it is unusable even for a
      // live chat (the next boot creates a fresh machine). Destroy.
      await destroyMachineQuietly(fly, machine.id);
      return true;
    });
    if (decided) destroyed.push({ chatId: chatId ?? null, machineId: machine.id, reason: "orphan" });
  }
  return { destroyed };
}

function setMachineClientsForTesting({ fly, guestFactory } = {}) {
  flyClientForTesting = fly ?? null;
  guestClientFactoryForTesting = typeof guestFactory === "function" ? guestFactory : null;
}

module.exports = {
  METADATA_CHAT_KEY,
  METADATA_HOST_KEY,
  METADATA_ROLE,
  METADATA_ROLE_KEY,
  destroyProjectMachine,
  ensureProjectMachine,
  guestForChat,
  listProjectMachineRecords,
  machineConfigPayload,
  readMachineRecord,
  reconcileProjectMachines,
  setMachineClientsForTesting,
  stopProjectMachine,
};
