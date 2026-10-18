/**
 * Pure index bookkeeping for `db-health-check.mjs`, split out so the
 * missing/present/covering decision can be unit-tested without a database.
 */

/**
 * Parses a `pg_indexes.indexdef`, e.g.
 *   CREATE INDEX foo ON public.bar USING btree (col1, col2 DESC)
 *   CREATE UNIQUE INDEX foo ON public.bar USING btree (col1) WHERE (status = 'running')
 */
export function parseIndexDefinition(indexdef) {
  const def = String(indexdef);
  const m = def.match(/\(([^)]+)\)/);
  if (!m) return null;
  const cols = m[1]
    .split(",")
    .map((c) =>
      c
        .trim()
        .replace(/\s+(DESC|ASC)\s*$/i, "")
        .replace(/\s+NULLS\s+(FIRST|LAST)\s*$/i, "")
        .replace(/^"(.+)"$/, "$1"),
    )
    .filter(Boolean);
  const unique = /CREATE\s+UNIQUE\s+INDEX/i.test(def);
  // A partial index has a trailing WHERE predicate (after the column list).
  const partial = /\)\s+WHERE\s+/i.test(def);
  return { cols, unique, partial };
}

/**
 * An expected index counts as present when (a) its name exists, or (b) another
 * index covers EXACTLY the same columns in the same order and shares its
 * UNIQUE/partial properties (covering). Returns `{ missing, aliasedFor }`.
 */
export function findMissingIndexes(expected, indexNames, indexMeta) {
  const present = new Set(indexNames);
  const missing = [];
  const aliasedFor = {};
  for (const e of expected) {
    if (present.has(e.name)) continue;
    let coveredBy = null;
    if (e.columns) {
      for (const [iname, meta] of indexMeta.entries()) {
        const icols = meta.cols;
        if (
          icols.length === e.columns.length &&
          icols.every((c, idx) => c === e.columns[idx]) &&
          // A cover for a UNIQUE/partial expected index must share those
          // properties — otherwise a plain index would mask a missing partial
          // unique lock index (Codex P2).
          (!e.unique || meta.unique) &&
          (!e.partial || meta.partial)
        ) {
          coveredBy = iname;
          break;
        }
      }
    }
    if (coveredBy) {
      aliasedFor[e.name] = coveredBy;
    } else {
      missing.push(e.name);
    }
  }
  return { missing, aliasedFor };
}
