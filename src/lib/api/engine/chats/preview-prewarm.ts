import type { BuildIntent } from "@/lib/builder/build-intent";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";

export function schedulePreviewPreWarm(params: {
  enabled: boolean;
  buildIntent: BuildIntent;
  chatId: string;
  scaffoldFiles: Array<{ path: string; content: string }>;
  startPreviewSessionFn?: typeof startPreviewSession;
}): boolean {
  const {
    enabled,
    buildIntent,
    chatId,
    scaffoldFiles,
    startPreviewSessionFn = startPreviewSession,
  } = params;
  const normalizedChatId = chatId.trim();
  if (!enabled || buildIntent !== "website" || !normalizedChatId || scaffoldFiles.length === 0) {
    return false;
  }
  const seedFiles = scaffoldFiles.map((file) => ({
    path: file.path,
    content: file.content,
    language: inferFileLanguage(file.path),
  }));
  void startPreviewSessionFn(seedFiles, {
    chatId: normalizedChatId,
    versionIdForSession: null,
    skipRepair: true,
    skipProjectScaffold: true,
    precache: true,
  }).catch((error) => {
    console.warn("[preview-prewarm] Failed (opportunistic, continuing):", error);
  });
  return true;
}
