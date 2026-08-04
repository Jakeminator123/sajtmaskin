"use strict";

const path = require("node:path");
const { PACKAGE_CACHE_DIR } = require("../runtime.js");

/** Directory name of the package cache inside `/data`, for the single-walk lookup. */
const PACKAGE_CACHE_DIR_NAME = path.basename(PACKAGE_CACHE_DIR);

const PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const PREVIEW_BASE_URL =
  process.env.PREVIEW_BASE_URL ?? "https://preview-placeholder.example.com";
const SESSION_TTL_MS =
  Number.parseInt(process.env.PREVIEW_SESSION_TTL_MS ?? `${60 * 60 * 1000}`, 10);
// Prewarm resource leases deliberately share the existing preview-session
// horizon: they bound cold starts before generation credits settle, without
// introducing a second billing or tenant state.
const PREWARM_LEASE_MS = SESSION_TTL_MS;
const OPPORTUNISTIC_CLEANUP_INTERVAL_MS =
  Number.parseInt(process.env.PREVIEW_HOST_OPPORTUNISTIC_CLEANUP_INTERVAL_MS ?? `${5 * 60 * 1000}`, 10);
const BACKGROUND_CLEANUP_INTERVAL_MS =
  Number.parseInt(process.env.PREVIEW_HOST_BACKGROUND_CLEANUP_INTERVAL_MS ?? `${10 * 60 * 1000}`, 10);
// Hur ofta idle-reapern letar efter runtimes utan trafik/öppna iframes.
// Själva idle-fönstret styrs av PREVIEW_HOST_RUNTIME_IDLE_STOP_MS (runtime.js).
const RUNTIME_IDLE_SWEEP_INTERVAL_MS =
  Number.parseInt(process.env.PREVIEW_HOST_RUNTIME_IDLE_SWEEP_INTERVAL_MS ?? `${60 * 1000}`, 10);

module.exports = {
  PACKAGE_CACHE_DIR_NAME,
  PORT,
  HOST,
  PREVIEW_BASE_URL,
  SESSION_TTL_MS,
  PREWARM_LEASE_MS,
  OPPORTUNISTIC_CLEANUP_INTERVAL_MS,
  BACKGROUND_CLEANUP_INTERVAL_MS,
  RUNTIME_IDLE_SWEEP_INTERVAL_MS,
};
