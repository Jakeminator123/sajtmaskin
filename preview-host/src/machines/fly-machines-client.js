"use strict";

// Minimal Fly Machines REST client (https://docs.fly.io/machines/api/). Only
// the calls the per-project guest lifecycle needs. No SDK: the host has no
// dependency budget for one, and the surface is six endpoints. There is no
// stop: a stopped Machine loses its rootfs anyway, so idle guests are
// destroyed (project-machines.js) and the next visit creates a fresh one.

const DEFAULT_TIMEOUT_MS = 30_000;

// Placement failures Fly reports when the region has no room for the guest
// size right now ("could not reserve resource for machine: insufficient
// memory available…"). The status code for these varies (412/422/5xx), so
// the message decides.
const CAPACITY_ERROR_RE =
  /insufficient (?:resources|memory|cpus?|capacity)|could not reserve resource|no capacity|capacity (?:exceeded|unavailable)/i;

class FlyMachinesError extends Error {
  constructor(
    message,
    { status = null, body = null, method = null, path = null, retryAfterMs = null } = {},
  ) {
    super(message);
    this.name = "FlyMachinesError";
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
    this.retryAfterMs = retryAfterMs;
  }
  get notFound() {
    return this.status === 404;
  }
  /**
   * Worth retrying a create: rate limit, server error or a capacity miss.
   * A transport error without a status is not retried — the create may have
   * gone through, and the orphan reconcile is the cleanup path for that.
   */
  get retryableCreate() {
    if (this.status === 429) return true;
    if (Number.isInteger(this.status) && this.status >= 500) return true;
    return CAPACITY_ERROR_RE.test(this.message);
  }
}

function parseRetryAfterMs(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/**
 * Fly uses two auth schemes: tokens from `fly tokens create` (macaroons,
 * printed as `FlyV1 fm2_…`) must be sent as `Authorization: FlyV1 <token>`;
 * only `flyctl auth token` output uses `Bearer`. The guest-app deploy token
 * the runbook prescribes is a macaroon, so sending it as Bearer is a 401.
 */
function flyAuthorizationHeader(apiToken) {
  const token = String(apiToken ?? "").trim();
  if (/^FlyV1\s+/i.test(token)) return `FlyV1 ${token.replace(/^FlyV1\s+/i, "")}`;
  if (/^fm\d_/.test(token)) return `FlyV1 ${token}`;
  return `Bearer ${token}`;
}

function createFlyMachinesClient({ apiBase, apiToken, appName, fetchImpl = globalThis.fetch }) {
  if (!apiBase || !apiToken || !appName) {
    throw new Error("Fly Machines client requires apiBase, apiToken and appName.");
  }
  const authorization = flyAuthorizationHeader(apiToken);
  const base = apiBase.replace(/\/$/, "");
  const appPath = `/v1/apps/${encodeURIComponent(appName)}`;

  async function request(method, path, { body, timeoutMs = DEFAULT_TIMEOUT_MS, query } = {}) {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          authorization,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      throw new FlyMachinesError(
        `Fly Machines ${method} ${path} failed: ${error instanceof Error ? error.message : "network error"}`,
        { method, path },
      );
    }
    clearTimeout(timer);
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text.slice(0, 2000) };
      }
    }
    if (!response.ok) {
      const detail =
        parsed && typeof parsed === "object" && typeof parsed.error === "string"
          ? parsed.error
          : text.slice(0, 300);
      throw new FlyMachinesError(
        `Fly Machines ${method} ${path} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        {
          status: response.status,
          body: parsed,
          method,
          path,
          retryAfterMs: parseRetryAfterMs(response.headers?.get?.("retry-after") ?? null),
        },
      );
    }
    return parsed;
  }

  return {
    appName,
    createMachine(payload) {
      return request("POST", `${appPath}/machines`, { body: payload, timeoutMs: 60_000 });
    },
    getMachine(machineId) {
      return request("GET", `${appPath}/machines/${encodeURIComponent(machineId)}`);
    },
    listMachines({ metadata, state } = {}) {
      const query = {};
      for (const [key, value] of Object.entries(metadata ?? {})) query[`metadata.${key}`] = value;
      if (state) query.state = state;
      return request("GET", `${appPath}/machines`, { query });
    },
    /** Blocks server-side until the machine reaches `state` (or times out). */
    waitForMachine(machineId, { state = "started", timeoutSeconds = 60 } = {}) {
      return request("GET", `${appPath}/machines/${encodeURIComponent(machineId)}/wait`, {
        query: { state, timeout: timeoutSeconds },
        timeoutMs: (timeoutSeconds + 15) * 1000,
      });
    },
    startMachine(machineId) {
      return request("POST", `${appPath}/machines/${encodeURIComponent(machineId)}/start`);
    },
    destroyMachine(machineId, { force = true } = {}) {
      return request("DELETE", `${appPath}/machines/${encodeURIComponent(machineId)}`, {
        query: { force: force ? "true" : "false" },
      });
    },
  };
}

module.exports = {
  FlyMachinesError,
  createFlyMachinesClient,
  flyAuthorizationHeader,
};
