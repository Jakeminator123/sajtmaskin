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
  /**
   * Stripe-kundrader som hör till användarna en åtgärd är på väg att radera.
   *
   * Egen post eftersom en kundrad kan finnas HELT UTAN abonnemang: en avbruten
   * checkout lämnar kunden kvar. Räknades den inte fick `reset-all` noll från
   * spärren, raderade projekt- och ledgerrader och stoppades först av
   * kundradens RESTRICT vid den sista `users`-raderingen — alltså exakt det
   * halvraderade utfallet spärren finns för att förhindra.
   */
  customers: number;
};

/**
 * Vilka rader en åtgärd är på väg att radera.
 *
 * - `allProjects` — hela projektstädningen (`clear projects`). Varje abonnemang
 *   bär ett `project_id`, så alla abonnemang berörs. Användare rörs inte, och
 *   då står ingen kundrad i vägen.
 * - `projectIds` — en avgränsad uppsättning projekt.
 * - `usersExcept` — varje användare UTOM de skyddade e-postadresserna.
 * - `everything` — nollställningen: varje projekt OCH varje användare utom de
 *   skyddade. Kundraderna räknas eftersom användarna faktiskt raderas.
 */
export type BillingRetentionScope =
  | { kind: "allProjects" }
  | { kind: "projectIds"; projectIds: string[] }
  | { kind: "usersExcept"; keepEmails: string[] }
  | { kind: "everything"; keepEmails: string[] };

const EMPTY: BillingRetentionCounts = { subscriptions: 0, grants: 0, jobs: 0, customers: 0 };

export function hasProtectedBillingRows(counts: BillingRetentionCounts): boolean {
  return counts.subscriptions + counts.grants + counts.jobs + counts.customers > 0;
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
    `${counts.grants} kreditgrant(er), ${counts.jobs} betalningsjobb och ` +
    `${counts.customers} kundrader hör till raderna som skulle tas bort. ` +
    `Abonnemangsbokföringen raderas aldrig automatiskt — en kundrad räknas även ` +
    `utan abonnemang, eftersom en avbruten checkout lämnar den kvar. Avsluta ` +
    `abonnemangen och avregistrera kunderna först, eller välj en rensning som ` +
    `inte rör dem.`
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

/** Predikat mot abonnemangsraden `s`. */
function scopePredicate(scope: BillingRetentionScope): SQL {
  switch (scope.kind) {
    case "allProjects":
    case "everything":
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
 * Predikat mot kundraden `c`, eller `null` när åtgärden inte raderar någon
 * användare. En projektrensning rör inte `users`, så kundraderna är inte i
 * farozonen där och ska inte kunna låsa den.
 */
function customerPredicate(scope: BillingRetentionScope): SQL | null {
  if (scope.kind !== "usersExcept" && scope.kind !== "everything") return null;
  return scope.keepEmails.length === 0
    ? sql`true`
    : sql`NOT EXISTS (
        SELECT 1 FROM users u
         WHERE u.id = c.user_id
           AND u.email = ANY(${textArray(scope.keepEmails)})
      )`;
}

/**
 * Räknar abonnemang, kreditgrants, betalningsjobb och kundrader som hör till de
 * rader `scope` är på väg att radera. En enda rundtur; inget skrivs.
 */
export async function countProtectedBillingRows(
  scope: BillingRetentionScope,
): Promise<BillingRetentionCounts> {
  if (scope.kind === "projectIds" && scope.projectIds.length === 0) return EMPTY;

  const predicate = scopePredicate(scope);
  const customers = customerPredicate(scope);
  try {
    const result = await db.execute<{
      subscriptions: number;
      grants: number;
      jobs: number;
      customers: number;
    }>(sql`
      SELECT
        (SELECT count(*) FROM site_subscriptions s WHERE ${predicate})::int
          AS subscriptions,
        (SELECT count(*) FROM subscription_credit_grants g
           JOIN site_subscriptions s ON s.id = g.subscription_id
          WHERE ${predicate})::int AS grants,
        (SELECT count(*) FROM billing_jobs j
           JOIN site_subscriptions s ON s.id = j.subscription_id
          WHERE ${predicate})::int AS jobs,
        ${
          customers
            ? sql`(SELECT count(*) FROM billing_customers c WHERE ${customers})::int`
            : sql`0`
        } AS customers
    `);
    const row = result.rows?.[0];
    return {
      subscriptions: Number(row?.subscriptions ?? 0),
      grants: Number(row?.grants ?? 0),
      jobs: Number(row?.jobs ?? 0),
      customers: Number(row?.customers ?? 0),
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
