/**
 * Pool-mättnad — mätningen A3 behöver innan `POSTGRES_POOL_MAX` vrids.
 *
 * Planen sa "mät `pg_stat_activity`", men det mäter fel sida. Felet i
 * 2026-07-13-stormen var `timeout exceeded when trying to connect`, vilket är
 * `pg.Pool` som ger upp medan den väntar på en **klient ur instansens egen
 * pool** — inte Postgres som nekar en anslutning. Serversidan kan alltså se
 * fullt frisk ut samtidigt som varje request på en instans står i kö bakom
 * `max: 3`. Mäter man bara serversidan svarar man på en annan fråga och kan
 * dra poolstorleken åt fel håll.
 *
 * **`atCeiling` är den bärande signalen, inte `waiting`.** Att `pg.Pool` just
 * kastat en connect-timeout betyder att den inte kunde lämna ut en klient — men
 * den timeoutade requesten är redan **borttagen ur kön** när felet når oss, så
 * `waiting` kan läsa 0 i exakt det ögonblick vi loggar. `waiting > 0` är därför
 * bekräftande bevis (andra väntar också), aldrig ett villkor: en tom kö
 * *motbevisar* ingenting.
 *
 * Serversidans utrymme — skälet att inte höja `max` blint, eftersom fler
 * instanser × högre max kan slå i poolerns tak i stället — mäts separat av
 * `scripts/db/db-health-check.mjs` → `connections`.
 *
 * Modulen är avsiktligt ett löv: den importerar **inte** `client.ts`, utan
 * `client.ts` registrerar sin pool här. Annars skulle varje konsument (t.ex.
 * `transient-db-response.ts` och dess unit-test) dra in client-modulen, som
 * kastar vid import när ingen connection string finns.
 */

/** Bara de fält vi läser, så modulen inte binds till `@types/pg`-formen. */
type PoolLike = {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
};

export type DbPoolStats = {
  /** Taket: `POSTGRES_POOL_MAX`, annars pooled/direct-defaulten. */
  max: number;
  /** Klienter poolen håller just nu (lediga + utlånade). */
  total: number;
  idle: number;
  /**
   * Requests som står i kö för en ledig klient **just nu**. Under-rapporterar
   * vid en connect-timeout: den som timeoutade är redan ur kön. Bekräftande
   * bevis, inte ett villkor.
   */
  waiting: number;
  /** Poolen är vid sitt tak och kan inte lämna ut ännu en klient. */
  atCeiling: boolean;
};

let registeredPool: PoolLike | null = null;
let registeredMax = 0;

/** Anropas av `client.ts` när poolen skapats. `null` nollställer (tester). */
export function registerDbPool(pool: PoolLike | null, max: number): void {
  registeredPool = pool;
  registeredMax = max;
}

/** `null` när ingen pool är registrerad (build-fas, test, ingen DB-config). */
export function getDbPoolStats(): DbPoolStats | null {
  if (!registeredPool) return null;
  const { totalCount: total, idleCount: idle, waitingCount: waiting } = registeredPool;
  return {
    max: registeredMax,
    total,
    idle,
    waiting,
    atCeiling: registeredMax > 0 && total >= registeredMax,
  };
}

/**
 * Kompakt form för en loggrad: `pool=3/3 idle=0 waiting=7 at-ceiling`.
 * Tom sträng när ingen pool är registrerad, så anropare kan konkatenera
 * utan att först kolla.
 */
export function formatDbPoolStats(stats: DbPoolStats | null = getDbPoolStats()): string {
  if (!stats) return "";
  const suffix = stats.atCeiling ? " at-ceiling" : "";
  return `pool=${stats.total}/${stats.max} idle=${stats.idle} waiting=${stats.waiting}${suffix}`;
}
