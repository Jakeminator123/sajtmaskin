import type { VideoGenerationJob } from "@/lib/media/video-generation-contract";
import { getBuilderBridge, waitForBuilderSend } from "@/lib/openclaw/builder-bridge";

type Target = { chatId: string; projectId: string; placement?: string; versionId?: string };
type PendingInsertion = Target & { jobId: string; expiresAt: number };
export type VideoBuilderHandoff = { kind: "handoff"; href: string; prepare: () => void };
type InsertionOutcome = { kind: "sent" } | VideoBuilderHandoff;

const KEY_PREFIX = "sajtmaskin:video-insert:";
const MAX_HANDOFF_AGE_MS = 15 * 60 * 1000;

function handoffKey(target: Pick<Target, "chatId" | "projectId">) {
  return KEY_PREFIX + JSON.stringify([target.chatId, target.projectId]);
}

export async function insertGeneratedVideo(
  job: VideoGenerationJob,
  target: Target,
  signal: AbortSignal,
  { allowHandoff = false, onDispatch }: { allowHandoff?: boolean; onDispatch?: () => void } = {},
): Promise<InsertionOutcome> {
  if (signal.aborted || job.projectId !== target.projectId || job.status !== "succeeded" || job.media?.mimeType !== "video/mp4") {
    throw new Error("Videon är inte klar i den här sajten.");
  }
  const bridge = getBuilderBridge();
  if (!bridge && allowHandoff) {
    const query = new URLSearchParams({ project: target.projectId, chatId: target.chatId });
    return {
      kind: "handoff",
      href: `/builder?${query}`,
      prepare: () => {
        if (signal.aborted) throw new Error("Öppna den sparade videon i rätt sajt.");
        const pending: PendingInsertion = { ...target, jobId: job.id, expiresAt: Date.now() + MAX_HANDOFF_AGE_MS };
        window.sessionStorage.setItem(handoffKey(target), JSON.stringify(pending));
      },
    };
  }
  const expectedVersionId = target.versionId ?? bridge?.getActiveVersionId() ?? undefined;
  const ready = await waitForBuilderSend({
    expectedChatId: target.chatId,
    expectedVersionId,
    isCancelled: () => signal.aborted,
    maxAttempts: 40,
    intervalMs: 250,
  });
  if (!ready.ok || signal.aborted || getBuilderBridge() !== ready.bridge) {
    throw new Error("Videon sparades. Byggaren kunde inte ta emot den här turen.");
  }

  const placement = target.placement ? ` Placering: ${target.placement}` : "";
  onDispatch?.();
  const outcome = await ready.bridge.sendMessage(
    `Lägg in den färdiga bifogade MP4-videon på sajten med en vanlig uppspelningskontroll. Använd exakt den bifogade filen.${placement}`,
    {
      attachments: [{
        type: "user_file",
        url: job.media.url,
        filename: job.media.filename,
        mimeType: job.media.mimeType,
      }],
    },
  );
  if (outcome.status === "rejected" || outcome.status === "failed" || outcome.status === "aborted") {
    throw new Error("Videon sparades. Byggaren kunde inte avsluta infogningen.");
  }
  return { kind: "sent" };
}

export async function resumeVideoInsertion(target: Pick<Target, "chatId" | "projectId">, signal: AbortSignal): Promise<InsertionOutcome | undefined> {
  const key = handoffKey(target);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return undefined;
  const intent = JSON.parse(raw) as PendingInsertion;
  if (!intent.jobId || intent.chatId !== target.chatId || intent.projectId !== target.projectId || intent.expiresAt < Date.now()) {
    return undefined;
  }

  const jobId = intent.jobId;
  const response = await fetch(`/api/media/video-generations/${encodeURIComponent(jobId)}?projectId=${encodeURIComponent(target.projectId)}`, { signal });
  const data = await response.json().catch(() => null) as { job?: VideoGenerationJob } | null;
  if (signal.aborted || window.sessionStorage.getItem(key) !== raw) return undefined;
  if (!response.ok || !data?.job || data.job.id !== jobId) throw new Error("Kunde inte hämta den sparade videon. Den finns kvar i mediebanken.");
  return insertGeneratedVideo(data.job, intent, signal, {
    // Consume only when the scoped bridge is ready. No second send after an
    // ambiguous response, a Strict Mode remount or a page refresh.
    onDispatch: () => {
      if (window.sessionStorage.getItem(key) !== raw) throw new Error("Infogningen har redan skickats.");
      window.sessionStorage.removeItem(key);
    },
  });
}
