import fs from "node:fs";
import path from "node:path";

import {
  faultEventFromErrorLogEvent,
  faultEventFromRecurringPattern,
  type FaultEvent,
} from "./fault-events";
import {
  buildFaultPromotionCandidates,
  formatFaultPromotionReport,
} from "./fault-promotion-report";
import type { ErrorLogEvent } from "@/lib/logging/error-log-rag";

function readNdjson(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as unknown];
    } catch {
      return [];
    }
  });
}

function readJsonArray(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function looksLikeErrorLogEvent(value: unknown): value is ErrorLogEvent {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { fault?: unknown }).fault === "string" &&
      typeof (value as { faultText?: unknown }).faultText === "string" &&
      typeof (value as { phase?: unknown }).phase === "string",
  );
}

function collectFaultEvents(root: string): FaultEvent[] {
  const events: FaultEvent[] = [];
  const ndjsonPath = path.join(root, "logs", "llm-segmentts-and-index", "error-log.ndjson");
  for (const row of readNdjson(ndjsonPath)) {
    if (looksLikeErrorLogEvent(row)) {
      events.push(faultEventFromErrorLogEvent(row));
    }
  }

  const siteRoot = path.join(root, "logs", "site-observability");
  if (fs.existsSync(siteRoot)) {
    for (const chatId of fs.readdirSync(siteRoot)) {
      const filePath = path.join(siteRoot, chatId, "latest", "fix-patterns.json");
      for (const pattern of readJsonArray(filePath)) {
        if (
          pattern &&
          typeof pattern === "object" &&
          typeof (pattern as { pattern?: unknown }).pattern === "string"
        ) {
          events.push(
            faultEventFromRecurringPattern(
              pattern as Parameters<typeof faultEventFromRecurringPattern>[0],
              { chatId },
            ),
          );
        }
      }
    }
  }
  return events;
}

const root = process.cwd();
const events = collectFaultEvents(root);
console.info(formatFaultPromotionReport(buildFaultPromotionCandidates(events)));
