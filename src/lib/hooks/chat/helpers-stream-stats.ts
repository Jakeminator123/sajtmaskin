import { debugLog, warnLog } from "@/lib/utils/debug";
import type { StreamDebugStats, StreamQualitySignal } from "./types";

export function initStreamStats(
  streamType: StreamDebugStats["streamType"],
  assistantMessageId: string,
): StreamDebugStats {
  return {
    streamType,
    assistantMessageId,
    startedAt: Date.now(),
    contentEvents: 0,
    thinkingEvents: 0,
    partsEvents: 0,
    errorEvents: 0,
    contentChars: 0,
    thinkingChars: 0,
    contentNoopEvents: 0,
    thinkingNoopEvents: 0,
    maxContentChunk: 0,
    maxThinkingChunk: 0,
    finalContentLength: 0,
    finalThinkingLength: 0,
    didReceiveDone: false,
  };
}

export function recordStreamText(
  stats: StreamDebugStats,
  kind: "content" | "thinking",
  previous: string,
  merged: string,
  incomingLength: number,
) {
  if (kind === "content") {
    stats.contentEvents += 1;
    stats.contentChars += incomingLength;
    stats.maxContentChunk = Math.max(stats.maxContentChunk, incomingLength);
    if (merged.length === previous.length) {
      stats.contentNoopEvents += 1;
    }
    stats.finalContentLength = merged.length;
    return;
  }
  stats.thinkingEvents += 1;
  stats.thinkingChars += incomingLength;
  stats.maxThinkingChunk = Math.max(stats.maxThinkingChunk, incomingLength);
  if (merged.length === previous.length) {
    stats.thinkingNoopEvents += 1;
  }
  stats.finalThinkingLength = merged.length;
}

export function recordStreamParts(stats: StreamDebugStats, partsCount: number) {
  if (partsCount <= 0) return;
  stats.partsEvents += 1;
}

export function finalizeStreamStats(stats: StreamDebugStats): StreamQualitySignal {
  const durationMs = Date.now() - stats.startedAt;
  const summary = {
    streamType: stats.streamType,
    assistantMessageId: stats.assistantMessageId,
    chatId: stats.chatId ?? null,
    versionId: stats.versionId ?? null,
    durationMs,
    didReceiveDone: stats.didReceiveDone,
    abortedByClient: Boolean(stats.abortedByClient),
    contentEvents: stats.contentEvents,
    contentChars: stats.contentChars,
    contentNoopEvents: stats.contentNoopEvents,
    maxContentChunk: stats.maxContentChunk,
    finalContentLength: stats.finalContentLength,
    thinkingEvents: stats.thinkingEvents,
    thinkingChars: stats.thinkingChars,
    thinkingNoopEvents: stats.thinkingNoopEvents,
    maxThinkingChunk: stats.maxThinkingChunk,
    finalThinkingLength: stats.finalThinkingLength,
    partsEvents: stats.partsEvents,
    errorEvents: stats.errorEvents,
  };

  debugLog("build", "Stream summary", summary);

  const reasons: string[] = [];
  const criticalReasons: string[] = [];
  if (!stats.didReceiveDone) {
    reasons.push("done_event_missing");
    criticalReasons.push("done_event_missing");
  }
  if (stats.errorEvents > 0) {
    if (stats.didReceiveDone) {
      reasons.push("error_event_recovered");
    } else {
      reasons.push("error_event_received");
      criticalReasons.push("error_event_received");
    }
  }
  if (stats.contentEvents > 0 && stats.finalContentLength === 0) {
    reasons.push("content_empty_after_events");
    criticalReasons.push("content_empty_after_events");
  }
  if (stats.thinkingEvents > 0 && stats.finalThinkingLength === 0) {
    reasons.push("thinking_empty_after_events");
    criticalReasons.push("thinking_empty_after_events");
  }

  const onlyDoneMissingOnAbort =
    stats.abortedByClient &&
    criticalReasons.length === 1 &&
    criticalReasons[0] === "done_event_missing" &&
    stats.errorEvents === 0;

  if (onlyDoneMissingOnAbort) {
    reasons.push("client_abort_expected");
    debugLog(
      "build",
      `Stream ended before done (client abort): reasons=[${reasons.join(", ")}]`,
      summary,
    );
    return { hasCriticalAnomaly: false, reasons };
  }

  const hasCriticalAnomaly = criticalReasons.length > 0;
  const inlineCritical = criticalReasons.join(", ");
  const inlineReasons = reasons.join(", ");
  if (hasCriticalAnomaly) {
    warnLog(
      "build",
      `Stream anomaly detected — critical=[${inlineCritical}] reasons=[${inlineReasons}]`,
      { ...summary, reasons, criticalReasons },
    );
  } else if (stats.errorEvents > 0) {
    debugLog("build", "Stream recovered after error", { ...summary, reasons });
  }
  return { hasCriticalAnomaly, reasons };
}
