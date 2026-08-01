import fs from "node:fs";
import path from "node:path";
import {
  GLOBAL_ERROR_LOG_CSV_FILE,
  LEGACY_INDEX_DIR,
  MAX_GLOBAL_ERROR_LOG_ROWS,
} from "./constants";
import {
  findLastStringAtOrBefore,
  readBoolean,
  readNumber,
  readString,
} from "./entry-fields";
import { ensureLegacyIndexDir } from "./run-dirs";
import type { FaultFixRow, StoredGenerationEntry } from "./types";

function formatErrorDetails(data: Record<string, unknown>, maxItems = 3): string {
  const errors = Array.isArray(data.errors) ? data.errors : [];
  if (errors.length === 0) return `${readNumber(data.errorCount) ?? "?"} syntaxfel`;
  const items = errors.slice(0, maxItems).map((err: unknown) => {
    if (typeof err === "string") return err;
    const e = err as Record<string, unknown>;
    const file = readString(e.file) ?? "?";
    const line = readNumber(e.line) ?? "?";
    const msg = readString(e.message) ?? "?";
    return `${file}:${line}: ${msg}`;
  });
  const rest = errors.length > maxItems ? ` … +${errors.length - maxItems} till` : "";
  return items.join("; ") + rest;
}

const EMPTY_CONTEXT_COLS: Pick<FaultFixRow, "scaffoldId" | "serializeMode" | "styleDirection" | "file" | "fixer" | "resolved"> = {
  scaffoldId: "-",
  serializeMode: "-",
  styleDirection: "-",
  file: "-",
  fixer: "-",
  resolved: "-",
};

function faultFixTimestamp(e: StoredGenerationEntry): string {
  return readString(e.ts) || new Date().toISOString();
}

const FAULT_FIX_TYPES: Record<string, (e: StoredGenerationEntry) => FaultFixRow | FaultFixRow[] | null> = {
  "autofix.result": (e) => {
    const fixEntries = Array.isArray(e.data.fixes) ? (e.data.fixes as Array<{ fixer?: string; description?: string; file?: string }>) : [];
    const warnings = Array.isArray(e.data.warnings) ? e.data.warnings.length : 0;
    if (fixEntries.length === 0 && warnings === 0) return null;
    const chatId = readString(e.data.chatId) || "-";
    const versionId = readString(e.data.versionId) || "-";
    const lineageHash = readString(e.data.lineageHash) || "-";
    const scaffoldId = readString(e.data.scaffoldId) || "-";
    const modelTier = readString(e.data.resolvedTier) || "-";
    const rows: FaultFixRow[] = fixEntries.map((fix) => ({
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: `Autofix: ${readString(fix.fixer) || "unknown"}`,
      severity: "info",
      createdBy: "deterministic-autofix",
      fixedBy: "deterministic-autofix",
      modelTier,
      problem: readString(fix.description) || "autofix",
      action: "Deterministisk autofix",
      model: "-",
      provider: "-",
      pass: "-",
      outcome: "OK",
      chatId,
      versionId,
      lineageHash,
      ...EMPTY_CONTEXT_COLS,
      scaffoldId,
      file: readString(fix.file) || "-",
      fixer: readString(fix.fixer) || "-",
      resolved: "true",
    }));
    if (rows.length > 0) {
      rows.push({
        ts: faultFixTimestamp(e),
        phase: "phase-3",
        step: "Autofix",
        severity: "info",
        createdBy: "deterministic-autofix",
        fixedBy: "deterministic-autofix",
        modelTier,
        problem: `${fixEntries.length} fix(ar), ${warnings} varning(ar)`,
        action: "Deterministisk autofix (sammanfattning)",
        model: "-",
        provider: "-",
        pass: "-",
        outcome: "OK",
        chatId,
        versionId,
        lineageHash,
        ...EMPTY_CONTEXT_COLS,
        scaffoldId,
      });
    }
    return rows;
  },
  "autofix.risk": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Autofix",
    severity: (readNumber(e.data.riskyFixCount) ?? 0) > 0 ? "warning" : "info",
    createdBy: "deterministic-autofix",
    fixedBy: "-",
    modelTier: "-",
    problem: `Riskprofil: ${readNumber(e.data.safeFixCount) ?? 0} säkra, ${readNumber(e.data.riskyFixCount) ?? 0} riskabla fixar`,
    action: "Notering: riskklassad deterministisk autofix",
    model: "-",
    provider: "-",
    pass: "-",
    outcome: (readNumber(e.data.riskyFixCount) ?? 0) > 0 ? "Varning" : "OK",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
  }),
  "syntax-validation.pass": (e) => {
    const phase = readString(e.data.phase);
    const errorCount = readNumber(e.data.errorCount);
    if (phase === "invalid" && errorCount && errorCount > 0) {
      return {
        ts: faultFixTimestamp(e),
        phase: "phase-3",
        step: `Syntaxvalidering (pass ${readNumber(e.data.pass) ?? "?"})`,
        severity: "error",
        createdBy: "syntax-validator",
        fixedBy: "-",
        modelTier: "-",
        problem: formatErrorDetails(e.data),
        action: "Validering flaggade fel",
        model: "-",
        provider: "-",
        pass: String(readNumber(e.data.pass) ?? "-"),
        outcome: "Fel hittade",
        chatId: "-",
        versionId: "-",
        lineageHash: "-",
        ...EMPTY_CONTEXT_COLS,
        resolved: "false",
      };
    }
    return null;
  },
  "syntax-validation.fixer.start": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "warning",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: formatErrorDetails(e.data),
    action: "LLM fixer startad",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Startad",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: "false",
  }),
  "syntax-validation.fixer.result": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: readBoolean(e.data.valid) ? "info" : readBoolean(e.data.improved) ? "warning" : "error",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: `${readNumber(e.data.errorsBefore) ?? "?"} -> ${readNumber(e.data.errorsAfter) ?? "?"} fel`,
    action: readBoolean(e.data.improved) ? "Fixer förbättrade koden" : "Fixer kunde inte förbättra",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: readBoolean(e.data.valid) ? "OK" : readBoolean(e.data.improved) ? "Delvis" : "Misslyckades",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: (readNumber(e.data.errorsAfter) ?? 1) === 0 ? "true" : "false",
  }),
  "syntax-validation.fixer.error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "error",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: readString(e.data.message) || "Okänt fel",
    action: "Fixer kraschade",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Krasch",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: "false",
  }),
  "syntax-validation.fixer.noop": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `LLM Fixer (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "warning",
    createdBy: "syntax-validator",
    fixedBy: "llm-fixer",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel kvar`,
    action: "Fixer returnerade ingen fix",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Noop",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: "llm-fixer",
    resolved: "false",
  }),
  "syntax-validation.gave-up": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: `Syntaxvalidering (pass ${readNumber(e.data.pass) ?? "?"})`,
    severity: "error",
    createdBy: "syntax-validator",
    fixedBy: "-",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel kvar`,
    action: "Max pass nått — gav upp",
    model: readString(e.data.fixerModel) || readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: String(readNumber(e.data.pass) ?? "-"),
    outcome: "Gav upp",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "syntax-validation.early-stop": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Syntaxvalidering",
    severity: "warning",
    createdBy: "syntax-validator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.reason) || "tidig stop",
    action: `Stoppade tidigt: ${readString(e.data.reason) || "-"}`,
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Stoppade",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "syntax-validation.pipeline-error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Syntaxpipeline",
    severity: "error",
    createdBy: "syntax-validator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Pipeline-fel",
    action: "Pipeline kunde ej köras",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Pipeline-fel",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "autofix.mechanical-residual": (e) => {
    const residualCount = readNumber(e.data.residualErrorCount);
    if (!residualCount || residualCount === 0) return null;
    const residualErrors = Array.isArray(e.data.residualErrors) ? e.data.residualErrors : [];
    const topPatterns = residualErrors
      .slice(0, 5)
      .map((err: unknown) => {
        const r = err as Record<string, unknown>;
        return readString(r.pattern) || readString(r.message) || "?";
      })
      .join("; ");
    return {
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: "Mekanisk residual",
      severity: "warning",
      createdBy: "mechanical-autofix",
      fixedBy: "-",
      modelTier: "-",
      problem: `${residualCount} fel kvar efter ${readNumber(e.data.mechanicalFixCount) ?? 0} mekaniska fixar: ${topPatterns}`,
      action: "Mekaniska fixar räckte inte — eskaleras till LLM-fix",
      model: "-",
      provider: "-",
      pass: "-",
      outcome: "Residual",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      resolved: "false",
    };
  },
  "file-repair": (e) => {
    const fixes = Array.isArray(e.data.fixes) ? e.data.fixes.length : 0;
    if (fixes === 0) return null;
    return {
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: "Filreparation (preflight)",
      severity: "info",
      createdBy: "preflight",
      fixedBy: "deterministic-autofix",
      modelTier: "-",
      problem: `${fixes} reparation(er)`,
      action: "Deterministisk filreparation",
      model: "-",
      provider: "-",
      pass: "-",
      outcome: "OK",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      fixer: "deterministic-autofix",
      resolved: "true",
    };
  },
  "merged-syntax.invalid": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Merged syntax",
    severity: "error",
    createdBy: "preflight",
    fixedBy: "-",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} syntaxfel i merged projekt`,
    action: "Merged syntax flaggade fel",
    model: "-",
    provider: "-",
    pass: "-",
    outcome: "Fel hittade",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "merged-syntax.fixed": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Merged syntax fixer",
    severity: readNumber(e.data.errorsAfter) === 0 ? "info" : "warning",
    createdBy: "preflight",
    fixedBy: readString(e.data.fixerModel) ? "llm-fixer" : "deterministic-autofix",
    modelTier: "-",
    problem: `${readNumber(e.data.errorsBefore) ?? "?"} -> ${readNumber(e.data.errorsAfter) ?? "?"} fel`,
    action: "Merged syntax reparation",
    model: readString(e.data.fixerModel) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: readNumber(e.data.errorsAfter) === 0 ? "OK" : "Delvis",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    fixer: readString(e.data.fixerModel) ? "llm-fixer" : "deterministic-autofix",
    resolved: (readNumber(e.data.errorsAfter) ?? 1) === 0 ? "true" : "false",
  }),
  "verifier-pass": (e) => {
    const blockingFindings = Array.isArray(e.data.blockingFindings) ? (e.data.blockingFindings as Array<{ id?: string; detail?: string }>) : [];
    const qualityFindings = Array.isArray(e.data.qualityFindings) ? (e.data.qualityFindings as Array<{ id?: string; detail?: string }>) : [];
    const blockingCount = readNumber(e.data.blocking) ?? blockingFindings.length;
    const qualityCount = readNumber(e.data.quality) ?? qualityFindings.length;
    const summaryRow: FaultFixRow = {
      ts: faultFixTimestamp(e),
      phase: "phase-3",
      step: "Verifier-pass",
      severity: blockingCount > 0 ? "warning" : qualityCount > 0 ? "info" : "info",
      createdBy: "verifier-pass",
      fixedBy: "-",
      modelTier: "-",
      problem: `blocking=${blockingCount}, quality=${qualityCount}`,
      action: "Read-only kvalitetsgranskning",
      model: readString(e.data.model) || "-",
      provider: readString(e.data.provider) || "-",
      pass: "-",
      outcome: blockingCount > 0 ? "Signaler" : "OK",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      resolved: "false",
    };
    const findingRows: FaultFixRow[] = blockingFindings.slice(0, 5).map((f) => ({
      ...summaryRow,
      step: `Verifier: ${readString(f.id) || "finding"}`,
      severity: "warning",
      problem: readString(f.detail) || readString(f.id) || "blocking finding",
      action: "Blockerande kvalitetssignal",
    }));
    const qualityRows: FaultFixRow[] = qualityFindings.slice(0, 5).map((f) => ({
      ...summaryRow,
      step: `Verifier: ${readString(f.id) || "finding"}`,
      severity: "info",
      problem: readString(f.detail) || readString(f.id) || "quality finding",
      action: "Kvalitetssignal",
    }));
    return [summaryRow, ...findingRows, ...qualityRows];
  },
  "scaffold-retry.suggested": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Scaffold retry",
    severity: "warning",
    createdBy: "preflight",
    fixedBy: "server-repair",
    modelTier: "-",
    problem: readString(e.data.failureType) || "scaffold-problem",
    action: `${readString(e.data.currentScaffoldId) || "-"} -> ${readString(e.data.suggestedScaffoldId) || "-"}`,
    model: "-",
    provider: "-",
    pass: "-",
    outcome: readString(e.data.confidence) || "föreslagen",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    scaffoldId: readString(e.data.currentScaffoldId) || "-",
  }),
  "preflight.version.failed": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Preflight",
    severity: "error",
    createdBy: "preflight",
    fixedBy: "-",
    modelTier: "-",
    problem: `${readNumber(e.data.errorCount) ?? "?"} preflight-fel`,
    action: "Version misslyckades i preflight",
    model: "-",
    provider: "-",
    pass: "-",
    outcome: "Misslyckades",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "preview-preflight.error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-4",
    step: "Preview preflight",
    severity: "error",
    createdBy: "preview-preflight",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || readString(e.data.reason) || "Preview preflight failed",
    action: "Preview-start blocker identifierad",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Blockerad",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "project-sanity.error": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-4",
    step: "Project sanity",
    severity: "error",
    createdBy: "project-sanity",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || readString(e.data.reason) || "Project sanity failure",
    action: "Sanity-kontroll flaggade blockerande fel",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Fel",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    file: readString(e.data.file) || "-",
    resolved: "false",
  }),
  "site.empty_generation": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Finalize",
    severity: "error",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Tom generation efter finalize",
    action: "Generation stoppades innan version sparades",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Ingen version",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "site.partial_file_output": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Finalize",
    severity: "error",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Partial file output upptäckt",
    action: "Fail-fast skydd stoppade versionssave",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Ingen version",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "site.awaiting_input": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-3",
    step: "Awaiting input",
    severity: "warning",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || readString(e.data.reason) || "Generatorn behöver användarinput",
    action: "Blockerande fråga presenterades i stället för automatisk fix",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Väntar på input",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
  "server-verify.policy": (e) => {
    if (readBoolean(e.data.run) !== false) return null;
    return {
      ts: faultFixTimestamp(e),
      phase: "phase-4",
      step: "Background verify",
      severity: "info",
      createdBy: "server-verify",
      fixedBy: "-",
      modelTier: "-",
      problem: readString(e.data.reason) || "Background verify skipped",
      action: "Server verify hoppades över enligt policy",
      model: readString(e.data.model) || "-",
      provider: readString(e.data.provider) || "-",
      pass: "-",
      outcome: "Skippad",
      chatId: "-",
      versionId: "-",
      lineageHash: "-",
      ...EMPTY_CONTEXT_COLS,
      resolved: "true",
    };
  },
  "comm.error.create": (e) => ({
    ts: faultFixTimestamp(e),
    phase: "phase-1",
    step: "Kommunikation",
    severity: "error",
    createdBy: "generator",
    fixedBy: "-",
    modelTier: "-",
    problem: readString(e.data.message) || "Kommunikationsfel",
    action: "Fel vid skapande",
    model: readString(e.data.model) || "-",
    provider: readString(e.data.provider) || "-",
    pass: "-",
    outcome: "Fel",
    chatId: "-",
    versionId: "-",
    lineageHash: "-",
    ...EMPTY_CONTEXT_COLS,
    resolved: "false",
  }),
};

function inferProvider(model: string): string {
  const normalized = model.trim().toLowerCase();
  if (!normalized || normalized === "-") return "-";
  if (
    normalized.includes("gpt") ||
    normalized.includes("openai") ||
    normalized.includes("o1") ||
    normalized.includes("o3") ||
    normalized.includes("o4")
  ) {
    return "OpenAI";
  }
  if (normalized.includes("claude") || normalized.includes("anthropic")) {
    return "Anthropic";
  }
  if (normalized.includes("gemini") || normalized.includes("google")) {
    return "Google";
  }
  return "-";
}

function enrichFaultFixRow(
  row: FaultFixRow,
  entries: StoredGenerationEntry[],
  entryIndex: number,
): FaultFixRow {
  const modelTier = findLastStringAtOrBefore(entries, entryIndex, "modelId") || row.modelTier;
  const model = row.model !== "-" ? row.model : "-";
  return {
    ...row,
    modelTier: modelTier || "-",
    provider: row.provider !== "-" ? row.provider : inferProvider(model),
    chatId: findLastStringAtOrBefore(entries, entryIndex, "chatId") || row.chatId,
    versionId: findLastStringAtOrBefore(entries, entryIndex, "versionId") || row.versionId,
    lineageHash: findLastStringAtOrBefore(entries, entryIndex, "lineageHash") || row.lineageHash,
    scaffoldId: row.scaffoldId !== "-" ? row.scaffoldId : (findLastStringAtOrBefore(entries, entryIndex, "scaffoldId") || "-"),
    serializeMode: row.serializeMode !== "-" ? row.serializeMode : (findLastStringAtOrBefore(entries, entryIndex, "serializeMode") || "-"),
    styleDirection: row.styleDirection !== "-" ? row.styleDirection : (findLastStringAtOrBefore(entries, entryIndex, "styleDirection") || "-"),
  };
}

export function collectFaultFixRows(entries: StoredGenerationEntry[]): FaultFixRow[] {
  const rows: FaultFixRow[] = [];
  for (const [entryIndex, entry] of entries.entries()) {
    const type = readString(entry.data.type);
    if (!type) continue;
    const handler = FAULT_FIX_TYPES[type];
    if (!handler) continue;
    const result = handler(entry);
    if (!result) continue;
    const batch = Array.isArray(result) ? result : [result];
    for (const row of batch) {
      rows.push(enrichFaultFixRow(row, entries, entryIndex));
    }
  }
  return rows;
}

export function buildFaultFixIndex(entries: StoredGenerationEntry[]): string {
  const rows = collectFaultFixRows(entries);

  if (rows.length === 0) {
    return [
      "# Fault & Fix Index",
      "",
      "Inga fel, fixar eller reparationer loggade under denna körning.",
      "",
    ].join("\n");
  }

  const header =
    "| Tid | Fas | Steg | Severity | Skapad av | Fixad av | Modellnivå | Modell | Provider | Pass | Problem | Åtgärd | Resultat | Chat | Version | Lineage |";
  const sep =
    "|-----|-----|------|----------|-----------|----------|------------|--------|----------|------|---------|--------|----------|------|---------|---------|";
  const tableRows = rows.map(
    (r) =>
      `| ${r.ts} | ${r.phase} | ${r.step} | ${r.severity} | ${r.createdBy} | ${r.fixedBy} | ${r.modelTier} | ${r.model} | ${r.provider} | ${r.pass} | ${r.problem} | ${r.action} | ${r.outcome} | ${r.chatId} | ${r.versionId} | ${r.lineageHash} |`,
  );

  return [
    "# Fault & Fix Index",
    "",
    `Totalt ${rows.length} händelse(r) under denna körning.`,
    "",
    header,
    sep,
    ...tableRows,
    "",
  ].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const FAULT_FIX_CSV_HEADER = [
  "time",
  "phase",
  "step",
  "severity",
  "created_by",
  "fixed_by",
  "model_tier",
  "model",
  "provider",
  "pass",
  "problem",
  "action",
  "outcome",
  "chat_id",
  "version_id",
  "lineage_hash",
  "scaffold_id",
  "serialize_mode",
  "style_direction",
  "file",
  "fixer",
  "resolved",
].join(",");

function faultFixRowToCsvLine(row: FaultFixRow): string {
  return [
    row.ts,
    row.phase,
    row.step,
    row.severity,
    row.createdBy,
    row.fixedBy,
    row.modelTier,
    row.model,
    row.provider,
    row.pass,
    row.problem,
    row.action,
    row.outcome,
    row.chatId,
    row.versionId,
    row.lineageHash,
    row.scaffoldId,
    row.serializeMode,
    row.styleDirection,
    row.file,
    row.fixer,
    row.resolved,
  ]
    .map((cell) => escapeCsv(cell))
    .join(",");
}

export function buildFaultFixCsv(rows: FaultFixRow[]): string {
  const lines = rows.map(faultFixRowToCsvLine);
  return [FAULT_FIX_CSV_HEADER, ...lines].join("\n") + "\n";
}

export function appendGlobalFaultFixCsv(rows: FaultFixRow[]): void {
  ensureLegacyIndexDir();
  const csvPath = path.join(LEGACY_INDEX_DIR, GLOBAL_ERROR_LOG_CSV_FILE);
  const existingLines = fs.existsSync(csvPath)
    ? fs
        .readFileSync(csvPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean)
    : [];

  const existingBody = existingLines.length > 0 && existingLines[0] === FAULT_FIX_CSV_HEADER
    ? existingLines.slice(1)
    : existingLines;
  const mergedLines = [...new Set([
    ...existingBody,
    ...rows.map(faultFixRowToCsvLine),
  ])];
  // Cap: behåll de N senaste raderna. Förut växte filen för evigt eftersom
  // dedup bara skedde på exakta rader (ts gör i princip varje rad unik).
  // Backoffice-konsumenterna (Autofix & Kvalitet, llm_config) bryr sig bara
  // om senaste fix-statistiken, så att klippa äldre rader är säkert.
  const cappedLines =
    mergedLines.length > MAX_GLOBAL_ERROR_LOG_ROWS
      ? mergedLines.slice(mergedLines.length - MAX_GLOBAL_ERROR_LOG_ROWS)
      : mergedLines;
  fs.writeFileSync(
    csvPath,
    [FAULT_FIX_CSV_HEADER, ...cappedLines].join("\n") + "\n",
    "utf8",
  );
}
