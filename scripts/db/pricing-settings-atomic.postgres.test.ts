// @vitest-environment node
/**
 * Postgres-backat kontraktstest för atomisk `credit_action_prices`-patch.
 *
 * Enhetstesterna i `pricing-settings.test.ts` bevisar merge-semantiken och att
 * koden *anropar* `.for("update")` mot en mock. De kan inte bevisa att
 * node-postgres under READ COMMITTED faktiskt serialiserar två samtidiga
 * patchar mot singleton-raden. Utan `SELECT … FOR UPDATE` läser båda samma
 * snapshot, mergar i Node och den sista UPDATE:n vinner — den andra patchens
 * fält försvinner. Det är en pengaväg, så racet måste fällas mot riktig
 * Postgres.
 *
 * Filen bevisar tre lager, samma upplägg som
 * `project-meta-atomic-patch.postgres.test.ts`:
 * 1. Lås-lös read–merge–write med explicit barriär efter SELECT förlorar
 *    deterministiskt ett fält. Det är kontrollen: testet *kan* se racet.
 * 2. Samma interleaving med `FOR UPDATE` behåller båda fälten.
 * 3. `updatePricingSettings` via Drizzle behåller båda under `Promise.all`.
 *    Ett kort `BEFORE UPDATE`-sleep vidgar fönstret så att båda SELECT:arna
 *    hinner landa innan någon COMMIT:ar. Utan den vidgningen är localhost-
 *    Postgres så snabb att två anrop kan serialiseras av en slump — då skulle
 *    testet passera även om låset togs bort. Sleepen gör att ett borttaget
 *    `FOR UPDATE` i produktionkoden faller här.
 *
 * Säkerhet: testet SKRIVER och vägrar därför allt utom en dev-target via
 * `check-db-env-target.mjs`. Kontroll-lagren 1–2 använder en egen rad
 * (`pstest_<run>`), inte singletonen. Lager 3 måste träffa `id = 'default'`
 * eftersom funktionen är hårdkodad dit; raden snapshotas i `beforeAll` och
 * återställs i `afterEach`/`afterAll`. Sleep-triggern bär körprefix och
 * släpps i `finally`.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_CREDIT_ACTION_PRICES, getCreditCost } from "../../src/lib/credits/pricing";
import {
  checkDbEnvTarget,
  loadDbTargets,
  resolveConfiguredDbUrl,
} from "./check-db-env-target.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

if (existsSync(".env.local")) loadEnvFile({ path: ".env.local", override: false });

function resolveDevDbUrl(): { url: string | null; reason: string } {
  const resolved = resolveConfiguredDbUrl(process.env);
  if (!resolved) return { url: null, reason: "ingen databas-URL i env" };

  const verdict = checkDbEnvTarget({
    expect: "dev",
    urlValue: resolved.value,
    targets: loadDbTargets(),
  });
  return verdict.ok
    ? { url: resolved.value, reason: verdict.message }
    : { url: null, reason: verdict.message };
}

const target = resolveDevDbUrl();
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[pricing-settings-atomic.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att låskontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

function createBarrier(count: number): { arrive(): Promise<void> } {
  let released!: () => void;
  const gate = new Promise<void>((resolve) => {
    released = resolve;
  });
  let arrived = 0;
  return {
    arrive() {
      arrived += 1;
      if (arrived >= count) released();
      return gate;
    },
  };
}

const KEPT_PREVIEW = 17;
const WIZARD_PRICE = 101;
const AUDIT_PRICE = 202;
const ADVANCED_PRICE = 33;
const DEFAULT_ID = "default";

type CreditPrices = Record<string, unknown>;
type Snapshot = {
  domain_markup_basis_points: number;
  domain_usd_to_sek_ore: number;
  credit_action_prices: CreditPrices;
  updated_by: string | null;
  updated_at: Date;
};

describe.skipIf(!target.url)("pricing_settings atomisk patch mot riktig Postgres", () => {
  const runTag = randomUUID();
  const privateId = `pstest_${runTag}`;
  const updatedBy = `pstest_${runTag.slice(0, 8)}`;
  const raceId = `pst_slow_${runTag.replace(/-/g, "").slice(0, 10)}`;

  let pool: Pool;
  let snapshot: Snapshot | null = null;
  let updatePricingSettings: typeof import("../../src/lib/db/services/pricing-settings").updatePricingSettings;
  let mergeCreditActionPrices: typeof import("../../src/lib/db/services/pricing-settings").mergeCreditActionPrices;
  let parseCreditActionPrices: typeof import("../../src/lib/db/services/pricing-settings").parseCreditActionPrices;
  let getPricingSettings: typeof import("../../src/lib/db/services/pricing-settings").getPricingSettings;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 4,
    });

    const settings = await import("../../src/lib/db/services/pricing-settings");
    updatePricingSettings = settings.updatePricingSettings;
    mergeCreditActionPrices = settings.mergeCreditActionPrices;
    parseCreditActionPrices = settings.parseCreditActionPrices;
    getPricingSettings = settings.getPricingSettings;

    await dropRaceHelpers();

    const existing = await pool.query<Snapshot>(
      `select domain_markup_basis_points, domain_usd_to_sek_ore,
              credit_action_prices, updated_by, updated_at
         from pricing_settings where id = $1`,
      [DEFAULT_ID],
    );
    snapshot = existing.rows[0] ?? null;

    await pool.query(
      `insert into pricing_settings (
         id, domain_markup_basis_points, domain_usd_to_sek_ore,
         credit_action_prices, updated_by
       ) values ($1, 50000, 1100, $2::jsonb, $3)`,
      [privateId, JSON.stringify({ deployPreview: KEPT_PREVIEW }), updatedBy],
    );
  }, 60_000);

  beforeEach(async () => {
    await pool.query(
      `update pricing_settings
          set credit_action_prices = $2::jsonb, updated_by = $3
        where id = $1`,
      [privateId, JSON.stringify({ deployPreview: KEPT_PREVIEW }), updatedBy],
    );
  });

  afterEach(async () => {
    await restoreDefault();
  });

  afterAll(async () => {
    if (!pool) return;
    await restoreDefault().catch(() => null);
    await dropRaceHelpers().catch(() => null);
    await pool.query("delete from pricing_settings where id = $1", [privateId]).catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  async function restoreDefault(): Promise<void> {
    if (!snapshot) return;
    await pool.query(
      `update pricing_settings
          set domain_markup_basis_points = $2,
              domain_usd_to_sek_ore = $3,
              credit_action_prices = $4::jsonb,
              updated_by = $5,
              updated_at = $6
        where id = $1`,
      [
        DEFAULT_ID,
        snapshot.domain_markup_basis_points,
        snapshot.domain_usd_to_sek_ore,
        JSON.stringify(snapshot.credit_action_prices),
        snapshot.updated_by,
        snapshot.updated_at,
      ],
    );
  }

  async function dropRaceHelpers(): Promise<void> {
    const { rows: triggers } = await pool.query<{ tgname: string }>(
      `select t.tgname
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'pricing_settings'
          and not t.tgisinternal
          and t.tgname like 'pst_slow_%'`,
    );
    for (const { tgname } of triggers) {
      await pool.query(`drop trigger if exists ${tgname} on pricing_settings`);
    }
    const { rows: funcs } = await pool.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname like 'pst_slow_%'`,
    );
    for (const { proname } of funcs) {
      await pool.query(`drop function if exists ${proname}()`);
    }
  }

  async function readPrices(id: string): Promise<CreditPrices> {
    const { rows } = await pool.query<{ credit_action_prices: CreditPrices }>(
      "select credit_action_prices from pricing_settings where id = $1",
      [id],
    );
    const prices = rows[0]?.credit_action_prices;
    return prices && typeof prices === "object" && !Array.isArray(prices) ? prices : {};
  }

  async function seedDefault(prices: CreditPrices): Promise<void> {
    await pool.query(
      `update pricing_settings
          set credit_action_prices = $2::jsonb, updated_by = $3
        where id = $1`,
      [DEFAULT_ID, JSON.stringify(prices), updatedBy],
    );
  }

  /**
   * Samma algoritm som `updatePricingSettings` minus radlåset: läs JSON,
   * merga i Node, skriv tillbaka. `arrive` släpper först när båda läst —
   * då är lost-update deterministisk.
   */
  async function readMergeWrite(
    client: PoolClient,
    id: string,
    patch: { wizard?: number | null; auditBasic?: number | null; auditAdvanced?: number | null },
    arrive: (() => Promise<void>) | null,
    forUpdate: boolean,
  ): Promise<void> {
    await client.query("begin");
    try {
      const lockSql = forUpdate ? " for update" : "";
      const { rows } = await client.query<{ credit_action_prices: unknown }>(
        `select credit_action_prices from pricing_settings where id = $1${lockSql}`,
        [id],
      );
      const merged = mergeCreditActionPrices(
        parseCreditActionPrices(rows[0]?.credit_action_prices),
        patch,
      );
      if (arrive) await arrive();
      await client.query(
        `update pricing_settings
            set credit_action_prices = $2::jsonb,
                updated_by = $3,
                updated_at = now()
          where id = $1`,
        [id, JSON.stringify(merged), updatedBy],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => null);
      throw error;
    }
  }

  async function parallelRmw(
    id: string,
    left: Parameters<typeof readMergeWrite>[2],
    right: Parameters<typeof readMergeWrite>[2],
    opts: { forUpdate: boolean; barrier: boolean },
  ): Promise<void> {
    const gate = opts.barrier ? createBarrier(2) : null;
    const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      await Promise.all([
        readMergeWrite(c1, id, left, gate ? () => gate.arrive() : null, opts.forUpdate),
        readMergeWrite(c2, id, right, gate ? () => gate.arrive() : null, opts.forUpdate),
      ]);
    } finally {
      c1.release();
      c2.release();
    }
  }

  /**
   * Vidgar racet så båda SELECT:arna hinner före COMMIT. Utan sleep är
   * localhost-Postgres så snabb att Promise.all kan serialiseras av en slump
   * — då skulle testet vara grönt även utan FOR UPDATE.
   */
  async function withSlowUpdate<T>(fn: () => Promise<T>): Promise<T> {
    await pool.query(
      `create or replace function ${raceId}() returns trigger as $f$
       begin
         perform pg_sleep(0.12);
         return new;
       end;
       $f$ language plpgsql`,
    );
    await pool.query(
      `create trigger ${raceId}
         before update on pricing_settings
         for each row execute function ${raceId}()`,
    );
    try {
      return await fn();
    } finally {
      await pool.query(`drop trigger if exists ${raceId} on pricing_settings`).catch(() => null);
      await pool.query(`drop function if exists ${raceId}()`).catch(() => null);
    }
  }

  it("lås-lös read–merge–write förlorar ett samtidigt fält (kontroll att racet syns)", async () => {
    await parallelRmw(
      privateId,
      { wizard: WIZARD_PRICE },
      { auditBasic: AUDIT_PRICE },
      { forUpdate: false, barrier: true },
    );

    const prices = await readPrices(privateId);
    const keptWizard = prices.wizard === WIZARD_PRICE;
    const keptAudit = prices.auditBasic === AUDIT_PRICE;
    expect(keptWizard && keptAudit).toBe(false);
    expect(keptWizard || keptAudit).toBe(true);
    expect(prices.deployPreview).toBe(KEPT_PREVIEW);
  }, 60_000);

  it("SELECT FOR UPDATE serialiserar samma interleaving och behåller båda fälten", async () => {
    await parallelRmw(
      privateId,
      { wizard: WIZARD_PRICE },
      { auditBasic: AUDIT_PRICE },
      { forUpdate: true, barrier: false },
    );

    expect(await readPrices(privateId)).toEqual({
      deployPreview: KEPT_PREVIEW,
      wizard: WIZARD_PRICE,
      auditBasic: AUDIT_PRICE,
    });
  }, 60_000);

  it("samma sleep-fönster utan FOR UPDATE tappar ett fält (bevis att lager 3 skulle falla)", async () => {
    // Ingen barriär — bara den sleep som updatePricingSettings-testerna använder.
    // Om båda fälten överlever här är fönstret för smalt och lager 3 är
    // false-green vid ett borttaget lås.
    await withSlowUpdate(() =>
      parallelRmw(
        privateId,
        { wizard: WIZARD_PRICE },
        { auditBasic: AUDIT_PRICE },
        { forUpdate: false, barrier: false },
      ),
    );

    const prices = await readPrices(privateId);
    const keptWizard = prices.wizard === WIZARD_PRICE;
    const keptAudit = prices.auditBasic === AUDIT_PRICE;
    expect(keptWizard && keptAudit).toBe(false);
    expect(keptWizard || keptAudit).toBe(true);
    expect(prices.deployPreview).toBe(KEPT_PREVIEW);
  }, 60_000);

  it("updatePricingSettings behåller samtidiga wizard- och auditBasic-patchar", async () => {
    await seedDefault({ deployPreview: KEPT_PREVIEW });

    await withSlowUpdate(async () => {
      await Promise.all([
        updatePricingSettings({
          creditActionPrices: { wizard: WIZARD_PRICE },
          updatedBy: `${updatedBy}-wizard`,
        }),
        updatePricingSettings({
          creditActionPrices: { auditBasic: AUDIT_PRICE },
          updatedBy: `${updatedBy}-audit`,
        }),
      ]);
    });

    const stored = await readPrices(DEFAULT_ID);
    expect(stored).toMatchObject({
      deployPreview: KEPT_PREVIEW,
      wizard: WIZARD_PRICE,
      auditBasic: AUDIT_PRICE,
    });

    const settings = await getPricingSettings();
    expect(settings.creditActionPrices).toMatchObject({
      deployPreview: KEPT_PREVIEW,
      wizard: WIZARD_PRICE,
      auditBasic: AUDIT_PRICE,
    });
    expect(getCreditCost("wizard.enrich", {}, settings.creditActionPrices)).toBe(WIZARD_PRICE);
    expect(getCreditCost("audit.basic", {}, settings.creditActionPrices)).toBe(AUDIT_PRICE);
  }, 60_000);

  it("null tar bort exakt en override under samtidighet och lämnar resten", async () => {
    await seedDefault({
      deployPreview: KEPT_PREVIEW,
      wizard: WIZARD_PRICE,
      auditBasic: AUDIT_PRICE,
    });

    await withSlowUpdate(async () => {
      await Promise.all([
        updatePricingSettings({
          creditActionPrices: { wizard: null },
          updatedBy: `${updatedBy}-null`,
        }),
        updatePricingSettings({
          creditActionPrices: { auditAdvanced: ADVANCED_PRICE },
          updatedBy: `${updatedBy}-adv`,
        }),
      ]);
    });

    const stored = await readPrices(DEFAULT_ID);
    expect(stored).toEqual({
      deployPreview: KEPT_PREVIEW,
      auditBasic: AUDIT_PRICE,
      auditAdvanced: ADVANCED_PRICE,
    });
    expect(stored).not.toHaveProperty("wizard");

    const settings = await getPricingSettings();
    expect(getCreditCost("wizard.enrich", {}, settings.creditActionPrices)).toBe(
      DEFAULT_CREDIT_ACTION_PRICES.wizard,
    );
    expect(getCreditCost("audit.basic", {}, settings.creditActionPrices)).toBe(AUDIT_PRICE);
    expect(getCreditCost("audit.advanced", {}, settings.creditActionPrices)).toBe(ADVANCED_PRICE);
  }, 60_000);

  it("0 sparas som priset noll och tolkas inte som borttagning, även under samtidighet", async () => {
    await seedDefault({ deployPreview: KEPT_PREVIEW, auditBasic: AUDIT_PRICE });

    await withSlowUpdate(async () => {
      await Promise.all([
        updatePricingSettings({
          creditActionPrices: { wizard: 0 },
          updatedBy: `${updatedBy}-zero`,
        }),
        updatePricingSettings({
          creditActionPrices: { auditAdvanced: ADVANCED_PRICE },
          updatedBy: `${updatedBy}-adv0`,
        }),
      ]);
    });

    const stored = await readPrices(DEFAULT_ID);
    expect(stored).toHaveProperty("wizard", 0);
    expect(stored.wizard).not.toBeNull();
    expect(stored).toMatchObject({
      deployPreview: KEPT_PREVIEW,
      auditBasic: AUDIT_PRICE,
      auditAdvanced: ADVANCED_PRICE,
      wizard: 0,
    });

    const { rows } = await pool.query<{ wizard_present: boolean; wizard_text: string }>(
      `select (credit_action_prices ? 'wizard') as wizard_present,
              credit_action_prices ->> 'wizard' as wizard_text
         from pricing_settings where id = $1`,
      [DEFAULT_ID],
    );
    expect(rows[0]).toEqual({ wizard_present: true, wizard_text: "0" });

    const settings = await getPricingSettings();
    expect(getCreditCost("wizard.enrich", {}, settings.creditActionPrices)).toBe(0);
    expect(getCreditCost("wizard.enrich", {}, settings.creditActionPrices)).not.toBe(
      DEFAULT_CREDIT_ACTION_PRICES.wizard,
    );
  }, 60_000);
});
