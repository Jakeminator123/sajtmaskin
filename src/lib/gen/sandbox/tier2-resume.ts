import { tryResumeSandboxById, isSandboxConfigured } from "@/lib/mcp/runtime-url";
import { fetchPreviewHostStatus } from "./preview-host-client";
import type { SandboxSessionEntry } from "./session-store";

/**
 * Resume tier-2 preview for a stored session — Vercel VM or preview-host HTTP status.
 */
export async function tryResumeTier2Runtime(
  entry: SandboxSessionEntry,
): Promise<{ sandboxId: string; primaryUrl: string } | null> {
  const provider = entry.tier2Provider === "preview_host" ? "preview_host" : "vercel_sandbox";
  if (provider === "preview_host") {
    return fetchPreviewHostStatus(entry.sandboxId);
  }
  if (!isSandboxConfigured()) return null;
  return tryResumeSandboxById(entry.sandboxId);
}
