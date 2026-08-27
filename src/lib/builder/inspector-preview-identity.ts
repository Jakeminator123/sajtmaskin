import { getActivePreviewSessionAsync } from "@/lib/gen/preview/session-store";

export type InspectorPreviewIdentity = {
  chatId: string;
  versionId: string;
  previewSessionId: string;
  lifecycleToken: string | null;
};

export type ParsedInspectorPreviewIdentity =
  | { status: "absent"; identity: null }
  | { status: "invalid"; identity: null }
  | { status: "valid"; identity: InspectorPreviewIdentity };

/**
 * The only tuple-less compatibility surface is the app's own legacy render
 * shim. Exact origin + path prevents a forged Host header or arbitrary local
 * URL from turning the non-serverless Playwright fallback into an SSRF proxy.
 */
export function isInspectorCompatibilityPreviewUrl(
  requestedUrl: string,
  appRequestUrl: string,
): boolean {
  try {
    const requested = new URL(requestedUrl);
    const app = new URL(appRequestUrl);
    return (
      requested.origin === app.origin &&
      requested.pathname.replace(/\/+$/, "") === "/api/preview-render"
    );
  } catch {
    return false;
  }
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Parsing preserves an explicit `absent` state so each server surface can
 * decide whether its narrowly defined compatibility URL supports it. Once any
 * tuple field is supplied, all fields (including an explicit null legacy
 * lifecycle token) are required.
 */
export function parseInspectorPreviewIdentity(
  body: Record<string, unknown>,
): ParsedInspectorPreviewIdentity {
  const keys = ["chatId", "versionId", "previewSessionId", "lifecycleToken"] as const;
  if (!keys.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    return { status: "absent", identity: null };
  }
  const chatId = nonEmpty(body.chatId);
  const versionId = nonEmpty(body.versionId);
  const previewSessionId = nonEmpty(body.previewSessionId);
  const hasLifecycle = Object.prototype.hasOwnProperty.call(body, "lifecycleToken");
  const lifecycleToken = body.lifecycleToken === null ? null : nonEmpty(body.lifecycleToken);
  if (!chatId || !versionId || !previewSessionId || !hasLifecycle) {
    return { status: "invalid", identity: null };
  }
  if (body.lifecycleToken !== null && !lifecycleToken) {
    return { status: "invalid", identity: null };
  }
  return {
    status: "valid",
    identity: { chatId, versionId, previewSessionId, lifecycleToken },
  };
}

function urlBelongsToSession(requestUrl: string, sessionUrl: string): boolean {
  try {
    const requested = new URL(requestUrl);
    const session = new URL(sessionUrl);
    if (requested.origin !== session.origin) return false;
    const basePath = session.pathname.replace(/\/+$/, "") || "/";
    const requestedPath = requested.pathname.replace(/\/+$/, "") || "/";
    if (basePath === "/") return true;
    return requestedPath === basePath || requestedPath.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
}

export async function isInspectorPreviewIdentityCurrent(
  identity: InspectorPreviewIdentity,
  requestedUrl: string,
): Promise<boolean> {
  const session = await getActivePreviewSessionAsync(identity.chatId);
  return Boolean(
    session &&
      session.versionId === identity.versionId &&
      session.previewSessionId === identity.previewSessionId &&
      (session.lifecycleToken?.trim() || null) === identity.lifecycleToken &&
      urlBelongsToSession(requestedUrl, session.previewUrl),
  );
}

export function inspectorPreviewIdentityCacheKey(
  identity: InspectorPreviewIdentity | null,
): string {
  if (!identity) return "compat";
  return [
    identity.chatId,
    identity.versionId,
    identity.previewSessionId,
    identity.lifecycleToken ?? "legacy",
  ].join(":");
}
