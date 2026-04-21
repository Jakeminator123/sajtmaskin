/**
 * Tiny TF-IDF + cosine retriever for the error-log RAG.
 *
 * Why TF-IDF and not embeddings:
 * - Deterministic. Same NDJSON → same index. Easy to test, easy to ship.
 * - Zero network dependency. Works offline, works in CI, works without
 *   OPENAI_API_KEY.
 * - Sub-second over 5k rows on a laptop — plenty for our follow-up bursts.
 *
 * The retriever is wrapped in `error-log-retriever.ts`, which adds the
 * scaffold/lineage filter + system-prompt block rendering.
 */

const TOKEN_RE = /[a-zA-Z][a-zA-Z0-9_-]*/g;
const STOPWORDS = new Set([
  "the", "is", "a", "an", "and", "or", "of", "to", "in", "for", "on", "at",
  "by", "with", "from", "as", "this", "that", "it", "its", "be", "are", "was",
  "were", "but", "not", "if", "then", "so", "than", "into", "via",
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  const matches = text.toLowerCase().match(TOKEN_RE);
  if (!matches) return [];
  const out: string[] = [];
  for (const tok of matches) {
    if (tok.length < 2) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

export interface TfIdfDocument<T> {
  id: string;
  text: string;
  payload: T;
}

export interface TfIdfIndex<T> {
  documents: TfIdfDocument<T>[];
  /** doc -> term -> tf */
  termFreq: Array<Map<string, number>>;
  /** term -> doc-frequency */
  docFreq: Map<string, number>;
  /** doc -> precomputed L2 norm of tf-idf vector */
  vectorNorm: number[];
  /** total documents */
  N: number;
}

export function buildTfIdfIndex<T>(documents: TfIdfDocument<T>[]): TfIdfIndex<T> {
  const N = documents.length;
  const termFreq: Array<Map<string, number>> = [];
  const docFreq = new Map<string, number>();
  for (const doc of documents) {
    const tokens = tokenize(doc.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    termFreq.push(tf);
    for (const term of tf.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  // Precompute per-doc L2 norm of tf-idf vector for cosine.
  const vectorNorm: number[] = new Array(N).fill(0);
  for (let i = 0; i < N; i += 1) {
    let sumSq = 0;
    for (const [term, tf] of termFreq[i]) {
      const idf = Math.log((N + 1) / ((docFreq.get(term) ?? 0) + 1)) + 1;
      const w = tf * idf;
      sumSq += w * w;
    }
    vectorNorm[i] = Math.sqrt(sumSq);
  }
  return { documents, termFreq, docFreq, vectorNorm, N };
}

export interface TfIdfHit<T> {
  document: TfIdfDocument<T>;
  score: number;
}

export function queryTfIdfIndex<T>(
  index: TfIdfIndex<T>,
  query: string,
  topK = 5,
): TfIdfHit<T>[] {
  if (index.N === 0) return [];
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const qTf = new Map<string, number>();
  for (const t of qTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1);
  // Compute query tf-idf vector + norm.
  let qNormSq = 0;
  const qWeighted = new Map<string, number>();
  for (const [term, tf] of qTf) {
    const idf = Math.log((index.N + 1) / ((index.docFreq.get(term) ?? 0) + 1)) + 1;
    const w = tf * idf;
    qWeighted.set(term, w);
    qNormSq += w * w;
  }
  const qNorm = Math.sqrt(qNormSq);
  if (qNorm === 0) return [];
  // Score each doc via dot-product / (qNorm * docNorm).
  const scored: TfIdfHit<T>[] = [];
  for (let i = 0; i < index.N; i += 1) {
    let dot = 0;
    const docTf = index.termFreq[i];
    for (const [term, qw] of qWeighted) {
      const tf = docTf.get(term);
      if (!tf) continue;
      const idf = Math.log((index.N + 1) / ((index.docFreq.get(term) ?? 0) + 1)) + 1;
      dot += qw * tf * idf;
    }
    if (dot === 0) continue;
    const dn = index.vectorNorm[i];
    if (dn === 0) continue;
    const score = dot / (qNorm * dn);
    scored.push({ document: index.documents[i], score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// Re-export tokenize for tests / debug use.
export const __internal = { tokenize };
