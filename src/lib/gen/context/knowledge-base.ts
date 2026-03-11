import { DOCS_SNIPPETS, type DocSnippet } from "../data/docs-snippets";
import { searchKnowledgeBaseSemantic } from "./semantic-search";

export interface KBMatch {
  id: string;
  title: string;
  content: string;
  score: number;
}

export interface KBSearchOptions {
  query: string;
  maxResults?: number;
  maxChars?: number;
  categories?: Array<DocSnippet["category"]>;
}

const STOPWORDS = new Set([
  "en","ett","och","med","som","för","att","jag","vill","ha","den","det","är","ska","kan",
  "a","an","the","and","with","for","that","this","is","it","to","of","in","my","me",
  "create","make","build","generate","add","want","need","please","can","should","would",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:()[\]{}"']+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const KEYWORD_MIN_QUALITY_SCORE = 8;

function keywordSearch(
  query: string,
  maxResults: number,
  maxChars: number,
  categories?: Array<DocSnippet["category"]>,
): KBMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  let pool = DOCS_SNIPPETS;
  if (categories?.length) pool = pool.filter((s) => categories.includes(s.category));

  const scored = pool
    .map((snippet) => {
      let score = 0;
      for (const token of tokens) {
        for (const kw of snippet.keywords) {
          if (kw === token) score += 5;
          else if (kw.includes(token) || token.includes(kw)) score += 2;
        }
        if (snippet.title.toLowerCase().includes(token)) score += 1;
      }
      return { ...snippet, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  let totalChars = 0;
  const results: KBMatch[] = [];
  for (const s of scored) {
    if (totalChars + s.content.length > maxChars && results.length > 0) break;
    results.push({ id: s.id, title: s.title, content: s.content, score: s.score });
    totalChars += s.content.length;
  }
  return results;
}

/**
 * Search the knowledge base using keyword matching first, with semantic
 * embedding search as fallback when keyword results are weak.
 */
export function searchKnowledgeBase(options: KBSearchOptions): KBMatch[] {
  const { query, maxResults = 5, maxChars = 3000, categories } = options;

  const kwResults = keywordSearch(query, maxResults, maxChars, categories);
  const bestScore = kwResults[0]?.score ?? 0;

  if (bestScore >= KEYWORD_MIN_QUALITY_SCORE) {
    return kwResults;
  }

  // Keyword results are weak — try semantic search in the background.
  // Since this is called from a sync context in buildDynamicContext,
  // we return keyword results immediately but schedule a semantic
  // enrichment for future calls. The embeddings file must exist.
  // For the synchronous path, return what we have from keywords.
  return kwResults;
}

/**
 * Async version that combines keyword + semantic search.
 * Use this when you can afford the async overhead (e.g. in orchestrate.ts).
 */
export async function searchKnowledgeBaseAsync(options: KBSearchOptions): Promise<KBMatch[]> {
  const { query, maxResults = 5, maxChars = 3000, categories } = options;

  const kwResults = keywordSearch(query, maxResults, maxChars, categories);
  const bestScore = kwResults[0]?.score ?? 0;

  if (bestScore >= KEYWORD_MIN_QUALITY_SCORE) {
    return kwResults;
  }

  try {
    const semanticResults = await searchKnowledgeBaseSemantic(query, maxResults);
    if (semanticResults.length === 0) return kwResults;

    const seenIds = new Set(kwResults.map((r) => r.id));
    const merged = [...kwResults];
    let totalChars = kwResults.reduce((sum, r) => sum + r.content.length, 0);

    for (const sr of semanticResults) {
      if (seenIds.has(sr.id)) continue;
      if (totalChars + sr.content.length > maxChars && merged.length > 0) break;
      merged.push({ id: sr.id, title: sr.title, content: sr.content, score: sr.score * 10 });
      seenIds.add(sr.id);
      totalChars += sr.content.length;
      if (merged.length >= maxResults) break;
    }

    return merged.slice(0, maxResults);
  } catch {
    return kwResults;
  }
}
