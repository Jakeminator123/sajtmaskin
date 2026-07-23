/**
 * DB-target identity guard: verifierar att den POSTGRES_URL processen ser
 * pekar på RÄTT Supabase-projekt för den avsedda miljön (dev/prod), enligt
 * den kanoniska mappningen i `config/db-targets.json`.
 *
 * Syfte: stoppa dev/prod-förvirring — t.ex. att CI:s prod-migrationer körs
 * mot dev-databasen, eller att en lokal `.env.local` råkar peka på prod.
 *
 * Användning:
 *   node scripts/db/check-db-env-target.mjs --expect=prod   # CI-prod-guard
 *   node scripts/db/check-db-env-target.mjs --expect=dev    # lokal sanity
 *
 * Utskriften är alltid SANITISERAD: miljönamn, host, databas och project ref
 * — aldrig lösenord eller hela connection-strängen.
 *
 * Exit codes: 0 = OK/varning, 1 = fel target eller saknad URL.
 */
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const CONNECTION_KEYS = [
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_POSTGRES_URL",
  "STORAGE_POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TARGETS_PATH = path.resolve(__dirname, "../../config/db-targets.json");

export function loadDbTargets(filePath = DEFAULT_TARGETS_PATH) {
  if (!existsSync(filePath)) {
    throw new Error(`[db-env-target] Hittar inte ${filePath}`);
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  for (const envName of ["dev", "prod"]) {
    if (!parsed?.[envName]?.projectRef) {
      throw new Error(`[db-env-target] config/db-targets.json saknar "${envName}.projectRef"`);
    }
  }
  return parsed;
}

/**
 * Extraherar Supabase project ref ur en connection-URL.
 *
 * Två format:
 *  - Direct:  postgres://postgres:...@db.<ref>.supabase.co:5432/postgres
 *  - Pooler:  postgres://postgres.<ref>:...@aws-0-<region>.pooler.supabase.com:6543/postgres
 */
export function extractSupabaseProjectRef(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }

  const directMatch = url.hostname.match(/^db\.([a-z0-9]{16,24})\.supabase\.co$/);
  if (directMatch) return { ref: directMatch[1], via: "hostname" };

  if (url.hostname.endsWith(".pooler.supabase.com")) {
    const username = decodeURIComponent(url.username || "");
    const userMatch = username.match(/\.([a-z0-9]{16,24})$/);
    if (userMatch) return { ref: userMatch[1], via: "username" };
  }

  return null;
}

/** Sanitiserad identitet — aldrig lösenord/credentials. */
export function describeDbTarget(urlValue) {
  try {
    const url = new URL(urlValue);
    const refInfo = extractSupabaseProjectRef(urlValue);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || "postgres",
      projectRef: refInfo?.ref ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Normaliserar ett rått env-värde till en användbar connection-URL, eller
 * `undefined` om värdet inte är en riktig URL. Speglar runtime-resolvern
 * (`normalizeDbEnvUrl` i `src/lib/db/env.ts`): strippar omgivande citattecken
 * och hoppar över ointerpolerade placeholders (`${POSTGRES_URL}` / `$POSTGRES_URL`).
 * Utan detta kunde guarden validera en annan sträng än den appen och
 * migrationerna faktiskt använder (t.ex. Vercel/Supabase-setups där primärnyckeln
 * är en template men den riktiga URL:en ligger i ett storage-alias) → falsk röd.
 */
export function normalizeDbUrlValue(raw) {
  if (typeof raw !== "string") return undefined;
  let value = raw.trim();
  if (!value) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
    if (!value) return undefined;
  }
  if (/^\$\{[A-Z0-9_]+\}$/.test(value) || /^\$[A-Z0-9_]+$/.test(value)) {
    return undefined;
  }
  return value;
}

export function resolveConfiguredDbUrl(env = process.env) {
  for (const key of CONNECTION_KEYS) {
    const value = normalizeDbUrlValue(env[key]);
    if (value) return { key, value };
  }
  return null;
}

/**
 * Kärnkontroll (ren funktion för test):
 * @returns {{ ok: boolean, level: "ok"|"warn"|"error", message: string }}
 */
export function checkDbEnvTarget({ expect, urlValue, targets }) {
  if (expect !== "dev" && expect !== "prod") {
    return { ok: false, level: "error", message: `Ogiltig --expect="${expect}" (dev|prod)` };
  }
  if (!urlValue) {
    return { ok: false, level: "error", message: "Ingen databas-URL satt (POSTGRES_URL m.fl.)" };
  }

  const described = describeDbTarget(urlValue);
  if (!described) {
    return { ok: false, level: "error", message: "Databas-URL:en kunde inte parsas" };
  }

  const identity = `host=${described.host} db=${described.database} ref=${described.projectRef ?? "-"}`;
  const expected = targets[expect];
  const other = targets[expect === "prod" ? "dev" : "prod"];

  if (!described.projectRef) {
    if (expect === "prod") {
      return {
        ok: false,
        level: "error",
        message: `Förväntade prod-Supabase (${expected.projectRef}, ${expected.region}) men URL:en är inte en känd Supabase-URL — ${identity}`,
      };
    }
    // Dev: lokal/throwaway-Postgres är legitimt (t.ex. localhost i CI/dev-pods).
    return {
      ok: true,
      level: "warn",
      message: `Ej Supabase-URL (lokal Postgres?) — accepteras för dev — ${identity}`,
    };
  }

  if (described.projectRef === expected.projectRef) {
    return { ok: true, level: "ok", message: `Rätt ${expect}-target — ${identity}` };
  }

  if (described.projectRef === other.projectRef) {
    return {
      ok: false,
      level: "error",
      message: `FEL MILJÖ: URL:en pekar på ${expect === "prod" ? "DEV" : "PROD"}-projektet (${described.projectRef}) men ${expect.toUpperCase()} förväntades (${expected.projectRef}, ${expected.region}) — ${identity}`,
    };
  }

  return {
    ok: false,
    level: "error",
    message: `Okänt Supabase-projekt ${described.projectRef} — förväntade ${expected.projectRef} (${expected.region}) för ${expect} — ${identity}`,
  };
}

function parseArgs(argv) {
  const args = { expect: null };
  for (const arg of argv) {
    const match = arg.match(/^--expect=(.+)$/);
    if (match) args.expect = match[1].trim();
  }
  return args;
}

function main() {
  const { expect } = parseArgs(process.argv.slice(2));
  if (!expect) {
    console.error("[db-env-target] Ange --expect=dev eller --expect=prod");
    process.exit(1);
  }

  const targets = loadDbTargets();
  const resolved = resolveConfiguredDbUrl();
  const result = checkDbEnvTarget({ expect, urlValue: resolved?.value, targets });

  const prefix = `[db-env-target] expect=${expect} källa=${resolved?.key ?? "-"}`;
  if (result.level === "error") {
    console.error(`${prefix} ✗ ${result.message}`);
    process.exit(1);
  }
  if (result.level === "warn") {
    console.warn(`${prefix} ⚠ ${result.message}`);
  } else {
    console.log(`${prefix} ✓ ${result.message}`);
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
