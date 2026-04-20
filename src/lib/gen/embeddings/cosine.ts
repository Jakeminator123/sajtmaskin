/**
 * Shared cosine similarity helper.
 *
 * Single source of truth — replaces 4 ad-hoc copies that lived in
 * `scaffolds/scaffold-search.ts`, `dossiers/select.ts`,
 * `scaffold-variants/matcher.ts` and `templates/template-search.ts`.
 *
 * The denominator-zero guard uses `denom === 0` rather than
 * `normA === 0 || normB === 0`. The latter misses the case where both
 * norms are tiny but non-zero and `Math.sqrt(normA) * Math.sqrt(normB)`
 * underflows to 0 — that previously produced `Infinity`/`NaN` in
 * downstream rankings (see scaffold-variant matcher regression notes).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom) || denom === 0) return 0;
  const score = dot / denom;
  return Number.isFinite(score) ? score : 0;
}
