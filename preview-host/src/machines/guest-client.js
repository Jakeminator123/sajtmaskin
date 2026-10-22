"use strict";

// HTTP client for the guest agent (../../guest/agent.js) running inside one
// project's Fly Machine. Every call carries that machine's bearer token.

const DEFAULT_TIMEOUT_MS = 30_000;

class GuestAgentError extends Error {
  constructor(message, { status = null, body = null, path = null } = {}) {
    super(message);
    this.name = "GuestAgentError";
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

/** `http://[fdaa::1]:7070` for IPv6, `http://127.0.0.2:7070` otherwise. */
function guestBaseUrl(privateIp, port, protocol = "http") {
  const host = privateIp.includes(":") && !privateIp.startsWith("[") ? `[${privateIp}]` : privateIp;
  return `${protocol}://${host}:${port}`;
}

function createGuestClient({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  if (!baseUrl || !token) throw new Error("Guest client requires baseUrl and token.");
  const base = baseUrl.replace(/\/$/, "");
  const authHeaders = { authorization: `Bearer ${token}` };

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
          ...authHeaders,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      throw new GuestAgentError(
        `Guest ${method} ${path} failed: ${error instanceof Error ? error.message : "network error"}`,
        { path },
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
        parsed && typeof parsed === "object"
          ? parsed.message || parsed.error || ""
          : text.slice(0, 300);
      throw new GuestAgentError(
        `Guest ${method} ${path} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
        { status: response.status, body: parsed, path },
      );
    }
    return parsed;
  }

  const ws = (name) => `/workspaces/${encodeURIComponent(name)}`;

  return {
    baseUrl: base,
    /** Target the control-plane proxy forwards browser traffic to. */
    proxyTarget() {
      // Dedicated header so a browser-sent `Authorization` (generated apps'
      // own API routes read it) survives the hop; the agent strips only this.
      return {
        http: `${base}/proxy`,
        ws: `${base.replace(/^http/, "ws")}/proxy`,
        headers: { "x-sajtmaskin-guest-token": token },
      };
    },
    health({ timeoutMs = 5000 } = {}) {
      return request("GET", "/health", { timeoutMs });
    },
    putWorkspace(name, files) {
      return request("PUT", ws(name), { body: { files }, timeoutMs: 120_000 });
    },
    patchWorkspace(name, files, removedPaths = []) {
      return request("PATCH", ws(name), { body: { files, removedPaths }, timeoutMs: 60_000 });
    },
    deleteWorkspace(name) {
      return request("DELETE", ws(name), { timeoutMs: 60_000 });
    },
    readFile(name, relPath) {
      return request("GET", `${ws(name)}/file`, { query: { path: relPath } });
    },
    state(name, { probes = [] } = {}) {
      return request("GET", `${ws(name)}/state`, {
        query: probes.length > 0 ? { probe: probes.join(",") } : undefined,
      });
    },
    writeDepsState(name, fingerprint) {
      return request("POST", `${ws(name)}/deps-state`, { body: { fingerprint } });
    },
    seedNodeModules(name, { fingerprint, from = "warm" }) {
      return request("POST", `${ws(name)}/seed-node-modules`, {
        body: { fingerprint, from },
        timeoutMs: 180_000,
      });
    },
    exec(name, { command, timeoutMs, env }) {
      return request("POST", `${ws(name)}/exec`, {
        body: { command, timeoutMs, env },
        timeoutMs: (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30 * 60 * 1000) + 15_000,
      });
    },
    devStart({ args, env }) {
      return request("POST", "/dev/start", { body: { args, env }, timeoutMs: 60_000 });
    },
    devStop({ generation, drainMs } = {}) {
      return request("POST", "/dev/stop", { body: { generation, drainMs }, timeoutMs: 60_000 });
    },
    devStatus({ since = 0 } = {}) {
      return request("GET", "/dev/status", { query: { since }, timeoutMs: 10_000 });
    },
  };
}

module.exports = {
  GuestAgentError,
  createGuestClient,
  guestBaseUrl,
};
