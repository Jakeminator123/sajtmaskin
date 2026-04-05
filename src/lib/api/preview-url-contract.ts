/**
 * Public HTTP/SSE JSON uses `previewUrl` only (no response key `demoUrl`).
 * DB column remains `demo_url`. Inbound webhooks may still send legacy `demoUrl`.
 * @see docs/plans/avklarat/KORPLAN-preview-url-api.md
 */

export function previewUrlField(url: string | null | undefined): { previewUrl: string | null } {
  if (url == null || url === "") return { previewUrl: null };
  return { previewUrl: String(url) };
}

export function readPreviewUrl(data: { previewUrl?: unknown } | null | undefined): string | null {
  if (typeof data?.previewUrl !== "string") return null;
  const t = data.previewUrl.trim();
  return t ? t : null;
}

/**
 * Inbound webhook / legacy payloads: prefer `previewUrl`, then `sandboxUrl`,
 * then fall back to legacy `demoUrl`.
 */
export function resolveInboundPreviewUrl(
  data: { previewUrl?: unknown; sandboxUrl?: unknown; demoUrl?: unknown } | null | undefined,
): string | null {
  const p = readPreviewUrl(data);
  if (p) return p;
  if (typeof data?.sandboxUrl === "string") {
    const sandbox = data.sandboxUrl.trim();
    if (sandbox) return sandbox;
  }
  if (typeof data?.demoUrl !== "string") return null;
  const t = data.demoUrl.trim();
  return t ? t : null;
}
