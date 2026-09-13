import { prepareCredits, type PreparedCredits } from "./server";
import {
  acquireUserGenerationLock,
  chatGenerationLockFailureResponse,
  releaseChatGenerationLock,
  type ChatGenerationLock,
} from "@/lib/gen/stream/generation-lock";

/**
 * Preliminary eligibility identifies the authenticated account. The durable
 * account lease then serializes every create/follow-up and eligibility is read
 * AGAIN under that lease, before any provider or prewarm work is started.
 * This is concurrency admission, not an actual-provider-cost reservation.
 */
export async function prepareGenerationCredits(
  req: Request,
  action: "prompt.create" | "prompt.refine",
  context: Parameters<typeof prepareCredits>[2],
  options: Parameters<typeof prepareCredits>[3],
): Promise<
  | (PreparedCredits & { ok: true; generationLock: ChatGenerationLock })
  | (PreparedCredits & { ok: false })
> {
  const preliminary = await prepareCredits(req, action, context, options);
  if (!preliminary.ok) return preliminary;
  if (req.signal.aborted) {
    return { ok: false, cost: preliminary.cost, response: new Response(null, { status: 499 }) };
  }
  const admission = await acquireUserGenerationLock(preliminary.user.id);
  if (admission.status !== "acquired") {
    return {
      ok: false,
      cost: preliminary.cost,
      response: chatGenerationLockFailureResponse(admission.status, { scope: "user" }),
    };
  }
  let admitted = false;
  try {
    const current = await prepareCredits(req, action, context, options);
    if (!current.ok) return current;
    if (req.signal.aborted) {
      return { ok: false, cost: current.cost, response: new Response(null, { status: 499 }) };
    }
    if (current.user.id !== preliminary.user.id) {
      return {
        ok: false,
        cost: current.cost,
        response: chatGenerationLockFailureResponse("unavailable"),
      };
    }
    admitted = true;
    return { ...current, generationLock: admission.lock };
  } finally {
    if (!admitted) await releaseChatGenerationLock(admission.lock);
  }
}
