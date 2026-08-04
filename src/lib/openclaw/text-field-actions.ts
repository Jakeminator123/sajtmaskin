import {
  validateOpenClawApplyQuickEditAction,
  type OpenClawApplyQuickEditAction,
} from "./quick-edit-action";

const OPENCLAW_ACTION_CLOSE_TAG = "</openclaw-action>";
const OPENCLAW_TEXT_FIELD_SELECTOR = "[data-openclaw-text-target]";
const OPENCLAW_SEND_TARGET_SELECTOR = "[data-openclaw-send-target]";

type OpenClawTextFieldElement =
  | HTMLTextAreaElement
  | HTMLInputElement
  | HTMLElement;

export interface OpenClawTextFieldContext {
  target: string;
  label: string;
  kind: "textarea" | "input" | "contenteditable";
  placeholder: string;
  value: string;
  canWrite: boolean;
  multiline: boolean;
}

export interface OpenClawFillTextFieldAction {
  type: "fill_text_field";
  target: string;
  value: string;
  label?: string;
  focus?: boolean;
  /**
   * Debug-mode only: when true AND an armed mandate is active, the client fills
   * the field and then clicks the real send button (no manual approval). Outside
   * debug + armed mandate this flag is ignored and the normal fill-but-never-send
   * behavior applies. The server only emits `submit:true` in debug mode.
   */
  submit?: boolean;
}

/**
 * Fas 5: the assistant asks to start a repair of the active version. It carries
 * no files — approval in the UI dispatches the existing client autofix event
 * (`sajtmaskin:auto-fix`, manual), which runs the vetted repair flow and yields
 * a new version awaiting acceptance. OC never writes files directly.
 */
export interface OpenClawRequestRepairAction {
  type: "request_repair";
  label?: string;
  reason?: string;
}

/**
 * Debug-mode only: OpenClaw confirms an arming handshake and creates a bounded
 * autonomy mandate (Mode A). The client gates this on OPENCLAW.editEnabled and
 * sets the mandate in the store; outside debug it is ignored.
 */
export interface OpenClawStartBugHuntAction {
  type: "start_bug_hunt";
  mode?: "review_next" | "followups";
  count?: number;
  reason?: string;
}

export type OpenClawAction =
  | OpenClawFillTextFieldAction
  | OpenClawRequestRepairAction
  | OpenClawStartBugHuntAction
  | OpenClawApplyQuickEditAction;

export interface ParsedOpenClawMessage {
  visibleContent: string;
  action: OpenClawAction | null;
  hasIncompleteAction: boolean;
  /**
   * Svensk orsak till att ett KOMPLETT action-block avvisades, annars null.
   * Sätts aldrig samtidigt som `action` — blocket klipps bort ur den synliga
   * texten oavsett, så utan den här strängen ser en avvisning ut som att
   * Sajtagenten struntade i förfrågan.
   */
  actionError: string | null;
}

export interface ApplyOpenClawTextFieldActionResult {
  ok: boolean;
  field: OpenClawTextFieldContext | null;
  error?: string;
}

export function collectOpenClawTextFieldContext(
  root: ParentNode | null | undefined = typeof document === "undefined" ? null : document,
): OpenClawTextFieldContext[] {
  if (!root) return [];
  const fields = root.querySelectorAll(OPENCLAW_TEXT_FIELD_SELECTOR);
  const items: OpenClawTextFieldContext[] = [];
  for (const field of fields) {
    if (!isTextFieldElement(field)) continue;
    if (!isVisible(field)) continue;
    const summary = summarizeTextField(field);
    if (summary) items.push(summary);
  }
  return items;
}

export function getOpenClawTextFieldContext(
  target: string,
  root: ParentNode | null | undefined = typeof document === "undefined" ? null : document,
): OpenClawTextFieldContext | null {
  if (!root) return null;
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return null;
  const fields = root.querySelectorAll(OPENCLAW_TEXT_FIELD_SELECTOR);
  for (const field of fields) {
    if (!isTextFieldElement(field)) continue;
    const fieldTarget = field.getAttribute("data-openclaw-text-target")?.trim() ?? "";
    if (fieldTarget !== trimmedTarget) continue;
    const summary = summarizeTextField(field);
    if (summary) return summary;
  }
  return null;
}

export function applyOpenClawTextFieldAction(
  action: OpenClawFillTextFieldAction,
  root: ParentNode | null | undefined = typeof document === "undefined" ? null : document,
): ApplyOpenClawTextFieldActionResult {
  if (!root) {
    return { ok: false, field: null, error: "Ingen dokumentyta finns tillgänglig just nu." };
  }

  const field = findTextFieldElement(action.target, root);
  if (!field) {
    return { ok: false, field: null, error: "Jag hittar inte det fältet på sidan längre." };
  }

  const summary = summarizeTextField(field);
  if (!summary) {
    return { ok: false, field: null, error: "Fältet gick inte att läsa in." };
  }

  if (!summary.canWrite) {
    return { ok: false, field: summary, error: "Fältet är inte skrivbart just nu." };
  }

  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    setNativeFormValue(field, action.value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    if (action.focus !== false) field.focus();
    return {
      ok: true,
      field: {
        ...summary,
        value: action.value,
      },
    };
  }

  field.textContent = action.value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  if (action.focus !== false) field.focus();

  return {
    ok: true,
    field: {
      ...summary,
      value: action.value,
    },
  };
}

export function parseOpenClawMessage(
  content: string,
): ParsedOpenClawMessage {
  const rawContent = typeof content === "string" ? content : "";
  const openMatch = rawContent.match(/<openclaw-action>/i);
  if (!openMatch || openMatch.index === undefined) {
    return {
      visibleContent: rawContent.trim(),
      action: null,
      hasIncompleteAction: false,
      actionError: null,
    };
  }

  const actionStart = openMatch.index;
  const afterOpenTag = actionStart + openMatch[0].length;
  const closeIndex = rawContent.toLowerCase().indexOf(
    OPENCLAW_ACTION_CLOSE_TAG,
    afterOpenTag,
  );
  const beforeAction = rawContent.slice(0, actionStart).trimEnd();

  if (closeIndex === -1) {
    return {
      visibleContent: beforeAction.trim(),
      action: null,
      hasIncompleteAction: true,
      actionError: null,
    };
  }

  const actionPayload = rawContent.slice(afterOpenTag, closeIndex).trim();
  const afterAction = rawContent
    .slice(closeIndex + OPENCLAW_ACTION_CLOSE_TAG.length)
    .trim();
  const visibleContent = [beforeAction, afterAction].filter(Boolean).join("\n\n").trim();

  let action: OpenClawAction | null = null;
  let actionError: string | null = null;
  try {
    const result = parseOpenClawAction(JSON.parse(actionPayload));
    action = result.action;
    actionError = result.error;
  } catch {
    actionError = "Actionblocket är inte giltig JSON.";
  }

  return {
    visibleContent,
    action,
    hasIncompleteAction: false,
    actionError,
  };
}

/** Antingen en godkänd action, eller en svensk orsak till avvisningen. */
interface OpenClawActionParseResult {
  action: OpenClawAction | null;
  error: string | null;
}

function parseOpenClawAction(value: unknown): OpenClawActionParseResult {
  if (!value || typeof value !== "object") {
    return { action: null, error: "Actionblocket är inte ett JSON-objekt." };
  }
  const type = (value as Record<string, unknown>).type;

  if (type === "fill_text_field") {
    const parsed = parseOpenClawFillTextFieldAction(value);
    return parsed
      ? { action: parsed, error: null }
      : { action: null, error: "Fältförslaget saknar ett giltigt målfält eller text att fylla i." };
  }
  if (type === "request_repair") {
    const parsed = parseOpenClawRequestRepairAction(value);
    return parsed
      ? { action: parsed, error: null }
      : { action: null, error: "Reparationsförslaget gick inte att tolka." };
  }
  if (type === "start_bug_hunt") {
    const parsed = parseOpenClawStartBugHuntAction(value);
    return parsed
      ? { action: parsed, error: null }
      : { action: null, error: "Buggjaktsförslaget gick inte att tolka." };
  }
  if (type === "apply_quick_edit") {
    // Validera i stället för att parsa: förfiltret har redan tydliga svenska
    // fel (skyddad sökväg, för många ops, okänd op-typ …) som ska visas ordagrant.
    const validation = validateOpenClawApplyQuickEditAction(value);
    return validation.ok
      ? { action: validation.action, error: null }
      : { action: null, error: validation.error };
  }

  return {
    action: null,
    error:
      typeof type === "string" && type.trim()
        ? `Okänd action-typ "${type.trim().slice(0, 60)}".`
        : "Actionblocket saknar en action-typ.",
  };
}

function parseOpenClawStartBugHuntAction(
  value: unknown,
): OpenClawStartBugHuntAction | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "start_bug_hunt") return null;
  const mode =
    candidate.mode === "review_next" || candidate.mode === "followups"
      ? candidate.mode
      : undefined;
  const count =
    typeof candidate.count === "number" && Number.isFinite(candidate.count)
      ? Math.trunc(candidate.count)
      : undefined;
  const reason =
    typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, 400) : undefined;
  return { type: "start_bug_hunt", mode, count, reason: reason || undefined };
}

function parseOpenClawRequestRepairAction(
  value: unknown,
): OpenClawRequestRepairAction | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "request_repair") return null;
  const label =
    typeof candidate.label === "string" ? candidate.label.trim().slice(0, 160) : "";
  const reason =
    typeof candidate.reason === "string" ? candidate.reason.trim().slice(0, 400) : "";
  return {
    type: "request_repair",
    label: label || undefined,
    reason: reason || undefined,
  };
}

function parseOpenClawFillTextFieldAction(
  value: unknown,
): OpenClawFillTextFieldAction | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "fill_text_field") return null;

  const target =
    typeof candidate.target === "string" ? candidate.target.trim().slice(0, 160) : "";
  const textValue =
    typeof candidate.value === "string" ? candidate.value.slice(0, 6_000) : "";
  const label =
    typeof candidate.label === "string" ? candidate.label.trim().slice(0, 160) : "";

  if (!target || !textValue.trim()) return null;

  return {
    type: "fill_text_field",
    target,
    value: textValue,
    label: label || undefined,
    focus: candidate.focus !== false,
    submit: candidate.submit === true,
  };
}

function findTextFieldElement(
  target: string,
  root: ParentNode,
): OpenClawTextFieldElement | null {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) return null;
  const fields = root.querySelectorAll(OPENCLAW_TEXT_FIELD_SELECTOR);
  for (const field of fields) {
    if (!isTextFieldElement(field)) continue;
    const fieldTarget = field.getAttribute("data-openclaw-text-target")?.trim() ?? "";
    if (fieldTarget === trimmedTarget) {
      return field;
    }
  }
  return null;
}

function summarizeTextField(
  field: OpenClawTextFieldElement,
): OpenClawTextFieldContext | null {
  const target = field.getAttribute("data-openclaw-text-target")?.trim() ?? "";
  if (!target) return null;
  const placeholder = readTextFieldPlaceholder(field);
  const value = readTextFieldValue(field);
  const label =
    field.getAttribute("data-openclaw-text-label")?.trim() ||
    field.getAttribute("aria-label")?.trim() ||
    placeholder ||
    target;

  return {
    target,
    label,
    kind: field instanceof HTMLTextAreaElement
      ? "textarea"
      : field instanceof HTMLInputElement
        ? "input"
        : "contenteditable",
    placeholder,
    value,
    canWrite: isWritable(field),
    multiline:
      field instanceof HTMLTextAreaElement ||
      field.getAttribute("contenteditable") === "true",
  };
}

function readTextFieldPlaceholder(field: OpenClawTextFieldElement): string {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    return field.placeholder.trim().slice(0, 280);
  }
  return "";
}

function readTextFieldValue(field: OpenClawTextFieldElement): string {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    return field.value.slice(0, 1_200);
  }
  return (field.textContent ?? "").slice(0, 1_200);
}

function isWritable(field: OpenClawTextFieldElement): boolean {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
    return !field.disabled && !field.readOnly;
  }
  return field.getAttribute("contenteditable") === "true";
}

function isVisible(field: OpenClawTextFieldElement): boolean {
  if (field.hidden) return false;
  if (typeof window === "undefined") return true;
  const style = window.getComputedStyle(field);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  return true;
}

function isTextFieldElement(element: Element): element is OpenClawTextFieldElement {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return true;
  }
  return element instanceof HTMLElement && element.getAttribute("contenteditable") === "true";
}

function setNativeFormValue(
  element: HTMLTextAreaElement | HTMLInputElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(element) as
    | HTMLTextAreaElement
    | HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }
  element.value = value;
}

// ===========================================================================
// Debug-mode armed send (Mode A)
// ===========================================================================

export interface TriggerOpenClawSendResult {
  ok: boolean;
  /** "not_ready" means the button exists but is still disabled (caller retries). */
  reason?: "not_found" | "not_ready" | "no_document";
  error?: string;
}

function findOpenClawSendButton(
  target: string,
  root: ParentNode,
): HTMLButtonElement | null {
  const trimmed = target.trim();
  if (!trimmed) return null;
  const buttons = root.querySelectorAll(OPENCLAW_SEND_TARGET_SELECTOR);
  for (const button of buttons) {
    if (!(button instanceof HTMLButtonElement)) continue;
    const buttonTarget = button.getAttribute("data-openclaw-send-target")?.trim() ?? "";
    if (buttonTarget === trimmed) return button;
  }
  return null;
}

/**
 * Whether the builder send button for `target` is present and currently
 * clickable. Used by the armed auto-send loop to wait for React to enable the
 * button after the field was filled (the button's `disabled` is derived from
 * the trimmed input value + busy state).
 */
export function isOpenClawSendReady(
  target: string,
  root: ParentNode | null | undefined = typeof document === "undefined" ? null : document,
): boolean {
  if (!root) return false;
  const button = findOpenClawSendButton(target, root);
  return Boolean(button && !button.disabled);
}

/**
 * Click the real builder send button for `target`. Only clicks when the button
 * is enabled — never force-submits a disabled/busy composer. Pure DOM + guarded
 * so it can be unit-tested against a jsdom button and never throws.
 */
export function triggerOpenClawSend(
  target: string,
  root: ParentNode | null | undefined = typeof document === "undefined" ? null : document,
): TriggerOpenClawSendResult {
  if (!root) {
    return { ok: false, reason: "no_document", error: "Ingen dokumentyta tillgänglig." };
  }
  const button = findOpenClawSendButton(target, root);
  if (!button) {
    return { ok: false, reason: "not_found", error: "Hittar inte send-knappen." };
  }
  if (button.disabled) {
    return { ok: false, reason: "not_ready", error: "Send-knappen är inte klar än." };
  }
  button.click();
  return { ok: true };
}
