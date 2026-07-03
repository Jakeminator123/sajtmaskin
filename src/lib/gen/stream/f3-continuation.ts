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
 * The marker is self-clearing: any later persisted user message consumes it
 * (the walk only reports a pending continuation when NO user message follows
 * the marker), so exactly the direct reply to the F3 question inherits the
 * stage — a later design follow-up never does.
 */
import type { Message } from "@/lib/db/chat-repository-pg";

/** `output.kind` discriminator for the persisted awaiting-input ui-part. */
export const F3_CONTINUATION_KIND = "f3-continuation";

export interface PendingF3Continuation {
  /** Parent F2 version id from the original F3 kick (lineage), if known. */
  parentVersionId: string | null;
}

/**
 * Assistant-message ui-part persisted when an F3 stream ends tool-only in
 * awaiting-input. Shape follows `persistFollowUpClarification` so the builder
 * UI re-renders the question (with synthetic approval quick-replies) after a
 * refresh. `output.f3Continuation: true` is the machine-readable marker the
 * follow-up route derives the lifecycle stage from — deliberately NOT
 * `contractClarification`, so `collectConfirmedContractAnswers` ignores it.
 */
export function buildF3AwaitingInputUiPart(params: {
  question: string;
  parentVersionId: string | null;
}): Record<string, unknown> {
  return {
    type: "tool:awaiting-input",
    toolName: "Integrationsbygge väntar på svar",
    state: "approval-requested",
    output: {
      question: params.question,
      kind: F3_CONTINUATION_KIND,
      f3Continuation: true,
      lifecycleStage: "integrations",
      parentVersionId: params.parentVersionId,
      blocking: true,
      awaitingInput: true,
    },
  };
}

function readF3ContinuationMarker(
  message: Pick<Message, "ui_parts">,
): PendingF3Continuation | null {
  const parts = Array.isArray(message.ui_parts) ? message.ui_parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if ((part as { type?: unknown }).type !== "tool:awaiting-input") continue;
    const output = (part as { output?: unknown }).output;
    if (!output || typeof output !== "object") continue;
    const outputRecord = output as Record<string, unknown>;
    if (outputRecord.f3Continuation !== true) continue;
    const parentVersionId =
      typeof outputRecord.parentVersionId === "string" &&
      outputRecord.parentVersionId.trim()
        ? outputRecord.parentVersionId.trim()
        : null;
    return { parentVersionId };
  }
  return null;
}

/**
 * Walks persisted chat history (oldest→newest, the order `getChat` returns)
 * and reports a pending F3 continuation only when the most recent state is
 * "F3 asked, user has not answered yet": an assistant F3 marker with no user
 * message after it. The current (not-yet-persisted) request is by definition
 * the direct reply in that state. Non-marker assistant messages (background
 * repair summaries, QA answers persisted before the reply, …) do not consume
 * the pending question — only a user message does, mirroring
 * `collectConfirmedContractAnswers` semantics.
 */
export function resolvePendingF3Continuation(
  messages: Pick<Message, "role" | "ui_parts">[] | null | undefined,
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
    if (marker) pending = marker;
  }
  return pending;
}
