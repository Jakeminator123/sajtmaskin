#!/usr/bin/env node
/**
 * Preview-grind för PENDING migrationer mot den delade produktionsdatabasen.
 *
 * Varför den finns: Vercel Preview och Production läser SAMMA prod-Postgres
 * (`config/db-targets.json`), men `preview` kan ligga tiotals commits före
 * `master`. När CI applicerar migrationer vid push till `preview` träffar DDL:en
 * den databas som den GAMLA produktionskoden fortfarande läser — Vercel-deploy
 * av master är en separat process.
 *
 * Frånvaro av ett denylist-mönster är INTE bevis för bakåtkompatibilitet.
 * Grinden automatiserar verifierbart säkra fall (t.ex. `ADD COLUMN IF NOT
 * EXISTS`, `CREATE TABLE IF NOT EXISTS`, icke-unika `CREATE INDEX IF NOT
 * EXISTS`) och flaggar osäkra/brytande operationer — policies, triggers,
 * funktioner, constraints, backfills, drop index — så de kräver en särskild
 * granskningsväg i stället för att kontrollen stängs av.
 *
 * Särskild väg (manuell, aldrig satt i CI):
 *   DB_MIGRATION_ALLOW_REVIEWED_BREAKING=1
 * efter ägargranskning, typiskt tillsammans med `npm run db:migrate:prod` eller
 * promote. Pending-mängden kommer från samma `buildMigrationPlan` som köraren.
 *
 * Strikt read-only: SELECT mot `schema_migrations` + `information_schema`.
 * Skannar även `add-performance-indexes.mjs` (utanför SQL-ledgern).
 *
 * Användning:
 *   node scripts/db/check-additive-migrations.mjs
 *   node scripts/db/check-additive-migrations.mjs --json
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Statements som kan bryta kod som körs mot det GAMLA schemat, ändra
 * runtime-beteende (policies/triggers/funktioner) eller tappa/mutera data.
 * Frånvaro från listan ≠ säkert — osäkra fall ska gå via
 * {@link REVIEWED_BREAKING_ENV}, inte genom att stänga av grinden.
 *
 * @type {ReadonlyArray<{ id: string; re: RegExp; why: string }>}
 */
export const BREAKING_STATEMENTS = Object.freeze([
  { id: "drop-table", re: /\bDROP\s+TABLE\b/giu, why: "tabellen försvinner för gammal kod" },
  { id: "drop-column", re: /\bDROP\s+COLUMN\b/giu, why: "kolumnen försvinner för gammal kod" },
  {
    id: "rename",
    re: /\bRENAME\s+(?:COLUMN|CONSTRAINT|TO)\b/giu,
    why: "gammal kod läser det gamla namnet",
  },
  {
    id: "alter-column-type",
    re: /\bALTER\s+(?:COLUMN\s+)?(?:"[^"]*"|[\w.]+)\s+(?:SET\s+DATA\s+)?TYPE\b/giu,
    why: "typbytet kan göra gammal läsning ogiltig",
  },
  {
    id: "set-not-null",
    re: /\bSET\s+NOT\s+NULL\b/giu,
    why: "gammal kod som inte skickar kolumnen får INSERT-fel",
  },
  {
    id: "drop-default",
    re: /\bDROP\s+DEFAULT\b/giu,
    why: "gammal kod som förlitar sig på defaulten får INSERT-fel",
  },
  { id: "truncate", re: /\bTRUNCATE\b/giu, why: "dataförlust" },
  { id: "delete-from", re: /\bDELETE\s+FROM\b/giu, why: "dataförlust" },
  {
    id: "update-dml",
    re: /\bUPDATE\s+(?:ONLY\s+)?(?:"[^"]+"|[\w.]+)\s+SET\b/giu,
    why: "backfill kan ändra rader som gammal kod fortfarande läser",
  },
  {
    id: "drop-policy",
    re: /\bDROP\s+POLICY\b/giu,
    why: "RLS-policyborttagning kan öppna eller stänga access för körande kod",
  },
  {
    id: "drop-trigger",
    re: /\bDROP\s+TRIGGER\b/giu,
    why: "triggerborttagning ändrar skrivbeteende för körande kod",
  },
  {
    id: "create-trigger",
    re: /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\b/giu,
    why: "ny trigger kan ändra INSERT/UPDATE-beteende för gammal kod",
  },
  {
    id: "drop-function",
    re: /\bDROP\s+(?:FUNCTION|PROCEDURE|ROUTINE)\b/giu,
    why: "funktionsborttagning kan bryta triggers/views som gammal kod använder",
  },
  {
    id: "create-or-replace-function",
    re: /\bCREATE\s+OR\s+REPLACE\s+(?:FUNCTION|PROCEDURE|ROUTINE)\b/giu,
    why: "ersatt funktionskropp kan ändra runtime-beteende utan schema-diff",
  },
  {
    id: "drop-constraint",
    re: /\bDROP\s+CONSTRAINT\b/giu,
    why: "constraint-borttagning kan släppa igenom ogiltig data eller bryta antaganden",
  },
  {
    id: "drop-index",
    re: /\bDROP\s+INDEX\b/giu,
    why: "indexborttagning kan bryta UNIQUE-antaganden eller fråga-planer",
  },
  {
    id: "add-constraint",
    re: /\bADD\s+CONSTRAINT\b/giu,
    why: "UNIQUE/CHECK/FK kan göra gammal INSERT ogiltig",
  },
  {
    id: "add-unique",
    re: /\bADD\s+UNIQUE\b/giu,
    why: "unikhet kan göra gammal INSERT ogiltig",
  },
  {
    id: "add-primary-key",
    re: /\bADD\s+PRIMARY\s+KEY\b/giu,
    why: "PRIMARY KEY kan göra gammal INSERT ogiltig",
  },
  {
    id: "add-foreign-key",
    re: /\bADD\s+FOREIGN\s+KEY\b/giu,
    why: "FK kan göra gammal INSERT ogiltig",
  },
  {
    id: "add-column-unique",
    re: /\bADD\s+COLUMN\b[^;]*\bUNIQUE\b/giu,
    why: "kolumn-UNIQUE kan göra gammal INSERT ogiltig",
  },
  {
    id: "create-unique-index",
    re: /\bCREATE\s+UNIQUE\s+INDEX\b/giu,
    why: "unikhet kan göra gammal INSERT ogiltig",
  },
]);

/** Manual override after human review — never set by CI preview apply. */
export const REVIEWED_BREAKING_ENV = "DB_MIGRATION_ALLOW_REVIEWED_BREAKING";

/**
 * Static scan of `add-performance-indexes.mjs` (outside the SQL ledger).
 * Non-unique `CREATE INDEX IF NOT EXISTS` is the safe automated path.
 * Comments are blanked so documentation mentioning CONCURRENTLY does not trip.
 *
 * @param {string} source
 * @returns {Array<{ id: string; why: string; line: number; snippet: string }>}
 */
export function findBreakingPerfIndexStatements(source) {
  const blank = (text) => text.replace(/[^\n]/gu, " ");
  let code = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      code += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      code += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    code += source[i];
    i += 1;
  }

  /** @type {ReadonlyArray<{ id: string; re: RegExp; why: string }>} */
  const patterns = [
    {
      id: "perf-drop-index",
      re: /\bDROP\s+INDEX\b/giu,
      why: "perf-scriptet körs på varje preview/master-push mot prod",
    },
    {
      id: "perf-create-unique-index",
      re: /\bCREATE\s+UNIQUE\s+INDEX\b/giu,
      why: "unikt perf-index kan få gammal INSERT att faila",
    },
    {
      id: "perf-concurrently",
      re: /\bCONCURRENTLY\b/giu,
      why: "CONCURRENTLY kräver särskild körväg (ingen omslutande transaktion)",
    },
  ];
  /** @type {Array<{ id: string; why: string; line: number; snippet: string }>} */
  const findings = [];
  for (const { id, re, why } of patterns) {
    const pattern = new RegExp(re.source, re.flags);
    let match;
    while ((match = pattern.exec(code)) !== null) {
      const line = code.slice(0, match.index).split("\n").length;
      findings.push({
        id,
        why,
        line,
        snippet: source.split("\n")[line - 1]?.trim().slice(0, 160) ?? match[0],
      });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
}

/**
 * @param {boolean} allowed
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isReviewedBreakingAllowed(env = process.env) {
  return env[REVIEWED_BREAKING_ENV]?.trim() === "1";
}

/**
 * Maskerar kommentarer med blanksteg — samma längd, samma radbrytningar — så
 * att träffarnas offset fortfarande pekar på rätt rad i originalfilen.
 *
 * Stränglitteraler och dollar-quotade kroppar hoppas över i stället för att
 * maskeras: ett `--` inuti en sträng startar inget kommentar, och en
 * `DO $$ … $$`-kropp innehåller riktiga statements som MÅSTE granskas (det är
 * precis så `align-live-schema-parity.sql` gör sin `DROP COLUMN`).
 *
 * @param {string} sql
 * @returns {string}
 */
export function maskSqlComments(sql) {
  let out = "";
  let i = 0;
  const blank = (text) => text.replace(/[^\n]/gu, " ");

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }

    if (rest.startsWith("/*")) {
      // Postgres nästlar blockkommentarer, så djupet måste räknas.
      let depth = 0;
      let j = i;
      while (j < sql.length) {
        if (sql.startsWith("/*", j)) {
          depth += 1;
          j += 2;
        } else if (sql.startsWith("*/", j)) {
          depth -= 1;
          j += 2;
          if (depth === 0) break;
        } else {
          j += 1;
        }
      }
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }

    const dollar = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (rest[0] === "'" || rest[0] === '"') {
      const quote = rest[0];
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote) {
          // Fördubblad quote är en escapad quote, inte ett slut.
          if (sql[j + 1] === quote) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      // Stränglitteraler maskeras: `VALUES ('DROP COLUMN skipped')` är text, inte
      // DDL. Citerade IDENTIFIERARE lämnas orörda, eftersom typbytesmönstret
      // behöver kunna läsa `ALTER COLUMN "my col" TYPE …`.
      //
      // Litteraler INUTI en dollar-quotad kropp nås aldrig hit — kroppen
      // kopieras hel — så `EXECUTE 'ALTER TABLE t DROP COLUMN c'` i en
      // DO-block fångas fortfarande. Det är den säkra riktningen.
      out += quote === "'" ? blank(sql.slice(i, j)) : sql.slice(i, j);
      i = j;
      continue;
    }

    out += sql[i];
    i += 1;
  }

  return out;
}

/**
 * Träffar som bara kan skada för att det redan FINNS rader eller körande kod
 * som rör tabellen. Läggs en sådan constraint på en tabell som samma pending-
 * omgång själv skapar, och som ännu inte finns i måldatabasen, kan den per
 * definition inte ogiltigförklara vare sig en befintlig rad eller en INSERT
 * från den gamla produktionskoden — tabellen existerar inte för den koden.
 *
 * `create-unique-index` står MEDVETET utanför: repot kräver att unikhet
 * deklareras som tabellintern constraint, och den regeln ska inte kunna
 * kringgås av att tabellen råkar vara ny.
 *
 * @type {ReadonlySet<string>}
 */
const NEW_TABLE_EXEMPT_IDS = new Set([
  "add-constraint",
  "add-unique",
  "add-primary-key",
  "add-foreign-key",
  "add-column-unique",
]);

/** `CREATE TABLE [IF NOT EXISTS] <namn>` — tabellerna en fil själv skapar. */
const CREATE_TABLE_RE =
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/giu;

/** `ALTER TABLE [IF EXISTS] [ONLY] <namn>` — måltabellen för en efterföljande sats. */
const ALTER_TABLE_RE =
  /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/giu;

/** Samma form, men med schemaprefixet separat för kolumnbevisningen. */
const PROOF_ALTER_TABLE_RE =
  /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(public\.)?"?([a-z_][a-z0-9_]*)"?/giu;

/**
 * Tabellnamnen `sql` skapar med `CREATE TABLE`.
 *
 * @param {string} sql
 * @returns {Set<string>}
 */
export function parseCreatedTables(sql) {
  const masked = maskSqlComments(sql);
  const tables = new Set();
  const pattern = new RegExp(CREATE_TABLE_RE.source, CREATE_TABLE_RE.flags);
  let match;
  while ((match = pattern.exec(masked)) !== null) tables.add(match[1].toLowerCase());
  return tables;
}

/**
 * Måltabellen för satsen som innehåller offset `index`: närmast föregående
 * `ALTER TABLE <namn>`. Är tabellnamnet dynamiskt (`EXECUTE format('ALTER TABLE
 * %I …')`) går det inte att avgöra statiskt, och då returneras null — vilket
 * betyder "ingen dispens", den säkra riktningen.
 *
 * @param {Array<{ index: number; table: string }>} alterTargets
 * @param {number} index
 * @returns {string | null}
 */
function alterTargetAt(alterTargets, index) {
  let found = null;
  for (const target of alterTargets) {
    if (target.index > index) break;
    found = target.table;
  }
  return found;
}

/**
 * Proof-parsningen får bara lita på direkt SQL. Kommentarer, strängar och —
 * när `maskDollarBodies` är sant — hela dollar-quotade kroppar blankas med
 * bibehållen längd. Den vanliga brytandescannern fortsätter däremot att läsa
 * DO-kroppar konservativt via {@link maskSqlComments}.
 *
 * @param {string} sql
 * @param {{ maskDollarBodies: boolean }} options
 */
function maskForProof(sql, { maskDollarBodies }) {
  let out = "";
  let i = 0;
  const blank = (text) => text.replace(/[^\n]/gu, " ");

  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }

    if (sql.startsWith("/*", i)) {
      let depth = 0;
      let j = i;
      while (j < sql.length) {
        if (sql.startsWith("/*", j)) {
          depth += 1;
          j += 2;
        } else if (sql.startsWith("*/", j)) {
          depth -= 1;
          j += 2;
          if (depth === 0) break;
        } else {
          j += 1;
        }
      }
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }

    if (maskDollarBodies) {
      const dollar = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(sql.slice(i));
      if (dollar) {
        const tag = dollar[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        out += blank(sql.slice(i, stop));
        i = stop;
        continue;
      }
    }

    if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    out += sql[i];
    i += 1;
  }

  return out;
}

/**
 * @param {ReadonlyMap<string, Iterable<string>>} input
 * @returns {Map<string, Set<string>>}
 */
function normalizeColumnCatalog(input) {
  return new Map(
    [...input].map(([table, columns]) => [
      table.toLowerCase(),
      new Set([...columns].map((column) => column.toLowerCase())),
    ]),
  );
}

/**
 * @param {Array<{ filename: string; sql: string }>} sources
 * @param {{
 *   existingTables?: Iterable<string>,
 *   existingColumns?: ReadonlyMap<string, Iterable<string>>,
 *   tablesWithWriteTriggers?: Iterable<string>,
 * }} options
 * @returns {Map<number, Set<string>>}
 */
function safeNewColumnFindingKeys(sources, options) {
  const exemptions = new Map();
  if (!options.existingTables || !options.existingColumns || !options.tablesWithWriteTriggers) {
    return exemptions;
  }

  const existingTables = new Set([...options.existingTables].map((table) => table.toLowerCase()));
  const existingColumns = normalizeColumnCatalog(options.existingColumns);
  const triggeredTables = new Set(
    [...options.tablesWithWriteTriggers].map((table) => table.toLowerCase()),
  );

  const executableMasks = sources.map(({ sql }) => maskForProof(sql, { maskDollarBodies: false }));
  // Dynamisk SQL, en trigger eller en skrivning/defaultändring kan fylla de nya
  // kolumnerna utan att den lilla proof-grammatiken kan avgöra utfallet. Hela
  // omgångens kolumndispens stängs då, även när operationen verkar orelaterad.
  if (
    executableMasks.some((sql) =>
      /\b(?:EXECUTE|UPDATE|INSERT|MERGE|COPY)\b|\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b|\bSET\s+(?:DEFAULT|NOT\s+NULL)\b/iu.test(
        sql,
      ),
    )
  ) {
    return exemptions;
  }

  /**
   * @type {Array<{
   *   table: string,
   *   column: string,
   *   sourceIndex: number,
   *   index: number,
   *   exact: boolean,
   * }>}
   */
  const declarations = [];

  sources.forEach(({ sql }, sourceIndex) => {
    const masked = maskForProof(sql, { maskDollarBodies: true });
    const alterTargets = [];
    const alterPattern = new RegExp(PROOF_ALTER_TABLE_RE.source, PROOF_ALTER_TABLE_RE.flags);
    let alterMatch;
    while ((alterMatch = alterPattern.exec(masked)) !== null) {
      alterTargets.push({
        index: alterMatch.index,
        table: alterMatch[2].toLowerCase(),
        publicQualified: Boolean(alterMatch[1]),
      });
    }

    const exactIndexes = new Set();
    const exactPattern =
      /\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([a-z_][a-z0-9_]*)\s+TEXT(?=\s*[,;])/giu;
    let exactMatch;
    while ((exactMatch = exactPattern.exec(masked)) !== null) {
      exactIndexes.add(exactMatch.index);
    }

    const anyPattern =
      /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))/giu;
    let match;
    while ((match = anyPattern.exec(masked)) !== null) {
      const statementStart = masked.lastIndexOf(";", match.index) + 1;
      const target = [...alterTargets]
        .reverse()
        .find((candidate) => candidate.index <= match.index);
      if (!target || target.index < statementStart) continue;
      declarations.push({
        table: target.table,
        column: (match[1] ?? match[2]).toLowerCase(),
        sourceIndex,
        index: match.index,
        exact: target.publicQualified && exactIndexes.has(match.index),
      });
    }
  });

  const declarationCounts = new Map();
  for (const declaration of declarations) {
    const key = `${declaration.table}.${declaration.column}`;
    declarationCounts.set(key, (declarationCounts.get(key) ?? 0) + 1);
  }

  /**
   * @type {Map<string, {
   *   table: string,
   *   column: string,
   *   sourceIndex: number,
   *   index: number,
   * }>}
   */
  const safeDeclarations = new Map();
  for (const declaration of declarations) {
    const key = `${declaration.table}.${declaration.column}`;
    if (!declaration.exact || declarationCounts.get(key) !== 1) continue;
    if (!existingTables.has(declaration.table)) continue;
    if (!existingColumns.has(declaration.table)) continue;
    if (existingColumns.get(declaration.table)?.has(declaration.column)) continue;
    if (triggeredTables.has(declaration.table)) continue;
    safeDeclarations.set(key, declaration);
  }

  const declaredBefore = (table, columns, sourceIndex, index) =>
    columns.every((column) => {
      const declaration = safeDeclarations.get(`${table}.${column}`);
      return (
        declaration &&
        (declaration.sourceIndex < sourceIndex ||
          (declaration.sourceIndex === sourceIndex && declaration.index < index))
      );
    });

  sources.forEach(({ sql }, sourceIndex) => {
    const executable = executableMasks[sourceIndex];
    const allowed = new Set();
    /** @type {Set<string>} */
    const safeCheckTables = new Set();

    const checkPattern =
      /\bALTER\s+TABLE\s+public\.([a-z_][a-z0-9_]*)\s+ADD\s+CONSTRAINT\s+[a-z_][a-z0-9_]*\s+CHECK\s*\(\s*\(\s*([a-z_][a-z0-9_]*)\s+IS\s+NULL\s+AND\s+([a-z_][a-z0-9_]*)\s+IS\s+NULL\s*\)\s+OR\s*\(\s*([a-z_][a-z0-9_]*)\s+IS\s+NOT\s+NULL\s+AND\s+([a-z_][a-z0-9_]*)\s+IS\s+NOT\s+NULL\s+AND\s+([a-z_][a-z0-9_]*)\s+IN\s*\(\s*'(?:''|[^'])*'(?:\s*,\s*'(?:''|[^'])*')*\s*\)\s*\)\s*\)\s*;/giu;
    let checkMatch;
    while ((checkMatch = checkPattern.exec(sql)) !== null) {
      const table = checkMatch[1].toLowerCase();
      const nullKey = checkMatch[2].toLowerCase();
      const nullValue = checkMatch[3].toLowerCase();
      const presentKey = checkMatch[4].toLowerCase();
      const presentValue = checkMatch[5].toLowerCase();
      const phaseValue = checkMatch[6].toLowerCase();
      const addOffset = checkMatch.index + checkMatch[0].search(/\bADD\s+CONSTRAINT\b/iu);
      if (!/^ADD\s+CONSTRAINT\b/iu.test(executable.slice(addOffset))) continue;
      if (
        nullKey !== presentKey ||
        nullValue !== presentValue ||
        nullValue !== phaseValue ||
        nullKey === nullValue
      ) {
        continue;
      }
      if (!declaredBefore(table, [nullKey, nullValue], sourceIndex, checkMatch.index)) continue;
      allowed.add(`add-constraint:${addOffset}`);
      safeCheckTables.add(table);
    }

    // Same proven expand path may DROP CONSTRAINT before re-adding the CHECK.
    // Only exempt when the matching ADD CONSTRAINT was catalog-proven above.
    for (const table of safeCheckTables) {
      const dropPattern = new RegExp(
        String.raw`\bALTER\s+TABLE\s+public\.${table}\s+DROP\s+CONSTRAINT\b`,
        "giu",
      );
      let dropMatch;
      while ((dropMatch = dropPattern.exec(sql)) !== null) {
        const dropOffset = dropMatch.index + dropMatch[0].search(/\bDROP\s+CONSTRAINT\b/iu);
        if (!/^DROP\s+CONSTRAINT\b/iu.test(executable.slice(dropOffset))) continue;
        allowed.add(`drop-constraint:${dropOffset}`);
      }
    }

    const uniquePattern =
      /\bCREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+[a-z_][a-z0-9_]*\s+ON\s+public\.([a-z_][a-z0-9_]*)\s*\(\s*([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)\s*\)\s+WHERE\s+([a-z_][a-z0-9_]*)\s+IS\s+NOT\s+NULL\s*;/giu;
    let uniqueMatch;
    while ((uniqueMatch = uniquePattern.exec(sql)) !== null) {
      if (!/^CREATE\s+UNIQUE\s+INDEX\b/iu.test(executable.slice(uniqueMatch.index))) continue;
      const table = uniqueMatch[1].toLowerCase();
      const columns = uniqueMatch[2].split(",").map((column) => column.trim().toLowerCase());
      const predicateColumn = uniqueMatch[3].toLowerCase();
      if (new Set(columns).size !== columns.length || !columns.includes(predicateColumn)) continue;
      if (!declaredBefore(table, columns, sourceIndex, uniqueMatch.index)) continue;
      allowed.add(`create-unique-index:${uniqueMatch.index}`);
    }

    exemptions.set(sourceIndex, allowed);
  });

  return exemptions;
}

/**
 * @param {string} sql
 * @param {{ exemptTables?: Iterable<string>, safeFindingKeys?: Iterable<string> }} [options]
 *   `exemptTables` är tabeller som samma pending-omgång skapar och som saknas i
 *   måldatabasen. `safeFindingKeys` kommer bara från den katalogstödda
 *   kolumnbevisningen ovan; callers ska inte skapa dem själva.
 * @returns {Array<{ id: string; why: string; line: number; snippet: string }>}
 */
export function findBreakingStatements(sql, options = {}) {
  const masked = maskSqlComments(sql);
  const exempt = new Set([...(options.exemptTables ?? [])].map((table) => table.toLowerCase()));
  const safeFindingKeys = new Set(options.safeFindingKeys ?? []);

  /** @type {Array<{ index: number; table: string }>} */
  const alterTargets = [];
  if (exempt.size > 0) {
    const pattern = new RegExp(ALTER_TABLE_RE.source, ALTER_TABLE_RE.flags);
    let match;
    while ((match = pattern.exec(masked)) !== null) {
      alterTargets.push({ index: match.index, table: match[1].toLowerCase() });
    }
  }

  /** @type {Array<{ id: string; why: string; line: number; snippet: string }>} */
  const findings = [];

  for (const { id, re, why } of BREAKING_STATEMENTS) {
    const pattern = new RegExp(re.source, re.flags);
    let match;
    while ((match = pattern.exec(masked)) !== null) {
      const exemptHere =
        exempt.size > 0 &&
        NEW_TABLE_EXEMPT_IDS.has(id) &&
        exempt.has(alterTargetAt(alterTargets, match.index) ?? "");
      const safeNewColumnConstraint = safeFindingKeys.has(`${id}:${match.index}`);
      if (!exemptHere && !safeNewColumnConstraint) {
        const line = masked.slice(0, match.index).split("\n").length;
        findings.push({
          id,
          why,
          line,
          snippet: sql.split("\n")[line - 1]?.trim().slice(0, 160) ?? match[0],
        });
      }
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
}

/**
 * Ren klassificering av en lista pending filer. Läser filer från disk men rör
 * ingen databas, så den är direkt testbar.
 *
 * `existingTables` är måldatabasens nuvarande tabeller. En tabell som den
 * pending-omgången själv skapar och som INTE finns där kan inte ha vare sig
 * rader eller läsare i den gamla produktionskoden, så constraints mot den är
 * additiva. Utelämnas listan ges ingen dispens alls — utan kunskap om
 * databasen är det enda ärliga svaret det strängaste.
 *
 * @param {string[]} pending
 * @param {{
 *   migrationsDir?: string,
 *   readFile?: (path: string) => string,
 *   existingTables?: Iterable<string>,
 *   existingColumns?: ReadonlyMap<string, Iterable<string>>,
 *   tablesWithWriteTriggers?: Iterable<string>,
 * }} [options]
 */
export function classifyPendingMigrations(pending, options = {}) {
  const migrationsDir = options.migrationsDir ?? join("src", "lib", "db", "migrations");
  const read = options.readFile ?? ((path) => readFileSync(path, "utf8"));

  const sources = pending.map((filename) => ({
    filename,
    sql: read(join(migrationsDir, filename)),
  }));

  /** @type {Set<string> | null} */
  let exemptTables = null;
  if (options.existingTables) {
    const existing = new Set([...options.existingTables].map((table) => table.toLowerCase()));
    exemptTables = new Set();
    for (const { sql } of sources) {
      for (const table of parseCreatedTables(sql)) {
        if (!existing.has(table)) exemptTables.add(table);
      }
    }
  }

  const safeFindingKeys = safeNewColumnFindingKeys(sources, options);

  return sources.map(({ filename, sql }, sourceIndex) => ({
    filename,
    findings: findBreakingStatements(sql, {
      ...(exemptTables ? { exemptTables } : {}),
      safeFindingKeys: safeFindingKeys.get(sourceIndex),
    }),
  }));
}

/**
 * Måldatabasens nuvarande publika tabeller, kolumner och skrivtriggers.
 * Kolumn- och triggermetadata krävs för den smala dispensen för nya nullable
 * TEXT-kolumner; saknad metadata ger ingen dispens.
 *
 * @param {{ query: (text: string) => Promise<{ rows: Array<Record<string, string>> }> }} pool
 */
async function readExistingSchema(pool) {
  const [tablesResult, columnsResult, triggersResult] = await Promise.all([
    pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"),
    pool.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
    ),
    pool.query(
      `SELECT DISTINCT event_object_table AS table_name
         FROM information_schema.triggers
        WHERE event_object_schema = 'public'
          AND event_manipulation IN ('INSERT', 'UPDATE')`,
    ),
  ]);
  const existingTables = new Set(tablesResult.rows.map((row) => row.table_name.toLowerCase()));
  const existingColumns = new Map([...existingTables].map((table) => [table, new Set()]));
  for (const row of columnsResult.rows) {
    existingColumns.get(row.table_name.toLowerCase())?.add(row.column_name.toLowerCase());
  }
  const tablesWithWriteTriggers = new Set(
    triggersResult.rows.map((row) => row.table_name.toLowerCase()),
  );
  return { existingTables, existingColumns, tablesWithWriteTriggers };
}

async function main() {
  const asJson = process.argv.slice(2).includes("--json");
  const label = "[db:additive-check]";

  const [
    { Pool },
    { config },
    { readAppliedMigrations },
    { buildMigrationPlan, loadMigrationFiles, planFilenamesToApply, assertPlanExecutable },
    { normalizeEnvUrl },
    { resolveSslConfig, connectionStringForPg },
  ] = await Promise.all([
    import("pg"),
    import("dotenv"),
    import("./migration-ledger.mjs"),
    import("./migration-plan.mjs"),
    import("./db-target-guard.mjs"),
    import("./db-ssl.mjs"),
  ]);

  config({ path: ".env.local" });

  const connectionString = ["POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL"].reduce(
    (found, key) => found || normalizeEnvUrl(process.env[key]),
    undefined,
  );

  if (!connectionString) {
    console.warn(`${label} Ingen databasanslutning konfigurerad — SKIP (exit 0).`);
    return 0;
  }

  const host = (() => {
    try {
      return new URL(connectionString).host;
    } catch {
      return "unknown";
    }
  })();

  const pool = new Pool({
    connectionString: connectionStringForPg(connectionString),
    ssl: resolveSslConfig(connectionString),
    max: 2,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const migrationsDir = join("src", "lib", "db", "migrations");
    const files = await loadMigrationFiles(migrationsDir);
    const applied = await readAppliedMigrations(pool);
    const plan = buildMigrationPlan({ applied, files });
    assertPlanExecutable(plan);
    const pending = planFilenamesToApply(plan);
    const classified = classifyPendingMigrations(pending, await readExistingSchema(pool));
    const breaking = classified.filter((entry) => entry.findings.length > 0);

    const perfSource = readFileSync(join("scripts", "db", "add-performance-indexes.mjs"), "utf8");
    const perfFindings = findBreakingPerfIndexStatements(perfSource);

    const reviewedAllowed = isReviewedBreakingAllowed();
    const blocked = breaking.length > 0 || perfFindings.length > 0;

    if (asJson) {
      console.log(
        JSON.stringify(
          {
            ok: !blocked || reviewedAllowed,
            host,
            pending,
            breaking,
            perfFindings,
            reviewedBreakingAllowed: reviewedAllowed,
          },
          null,
          2,
        ),
      );
    } else if (pending.length === 0 && perfFindings.length === 0) {
      console.log(`${label} ${host}: inga pending migrationer — inget att granska.`);
    } else if (!blocked) {
      console.log(
        `${label} ✓ ${host}: ${pending.length} pending migration(er), alla inom den automatiska säkra vägen:\n` +
          pending.map((f) => `   - ${f}`).join("\n"),
      );
    } else if (reviewedAllowed) {
      console.warn(
        `${label} ⚠ ${host}: osäkra/brytande fynd finns, men ${REVIEWED_BREAKING_ENV}=1 är satt ` +
          `(manuell granskningsväg). CI sätter aldrig denna flagga.`,
      );
      for (const { filename, findings } of breaking) {
        console.warn(`\n   ${filename}`);
        for (const f of findings) {
          console.warn(`     rad ${f.line}: ${f.id} — ${f.why}`);
        }
      }
      for (const f of perfFindings) {
        console.warn(`   add-performance-indexes.mjs:${f.line}: ${f.id} — ${f.why}`);
      }
    } else {
      console.error(
        `${label} ✗ ${host}: pending/perf-ändringar är INTE verifierbart säkra mot den delade ` +
          `prod-databasen medan master/Vercel fortfarande kan köra gammal kod:`,
      );
      for (const { filename, findings } of breaking) {
        console.error(`\n   ${filename}`);
        for (const f of findings) {
          console.error(`     rad ${f.line}: ${f.id} — ${f.why}`);
          console.error(`       ${f.snippet}`);
        }
      }
      for (const f of perfFindings) {
        console.error(`\n   add-performance-indexes.mjs:${f.line}: ${f.id} — ${f.why}`);
        console.error(`       ${f.snippet}`);
      }
      console.error(
        `\nFrånvaro av ett denylist-mönster är inte bevis för bakåtkompatibilitet. ` +
          `Osäkra operationer behöver en särskild granskningsväg — stäng inte av grinden.`,
      );
      console.error(
        `\nMedveten väg:\n` +
          `   1. promota till master (npm run promote) när kod och schema ska landa tillsammans, eller\n` +
          `   2. npm run db:migrate:prod lokalt med ${REVIEWED_BREAKING_ENV}=1 efter ägargranskning ` +
          `(förstår att preview redan kan ha applicerat annan SQL mot samma DB),\n` +
          `   3. eller skriv om till verifierbart säkra former (expand nu, contract efter promote).\n` +
          `Se docs/runbooks/db-migrations.md.`,
      );
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(
      `${label} Kontrollen kunde inte slutföras:`,
      error instanceof Error ? error.message : String(error),
    );
    return 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
