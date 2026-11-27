import type { VideoGenerationJob, VideoGenerationMedia } from "@/lib/media/video-generation-contract";
import { getBuilderBridge } from "@/lib/openclaw/builder-bridge";

type Target = { chatId: string; projectId: string; placement?: string; versionId?: string };
type PendingInsertion = Target & { jobId: string; expiresAt: number };
export type VideoBuilderHandoff = { kind: "handoff"; href: string; prepare: () => void };
type InsertionOutcome = { kind: "draft" } | VideoBuilderHandoff;
export type BuilderVideoDraft = {
  chatId: string;
  projectId: string;
  prompt: string;
  media: VideoGenerationMedia;
};

export const BUILDER_VIDEO_DRAFT_EVENT = "sajtmaskin:builder-video-draft";

const KEY_PREFIX = "sajtmaskin:video-insert:";
const MAX_HANDOFF_AGE_MS = 15 * 60 * 1000;

function handoffKey(target: Pick<Target, "chatId" | "projectId">) {
  return KEY_PREFIX + JSON.stringify([target.chatId, target.projectId]);
}

export function prepareGeneratedVideoInBuilder(
  job: VideoGenerationJob,
  target: Target,
  signal: AbortSignal,
  { allowHandoff = false }: { allowHandoff?: boolean } = {},
): InsertionOutcome {
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
  if (bridge && (bridge.getChatId() !== target.chatId ||
      (target.versionId && bridge.getActiveVersionId() !== target.versionId))) {
    throw new Error("Videon sparades. Byggaren har bytt chatt eller version.");
  }

  const placement = target.placement ? ` Placering: ${target.placement}` : "";
  const accepted = !window.dispatchEvent(new CustomEvent<BuilderVideoDraft>(BUILDER_VIDEO_DRAFT_EVENT, {
    cancelable: true,
    detail: {
      chatId: target.chatId,
      projectId: target.projectId,
      media: job.media,
      prompt: `Lägg in den färdiga bifogade MP4-videon på sajten med en vanlig uppspelningskontroll. Använd exakt den bifogade filen.${placement}`,
    },
  }));
  if (!accepted) throw new Error("Videon sparades. Kunde inte öppna byggutkastet i den här sajten.");
  return { kind: "draft" };
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
  const outcome = prepareGeneratedVideoInBuilder(data.job, intent, signal);
  window.sessionStorage.removeItem(key);
  return outcome;
}
