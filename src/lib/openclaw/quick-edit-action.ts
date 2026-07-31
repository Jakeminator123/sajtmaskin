/**
 * OpenClaw-action `apply_quick_edit` — Sajtagenten föreslår små, exakta
 * kodändringar på användarens genererade sajt. Godkännande i UI:t kör
 * ändringen genom den befintliga Fast Edit Lane-klienten
 * (`quickEditChatFiles` → `POST /api/engine/chats/[chatId]/quick-edit`),
 * som skapar en immutabel minor-version och hot-patchar preview-VM:en.
 *
 * Endast en DELMÄNGD av quick-edit-lanens ops tillåts härifrån:
 * `replace_content`, `replace_text` och `delete_file` — inte
 * `delete_jsx_node` (den är inspektorns AST-yta, inte något en LLM ska
 * peka ut via radnummer).
 *
 * Valideringen här är ett KLIENT-FÖRFILTER med tydliga svenska fel —
 * servern har sina egna guards (unsafe_path, protected_path,
 * stale_base_version, base_busy m.fl.) och är alltid sista ordet.
 */

const QUICK_EDIT_ACTION_TYPE = "apply_quick_edit";

/** Hårt tak: max antal ops per föreslagen action. */
export const OPENCLAW_QUICK_EDIT_MAX_OPS = 5;

/** Hårt tak: total textmängd (content + find + replace) över alla ops. */
export const OPENCLAW_QUICK_EDIT_MAX_TOTAL_CHARS = 40_000;

const LABEL_MAX_CHARS = 160;
const REASON_MAX_CHARS = 400;

/**
 * Delmängd av `QuickEditClientOp` (`src/lib/builder/engine-files-patch.ts`).
 * Strukturen är avsiktligt identisk så godkända ops kan skickas rakt in i
 * `quickEditChatFiles` utan mappning.
 */
export type OpenClawQuickEditOp =
  | { kind: "replace_content"; path: string; content: string }
  | { kind: "replace_text"; path: string; find: string; replace: string; occurrence?: number }
  | { kind: "delete_file"; path: string };

export type OpenClawQuickEditOpKind = OpenClawQuickEditOp["kind"];

export interface OpenClawApplyQuickEditAction {
  type: "apply_quick_edit";
  label?: string;
  reason?: string;
  ops: OpenClawQuickEditOp[];
}

export type OpenClawQuickEditValidation =
  | { ok: true; action: OpenClawApplyQuickEditAction }
  | { ok: false; error: string };

const ALLOWED_OP_KINDS: ReadonlySet<string> = new Set([
  "replace_content",
  "replace_text",
  "delete_file",
]);

/**
 * Klient-förfilter för paths: relativa, utan `..`-segment, utan drive-letter.
 * Speglar serverns `isQuickEditSafePath` (`src/lib/gen/quick-edit/guards.ts`)
 * så att uppenbart osäkra förslag stoppas med tydligt fel redan innan
 * nätverksanropet. Serverns guard är fortfarande den kanoniska.
 */
export function isOpenClawQuickEditSafePath(rawPath: string): boolean {
  const path = rawPath.replace(/\\/g, "/").trim();
  if (!path) return false;
  if (path.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  if (path.split("/").some((segment) => segment === "..")) return false;
  return true;
}

/** Kort svensk beskrivning av en op för godkännandekortets fillista. */
export function describeOpenClawQuickEditOp(op: OpenClawQuickEditOp): string {
  switch (op.kind) {
    case "replace_content":
      return "ersätt filinnehåll";
    case "replace_text":
      return "ersätt text";
    case "delete_file":
      return "ta bort fil";
  }
}

function opContentChars(op: OpenClawQuickEditOp): number {
  switch (op.kind) {
    case "replace_content":
      return op.content.length;
    case "replace_text":
      return op.find.length + op.replace.length;
    case "delete_file":
      return 0;
  }
}

function parseQuickEditOp(value: unknown, index: number): OpenClawQuickEditOp | string {
  const position = `Op ${index + 1}`;
  if (!value || typeof value !== "object") {
    return `${position} är inte ett objekt.`;
  }
  const candidate = value as Record<string, unknown>;
  const kind = typeof candidate.kind === "string" ? candidate.kind : "";
  if (!ALLOWED_OP_KINDS.has(kind)) {
    return `${position} har okänd op-typ "${kind || "?"}". Tillåtna: replace_content, replace_text, delete_file.`;
  }

  const rawPath = typeof candidate.path === "string" ? candidate.path.trim() : "";
  if (!rawPath) {
    return `${position} (${kind}) saknar sökväg.`;
  }
  if (!isOpenClawQuickEditSafePath(rawPath)) {
    return `${position} har ogiltig sökväg "${rawPath}". Sökvägar ska vara relativa och utan "..".`;
  }

  if (kind === "replace_content") {
    if (typeof candidate.content !== "string") {
      return `${position} (replace_content) saknar content.`;
    }
    return { kind: "replace_content", path: rawPath, content: candidate.content };
  }

  if (kind === "replace_text") {
    if (typeof candidate.find !== "string" || candidate.find.length === 0) {
      return `${position} (replace_text) saknar find-text.`;
    }
    if (typeof candidate.replace !== "string") {
      return `${position} (replace_text) saknar replace-text.`;
    }
    const occurrence =
      typeof candidate.occurrence === "number" &&
      Number.isInteger(candidate.occurrence) &&
      candidate.occurrence > 0
        ? candidate.occurrence
        : undefined;
    return {
      kind: "replace_text",
      path: rawPath,
      find: candidate.find,
      replace: candidate.replace,
      ...(occurrence !== undefined ? { occurrence } : {}),
    };
  }

  return { kind: "delete_file", path: rawPath };
}

/**
 * Validera en rå `apply_quick_edit`-payload med tydliga svenska fel.
 * Vid `ok: false` renderas inget godkännandekort (samma "avvisas tyst"-
 * beteende som övriga actions i parse-kedjan) — felsträngarna finns för
 * tester, felsökning och som dokumenterat förfilterkontrakt.
 */
export function validateOpenClawApplyQuickEditAction(
  value: unknown,
): OpenClawQuickEditValidation {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Actionen är inte ett objekt." };
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== QUICK_EDIT_ACTION_TYPE) {
    return { ok: false, error: `Actionen har fel typ (förväntade "${QUICK_EDIT_ACTION_TYPE}").` };
  }

  if (!Array.isArray(candidate.ops) || candidate.ops.length === 0) {
    return { ok: false, error: "Actionen saknar ops (minst 1 krävs)." };
  }
  if (candidate.ops.length > OPENCLAW_QUICK_EDIT_MAX_OPS) {
    return {
      ok: false,
      error: `För många ops: ${candidate.ops.length} (max ${OPENCLAW_QUICK_EDIT_MAX_OPS}).`,
    };
  }

  const ops: OpenClawQuickEditOp[] = [];
  for (let index = 0; index < candidate.ops.length; index += 1) {
    const parsed = parseQuickEditOp(candidate.ops[index], index);
    if (typeof parsed === "string") {
      return { ok: false, error: parsed };
    }
    ops.push(parsed);
  }

  const totalChars = ops.reduce((sum, op) => sum + opContentChars(op), 0);
  if (totalChars > OPENCLAW_QUICK_EDIT_MAX_TOTAL_CHARS) {
    return {
      ok: false,
      error: `För stor total textmängd: ${totalChars} tecken (max ${OPENCLAW_QUICK_EDIT_MAX_TOTAL_CHARS}).`,
    };
  }

  const label =
    typeof candidate.label === "string" ? candidate.label.trim().slice(0, LABEL_MAX_CHARS) : "";
  const reason =
    typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, REASON_MAX_CHARS) : "";

  return {
    ok: true,
    action: {
      type: "apply_quick_edit",
      label: label || undefined,
      reason: reason || undefined,
      ops,
    },
  };
}

/**
 * Parse i samma mönster som övriga actions (`parseOpenClawAction` i
 * `text-field-actions.ts`): giltig action eller `null` (avvisad).
 */
export function parseOpenClawApplyQuickEditAction(
  value: unknown,
): OpenClawApplyQuickEditAction | null {
  const result = validateOpenClawApplyQuickEditAction(value);
  return result.ok ? result.action : null;
}
