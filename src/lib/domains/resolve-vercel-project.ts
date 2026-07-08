/**
 * Cross-tenant-safe resolution of the Vercel project a customer domain should
 * be attached to, from the Sajtmaskin chat that owns the generated site.
 *
 * Shared by `POST /api/domains/link` and `POST /api/domains/verify` so both
 * routes attach domains to the CUSTOMER's own generated Vercel project — never
 * the workspace's own project (the old `VERCEL_PROJECT_ID` behaviour).
 *
 * Resolution order:
 *  1. Engine chat lookup (`getEngineChatByIdForRequest`) — tenant-guarded, so a
 *     missing/foreign chat yields a 404 (never leaks another tenant's project).
 *  2. The chat's `app_projects` row → persisted `vercel_project_id`.
 *  3. Fallback: the most relevant deployment row for the chat that carries a
 *     Vercel project id (covers sites published before the link column existed).
 *  4. No project yet → 409 (the site must be published first).
 */
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { getProjectById } from "@/lib/db/services/projects";
import { getLatestVercelProjectIdForChat } from "@/lib/deployment";

export type VercelProjectResolution =
  | { ok: true; vercelProjectId: string; source: "app_project" | "deployment" }
  | { ok: false; status: 404 | 409; error: string };

export async function resolveVercelProjectForChat(
  req: Request,
  chatId: string,
  options?: { sessionId?: string },
): Promise<VercelProjectResolution> {
  const engineChat = await getEngineChatByIdForRequest(req, chatId, options);
  if (!engineChat) {
    // Covers both "no such chat" and "chat belongs to another tenant".
    return { ok: false, status: 404, error: "Chatten hittades inte." };
  }

  const projectId =
    typeof engineChat.project_id === "string" ? engineChat.project_id.trim() : "";
  if (projectId) {
    const project = await getProjectById(projectId).catch(() => null);
    const linked = project?.vercel_project_id?.trim();
    if (linked) {
      return { ok: true, vercelProjectId: linked, source: "app_project" };
    }
  }

  const deployed = await getLatestVercelProjectIdForChat(chatId).catch(() => null);
  if (deployed && deployed.trim()) {
    return { ok: true, vercelProjectId: deployed.trim(), source: "deployment" };
  }

  return {
    ok: false,
    status: 409,
    error: "Sajten måste publiceras innan en domän kan kopplas.",
  };
}
