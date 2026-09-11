#!/usr/bin/env node
/**
 * Additiv-bara-grind för PENDING migrationer mot en delad produktionsdatabas.
 *
 * Varför den finns: Vercel Preview och Production läser SAMMA prod-Postgres
 * (`config/db-targets.json`), men `preview` kan ligga tiotals commits före
 * `master`. När CI applicerar migrationer vid push till `preview` träffar DDL:en
 * därför den databas som den GAMLA produktionskoden fortfarande läser. En
 * additiv migration (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`)
 * är ofarlig där — gammal kod rör inte det nya. En brytande migration är det
 * inte: tar man bort, byter typ på eller byter namn på något som produktionen
 * läser, går produktionen sönder innan någon har promoverat.
 *
 * Grinden tillåter alltså den automatiska vägen för det vanliga fallet och
 * kräver ett medvetet beslut för resten: promote till `master`, eller
 * `npm run db:migrate:prod` med ägaren närvarande.
 *
 * Bara PENDING migrationer granskas. Repot innehåller redan brytande DDL som
 * för länge sedan är applicerad (t.ex. `align-live-schema-parity.sql`); den
 * ligger i ledgern och ska inte rödfärga varje ny push.
 *
 * Strikt read-only: enda databasanropet är en SELECT mot `schema_migrations`.
 *
 * Användning:
 *   node scripts/db/check-additive-migrations.mjs
 *   node scripts/db/check-additive-migrations.mjs --json
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Statements som kan bryta kod som körs mot det GAMLA schemat, eller som
 * tappar data. Medvetet kort: varje rad ska gå att motivera med "den gamla
 * produktionskoden slutar fungera" eller "rader försvinner".
 *
 * Uttryckligen UTANFÖR listan, eftersom drop-och-återskapa är själva idiomet
 * och en falsk träff skulle göra grinden till något man stänger av:
 * `DROP POLICY`, `DROP TRIGGER`, `DROP FUNCTION`, `DROP INDEX`,
 * `DROP CONSTRAINT` och backfill-`UPDATE`.
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
]);

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

    const dollar = /^\$[A-Za-z_]*\$/u.exec(rest);
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
 * @param {string} sql
 * @returns {Array<{ id: string; why: string; line: number; snippet: string }>}
 */
export function findBreakingStatements(sql) {
  const masked = maskSqlComments(sql);
  /** @type {Array<{ id: string; why: string; line: number; snippet: string }>} */
  const findings = [];

  for (const { id, re, why } of BREAKING_STATEMENTS) {
    const pattern = new RegExp(re.source, re.flags);
    let match;
    while ((match = pattern.exec(masked)) !== null) {
      const line = masked.slice(0, match.index).split("\n").length;
      findings.push({
        id,
        why,
        line,
        snippet: sql.split("\n")[line - 1]?.trim().slice(0, 160) ?? match[0],
      });
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
}

/**
 * Ren klassificering av en lista pending filer. Läser filer från disk men rör
 * ingen databas, så den är direkt testbar.
 *
 * @param {string[]} pending
 * @param {{ migrationsDir?: string, readFile?: (path: string) => string }} [options]
 */
export function classifyPendingMigrations(pending, options = {}) {
  const migrationsDir = options.migrationsDir ?? join("src", "lib", "db", "migrations");
  const read = options.readFile ?? ((path) => readFileSync(path, "utf8"));

  return pending.map((filename) => ({
    filename,
    findings: findBreakingStatements(read(join(migrationsDir, filename))),
  }));
}

async function main() {
  const asJson = process.argv.slice(2).includes("--json");
  const label = "[db:additive-check]";

  const [
    { Pool },
    { config },
    { readAppliedMigrations, diffPendingMigrations },
    { normalizeEnvUrl },
    { resolveSslConfig, connectionStringForPg },
  ] = await Promise.all([
    import("pg"),
    import("dotenv"),
    import("./migration-ledger.mjs"),
    import("./db-target-guard.mjs"),
    import("./db-ssl.mjs"),
  ]);

  // Samma källa som de andra DB-skripten, så en lokal körning verkligen
  // granskar dev i stället för att tyst SKIP:a. I CI finns ingen `.env.local`
  // och anslutningen kommer från injicerad POSTGRES_URL — no-op där.
  config({ path: ".env.local" });

  const connectionString = [
    "POSTGRES_URL",
    "POSTGRES_URL_NON_POOLING",
    "DATABASE_URL",
  ].reduce((found, key) => found || normalizeEnvUrl(process.env[key]), undefined);

  if (!connectionString) {
    // Fork / no-secret CI: samma meningsfulla SKIP som check-migrations-applied.
    // Utan creds finns ingen ledger att diffa mot, och grinden får inte bli
    // falskt röd där. Apply-steget är redan skippat i det läget.
    console.warn(`${label} Ingen databasanslutning konfigurerad — SKIP (exit 0).`);
    return 0;
  }

  // Sanitiserad identitet i varje utskrift: utfallet gäller EN databas, och
  // ett svar utan värdnamn går att läsa som om det gällde en annan.
  const host = (() => {
    try {
      return new URL(connectionString).host;
    } catch {
      return "unknown";
    }
  })();

  // Policy from the original URL; stripped string to pg. Leaving sslmode=
  // require in the URL makes current pg treat it as verify-full and ignore
  // DB_SSL_REJECT_UNAUTHORIZED=false — that is what reddened the first
  // preview-push after #1340.
  const pool = new Pool({
    connectionString: connectionStringForPg(connectionString),
    ssl: resolveSslConfig(connectionString),
    max: 2,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const pending = diffPendingMigrations(await readAppliedMigrations(pool));
    const classified = classifyPendingMigrations(pending);
    const breaking = classified.filter((entry) => entry.findings.length > 0);

    if (asJson) {
      console.log(JSON.stringify({ ok: breaking.length === 0, host, pending, breaking }, null, 2));
    } else if (pending.length === 0) {
      console.log(`${label} ${host}: inga pending migrationer — inget att granska.`);
    } else if (breaking.length === 0) {
      console.log(
        `${label} ✓ ${host}: ${pending.length} pending migration(er), alla additiva:\n` +
          pending.map((f) => `   - ${f}`).join("\n"),
      );
    } else {
      console.error(
        `${label} ✗ ${host}: ${breaking.length} pending migration(er) är INTE additiva och kan ` +
          `bryta produktionen, som fortfarande kör den gamla koden mot samma databas:`,
      );
      for (const { filename, findings } of breaking) {
        console.error(`\n   ${filename}`);
        for (const f of findings) {
          console.error(`     rad ${f.line}: ${f.id} — ${f.why}`);
          console.error(`       ${f.snippet}`);
        }
      }
      console.error(
        `\nDen automatiska preview-vägen applicerar bara additiv DDL. Kör den här ` +
          `migrationen medvetet i stället:\n` +
          `   1. promota till master (npm run promote) så kod och schema byter samtidigt, eller\n` +
          `   2. npm run db:migrate:prod lokalt, med vetskapen att produktionen bryts ` +
          `tills promoten är ute.\n` +
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
