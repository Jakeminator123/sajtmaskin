/**
 * Server-side HTTPS proof for a candidate customer host.
 *
 * A4 can call this later when it binds an exact READY deployment. This module
 * is intentionally standalone: it must not be imported from deploy POST, and
 * it never writes env, vercel.json, aliases, DNS or the database.
 *
 * Unknown provider/network status is not the same as a confirmed invalid host.
 * Callers must keep the last working identity when the verdict is `unknown`.
 */

import https from "node:https";
import tls from "node:tls";
import {
  guardedLookup,
  PINNED_ADDRESS_BLOCKED_MESSAGE,
} from "@/lib/capture/pinned-fetch";
import { normalizeDomainHostname } from "@/lib/live-site-url";
import { isDisallowedHost } from "@/lib/ssrf-guard";

export const CANONICAL_HTTPS_PROOF_KIND = "sajtmaskin.canonical_https_proof" as const;
export const CANONICAL_HTTPS_PROOF_VERSION = 1 as const;

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_REDIRECT_HOPS = 4;

export type CanonicalHttpsProviderStatus = "verified" | "invalid" | "unknown";

export type CanonicalHttpsProofReason =
  | "invalid_origin"
  | "invalid_identity"
  | "http_only"
  | "cert_mismatch"
  | "host_mismatch"
  | "self_redirect"
  | "redirect_loop"
  | "blocked_destination"
  | "timeout"
  | "unknown_status"
  | "provider_invalid"
  | "provider_unknown";

export type CanonicalHttpsProof = {
  kind: typeof CANONICAL_HTTPS_PROOF_KIND;
  version: typeof CANONICAL_HTTPS_PROOF_VERSION;
  origin: string;
  hostname: string;
  projectId: string;
  vercelProjectId: string | null;
  verifiedAt: string;
  certificateHosts: string[];
  serverName: string;
  statusCode: number;
};

export type CanonicalHttpsProofFailure = {
  status: "not_ready";
  verdict: "invalid" | "unknown";
  reason: CanonicalHttpsProofReason;
};

export type CanonicalHttpsProofSuccess = {
  status: "ready";
  proof: CanonicalHttpsProof;
};

export type CanonicalHttpsProofResult = CanonicalHttpsProofSuccess | CanonicalHttpsProofFailure;

export type CanonicalHttpsProofInput = {
  candidate: string;
  projectId: string;
  vercelProjectId?: string | null;
  providerStatus?: CanonicalHttpsProviderStatus;
};

export type CanonicalHttpsObservation = {
  timedOut?: boolean;
  protocol?: "https" | "http";
  authorized?: boolean;
  authorizationError?: string | null;
  certificateHosts?: string[];
  serverName?: string;
  responseHost?: string | null;
  statusCode?: number;
  location?: string | null;
  errorKind?:
    | "timeout"
    | "cert_mismatch"
    | "http_only"
    | "network"
    | "unknown"
    | "blocked_destination";
};

export type ProbeCanonicalHttpsOrigin = (input: {
  hostname: string;
  url: string;
  timeoutMs: number;
}) => Promise<CanonicalHttpsObservation>;

export type CanonicalHttpsProofDeps = {
  probe?: ProbeCanonicalHttpsOrigin;
  now?: () => Date;
  timeoutMs?: number;
};

type ParsedHttpsOrigin =
  { status: "ok"; origin: string; hostname: string } | CanonicalHttpsProofFailure;

type ParsedIdentity =
  { status: "ok"; projectId: string; vercelProjectId: string | null } | CanonicalHttpsProofFailure;

function notReady(
  verdict: CanonicalHttpsProofFailure["verdict"],
  reason: CanonicalHttpsProofReason,
): CanonicalHttpsProofFailure {
  return { status: "not_ready", verdict, reason };
}

function isExactIdentity(value: string): boolean {
  return Boolean(value) && value === value.trim();
}

export function parseCanonicalHttpsIdentity(
  projectId: string,
  vercelProjectId?: string | null,
): ParsedIdentity {
  if (!isExactIdentity(projectId)) {
    return notReady("invalid", "invalid_identity");
  }
  if (vercelProjectId == null) {
    return { status: "ok", projectId, vercelProjectId: null };
  }
  if (vercelProjectId === "") {
    return { status: "ok", projectId, vercelProjectId: null };
  }
  if (!isExactIdentity(vercelProjectId)) {
    return notReady("invalid", "invalid_identity");
  }
  return { status: "ok", projectId, vercelProjectId };
}

function isCleanHttpsOrigin(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.search &&
    !url.hash &&
    url.pathname === "/"
  );
}

export function parseCanonicalHttpsCandidate(candidate: string): ParsedHttpsOrigin {
  const raw = candidate.trim();
  if (!raw) return notReady("invalid", "invalid_origin");

  if (/^https?:\/\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return notReady("invalid", "invalid_origin");
    }
    if (url.protocol === "http:") return notReady("invalid", "http_only");
    if (!isCleanHttpsOrigin(url)) {
      return notReady("invalid", "invalid_origin");
    }
    const hostname = normalizeDomainHostname(url.hostname);
    if (!hostname) return notReady("invalid", "invalid_origin");
    if (isDisallowedHost(hostname)) return notReady("invalid", "blocked_destination");
    return { status: "ok", origin: `https://${hostname}`, hostname };
  }

  if (/[:/?#@]/.test(raw)) return notReady("invalid", "invalid_origin");
  const hostname = normalizeDomainHostname(raw);
  if (!hostname) return notReady("invalid", "invalid_origin");
  if (isDisallowedHost(hostname)) return notReady("invalid", "blocked_destination");
  return { status: "ok", origin: `https://${hostname}`, hostname };
}

export function certificateHostMatches(
  hostname: string,
  certificateHosts: readonly string[],
): boolean {
  const host = hostname.toLowerCase();
  return certificateHosts.some((entry) => {
    const candidate = entry.toLowerCase().replace(/\.$/, "");
    if (candidate === host) return true;
    if (!candidate.startsWith("*.")) return false;
    const base = candidate.slice(2);
    const hostLabels = host.split(".");
    const baseLabels = base.split(".");
    return hostLabels.length === baseLabels.length + 1 && host.endsWith(`.${base}`);
  });
}

function requestHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

/**
 * Exact URL the next hop fetches. Path, trailing slash and query stay as the
 * server sent them — only hostname case is folded.
 */
function toRequestUrl(url: URL): string {
  const hostname = requestHostname(url);
  const path = url.pathname || "/";
  return `https://${hostname}${path}${url.search}`;
}

/**
 * Loop / self-redirect key. Root `/` matches a slashless origin; every other
 * trailing slash is significant and must not be stripped.
 */
function toComparisonKey(href: string): string {
  const url = new URL(href);
  const hostname = requestHostname(url);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `https://${hostname}${path}${url.search}`;
}

function parseRedirectTarget(
  location: string,
  currentUrl: string,
  expectedHostname: string,
): { status: "follow"; nextUrl: string } | CanonicalHttpsProofFailure {
  let target: URL;
  try {
    target = new URL(location, currentUrl);
  } catch {
    return notReady("invalid", "invalid_origin");
  }
  if (target.protocol === "http:") return notReady("invalid", "http_only");
  if (target.protocol !== "https:" || target.username || target.password || target.port) {
    return notReady("invalid", "invalid_origin");
  }
  const hostname = normalizeDomainHostname(target.hostname);
  if (!hostname) return notReady("invalid", "invalid_origin");
  if (isDisallowedHost(hostname)) return notReady("invalid", "blocked_destination");
  if (hostname !== expectedHostname) return notReady("invalid", "host_mismatch");
  return { status: "follow", nextUrl: toRequestUrl(target) };
}

function classifyObservation(
  observation: CanonicalHttpsObservation,
  hostname: string,
  currentUrl: string,
):
  | { status: "ready"; statusCode: number; certificateHosts: string[]; serverName: string }
  | { status: "follow"; nextUrl: string }
  | CanonicalHttpsProofFailure {
  if (observation.timedOut || observation.errorKind === "timeout") {
    return notReady("unknown", "timeout");
  }
  if (observation.errorKind === "http_only" || observation.protocol === "http") {
    return notReady("invalid", "http_only");
  }
  if (observation.errorKind === "cert_mismatch") {
    return notReady("invalid", "cert_mismatch");
  }
  if (observation.errorKind === "blocked_destination") {
    return notReady("invalid", "blocked_destination");
  }
  if (observation.errorKind === "network" || observation.errorKind === "unknown") {
    return notReady("unknown", "unknown_status");
  }

  const certificateHosts = (observation.certificateHosts ?? []).map((entry) =>
    entry.toLowerCase().replace(/\.$/, ""),
  );
  const serverName = (observation.serverName ?? "").toLowerCase();
  const responseHost = observation.responseHost
    ? normalizeDomainHostname(observation.responseHost)
    : hostname;

  if (!observation.authorized || !certificateHostMatches(hostname, certificateHosts)) {
    return notReady("invalid", "cert_mismatch");
  }
  if (serverName !== hostname || responseHost !== hostname) {
    return notReady("invalid", "host_mismatch");
  }

  const statusCode = observation.statusCode ?? 0;
  const location = observation.location?.trim() ?? "";
  if (statusCode >= 300 && statusCode < 400 && location) {
    const target = parseRedirectTarget(location, currentUrl, hostname);
    if (target.status === "not_ready") return target;
    if (toComparisonKey(target.nextUrl) === toComparisonKey(currentUrl)) {
      return notReady("invalid", "self_redirect");
    }
    return { status: "follow", nextUrl: target.nextUrl };
  }

  return {
    status: "ready",
    statusCode: statusCode || 200,
    certificateHosts,
    serverName,
  };
}

function collectCertificateHosts(cert: tls.PeerCertificate | undefined): string[] {
  if (!cert || Object.keys(cert).length === 0) return [];
  const hosts: string[] = [];
  if (typeof cert.subjectaltname === "string") {
    for (const part of cert.subjectaltname.split(",")) {
      const match = /^\s*DNS:([^\s,]+)\s*$/i.exec(part);
      if (match?.[1]) hosts.push(match[1].toLowerCase().replace(/\.$/, ""));
    }
  }
  const cn = cert.subject?.CN;
  if (typeof cn === "string" && cn.trim()) {
    hosts.push(cn.toLowerCase().replace(/\.$/, ""));
  }
  return [...new Set(hosts)];
}

function observationFromProbeError(error: unknown): CanonicalHttpsObservation {
  const err = error as NodeJS.ErrnoException;
  const code = err.code ?? "";
  const rawMessage = typeof err.message === "string" ? err.message : "";
  const message = rawMessage.toLowerCase();
  if (rawMessage.includes(PINNED_ADDRESS_BLOCKED_MESSAGE)) {
    return { errorKind: "blocked_destination" };
  }
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || message.includes("timed out")) {
    return { timedOut: true, errorKind: "timeout" };
  }
  if (
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    code === "CERT_HAS_EXPIRED" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    message.includes("hostname/ip does not match") ||
    message.includes("altname")
  ) {
    return { errorKind: "cert_mismatch", authorized: false, protocol: "https" };
  }
  if (
    code === "EPROTO" ||
    code === "HPE_INVALID_CONSTANT" ||
    message.includes("wrong version number") ||
    message.includes("alert protocol")
  ) {
    return { errorKind: "http_only", protocol: "http" };
  }
  return { errorKind: "network" };
}

/**
 * Live TLS/HTTPS observation. Tests must inject a probe instead: Vitest
 * refuses this default so customer hosts are never contacted from unit tests.
 */
export function probeCanonicalHttpsOrigin(input: {
  hostname: string;
  url: string;
  timeoutMs: number;
}): Promise<CanonicalHttpsObservation> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return Promise.resolve({ errorKind: "unknown" });
  }
  if (parsed.protocol !== "https:") {
    return Promise.resolve({ errorKind: "http_only", protocol: "http" });
  }
  if (isDisallowedHost(input.hostname) || isDisallowedHost(parsed.hostname)) {
    return Promise.resolve({ errorKind: "blocked_destination" });
  }

  return new Promise((resolve) => {
    let settled = false;
    // Same pin as capture: the lookup that validates is the lookup the socket
    // uses. fetchWithPinnedDns is not used because it does not expose the peer
    // certificate fields this proof needs (SAN/CN via getPeerCertificate).
    const agent = new https.Agent({ lookup: guardedLookup, keepAlive: false });
    const settle = (observation: CanonicalHttpsObservation) => {
      if (settled) return;
      settled = true;
      agent.destroy();
      resolve(observation);
    };

    const request = https.request(
      {
        host: input.hostname,
        servername: input.hostname,
        port: 443,
        path: `${parsed.pathname}${parsed.search}` || "/",
        method: "GET",
        timeout: input.timeoutMs,
        rejectUnauthorized: false,
        agent,
      },
      (response) => {
        const socket = response.socket as tls.TLSSocket;
        const cert =
          typeof socket.getPeerCertificate === "function" ? socket.getPeerCertificate() : undefined;
        const identityError =
          cert && Object.keys(cert).length > 0
            ? tls.checkServerIdentity(input.hostname, cert)
            : new Error("missing certificate");
        const locationHeader = response.headers.location;
        const location = Array.isArray(locationHeader)
          ? locationHeader[0]
          : (locationHeader ?? null);
        response.resume();
        settle({
          protocol: "https",
          authorized: socket.authorized === true && !identityError,
          authorizationError:
            identityError?.message ??
            (socket.authorizationError ? String(socket.authorizationError) : null),
          certificateHosts: collectCertificateHosts(cert),
          serverName: input.hostname,
          responseHost: input.hostname,
          statusCode: response.statusCode ?? 0,
          location,
        });
        request.destroy();
      },
    );

    request.setTimeout(input.timeoutMs, () => {
      request.destroy();
      settle({ timedOut: true, errorKind: "timeout" });
    });
    request.on("error", (error) => {
      settle(observationFromProbeError(error));
    });
    request.end();
  });
}

export function isCanonicalHttpsProof(value: unknown): value is CanonicalHttpsProof {
  if (!value || typeof value !== "object") return false;
  const proof = value as CanonicalHttpsProof;
  return (
    proof.kind === CANONICAL_HTTPS_PROOF_KIND &&
    proof.version === CANONICAL_HTTPS_PROOF_VERSION &&
    typeof proof.origin === "string" &&
    typeof proof.hostname === "string" &&
    typeof proof.projectId === "string"
  );
}

/**
 * Prove that a candidate host answers on a clean HTTPS origin for a project.
 * No side effects. Fail-closed: only a matching TLS/host observation can
 * produce a proof object A4 may later trust.
 */
export async function proveCanonicalHttps(
  input: CanonicalHttpsProofInput,
  deps: CanonicalHttpsProofDeps = {},
): Promise<CanonicalHttpsProofResult> {
  const identity = parseCanonicalHttpsIdentity(input.projectId, input.vercelProjectId);
  if (identity.status === "not_ready") return identity;

  const parsed = parseCanonicalHttpsCandidate(input.candidate);
  if (parsed.status === "not_ready") return parsed;

  if (input.providerStatus === "invalid") return notReady("invalid", "provider_invalid");

  const probe = deps.probe ?? probeCanonicalHttpsOrigin;
  if (!deps.probe && process.env.VITEST) {
    throw new Error("canonical HTTPS proof refused to probe the network under Vitest");
  }

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const seen = new Set<string>([toComparisonKey(parsed.origin)]);
  let currentUrl = parsed.origin;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    const observation = await probe({
      hostname: parsed.hostname,
      url: currentUrl,
      timeoutMs,
    });
    const classified = classifyObservation(observation, parsed.hostname, currentUrl);
    if (classified.status === "not_ready") return classified;
    if (classified.status === "follow") {
      const nextKey = toComparisonKey(classified.nextUrl);
      if (seen.has(nextKey)) return notReady("invalid", "redirect_loop");
      seen.add(nextKey);
      currentUrl = classified.nextUrl;
      continue;
    }

    if (input.providerStatus === "unknown") return notReady("unknown", "provider_unknown");

    return {
      status: "ready",
      proof: {
        kind: CANONICAL_HTTPS_PROOF_KIND,
        version: CANONICAL_HTTPS_PROOF_VERSION,
        origin: parsed.origin,
        hostname: parsed.hostname,
        projectId: identity.projectId,
        vercelProjectId: identity.vercelProjectId,
        verifiedAt: (deps.now ?? (() => new Date()))().toISOString(),
        certificateHosts: classified.certificateHosts,
        serverName: classified.serverName,
        statusCode: classified.statusCode,
      },
    };
  }

  return notReady("invalid", "redirect_loop");
}
