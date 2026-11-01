import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

export type CollaborationSummaries = Record<string, {
  approvalStatus: string | null;
  unresolvedCount: number;
}>;

// Stay below the route's 100-ID limit and bound concurrent database work.
const SUMMARY_BATCH_SIZE = 50;

export async function fetchCollaborationSummaries(chatId: string, versionIds: string[]) {
  const ids = [...new Set(versionIds)];
  const summaries: CollaborationSummaries = {};
  for (let offset = 0; offset < ids.length; offset += SUMMARY_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + SUMMARY_BATCH_SIZE);
    const response = await fetch(
      `${engineChatBaseUrl(chatId)}/versions/collaboration-summaries?versionIds=${encodeURIComponent(batch.join(","))}`,
    );
    // Let SWR retain previous data and retry instead of replacing badges with empty data.
    if (!response.ok) throw new Error("Failed to load collaboration summaries");
    const data = await response.json() as { summaries?: CollaborationSummaries };
    Object.assign(summaries, data.summaries ?? {});
  }
  return { summaries };
}
