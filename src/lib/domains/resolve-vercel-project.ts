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
 *  2. The most recent actual deployment for the chat that carries a Vercel
 *     project id — the source of truth for where the live site is hosted.
 *  3. Fallback: the chat's `app_projects` row → persisted `vercel_project_id`
 *     (a cache; also covers sites whose deployment rows predate the project-id
 *     column). Used only when there is no deployment fallback, so a stale
 *     persisted link can no longer win over the newest deployment.
 *  4. No project yet → 409 (the site must be published first).
 */
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { getProjectById } from "@/lib/db/services/projects";
import { getLatestVercelProjectIdForChat } from "@/lib/deployment";

export type VercelProjectResolution =
  | {
      ok: true;
      vercelProjectId: string;
      appProjectId: string | null;
      source: "app_project" | "deployment";
    }
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
  const linked = projectId
    ? (await getProjectById(projectId).catch(() => null))?.vercel_project_id?.trim() || null
    : null;

  // The most recent ACTUAL deployment is the source of truth for where the live
  // site is hosted; `app_projects.vercel_project_id` is only a cache. That cache
  // goes stale when `setProjectVercelLink` fails on a re-publish (it is
  // best-effort in the deploy route): the app_project keeps the OLD Vercel
  // project id while the newest deployment carries the correct one. Preferring
  // the deployment stops the domain from attaching to the wrong/old project.
  // When there is no deployment fallback, the persisted link is the only source
  // and still wins.
  const deployed =
    (await getLatestVercelProjectIdForChat(chatId).catch(() => null))?.trim() || null;
  if (deployed) {
    return {
      ok: true,
      vercelProjectId: deployed,
      appProjectId: projectId || null,
      source: "deployment",
    };
  }
  if (linked) {
    return { ok: true, vercelProjectId: linked, appProjectId: projectId, source: "app_project" };
  }

  return {
    ok: false,
    status: 409,
    error: "Sajten måste publiceras innan en domän kan kopplas.",
  };
}
