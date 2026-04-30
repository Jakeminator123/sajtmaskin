import type { FixEntry } from "@/lib/gen/autofix/types";
import { normalizeErrorPattern } from "@/lib/gen/autofix/types";
import type { ErrorLogEvent } from "@/lib/logging/error-log-rag";

export type FaultPhase =
  | "generation"
  | "autofix"
  | "syntax"
  | "typecheck"
  | "preflight"
  | "verifier"
  | "server_verify"
  | "repair"
  | "preview"
  | "runtime";

export type FaultSeverity = "info" | "warning" | "blocking";
export type FaultGenerationMode = "init" | "followup" | "auto_repair" | null;

export interface FaultEvent {
  faultType: string;
  phase: FaultPhase;
  severity: FaultSeverity;
  message: string;
  normalizedPattern?: string;
  filePath?: string | null;
  routePath?: string | null;
  scaffoldId?: string | null;
  variantId?: string | null;
  capabilityIds?: string[];
  fixerId?: string | null;
  repairLane?: string | null;
  action?: string | null;
  success?: boolean | null;
  timestamp?: string;
  chatId?: string | null;
  versionId?: string | null;
  generationMode?: FaultGenerationMode;
}

type VerifierFindingLike = {
  id?: string;
  severity?: string;
  detail?: string;
  message?: string;
  file?: string | null;
  filePath?: string | null;
};

type RecurringPatternLike = {
  pattern: string;
  occurrences?: number;
  files?: Array<{ file?: string; count?: number }>;
  latestTs?: string | null;
  example?: string | null;
};

function severityFromString(value: string | null | undefined): FaultSeverity {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "info") return "info";
  if (normalized === "warning" || normalized === "warn") return "warning";
  return "blocking";
}

function phaseFromErrorLog(event: ErrorLogEvent): FaultPhase {
  const subphase = event.subphase.toLowerCase();
  if (subphase.includes("verifier")) return "verifier";
  if (subphase.includes("preflight")) return "preflight";
  if (subphase.includes("typecheck") || subphase.includes("tsc")) return "typecheck";
  if (subphase.includes("syntax")) return "syntax";
  if (event.phase === "quality-gate") return "verifier";
  if (event.phase === "server") return "server_verify";
  if (event.phase === "post-gen") return "preflight";
  if (event.phase === "codegen") return "generation";
  return "autofix";
}

export function faultEventFromFixEntry(
  entry: FixEntry,
  context: Partial<Pick<FaultEvent, "chatId" | "versionId" | "scaffoldId" | "generationMode">> = {},
): FaultEvent {
  return {
    faultType: entry.fixer,
    phase: entry.category === "llm" ? "repair" : "autofix",
    severity: "info",
    message: entry.description,
    normalizedPattern: normalizeErrorPattern(entry.description || entry.fixer),
    filePath: entry.file ?? null,
    fixerId: entry.fixer,
    repairLane: entry.lane ?? null,
    action: entry.category,
    success: true,
    ...context,
  };
}

export function faultEventFromErrorLogEvent(event: ErrorLogEvent): FaultEvent {
  const success =
    event.result === "fixed" ? true :
      event.result === "still-failing" ? false :
        event.result === "noop" ? null : null;
  return {
    faultType: event.fault || "unknown_fault",
    phase: phaseFromErrorLog(event),
    severity: severityFromString(event.severity),
    message: event.faultText || event.fixText || event.fault || "Unknown fault",
    normalizedPattern: normalizeErrorPattern(event.faultText || event.fault || ""),
    scaffoldId: event.scaffoldId ?? null,
    fixerId: event.fixer ?? null,
    action: event.fixText ?? null,
    success,
    timestamp: undefined,
    chatId: event.chatId ?? null,
    versionId: event.versionId ?? null,
    generationMode:
      typeof event.repairPassIndex === "number" && event.repairPassIndex > 0
        ? "followup"
        : null,
  };
}

export function faultEventFromVerifierFinding(
  finding: VerifierFindingLike,
  context: Partial<Pick<FaultEvent, "chatId" | "versionId" | "scaffoldId" | "generationMode">> = {},
): FaultEvent {
  const message = finding.detail ?? finding.message ?? finding.id ?? "Verifier finding";
  return {
    faultType: finding.id ?? "verifier_finding",
    phase: "verifier",
    severity: severityFromString(finding.severity),
    message,
    normalizedPattern: normalizeErrorPattern(message),
    filePath: finding.filePath ?? finding.file ?? null,
    success: false,
    ...context,
  };
}

export function faultEventFromRecurringPattern(
  pattern: RecurringPatternLike,
  context: Partial<Pick<FaultEvent, "chatId" | "versionId" | "scaffoldId" | "generationMode">> = {},
): FaultEvent {
  const topFile = pattern.files?.find((file) => file.file)?.file ?? null;
  return {
    faultType: pattern.pattern,
    phase: "repair",
    severity: "warning",
    message: pattern.example ?? pattern.pattern,
    normalizedPattern: pattern.pattern,
    filePath: topFile,
    success: null,
    timestamp: pattern.latestTs ?? undefined,
    ...context,
  };
}
