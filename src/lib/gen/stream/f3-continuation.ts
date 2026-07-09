/**
 * F3-continuation contract (P1 "F3-flödet körde v8 i F2-lane", BUG-SWARM-BACKLOG).
 *
 * The F3 ("Bygg integrationer") lifecycle stage is only carried by the
 * auto-kicked client message (`BuilderShellContent.onF3Ready` →
 * `meta.lifecycleStage: "integrations"`). When that F3 generation ends
 * tool-only (`tool_only_empty_generation` → awaiting-input), the user's
 * reply ("Godkänn förslag", free text, …) is a plain follow-up send with no
 * lifecycle meta — the server used to default it to design/F2, so the actual
 * SDK codegen ran in the F2 lane and `tier3-sdk-guard-fixer` stripped the
 * Stripe/Resend imports (prod chat cc10e7de v8).
 *
 * Fix: server-side truth. The generation stream persists an assistant
 * message carrying the marker built here when an F3 stream parks in
 * awaiting-input; the follow-up route derives the stage from persisted chat
 * history via `resolvePendingF3Continuation` instead of trusting client meta.
 *
 * ## Reply-intent classification (Bugbot HIGH, PR #382)
 *
 * A pending marker does NOT mean the next reply runs F3 — only an APPROVING
 * reply does. `classifyF3ContinuationReply` buckets the direct reply:
 *
 *  - `"approve"` — run F3. Matched by (in order):
 *      1. exact quick-reply match against the persisted approve option
 *         (`F3_CONTINUATION_APPROVE_OPTION`, same string the live client
 *         synthesizes via `normalizeApprovalOptionLabel`);
 *      2. free text with an explicit approval word (godkänn/approve …); or
 *      3. free text that explicitly asks for the integrations build
 *         (build-verb + integration-noun, e.g. "kör integrationsbygget").
 *      A negation word (inte/ej/not/…) anywhere in the free text vetoes
 *      approval — fail-safe. All word matching is Unicode-aware
 *      (`uWordRegex`) per `.cursor/rules/unicode-regex.mdc`.
 *  - `"reject"` — explicit decline ("Avvisa förslag", nej/avvisa/reject …).
 *      The marker is consumed and F3 closes CALMLY without any generation:
 *      a short confirmation ({@link F3_REJECT_ACK_MESSAGE}) is persisted and
 *      streamed with `done.reason = `{@link F3_REJECT_ACK_REASON} (P2
 *      F3-loop åtgärd 4 — the old "run as F2 follow-up" behavior produced a
 *      silent empty generation and re-asked the same question).
 *  - `"unrelated"` — anything else (design edits, questions, "Annat").
 *      Consume + run the message as a normal F2 follow-up.
 *
 * **Fail-safe rule: when in doubt, NOT F3.** A missed approval costs one
 * click ("Bygg integrationer" again); a false F3 burns credits in the wrong
 * tier and breaks the F2-mute contract.
 *
 * ## Atomic consumption (Bugbot MEDIUM, PR #382)
 *
 * The marker is consumed via `consumeF3ContinuationMarker`
 * (`chat-repository-pg.ts`): a conditional jsonb UPDATE that flags the
 * marker part with `F3_CONTINUATION_CONSUMED_KEY` only while unconsumed.
 * Two racing replies both read the same pending snapshot, but only the
 * first conditional write reports a row — the loser (and any reply after a
 * failed/unconfirmed write) runs F2. Inheritance REQUIRES a confirmed
 * consume; best-effort is not enough here. The in-memory walk below stays
 * as the cheap pre-filter (any persisted user message after the marker also
 * clears pending).
 */
import type { Message } from "@/lib/db/chat-repository-pg";
import { uWordRegex } from "@/lib/utils/unicode-word-boundary";

/** `output.kind` discriminator for the persisted awaiting-input ui-part. */
export const F3_CONTINUATION_KIND = "f3-continuation";

/** Machine-readable marker flag on the ui-part `output`. */
export const F3_CONTINUATION_FLAG_KEY = "f3Continuation";

/** Set by `consumeF3ContinuationMarker` — a consumed marker is never pending. */
export const F3_CONTINUATION_CONSUMED_KEY = "f3ContinuationConsumed";

/**
 * Display name of the marker tool-part. MUST NOT contain "integration"/env
 * wording: `isIntegrationOrEnvToolPart` (BuilderMessageTooling.tsx) filters
 * integration/env tool-parts out of `getLatestPendingReply`, and a matching
 * name suppressed the awaiting-input detection after reload so the
 * Godkänn/Avvisa quick-replies disappeared (Bugbot MEDIUM, PR #382).
 * Locked by MessageList.test.tsx (reload scenario renders the buttons).
 */
export const F3_CONTINUATION_TOOL_NAME = "Bygget väntar på ditt svar";

/**
 * Canonical quick-reply options, persisted in the marker so the reloaded UI
 * shows exactly the strings the server classifies against. They mirror the
 * live client's synthetic approval labels (`getActionPrompt` →
 * `normalizeApprovalOptionLabel` in BuilderMessageTooling.tsx).
 */
export const F3_CONTINUATION_APPROVE_OPTION = "Godkänn förslag";
export const F3_CONTINUATION_REJECT_OPTION = "Avvisa förslag";
export const F3_CONTINUATION_OTHER_OPTION = "Annat";
export const F3_CONTINUATION_QUICK_REPLY_OPTIONS = [
  F3_CONTINUATION_APPROVE_OPTION,
  F3_CONTINUATION_REJECT_OPTION,
  F3_CONTINUATION_OTHER_OPTION,
] as const;

/**
 * First tool-only round: the standard "run the build or continue with
 * design?" question (unchanged copy — pinned by MessageList/golden tests).
 */
export const F3_CONTINUATION_FIRST_QUESTION =
  "Integrationer signalerades, men modellen skrev inga kodfiler. Välj om du vill köra integrationsbygget igen eller fortsätta med designversionen.";

/**
 * Loop-breaker (P2 "F3 suggestIntegration-loop", BUG-SWARM-BACKLOG): an
 * APPROVAL round that STILL ended tool-only gets an honest question that
 * offers closure instead of an identical loop. Max one repeat is offered.
 */
export const F3_CONTINUATION_LOOP_QUESTION =
  "Modellen föreslog integrationer igen i stället för att skriva kod. Du kan försöka en sista gång ('Godkänn förslag') eller avsluta integrationsläget och fortsätta med designversionen ('Avvisa förslag').";

/**
 * Bugbot HIGH (PR #383): an F3 round that ends completely EMPTY — zero tool
 * calls, zero code (the prod "Model produced no text events" case) — takes
 * the SAME loop-breaker path as tool-only rounds, with copy that does not
 * falsely claim integrations were signaled. Offers retry or calm closure.
 */
export const F3_CONTINUATION_EMPTY_QUESTION =
  "Modellen skrev inga kodfiler i integrationsrundan. Du kan försöka igen ('Godkänn förslag') eller avsluta integrationsläget och fortsätta med designversionen ('Avvisa förslag').";

/** `done`-event reason for the silent (no tool calls) F3 no-code round. */
export const F3_EMPTY_NO_CODE_REASON = "f3_empty_no_code_generation";

/**
 * Honest first-round copy when the F3 round wrote no NEW code BUT the parent
 * design version already carries the integration/dossier artifacts (verified via
 * `resolveDossiersPresentInVersion` over the parent files). The old copy
 * ("Integrationer signalerades, men modellen skrev inga kodfiler") was a lie in
 * this case — the integration code very much exists, it just already lived in
 * the design version (the ai-tool-calling incident). Still offers the same
 * approve/continue choice via the canonical quick-replies.
 */
export const F3_CONTINUATION_PARENT_HAS_CODE_QUESTION =
  "Integrationskoden finns redan i designversionen — den här rundan skrev inga nya kodfiler. Välj om du vill köra integrationsbygget igen ('Godkänn förslag') eller fortsätta med designversionen som den är ('Avvisa förslag').";

/**
 * Terminal message after the SECOND repeated no-code round (tool-only OR
 * silent): no new marker is persisted (loop-breaker cap) — F3 ends and the
 * chat returns to design.
 */
export const F3_CONTINUATION_EXHAUSTED_MESSAGE =
  "Integrationsbygget avslutades: modellen levererade ingen kod efter upprepade integrationsrundor. Sajten är kvar i designläget — du kan starta 'Bygg integrationer' igen från previewpanelen.";

/** `done`-event reason for the loop-breaker terminal close (no marker). */
export const F3_TOOL_ONLY_EXHAUSTED_REASON = "tool_only_rounds_exhausted";

/**
 * Calm reject close-out (P2 F3-loop, åtgärd 4): a reject-classified reply
 * consumes the marker and gets this short confirmation instead of starting
 * an own-engine generation that would be empty/silent.
 */
export const F3_REJECT_ACK_MESSAGE =
  "Integrationsförslaget avvisades — inga integrationer byggdes. Sajten är kvar i designläget och du kan fortsätta redigera som vanligt.";

/** `done`-event reason for the calm reject close-out (no generation ran). */
export const F3_REJECT_ACK_REASON = "f3_reject_acknowledged";

/**
 * Codex P2 (PR #383): reject reply that LOST the atomic consume race to a
 * concurrent approval. The chat must not claim "avvisades" while the winning
 * approval request keeps building — neutral copy, still no generation on
 * this request.
 */
export const F3_REJECT_RACE_LOST_MESSAGE =
  "Ditt svar togs emot, men ett annat pågående svar hann före och integrationsbygget kan redan vara igång. Kolla senaste meddelandet i chatten — du kan fortsätta redigera designen som vanligt.";

export type F3ContinuationReplyIntent = "approve" | "reject" | "unrelated";

export interface PendingF3Continuation {
  /** Persisted assistant message carrying the marker (consume target). */
  messageId: string | null;
  /** Parent F2 version id from the original F3 kick (lineage), if known. */
  parentVersionId: string | null;
  /**
   * Integration providers signaled by well-formed `suggestIntegration`
   * calls in the tool-only round that produced the marker (identity-form
   * keys, e.g. "stripe"). The approval round maps these to dossier
   * capabilities so the build gets the hard-dossier verbatim templates.
   * `[]` for markers persisted before this field existed.
   */
  suggestedProviders: string[];
  /**
   * How many consecutive tool-only rounds this F3 kick has produced
   * (loop-breaker counter). `1` on the first marker; legacy markers
   * without the field also read as `1`.
   */
  toolOnlyRounds: number;
}

// Unicode-aware word patterns (see .cursor/rules/unicode-regex.mdc — plain
// JS \b never matches next to å/ä/ö). Conservative by design: the approve
// vocabulary is intentionally narrow because the fail-safe outcome is F2.
const APPROVE_WORD = uWordRegex("godkänn(?:er|de|d|t|s)?|godkännande|approve(?:d|s)?", "iu");
const BUILD_VERB = uWordRegex("bygg(?:a|er|de|t)?|kör|starta|build|run|start", "iu");
const INTEGRATION_NOUN = uWordRegex(
  "integration(?:en|er|erna|s)?|integrationsbygge(?:t|n)?|integrations?bygget",
  "iu",
);
const REJECT_WORD = uWordRegex(
  "avvisa(?:r|de|t)?|avböj(?:er|de)?|reject(?:ed|s)?|nej|no|avbryt|skippa|hoppa\\s+över",
  "iu",
);
// Deliberately NOT including "utan" ("godkänn utan ändringar" is an approval).
const NEGATION_WORD = uWordRegex("inte|ej|aldrig|not|don'?t|do\\s+not", "iu");

/**
 * Classifies the direct reply to a pending F3 awaiting-input question.
 * See the module doc for the full rule table. Only `"approve"` may inherit
 * `lifecycleStage: "integrations"`; everything else consumes the marker and
 * runs the message as a normal F2 follow-up.
 */
export function classifyF3ContinuationReply(message: string): F3ContinuationReplyIntent {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) return "unrelated";

  // 1. Exact quick-reply strings (case-insensitive; the client sends the
  //    option text verbatim as the message).
  const normalized = trimmed.toLowerCase();
  if (normalized === F3_CONTINUATION_APPROVE_OPTION.toLowerCase()) return "approve";
  if (normalized === F3_CONTINUATION_REJECT_OPTION.toLowerCase()) return "reject";
  if (normalized === F3_CONTINUATION_OTHER_OPTION.toLowerCase()) return "unrelated";

  // 2. Free text: a negation anywhere vetoes approval (fail-safe F2) —
  //    "godkänn inte", "bygg inte integrationerna", "don't approve".
  if (NEGATION_WORD.test(trimmed)) {
    return REJECT_WORD.test(trimmed) ? "reject" : "unrelated";
  }

  // 3. Explicit approval word, or an explicit integrations-build request.
  if (APPROVE_WORD.test(trimmed)) return "approve";
  if (BUILD_VERB.test(trimmed) && INTEGRATION_NOUN.test(trimmed)) return "approve";

  if (REJECT_WORD.test(trimmed)) return "reject";
  return "unrelated";
}

/**
 * Assistant-message ui-part persisted when an F3 stream ends tool-only in
 * awaiting-input. Shape follows `persistFollowUpClarification` so the builder
 * UI re-renders the question (with the canonical quick-replies) after a
 * refresh. `output.f3Continuation: true` is the machine-readable marker the
 * follow-up route derives the lifecycle stage from — deliberately NOT
 * `contractClarification`, so `collectConfirmedContractAnswers` ignores it.
 */
export function buildF3AwaitingInputUiPart(params: {
  question: string;
  parentVersionId: string | null;
  /** Providers signaled in the round that produced the marker. */
  suggestedProviders?: string[];
  /** Loop-breaker counter: which tool-only round this marker represents. */
  toolOnlyRounds?: number;
}): Record<string, unknown> {
  const suggestedProviders = (params.suggestedProviders ?? [])
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  return {
    type: "tool:awaiting-input",
    toolName: F3_CONTINUATION_TOOL_NAME,
    state: "approval-requested",
    output: {
      question: params.question,
      options: [...F3_CONTINUATION_QUICK_REPLY_OPTIONS],
      kind: F3_CONTINUATION_KIND,
      [F3_CONTINUATION_FLAG_KEY]: true,
      lifecycleStage: "integrations",
      parentVersionId: params.parentVersionId,
      suggestedProviders,
      toolOnlyRounds:
        typeof params.toolOnlyRounds === "number" && params.toolOnlyRounds > 0
          ? Math.floor(params.toolOnlyRounds)
          : 1,
      blocking: true,
      awaitingInput: true,
    },
  };
}

function readF3ContinuationMarker(
  message: Pick<Message, "ui_parts">,
): Omit<PendingF3Continuation, "messageId"> | null {
  const parts = Array.isArray(message.ui_parts) ? message.ui_parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if ((part as { type?: unknown }).type !== "tool:awaiting-input") continue;
    const output = (part as { output?: unknown }).output;
    if (!output || typeof output !== "object") continue;
    const outputRecord = output as Record<string, unknown>;
    if (outputRecord[F3_CONTINUATION_FLAG_KEY] !== true) continue;
    // A consumed marker is spent — the atomic arbiter already handed the
    // continuation to another request (or a previous turn).
    if (outputRecord[F3_CONTINUATION_CONSUMED_KEY] === true) continue;
    const parentVersionId =
      typeof outputRecord.parentVersionId === "string" &&
      outputRecord.parentVersionId.trim()
        ? outputRecord.parentVersionId.trim()
        : null;
    const suggestedProviders = Array.isArray(outputRecord.suggestedProviders)
      ? outputRecord.suggestedProviders
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .map((p) => p.trim())
      : [];
    const toolOnlyRounds =
      typeof outputRecord.toolOnlyRounds === "number" &&
      Number.isFinite(outputRecord.toolOnlyRounds) &&
      outputRecord.toolOnlyRounds > 0
        ? Math.floor(outputRecord.toolOnlyRounds)
        : 1;
    return { parentVersionId, suggestedProviders, toolOnlyRounds };
  }
  return null;
}

/**
 * Walks persisted chat history (oldest→newest, the order `getChat` returns)
 * and reports a pending F3 continuation only when the most recent state is
 * "F3 asked, user has not answered yet": an assistant F3 marker (unconsumed)
 * with no user message after it. The current (not-yet-persisted) request is
 * by definition the direct reply in that state. Non-marker assistant
 * messages (background repair summaries, QA answers persisted before the
 * reply, …) do not consume the pending question — only a user message does,
 * mirroring `collectConfirmedContractAnswers` semantics. This walk is the
 * cheap pre-filter; the authoritative arbiter is the conditional DB write in
 * `consumeF3ContinuationMarker`.
 */
export function resolvePendingF3Continuation(
  messages: Pick<Message, "id" | "role" | "ui_parts">[] | null | undefined,
): PendingF3Continuation | null {
  if (!Array.isArray(messages)) return null;
  let pending: PendingF3Continuation | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      pending = null;
      continue;
    }
    if (message.role !== "assistant") continue;
    const marker = readF3ContinuationMarker(message);
    if (marker) {
      pending = {
        messageId: typeof message.id === "string" && message.id ? message.id : null,
        parentVersionId: marker.parentVersionId,
        suggestedProviders: marker.suggestedProviders,
        toolOnlyRounds: marker.toolOnlyRounds,
      };
    }
  }
  return pending;
}
