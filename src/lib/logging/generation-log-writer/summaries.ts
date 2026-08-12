import path from "node:path";
import { MAX_SUMMARY_TIMELINE_ROWS } from "./constants";
import { readBoolean, readNumber, readString } from "./entry-fields";
import { buildMeta } from "./status";
import type { StoredGenerationEntry } from "./types";

export function buildHighlights(entries: StoredGenerationEntry[]): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    const type = readString(entry.data.type) || "";
    if (
      type === "comm.error.create" ||
      type === "preview-preflight.error" ||
      type === "project-sanity.error" ||
      type === "syntax-validation.pipeline-error" ||
      type === "syntax-validation.gave-up" ||
      type === "preflight.version.failed" ||
      type === "site.empty_generation" ||
      type === "site.stream_without_version" ||
      type === "site.partial_file_output" ||
      type === "site.awaiting_input"
    ) {
      const message = readString(entry.data.message) || readString(entry.data.reason) || type;
      lines.push(`- ${entry.ts.slice(11, 19)} \`${type}\`: ${message}`);
      continue;
    }
    if (type === "syntax-validation.early-stop") {
      const reason = readString(entry.data.reason) || "unknown";
      lines.push(`- ${entry.ts.slice(11, 19)} \`${type}\`: stopped early (${reason})`);
      continue;
    }
    if (type === "verifier-pass") {
      const blocking = readNumber(entry.data.blocking) ?? 0;
      const quality = readNumber(entry.data.quality) ?? 0;
      if (blocking > 0 || quality > 0) {
        lines.push(
          `- ${entry.ts.slice(11, 19)} \`verifier-pass\`: blocking=${blocking}, quality=${quality}`,
        );
      }
      continue;
    }
    if (type === "server-verify.policy") {
      const run = readBoolean(entry.data.run);
      const reason = readString(entry.data.reason) || "unknown";
      if (run === false) {
        lines.push(
          `- ${entry.ts.slice(11, 19)} \`server-verify.policy\`: background verify skipped (${reason})`,
        );
      }
    }
  }
  return [...new Set(lines)].slice(-12);
}

function buildTimeline(entries: StoredGenerationEntry[]): string[] {
  const kept =
    entries.length > MAX_SUMMARY_TIMELINE_ROWS
      ? entries.slice(-MAX_SUMMARY_TIMELINE_ROWS)
      : entries;
  const lines = kept.map((entry) => {
    const detail = readString(entry.summary) || readString(entry.data.type) || "event";
    return `- ${entry.ts.slice(11, 19)} ${detail}`;
  });
  if (kept.length < entries.length) {
    lines.unshift(`- ... ${entries.length - kept.length} tidigare events trunkerade`);
  }
  return lines;
}

export function buildSummary(dir: string, entries: StoredGenerationEntry[]): string {
  const meta = buildMeta(entries);
  const highlights = buildHighlights(entries);
  const timeline = buildTimeline(entries);
  const verifier = meta.verifier as { blocking?: number; quality?: number } | null;
  const serverVerify = meta.serverVerify as {
    run?: boolean;
    reason?: string | null;
    verificationPolicy?: string | null;
    qualityTarget?: string | null;
  } | null;

  return [
    "# Generationslogg",
    "",
    `- Körning: \`${path.basename(dir)}\``,
    `- Status: \`${readString(meta.status) || "unknown"}\``,
    `- Startad: ${readString(meta.startedAt) || "-"}`,
    `- Senast uppdaterad: ${readString(meta.updatedAt) || "-"}`,
    `- Typ: ${readString(meta.generationKind) || "-"}`,
    `- Slug: ${readString(meta.slug) || "-"}`,
    `- Chat: ${readString(meta.chatId) || "-"}`,
    `- Version: ${readString(meta.versionId) || "-"}`,
    "",
    "## LLM / Orkestrering",
    "",
    `- Modell: ${readString(meta.modelId) || "-"}`,
    `- Thinking: ${String(meta.thinking ?? "-")}`,
    `- Bilder: ${String(meta.imageGenerations ?? "-")}`,
    `- Promptstrategi: ${readString(meta.promptStrategy) || "-"}`,
    `- Prompttyp: ${readString(meta.promptType) || "-"}`,
    `- Promptkälla: ${readString(meta.promptSource) || "-"}`,
    `- Build intent: ${readString(meta.buildIntent) || "-"}`,
    `- Build method: ${readString(meta.buildMethod) || "-"}`,
    "",
    "## Stream",
    "",
    `- Reasoning ms: ${String((meta.streamTiming as { reasoningMs?: number } | null)?.reasoningMs ?? "-")}`,
    `- Output ms: ${String((meta.streamTiming as { outputMs?: number } | null)?.outputMs ?? "-")}`,
    `- Stream duration ms: ${String((meta.streamTiming as { durationMs?: number } | null)?.durationMs ?? "-")}`,
    `- Input tokens: ${String((meta.tokenUsage as { inputTokens?: number } | null)?.inputTokens ?? "-")}`,
    `- Output tokens: ${String((meta.tokenUsage as { outputTokens?: number } | null)?.outputTokens ?? "-")}`,
    "",
    "## Resultat",
    "",
    `- Duration ms: ${String(meta.durationMs ?? "-")}`,
    `- Preview URL: ${readString(meta.previewUrl) || "-"}`,
    `- Persist blocked: ${readString(meta.persistBlockedReason) || "-"}`,
    `- Preflight errors: ${String((meta.preflight as { errorCount?: number } | null)?.errorCount ?? "-")}`,
    `- Preflight warnings: ${String((meta.preflight as { warningCount?: number } | null)?.warningCount ?? "-")}`,
    `- Preview blocked: ${String((meta.preflight as { previewBlocked?: boolean } | null)?.previewBlocked ?? "-")}`,
    `- Verification blocked: ${String((meta.preflight as { verificationBlocked?: boolean } | null)?.verificationBlocked ?? "-")}`,
    "",
    "## Verify / Quality Gate",
    "",
    `- Verifier blockers: ${String(verifier?.blocking ?? "-")}`,
    `- Verifier quality findings: ${String(verifier?.quality ?? "-")}`,
    `- Background verify: ${
      typeof serverVerify?.run === "boolean"
        ? serverVerify.run
          ? "scheduled"
          : "skipped"
        : "-"
    }`,
    `- Background verify reason: ${serverVerify?.reason ?? "-"}`,
    `- Verification policy: ${serverVerify?.verificationPolicy ?? "-"}`,
    `- Quality target: ${serverVerify?.qualityTarget ?? "-"}`,
    "",
    "## Fel / Signaler",
    "",
    ...(highlights.length > 0 ? highlights : ["- Inga tydliga fel-/varningssignaler loggade ännu."]),
    "",
    "## Tidslinje",
    "",
    ...timeline,
    "",
  ].join("\n");
}
