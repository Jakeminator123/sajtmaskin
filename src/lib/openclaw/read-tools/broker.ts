import {
  parseOpenClawReadToolCall,
  type OpenClawReadToolCall,
  type OpenClawReadToolName,
} from "./contracts";
import {
  createOpenClawReadBudget,
  clampOpenClawReadSessionTtl,
  consumeOpenClawReadCall,
  consumeOpenClawReadOutput,
  DEFAULT_OPENCLAW_READ_BUDGET,
  OPENCLAW_READ_MAX_LANGUAGE_CHARS,
  OPENCLAW_READ_MAX_PROJECT_CHARS,
  OPENCLAW_READ_MAX_PROJECT_FILES,
  type OpenClawReadBudgetPolicy,
  type OpenClawReadBudgetState,
} from "./policy";
import {
  listOpenClawProjectFiles,
  readOpenClawProjectFile,
  searchOpenClawProjectCode,
  type ProjectFileToolErrorCode,
} from "./project-files";
import { scrubOpenClawReadText } from "./scrub";
import type {
  OpenClawReadAuthority,
  OpenClawReadTarget,
  OpenClawReadTargetLoadResult,
  OpenClawReadToolDataSource,
} from "./source";

export type OpenClawReadToolErrorCode =
  | "invalid_arguments"
  | "target_unavailable"
  | "revision_unavailable"
  | "snapshot_invalid"
  | "project_too_large"
  | "stale_revision"
  | "scope_expired"
  | "budget_exhausted"
  | "source_unavailable"
  | ProjectFileToolErrorCode;

export type OpenClawReadReceipt = {
  versionId: string;
  filesRevision: string;
  scopeExpiresAt: number;
};

export type OpenClawReadToolResponse =
  | {
      ok: true;
      tool: OpenClawReadToolName;
      receipt: OpenClawReadReceipt;
      data: unknown;
      budget: Readonly<OpenClawReadBudgetState>;
    }
  | {
      ok: false;
      tool: OpenClawReadToolName | null;
      error: {
        code: OpenClawReadToolErrorCode;
        message: string;
        retryable: boolean;
      };
      budget: Readonly<OpenClawReadBudgetState>;
    };

export type CreateOpenClawReadToolSessionResult =
  | {
      ok: true;
      session: OpenClawReadToolSession;
      receipt: OpenClawReadReceipt;
    }
  | {
      ok: false;
      error: {
        code: Extract<
          OpenClawReadToolErrorCode,
          "target_unavailable" | "revision_unavailable" | "snapshot_invalid" | "project_too_large"
        >;
        message: string;
      };
    };

export type OpenClawReadToolSession = {
  readonly receipt: OpenClawReadReceipt;
  execute(input: { name: unknown; arguments?: unknown }): Promise<OpenClawReadToolResponse>;
};

type BrokerOptions = {
  dataSource?: OpenClawReadToolDataSource;
  budget?: OpenClawReadBudgetPolicy;
  ttlMs?: number;
  now?: () => number;
};

const ERROR_MESSAGES: Record<OpenClawReadToolErrorCode, string> = {
  invalid_arguments: "The tool call does not match the read-only contract.",
  target_unavailable: "The bound project target is unavailable.",
  revision_unavailable: "The bound version has no usable content revision.",
  snapshot_invalid: "The bound project snapshot is invalid.",
  project_too_large: "The bound project exceeds the read-tool safety budget.",
  stale_revision: "The bound project revision changed during this read session.",
  scope_expired: "The read-tool session expired.",
  budget_exhausted: "The read-tool session budget is exhausted.",
  source_unavailable: "A read-only diagnostic source is unavailable.",
  invalid_path: "The requested path is not a safe project path.",
  restricted_path: "That project path is restricted from read tools.",
  file_not_found: "The requested file does not exist in the bound version.",
  unsupported_file: "Binary or encoded files cannot be read through this tool.",
  ambiguous_path: "The bound version contains an ambiguous duplicate path.",
  invalid_query: "The search query is not allowed.",
};

function cloneBudget(state: OpenClawReadBudgetState): Readonly<OpenClawReadBudgetState> {
  return { ...state };
}

function targetLoadCode(
  result: Exclude<OpenClawReadTargetLoadResult, { ok: true }>,
): "target_unavailable" | "revision_unavailable" | "snapshot_invalid" | "project_too_large" {
  return result.code;
}

function validateTarget(
  target: OpenClawReadTarget,
  expectedChatId: string,
): OpenClawReadToolErrorCode | null {
  if (
    target.chatId !== expectedChatId ||
    !target.metadata.versionId.trim() ||
    !target.metadata.filesRevision.trim()
  ) {
    return "snapshot_invalid";
  }
  if (target.files.length > OPENCLAW_READ_MAX_PROJECT_FILES) return "project_too_large";
  let chars = 0;
  for (const file of target.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.content !== "string" ||
      typeof file.language !== "string"
    ) {
      return "snapshot_invalid";
    }
    if (file.language.length > OPENCLAW_READ_MAX_LANGUAGE_CHARS) {
      return "project_too_large";
    }
    chars += file.content.length;
    if (chars > OPENCLAW_READ_MAX_PROJECT_CHARS) return "project_too_large";
  }
  return null;
}

function sanitizeVersionMetadata(target: OpenClawReadTarget) {
  const summary = scrubOpenClawReadText(target.metadata.verificationSummary, { maxChars: 1_200 });
  return {
    versionId: target.metadata.versionId,
    versionNumber: target.metadata.versionNumber,
    filesRevision: target.metadata.filesRevision,
    lifecycleStage: target.metadata.lifecycleStage,
    releaseState: target.metadata.releaseState,
    verificationState: target.metadata.verificationState,
    verificationSummary: summary.text || null,
    verificationSummaryRedacted: summary.redacted,
    editKind: target.metadata.editKind,
    createdAt: target.metadata.createdAt,
    hasPreviewUrl: target.metadata.hasPreviewUrl,
    fileCount: target.files.length,
  };
}

function sanitizeDiagnostics(
  diagnostics: Awaited<ReturnType<OpenClawReadToolDataSource["loadDiagnostics"]>>,
) {
  return diagnostics.map((entry) => {
    const category = scrubOpenClawReadText(entry.category, { maxChars: 120 });
    const message = scrubOpenClawReadText(entry.message, { maxChars: 1_200 });
    const kind = scrubOpenClawReadText(entry.defect?.kind, { maxChars: 80 });
    const signature = scrubOpenClawReadText(entry.defect?.signature, { maxChars: 200 });
    return {
      level: entry.level,
      category: category.text || null,
      message: message.text,
      createdAt: entry.createdAt,
      defect: entry.defect
        ? {
            kind: kind.text,
            signature: signature.text,
            file: entry.defect.file,
            line: entry.defect.line,
          }
        : null,
      redacted: category.redacted || message.redacted || kind.redacted || signature.redacted,
    };
  });
}

function sanitizePreviewLogs(
  logs: Awaited<ReturnType<OpenClawReadToolDataSource["loadPreviewLogs"]>>,
) {
  const exactRedactions = [...new Set(logs.redactValues ?? [])]
    .map((value) => value.trim())
    .filter((value) => value.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 20);
  return {
    available: logs.available,
    reason: logs.reason,
    truncated: logs.truncated,
    lines: logs.lines.map((line) => {
      const timestamp = scrubOpenClawReadText(line.ts, { maxChars: 64 });
      const identifierScrubbed = exactRedactions.reduce(
        (text, value) => text.replaceAll(value, "[REDACTED]"),
        line.message,
      );
      const message = scrubOpenClawReadText(identifierScrubbed, { maxChars: 1_000 });
      return {
        ts: timestamp.text,
        message: message.text,
        redacted: timestamp.redacted || message.redacted,
        truncated: message.truncated,
      };
    }),
  };
}

class BoundOpenClawReadToolSession implements OpenClawReadToolSession {
  readonly #authority: OpenClawReadAuthority;
  readonly #dataSource: OpenClawReadToolDataSource;
  readonly #budget: OpenClawReadBudgetState;
  readonly #expiresAt: number;
  readonly #versionId: string;
  readonly #filesRevision: string;
  readonly #now: () => number;

  constructor(params: {
    authority: OpenClawReadAuthority;
    dataSource: OpenClawReadToolDataSource;
    budget: OpenClawReadBudgetState;
    expiresAt: number;
    versionId: string;
    filesRevision: string;
    now: () => number;
  }) {
    this.#authority = params.authority;
    this.#dataSource = params.dataSource;
    this.#budget = params.budget;
    this.#expiresAt = params.expiresAt;
    this.#versionId = params.versionId;
    this.#filesRevision = params.filesRevision;
    this.#now = params.now;
  }

  get receipt(): OpenClawReadReceipt {
    return {
      versionId: this.#versionId,
      filesRevision: this.#filesRevision,
      scopeExpiresAt: this.#expiresAt,
    };
  }

  #error(
    code: OpenClawReadToolErrorCode,
    tool: OpenClawReadToolName | null,
    retryable = false,
  ): OpenClawReadToolResponse {
    return {
      ok: false,
      tool,
      error: { code, message: ERROR_MESSAGES[code], retryable },
      budget: cloneBudget(this.#budget),
    };
  }

  async #loadCurrentTarget(
    tool: OpenClawReadToolName,
  ): Promise<OpenClawReadTarget | OpenClawReadToolResponse> {
    let loaded: OpenClawReadTargetLoadResult;
    try {
      loaded = await this.#dataSource.loadTarget(this.#authority);
    } catch {
      return this.#error("source_unavailable", tool, true);
    }
    if (!loaded.ok) {
      const code = loaded.code === "target_unavailable" ? "target_unavailable" : loaded.code;
      return this.#error(code, tool, code === "target_unavailable");
    }
    const validationError = validateTarget(loaded.target, this.#authority.chatId);
    if (validationError) return this.#error(validationError, tool);
    if (
      loaded.target.metadata.versionId !== this.#versionId ||
      loaded.target.metadata.filesRevision !== this.#filesRevision
    ) {
      return this.#error("stale_revision", tool);
    }
    return loaded.target;
  }

  async #dispatch(
    call: OpenClawReadToolCall,
    target: OpenClawReadTarget,
  ): Promise<
    | {
        data: unknown;
        searchMatches?: number;
        listedFiles?: number;
      }
    | OpenClawReadToolResponse
  > {
    switch (call.name) {
      case "project_list_files": {
        const result = listOpenClawProjectFiles(target.files, call.arguments);
        if (!result.ok) return this.#error(result.code, call.name);
        return { data: result.data, listedFiles: result.data.files.length };
      }
      case "project_read_file": {
        const result = readOpenClawProjectFile(target.files, call.arguments);
        if (!result.ok) return this.#error(result.code, call.name);
        return { data: result.data };
      }
      case "project_search_code": {
        const result = searchOpenClawProjectCode(target.files, call.arguments);
        if (!result.ok) return this.#error(result.code, call.name);
        return { data: result.data, searchMatches: result.data.matches.length };
      }
      case "project_get_version":
        return { data: sanitizeVersionMetadata(target) };
      case "project_get_diagnostics": {
        try {
          const diagnostics = await this.#dataSource.loadDiagnostics(
            target,
            call.arguments.limit ?? 20,
          );
          return { data: { diagnostics: sanitizeDiagnostics(diagnostics.slice(0, 30)) } };
        } catch {
          return this.#error("source_unavailable", call.name, true);
        }
      }
      case "preview_get_status": {
        try {
          return { data: await this.#dataSource.loadPreviewStatus(target) };
        } catch {
          return this.#error("source_unavailable", call.name, true);
        }
      }
      case "preview_get_logs": {
        try {
          const logs = await this.#dataSource.loadPreviewLogs(target, call.arguments.limit ?? 20);
          return { data: sanitizePreviewLogs(logs) };
        } catch {
          return this.#error("source_unavailable", call.name, true);
        }
      }
    }
  }

  async execute(input: { name: unknown; arguments?: unknown }): Promise<OpenClawReadToolResponse> {
    if (this.#now() >= this.#expiresAt) return this.#error("scope_expired", null);
    if (!consumeOpenClawReadCall(this.#budget)) return this.#error("budget_exhausted", null);

    const parsed = parseOpenClawReadToolCall(input);
    if (!parsed.ok) return this.#error("invalid_arguments", null);
    const target = await this.#loadCurrentTarget(parsed.call.name);
    if (!("files" in target)) return target;
    if (this.#now() >= this.#expiresAt) return this.#error("scope_expired", parsed.call.name);

    const dispatched = await this.#dispatch(parsed.call, target);
    if ("ok" in dispatched) return dispatched;
    if (this.#now() >= this.#expiresAt) return this.#error("scope_expired", parsed.call.name);

    // Discard a result if the version changed while an upstream read was in flight.
    const postTarget = await this.#loadCurrentTarget(parsed.call.name);
    if (!("files" in postTarget)) return postTarget;
    if (this.#now() >= this.#expiresAt) return this.#error("scope_expired", parsed.call.name);

    const outputChars = JSON.stringify(dispatched.data).length;
    if (
      !consumeOpenClawReadOutput(this.#budget, {
        outputChars,
        searchMatches: dispatched.searchMatches,
        listedFiles: dispatched.listedFiles,
      })
    ) {
      return this.#error("budget_exhausted", parsed.call.name);
    }
    return {
      ok: true,
      tool: parsed.call.name,
      receipt: this.receipt,
      data: dispatched.data,
      budget: cloneBudget(this.#budget),
    };
  }
}

export async function createOpenClawReadToolSession(
  authority: OpenClawReadAuthority,
  options: BrokerOptions = {},
): Promise<CreateOpenClawReadToolSessionResult> {
  const chatId = authority.chatId.trim();
  const versionId = authority.versionId?.trim() || null;
  if (!chatId || chatId.length > 200 || (versionId && versionId.length > 200)) {
    return {
      ok: false,
      error: { code: "target_unavailable", message: ERROR_MESSAGES.target_unavailable },
    };
  }
  const dataSource =
    options.dataSource ?? (await import("./source")).defaultOpenClawReadToolDataSource;
  const now = options.now ?? Date.now;
  let loaded: OpenClawReadTargetLoadResult;
  try {
    loaded = await dataSource.loadTarget({ ...authority, chatId, versionId });
  } catch {
    return {
      ok: false,
      error: { code: "target_unavailable", message: ERROR_MESSAGES.target_unavailable },
    };
  }
  if (!loaded.ok) {
    const code = targetLoadCode(loaded);
    return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
  }
  const validationError = validateTarget(loaded.target, chatId);
  if (validationError) {
    const code = validationError === "project_too_large" ? "project_too_large" : "snapshot_invalid";
    return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
  }

  const createdAt = now();
  const expiresAt = createdAt + clampOpenClawReadSessionTtl(options.ttlMs);
  const session = new BoundOpenClawReadToolSession({
    authority: {
      ...authority,
      chatId,
      versionId: loaded.target.metadata.versionId,
    },
    dataSource,
    budget: createOpenClawReadBudget(options.budget ?? DEFAULT_OPENCLAW_READ_BUDGET),
    expiresAt,
    versionId: loaded.target.metadata.versionId,
    filesRevision: loaded.target.metadata.filesRevision,
    now,
  });
  return { ok: true, session, receipt: session.receipt };
}
