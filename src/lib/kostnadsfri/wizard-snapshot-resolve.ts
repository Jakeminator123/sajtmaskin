import { getPromptHandoffByIdForOwner } from "@/lib/db/services/projects";
import {
  readKostnadsfriWizardSnapshotFromHandoffPayload,
  type KostnadsfriWizardSnapshot,
} from "./wizard-snapshot";

/**
 * Läser det fail-closed wizardkvittot från den redan skrivna handoff-raden
 * (samma owner-scope som GET /api/prompts). Ingen ny tabell eller kolumn.
 */
export async function resolveKostnadsfriWizardSnapshotForOwner(params: {
  promptHandoffId: string | null | undefined;
  userId: string | null;
  sessionId: string | null;
}): Promise<KostnadsfriWizardSnapshot | null> {
  const id = typeof params.promptHandoffId === "string" ? params.promptHandoffId.trim() : "";
  if (!id) return null;
  if (!params.userId && !params.sessionId) return null;
  const row = await getPromptHandoffByIdForOwner(id, {
    userId: params.userId,
    sessionId: params.sessionId,
  });
  if (!row || row.source !== "kostnadsfri") return null;
  return readKostnadsfriWizardSnapshotFromHandoffPayload(row.payload);
}
