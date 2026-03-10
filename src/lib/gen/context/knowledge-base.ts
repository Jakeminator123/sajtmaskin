import { DOCS_SNIPPETS, type DocSnippet } from "../data/docs-snippets";

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

export function searchKnowledgeBase(options: KBSearchOptions): KBMatch[] {
  const { query, maxResults = 5, maxChars = 3000, categories } = options;
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
