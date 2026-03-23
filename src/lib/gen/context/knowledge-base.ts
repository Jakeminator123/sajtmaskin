import type { DocSnippet } from "../data/docs-snippets";
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

/**
 * Search the knowledge base using semantic embeddings.
 *
 * Synchronous callers get an empty result set (embedding search is async).
 * Use `searchKnowledgeBaseAsync` when an async context is available.
 */
export function searchKnowledgeBase(_options: KBSearchOptions): KBMatch[] {
  return [];
}

/**
 * Async knowledge base search using semantic embedding similarity.
 * Returns an empty list when embeddings or API key are unavailable.
 */
export async function searchKnowledgeBaseAsync(options: KBSearchOptions): Promise<KBMatch[]> {
  const { query, maxResults = 5, maxChars = 3000 } = options;

  try {
    const semanticResults = await searchKnowledgeBaseSemantic(query, maxResults);
    if (semanticResults.length === 0) return [];

    let totalChars = 0;
    const results: KBMatch[] = [];

    for (const sr of semanticResults) {
      if (totalChars + sr.content.length > maxChars && results.length > 0) break;
      results.push({ id: sr.id, title: sr.title, content: sr.content, score: sr.score * 10 });
      totalChars += sr.content.length;
      if (results.length >= maxResults) break;
    }

    return results;
  } catch {
    return [];
  }
}
