import { createHash } from "node:crypto";

export const MAX_REVIEW_ROUNDS = 3;
export const MAX_DEFERRED_IMPACT = 2;

// Scores are reviewer estimates, not measured probabilities or a CI pass rate.
export function validateFinding(finding) {
  if (!finding || !/^F[1-9][0-9]*$/.test(finding.id) ||
      !["P0", "P1", "P2"].includes(finding.priority) ||
      !Number.isInteger(finding.confidencePercent) || finding.confidencePercent < 0 || finding.confidencePercent > 100 ||
      !Number.isInteger(finding.impactScore) || finding.impactScore < 1 || finding.impactScore > 5 ||
      typeof finding.file !== "string" || !finding.file.trim() ||
      !Number.isInteger(finding.line) || finding.line < 1 ||
      typeof finding.description !== "string" || !finding.description.trim()) {
    throw new Error("Invalid Buggpass finding (id, confidence %, impact 1–5, location and explanation required).");
  }
}

export function reviewDigest(review) {
  return createHash("sha256").update(JSON.stringify(review)).digest("hex");
}

export function followUpDigest(previous) {
  return previous ? reviewDigest({ base: previous.base, head: previous.head, rootBase: previous.rootBase,
    review: previous.review, decisions: previous.decisions, previousContext: previous.previousContext ?? null }) : null;
}

export function validateCachedContext(receipt, previous) {
  if (previous && receipt.previousContext !== followUpDigest(previous)) {
    throw new Error("Cached review did not cover these previous findings/decisions; fresh review required, not a green cache hit.");
  }
}

export function validateReviewChain(receipt, readReview, seen = new Set()) {
  const key = `${receipt.base}:${receipt.head}`;
  if (seen.has(key) || seen.size >= MAX_REVIEW_ROUNDS) throw new Error("Invalid/cyclic review chain.");
  seen.add(key);
  if (receipt.previous) {
    const previous = readReview(receipt.previous.base, receipt.previous.head);
    if (previous.round + 1 !== receipt.round || previous.rootBase !== receipt.rootBase) throw new Error("Invalid review round chain.");
    validateReviewChain(previous, readReview, seen);
    validateCachedContext(receipt, previous);
  } else if (receipt.round !== 1) throw new Error("Missing previous review in follow-up chain.");
}

export function canReuseAfterPublication(receipt, publishedAt) {
  if (!publishedAt) return true;
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error("Invalid publication timestamp.");
  return receipt.publishedAt === publishedAt && Date.parse(receipt.reviewedAt) >= Date.parse(publishedAt);
}

export function validateDecision(review, decision) {
  const finding = review.findings.find((item) => item.id === decision?.findingId);
  if (!finding || decision.reviewDigest !== reviewDigest(review) ||
      !["accept", "reject", "defer"].includes(decision.action) ||
      typeof decision.reason !== "string" || decision.reason.trim().length < 20) {
    throw new Error("Decision needs a current finding, exact review digest and a concrete reason/evidence (20+ characters).");
  }
  if (decision.action === "defer" && (finding.priority !== "P2" || finding.impactScore > MAX_DEFERRED_IMPACT ||
      typeof decision.followUp !== "string" || !decision.followUp.trim())) {
    throw new Error("Only low-impact P2 findings may be deferred, with a traceable follow-up.");
  }
}

export function reviewStatus(review, decisions = []) {
  if (review.complete !== true) return "incomplete";
  const byId = new Map();
  for (const decision of decisions) {
    validateDecision(review, decision);
    if (byId.has(decision.findingId)) throw new Error("Duplicate decision for finding.");
    byId.set(decision.findingId, decision);
  }
  if (review.findings.some((finding) => !byId.has(finding.id))) return "needs-triage";
  if ([...byId.values()].some((decision) => decision.action === "accept")) return "needs-fix";
  return [...byId.values()].some((decision) => decision.action === "defer") ? "acceptable-with-follow-up" : "clear";
}

export function nextRound(previous) {
  const round = previous ? previous.round + 1 : 1;
  if (!Number.isInteger(round) || round < 1 || round > MAX_REVIEW_ROUNDS) {
    throw new Error("Three review rounds reached: return remaining findings to the owner; no endless model loop.");
  }
  return round;
}

export function formatReview(receipt) {
  const review = receipt.review;
  const lines = [`Buggpass ${receipt.base.slice(0, 12)}..${receipt.head.slice(0, 12)} · round ${receipt.round}/${MAX_REVIEW_ROUNDS}`,
    `Status: ${reviewStatus(review, receipt.decisions)}. ${review.summary}`];
  for (const finding of review.findings) {
    const decision = receipt.decisions.find((item) => item.findingId === finding.id);
    lines.push(`${finding.id}: ${finding.confidencePercent}% confidence · impact ${finding.impactScore}/5 · ${finding.priority} · ${finding.file}:${finding.line}`,
      `  ${finding.description}${decision ? ` [${decision.action}: ${decision.reason}]` : " [author must triage]"}`);
  }
  return lines.join("\n");
}
