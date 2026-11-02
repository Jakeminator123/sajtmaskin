"use strict";

// Isoleringsläge för preview-hosten (SM-080).
//
//   PREVIEW_HOST_ISOLATION=shared   (default, oförändrat beteende) — install,
//       verify och `next dev` körs som processer på den här hosten.
//   PREVIEW_HOST_ISOLATION=machine  — varje chat får en egen Fly Machine
//       (gästagent, se ../../guest/). Hosten blir rent kontrollplan.
//
// Fail-closed: allt annat än exakt `shared` tolkas som ett krav på isolering.
// Är konfigurationen då ofullständig vägrar varje boot/verify med ett tydligt
// fel i stället för att tyst falla tillbaka på den delade hosten (beslut
// 2026-09-18, docs/decisions/README.md).

const DEFAULT_MACHINES_API_BASE = "https://api.machines.dev";
const INTERNAL_MACHINES_API_BASE = "http://_api.internal:4280";

function readInt(name, fallback, { min = 1 } = {}) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function readTrimmed(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isolationMode() {
  const raw = readTrimmed("PREVIEW_HOST_ISOLATION").toLowerCase();
  if (!raw || raw === "shared") return "shared";
  return "machine";
}

function isMachineIsolation() {
  return isolationMode() === "machine";
}

function machineIsolationConfig() {
  const rawMode = readTrimmed("PREVIEW_HOST_ISOLATION").toLowerCase();
  return {
    mode: isolationMode(),
    rawMode,
    appName: readTrimmed("PREVIEW_GUEST_FLY_APP"),
    image: readTrimmed("PREVIEW_GUEST_IMAGE"),
    apiBase: readTrimmed("PREVIEW_GUEST_MACHINES_API_BASE") || DEFAULT_MACHINES_API_BASE,
    // Explicit, guest-app-scoped token only. The generic FLY_API_TOKEN is
    // deliberately NOT read: a broad token lying in a host's env is exactly
    // what shared mode can leak through /proc, and a deploy token for the
    // control-plane app itself must never double as the guest-app token.
    apiToken: readTrimmed("PREVIEW_GUEST_FLY_API_TOKEN"),
    region: readTrimmed("PREVIEW_GUEST_REGION") || readTrimmed("FLY_REGION") || "arn",
    cpuKind: readTrimmed("PREVIEW_GUEST_CPU_KIND") || "shared",
    cpus: readInt("PREVIEW_GUEST_CPUS", 2),
    memoryMb: readInt("PREVIEW_GUEST_MEMORY_MB", 2048, { min: 256 }),
    agentPort: readInt("PREVIEW_GUEST_AGENT_PORT", 7070),
    devPort: readInt("PREVIEW_GUEST_DEV_PORT", 3000),
    // Tag written into machine metadata so a dev/staging control plane never
    // reconciles (destroys) another control plane's guests in the same app.
    hostIdentity: readTrimmed("PREVIEW_GUEST_HOST_IDENTITY") || readTrimmed("FLY_APP_NAME") || "local",
    machineStartTimeoutMs: readInt("PREVIEW_GUEST_MACHINE_START_TIMEOUT_MS", 120_000),
    agentReadyTimeoutMs: readInt("PREVIEW_GUEST_AGENT_READY_TIMEOUT_MS", 90_000),
    stopMachineOnHibernate:
      (readTrimmed("PREVIEW_GUEST_STOP_ON_HIBERNATE") || "true").toLowerCase() !== "false",
  };
}

function validateMachineIsolationConfig(config = machineIsolationConfig()) {
  const problems = [];
  if (config.mode !== "machine") return { ok: true, problems };
  if (config.rawMode !== "machine") {
    problems.push(
      `PREVIEW_HOST_ISOLATION="${config.rawMode}" is not a known mode (use "shared" or "machine"); treated as a request for isolation and refused.`,
    );
  }
  if (!config.appName) problems.push("PREVIEW_GUEST_FLY_APP is missing.");
  if (!config.image) problems.push("PREVIEW_GUEST_IMAGE is missing.");
  if (!config.apiToken) problems.push("PREVIEW_GUEST_FLY_API_TOKEN (guest-app-scoped Fly token) is missing.");
  if (!/^https?:\/\//.test(config.apiBase)) {
    problems.push("PREVIEW_GUEST_MACHINES_API_BASE must be an http(s) URL.");
  }
  return { ok: problems.length === 0, problems };
}

class IsolationUnavailableError extends Error {
  constructor(problems) {
    super(
      `Preview isolation is required but not available: ${problems.join(" ")} ` +
        "Refusing to run project code on the shared host (fail-closed).",
    );
    this.code = "PREVIEW_ISOLATION_UNAVAILABLE";
    this.problems = problems;
  }
}

/** Throws unless machine isolation is fully configured. Never falls back. */
function assertMachineIsolationReady() {
  const config = machineIsolationConfig();
  const validation = validateMachineIsolationConfig(config);
  if (!validation.ok) throw new IsolationUnavailableError(validation.problems);
  return config;
}

/** Public, secret-free description for `/health` and `/admin/machines`. */
function describeIsolation() {
  const config = machineIsolationConfig();
  const validation = validateMachineIsolationConfig(config);
  return {
    mode: config.mode,
    configured: validation.ok,
    problems: validation.problems,
    ...(config.mode === "machine"
      ? {
          guestApp: config.appName || null,
          image: config.image || null,
          region: config.region,
          guest: { cpuKind: config.cpuKind, cpus: config.cpus, memoryMb: config.memoryMb },
          hostIdentity: config.hostIdentity,
        }
      : {}),
  };
}

module.exports = {
  DEFAULT_MACHINES_API_BASE,
  INTERNAL_MACHINES_API_BASE,
  IsolationUnavailableError,
  assertMachineIsolationReady,
  describeIsolation,
  isMachineIsolation,
  isolationMode,
  machineIsolationConfig,
  validateMachineIsolationConfig,
};
