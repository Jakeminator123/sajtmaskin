import { getPromptHandoffByIdForOwner } from "@/lib/db/services/projects";
import {
  parseAuditHandoffPayload,
  type AuditHandoffPayload,
} from "@/lib/builder/audit-handoff";

export async function resolveAuditHandoffForOwner(params: {
  promptHandoffId: string | null | undefined;
  userId: string | null;
  sessionId: string | null;
}): Promise<AuditHandoffPayload | null> {
  const id = typeof params.promptHandoffId === "string" ? params.promptHandoffId.trim() : "";
  if (!id) return null;
  if (!params.userId && !params.sessionId) return null;
  const row = await getPromptHandoffByIdForOwner(id, {
    userId: params.userId,
    sessionId: params.sessionId,
  });
  if (!row) return null;
  return parseAuditHandoffPayload(row.payload);
}
