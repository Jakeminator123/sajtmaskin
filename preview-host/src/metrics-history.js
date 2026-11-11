"use strict";

// Samtidighetshistorik för backoffice-sidan "Samtidighet". En sampling per
// minut av hur många gästmaskiner och förhandsvisningar som lever, sparad som
// NDJSON i datavolymen (`/data` på Fly) och avgränsad till 14 dagar.
//
// Medvetet billigt: varje sampling läser bara storen och processens egna
// räknare — inga anrop mot Fly Machines-API:t. `guests` är därför
// kontrollplanets bild (posten i storen), inte Flys.
//
// Filen är append-only mellan kompakteringar så ett krasch tappar högst en
// sampling; en trasig rad hoppas över vid inläsning.

const fs = require("node:fs");
const path = require("node:path");
const { getDataDir, readStoreSync } = require("./store.js");

const FILE_NAME = "metrics-history.ndjson";
const DEFAULT_INTERVAL_MS = 60 * 1000;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
// Skriv om filen (utan utgångna rader) ungefär en gång i timmen.
const COMPACT_EVERY_APPENDS = 60;

function positiveInt(raw, fallback) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isSessionUsable(session, nowMs) {
  if (!session || typeof session !== "object" || session.status === "destroyed") return false;
  const expiresAt = Date.parse(session.sessionExpiresAt ?? "");
  return !(Number.isFinite(expiresAt) && nowMs > expiresAt);
}

/** Runtime-räknaren laddas lat så modulen går att testa utan runtime-stacken. */
function runningRuntimeCount() {
  try {
    return require("./runtime/shared.js").runtimeChildren.size;
  } catch {
    return null;
  }
}

/**
 * En sampling. `guests` = gästmaskiner som kontrollplanet tror är startade
 * (SM-080, maskinläge). `runtimes` = förhandsvisningar med en levande
 * dev-process (lokal i delat läge, fjärr i maskinläge). Inga tokens.
 */
function collectSample(nowMs = Date.now(), { store = readStoreSync(), runtimes } = {}) {
  const machines = Object.values(store?.machines ?? {}).filter(
    (record) => record && typeof record === "object",
  );
  const sessions = Object.values(store?.sessions ?? {}).filter((session) =>
    isSessionUsable(session, nowMs),
  );
  const runtimeCount = runtimes === undefined ? runningRuntimeCount() : runtimes;
  return {
    t: nowMs,
    guests: machines.filter((record) => record.state === "started").length,
    machines: machines.length,
    runtimes: Number.isSafeInteger(runtimeCount) ? runtimeCount : null,
    sessions: sessions.length,
  };
}

function parseSampleLine(line) {
  if (!line || !line.trim()) return null;
  try {
    const sample = JSON.parse(line);
    if (!sample || typeof sample !== "object" || !Number.isFinite(sample.t)) return null;
    return sample;
  } catch {
    return null;
  }
}

function createMetricsHistory({
  dataDir = getDataDir(),
  intervalMs = positiveInt(process.env.PREVIEW_HOST_METRICS_SAMPLE_MS, DEFAULT_INTERVAL_MS),
  retentionMs = RETENTION_MS,
  collect = collectSample,
  now = () => Date.now(),
} = {}) {
  const filePath = path.join(dataDir, FILE_NAME);
  // Ringbuffertens tak: ett fönsters samplingar plus marginal för omstarter.
  const capacity = Math.ceil(retentionMs / intervalMs) + 120;
  let samples = null;
  let appendsSinceCompact = 0;
  let timer = null;
  let startedAt = null;
  const status = { writeErrors: 0, lastError: null };

  function prune(nowMs) {
    const cutoff = nowMs - retentionMs;
    let firstKept = 0;
    while (firstKept < samples.length && samples[firstKept].t < cutoff) firstKept += 1;
    const overflow = samples.length - firstKept - capacity;
    if (overflow > 0) firstKept += overflow;
    if (firstKept > 0) samples = samples.slice(firstKept);
  }

  function load() {
    if (samples) return samples;
    samples = [];
    let raw = "";
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") {
        status.lastError = `read: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    for (const line of raw.split("\n")) {
      const sample = parseSampleLine(line);
      if (sample) samples.push(sample);
    }
    samples.sort((a, b) => a.t - b.t);
    prune(now());
    return samples;
  }

  function compact() {
    const tmpPath = `${filePath}.tmp`;
    const body = samples.map((sample) => JSON.stringify(sample)).join("\n");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(tmpPath, body ? `${body}\n` : "", "utf8");
    fs.renameSync(tmpPath, filePath);
    appendsSinceCompact = 0;
  }

  function record(sample) {
    load();
    samples.push(sample);
    prune(sample.t);
    try {
      appendsSinceCompact += 1;
      if (appendsSinceCompact >= COMPACT_EVERY_APPENDS) {
        compact();
      } else {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.appendFileSync(filePath, `${JSON.stringify(sample)}\n`, "utf8");
      }
    } catch (error) {
      // Full disk eller liknande: historiken lever vidare i minnet och felet
      // syns i /admin/metrics i stället för att fälla servern.
      status.writeErrors += 1;
      status.lastError = `write: ${error instanceof Error ? error.message : String(error)}`;
    }
    return sample;
  }

  function sampleNow() {
    try {
      return record(collect(now()));
    } catch (error) {
      status.lastError = `collect: ${error instanceof Error ? error.message : String(error)}`;
      return null;
    }
  }

  function snapshot({ sinceMs } = {}) {
    load();
    const since = Number.isFinite(sinceMs) ? sinceMs : -Infinity;
    return {
      intervalMs,
      retentionMs,
      startedAt,
      writeErrors: status.writeErrors,
      lastError: status.lastError,
      samples: samples.filter((sample) => sample.t >= since),
    };
  }

  function start() {
    if (timer) return;
    startedAt = new Date(now()).toISOString();
    load();
    sampleNow();
    timer = setInterval(sampleNow, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { filePath, capacity, load, record, sampleNow, snapshot, compact, start, stop };
}

let defaultHistory = null;

/** Processens enda historik; servern startar samplingen, routen läser den. */
function getMetricsHistory() {
  if (!defaultHistory) defaultHistory = createMetricsHistory();
  return defaultHistory;
}

module.exports = {
  FILE_NAME,
  RETENTION_MS,
  collectSample,
  createMetricsHistory,
  getMetricsHistory,
};
