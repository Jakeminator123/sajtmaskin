/**
 * Bevarandespärr för abonnemangsbokföringen (D1-tabellerna).
 *
 * D3 säger att ingen abonnemangsdata raderas automatiskt. Databasen håller den
 * linjen med `ON DELETE RESTRICT` på `site_subscriptions.project_id` och på
 * användarlänkarna, men en RESTRICT ensam ger ett fult utfall i adminpanelen:
 * rensningarna där raderar flera tabeller i tur och ordning, så felet kommer
 * först när halva miljön redan är borta. Den här modulen låter anroparen ställa
 * frågan FÖRE den första DELETE:n och avbryta hela åtgärden i stället.
 *
 * Modulen är MEDVETET den enda platsen under `src/` som nämner de fyra
 * tabellerna vid namn. D1 är schemaetapp: checkout, webhook, portallänk och
 * avstämning ägs av D2. `site-subscriptions-migration.test.ts` håller den
 * gränsen och tillåter bara den här filen — och bara som LÄSARE. Lägg aldrig
 * till en INSERT, UPDATE eller DELETE här.
 */
import { sql, type SQL } from "drizzle-orm";

import { db } from "./client";

/** Postgres `undefined_table`. En databas utan tabellerna har ingen bokföring att skydda. */
const UNDEFINED_TABLE = "42P01";

export type BillingRetentionCounts = {
  subscriptions: number;
  grants: number;
  jobs: number;
};

/**
 * Vilka rader en åtgärd är på väg att radera.
 *
 * - `allProjects` — hela projektstädningen (`reset-all`, `clear projects`).
 *   Varje abonnemang bär ett `project_id`, så alla abonnemang berörs.
 * - `projectIds` — en avgränsad uppsättning projekt.
 * - `usersExcept` — varje användare UTOM de skyddade e-postadresserna.
 */
export type BillingRetentionScope =
  | { kind: "allProjects" }
  | { kind: "projectIds"; projectIds: string[] }
  | { kind: "usersExcept"; keepEmails: string[] };

const EMPTY: BillingRetentionCounts = { subscriptions: 0, grants: 0, jobs: 0 };

export function hasProtectedBillingRows(counts: BillingRetentionCounts): boolean {
  return counts.subscriptions + counts.grants + counts.jobs > 0;
}

/** Fel som betyder "ingenting raderades" — anroparen har inte hunnit skriva något. */
export class BillingRetentionError extends Error {
  readonly counts: BillingRetentionCounts;

  constructor(action: string, counts: BillingRetentionCounts) {
    super(billingRetentionMessage(action, counts));
    this.name = "BillingRetentionError";
    this.counts = counts;
  }
}

export function billingRetentionMessage(
  action: string,
  counts: BillingRetentionCounts,
): string {
  return (
    `${action} avbröts innan något raderades: ${counts.subscriptions} abonnemang, ` +
    `${counts.grants} kreditgrant(er) och ${counts.jobs} betalningsjobb hör till raderna ` +
    `som skulle tas bort. Abonnemangsbokföringen raderas aldrig automatiskt — avsluta ` +
    `abonnemangen först, eller välj en rensning som inte rör dem.`
  );
}

/**
 * Hela listan som EN parameter: `ANY($1::text[])`.
 *
 * Drizzle expanderar ett interpolerat JS-fält till en parameter per post, så
 * `ANY(${list}::text[])` blir `ANY(($1, $2)::text[])` — en record-konstruktor
 * som Postgres vägrar casta till `text[]` (42846), och med en enda post
 * `ANY(($1)::text[])`, alltså en ogiltig arrayliteral (22P02). Båda fallen
 * gjorde att spärren kastade i stället för att svara, och en icke-tom lista
 * kunde därför aldrig granskas.
 */
function textArray(values: string[]): SQL {
  return sql`${sql.param(values)}::text[]`;
}

function scopePredicate(scope: BillingRetentionScope): SQL {
  switch (scope.kind) {
    case "allProjects":
      return sql`true`;
    case "projectIds":
      return sql`s.project_id = ANY(${textArray(scope.projectIds)})`;
    case "usersExcept":
      return scope.keepEmails.length === 0
        ? sql`true`
        : sql`NOT EXISTS (
            SELECT 1 FROM users u
             WHERE u.id = s.user_id
               AND u.email = ANY(${textArray(scope.keepEmails)})
          )`;
  }
}

/**
 * Räknar abonnemang, kreditgrants och betalningsjobb som hör till de rader
 * `scope` är på väg att radera. En enda rundtur; inget skrivs.
 */
export async function countProtectedBillingRows(
  scope: BillingRetentionScope,
): Promise<BillingRetentionCounts> {
  if (scope.kind === "projectIds" && scope.projectIds.length === 0) return EMPTY;

  const predicate = scopePredicate(scope);
  try {
    const result = await db.execute<{
      subscriptions: number;
      grants: number;
      jobs: number;
    }>(sql`
      SELECT
        (SELECT count(*) FROM site_subscriptions s WHERE ${predicate})::int
          AS subscriptions,
        (SELECT count(*) FROM subscription_credit_grants g
           JOIN site_subscriptions s ON s.id = g.subscription_id
          WHERE ${predicate})::int AS grants,
        (SELECT count(*) FROM billing_jobs j
           JOIN site_subscriptions s ON s.id = j.subscription_id
          WHERE ${predicate})::int AS jobs
    `);
    const row = result.rows?.[0];
    return {
      subscriptions: Number(row?.subscriptions ?? 0),
      grants: Number(row?.grants ?? 0),
      jobs: Number(row?.jobs ?? 0),
    };
  } catch (error) {
    if ((error as { code?: string } | null)?.code === UNDEFINED_TABLE) {
      // Miljön har inte fått D1-migrationen än. Ingen tabell, ingen bokföring
      // att bevara — spärren ska inte låsa adminpanelen där.
      console.warn("[billing-retention] abonnemangstabellerna saknas i den här databasen");
      return EMPTY;
    }
    throw error;
  }
}

/**
 * Kastar {@link BillingRetentionError} när `scope` berör bokförda rader.
 * Anropas FÖRE den första DELETE:n, annars är halva miljön redan borta när
 * databasens RESTRICT slår till.
 */
export async function assertNoProtectedBillingRows(
  action: string,
  scope: BillingRetentionScope,
): Promise<void> {
  const counts = await countProtectedBillingRows(scope);
  if (hasProtectedBillingRows(counts)) throw new BillingRetentionError(action, counts);
}

/**
 * De av `projectIds` som bär ett abonnemang. Används av bakgrundsstädningen,
 * som ska HOPPA ÖVER sådana projekt i stället för att avbryta hela körningen.
 */
export async function projectIdsWithBillingRows(projectIds: string[]): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  try {
    const result = await db.execute<{ project_id: string }>(sql`
      SELECT DISTINCT project_id FROM site_subscriptions
       WHERE project_id = ANY(${textArray(projectIds)})
    `);
    return new Set((result.rows ?? []).map((row) => row.project_id));
  } catch (error) {
    if ((error as { code?: string } | null)?.code === UNDEFINED_TABLE) return new Set();
    throw error;
  }
}
