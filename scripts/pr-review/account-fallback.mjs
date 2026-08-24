export const ACCOUNT_FALLBACK_REQUEST_PREFIX = "sajtmaskin-pr-review-fallback:v2";
export const ACCOUNT_REVIEW_PREFIX = "sajtmaskin-codex-account-review:v2";
export const ACCOUNT_REVIEW_RECEIPT_PREFIX = "sajtmaskin-codex-account-review-receipt:v2";

const SHA_RE = /^[0-9a-f]{40}$/i;

function markerPattern(prefix, fields) {
  return new RegExp(
    `<!--\\s*${prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s+${fields}\\s*-->`,
    "i",
  );
}

const REQUEST_RE = markerPattern(
  ACCOUNT_FALLBACK_REQUEST_PREFIX,
  "head=([0-9a-f]{40})\\s+reason=([a-z0-9_-]+)",
);
const REVIEW_RE = markerPattern(
  ACCOUNT_REVIEW_PREFIX,
  "head=([0-9a-f]{40})\\s+scope=full-current-diff",
);
const RECEIPT_RE = markerPattern(
  ACCOUNT_REVIEW_RECEIPT_PREFIX,
  "head=([0-9a-f]{40})\\s+review=([1-9][0-9]*)",
);

export function renderAccountFallbackRequest({ headSha, reason }) {
  if (!SHA_RE.test(String(headSha ?? ""))) throw new Error("Fallback requires a valid head SHA");
  if (!/^[a-z0-9_-]+$/.test(String(reason ?? ""))) {
    throw new Error("Fallback requires a machine-readable reason");
  }
  return [
    `<!-- ${ACCOUNT_FALLBACK_REQUEST_PREFIX} head=${headSha} reason=${reason} -->`,
    "## PR-review överlämnad till Codex-kontot",
    "",
    "OpenAI Platform-reviewn kunde inte köras på grund av saknad API-nyckel eller otillgänglig faktureringskvot.",
    "En separat kontobaserad Codex-granskning måste nu läsa hela diffen och publicera ett SHA-bundet reviewkvitto.",
  ].join("\n");
}

export function renderAccountReviewMarker(headSha) {
  if (!SHA_RE.test(String(headSha ?? ""))) throw new Error("Review requires a valid head SHA");
  return `<!-- ${ACCOUNT_REVIEW_PREFIX} head=${headSha} scope=full-current-diff -->`;
}

export function renderAccountReviewReceiptMarker({ headSha, reviewId }) {
  if (!SHA_RE.test(String(headSha ?? ""))) throw new Error("Receipt requires a valid head SHA");
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
    throw new Error("Receipt requires a positive review ID");
  }
  return `<!-- ${ACCOUNT_REVIEW_RECEIPT_PREFIX} head=${headSha} review=${reviewId} -->`;
}

export function parseAccountFallbackRequest(body) {
  const match = REQUEST_RE.exec(String(body ?? ""));
  return match ? { headSha: match[1].toLowerCase(), reason: match[2].toLowerCase() } : null;
}

export function parseAccountReviewMarker(body) {
  const match = REVIEW_RE.exec(String(body ?? ""));
  return match ? { headSha: match[1].toLowerCase(), scope: "full-current-diff" } : null;
}

export function parseAccountReviewReceiptMarker(body) {
  const match = RECEIPT_RE.exec(String(body ?? ""));
  if (!match) return null;
  const reviewId = Number(match[2]);
  return Number.isSafeInteger(reviewId) && reviewId > 0
    ? { headSha: match[1].toLowerCase(), reviewId }
    : null;
}
