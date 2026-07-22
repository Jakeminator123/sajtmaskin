/**
 * Pure, testable sökfilter för TemplatesBrowser.
 *
 * Bryts ut ur `templates-browser.tsx` så matchningen kan enhetstestas utan att
 * rendera komponenten. Matchningen är accent-okänslig: å/ä/ö/é m.fl. normaliseras
 * bort på både sökterm och innehåll, så "cafe" matchar "Café" och "for" matchar
 * "för".
 */

/** Gör en sträng jämförbar: gemener, trimmad och utan diakritiska tecken. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export interface SearchableCategory {
  id: string;
  title: string;
  description: string;
}

export interface SearchableTemplate {
  id: string;
  title: string;
}

export interface CategorySearchResult {
  id: string;
  count: number;
}

/**
 * Filtrerar kategorier mot en söksträng och returnerar matchande kategori-id:n
 * plus antal (alla mallar vid direktträff på kategorin, annars antal mall-träffar).
 * Tom söksträng → alla kategorier med sitt totala antal mallar.
 */
export function filterCategoriesByQuery(
  categories: readonly SearchableCategory[],
  templatesByCategory: Record<string, readonly SearchableTemplate[]>,
  rawQuery: string,
): CategorySearchResult[] {
  const q = normalizeSearch(rawQuery);

  if (!q) {
    return categories.map((category) => ({
      id: category.id,
      count: templatesByCategory[category.id]?.length ?? 0,
    }));
  }

  const results: CategorySearchResult[] = [];
  for (const category of categories) {
    const templates = templatesByCategory[category.id] ?? [];
    const directMatch =
      normalizeSearch(category.title).includes(q) ||
      normalizeSearch(category.description).includes(q);
    const templateMatches = templates.filter((template) =>
      normalizeSearch(template.title).includes(q),
    );
    if (!directMatch && templateMatches.length === 0) continue;
    results.push({
      id: category.id,
      count: directMatch ? templates.length : templateMatches.length,
    });
  }
  return results;
}
