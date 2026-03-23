/**
 * Policy for sequential pre-generation contract clarifications (own engine).
 *
 * After MAX rounds we stop gating and run a high-capability model with a
 * reduced output-token budget for the full-site generation pass.
 */

import { resolveBuildMaxOutputTokens } from "@/lib/gen/defaults";
import type { CanonicalModelId, OwnModelId } from "@/lib/models/catalog";

/** Max sequential contract Q&A rounds before forcing a build (no more blocking questions). */
export const MAX_CONTRACT_CLARIFICATION_ROUNDS = 7;

function readFractionEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(1, Math.max(0.05, raw));
}

/**
 * Fraction of the user's tier max output tokens used when the clarification cap
 * triggers the "resolve everything" build (default ~half, slightly conservative).
 */
export function getClarificationCapOutputFraction(): number {
  return readFractionEnv("SAJTMASKIN_CLARIFICATION_CAP_OUTPUT_FRACTION", 0.45);
}

/**
 * OpenAI model id for the post-cap full-site generation pass (high capability).
 * Override with `SAJTMASKIN_CLARIFICATION_CAP_MODEL` (e.g. `gpt-5.2`).
 */
export function getClarificationCapOwnModelId(): OwnModelId {
  const raw = process.env.SAJTMASKIN_CLARIFICATION_CAP_MODEL?.trim();
  return (raw || "gpt-5.2") as OwnModelId;
}

/**
 * Output token budget for the cap-triggered build, relative to the user's selected tier.
 */
export function resolveClarificationCapMaxOutputTokens(baseTier: CanonicalModelId): number {
  const base = resolveBuildMaxOutputTokens(baseTier);
  const fraction = getClarificationCapOutputFraction();
  const minFloor = 8_192;
  return Math.max(minFloor, Math.floor(base * fraction));
}

export function shouldOfferContractClarification(
  hasQuestion: boolean,
  confirmedAnswerCount: number,
): boolean {
  return hasQuestion && confirmedAnswerCount < MAX_CONTRACT_CLARIFICATION_ROUNDS;
}

export function shouldUseClarificationCapBuild(confirmedAnswerCount: number): boolean {
  return confirmedAnswerCount >= MAX_CONTRACT_CLARIFICATION_ROUNDS;
}
