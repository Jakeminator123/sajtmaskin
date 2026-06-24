// READ-ONLY diagnostic. SELECT only — no writes.
//
// Dumps the latest N engine chats ("projekt") with their prompts and
// generation logs, plus each chat's version verification status.
//
// Usage (PowerShell):
//   node scripts/debug/latest-generations.mjs            # latest 2, prod env
//   node scripts/debug/latest-generations.mjs 5          # latest 5
//   node scripts/debug/latest-generations.mjs 2 .env.local   # against dev DB
//
// Env source order: 2nd arg path -> .env.vercel.production.pulled -> .env.local
import fs from "node:fs";
import pg from "pg";

const COUNT = Number.parseInt(process.argv[2] ?? "2", 10) || 2;
const ENV_CANDIDATES = [
  process.argv[3],
  ".env.vercel.production.pulled",
  ".env.local",
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => fs.existsSync(p));
if (!ENV_PATH) {
  console.error("Hittade ingen env-fil (" + ENV_CANDIDATES.join(", ") + ")");
  process.exit(1);
}

function loadEnv(path) {
  const out = {};
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const conn =
  env.POSTGRES_URL || env.POSTGRES_PRISMA_URL || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
if (!conn) {
  console.error("Ingen POSTGRES_URL i " + ENV_PATH);
  process.exit(1);
}
let clean = conn;
try { const u = new URL(conn); u.searchParams.delete("sslmode"); u.searchParams.delete("supa"); clean = u.toString(); } catch {}

const pool = new pg.Pool({ connectionString: clean, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 15000 });

const trunc = (s, n = 240) => (s == null ? "" : String(s).replace(/\s+/g, " ").slice(0, n));

try {
  console.log("Env: " + ENV_PATH + "   (senaste " + COUNT + " chattar)");
  const chats = await pool.query(
    `SELECT id, title, model, created_at, updated_at
       FROM engine_chats ORDER BY updated_at DESC LIMIT $1`,
    [COUNT],
  );
  for (const c of chats.rows) {
    console.log("\n==================================================================");
    console.log("CHAT " + c.id + "  | titel: " + (c.title ?? "(ingen)") + "  | modell: " + c.model);
    console.log("skapad: " + c.created_at + "  | uppdaterad: " + c.updated_at);

    const prompts = await pool.query(
      `SELECT event, model_tier, build_intent, created_at, prompt_original, prompt_formatted
         FROM prompt_logs WHERE chat_id = $1 ORDER BY created_at ASC`,
      [c.id],
    );
    console.log("\n  -- PROMPTAR (" + prompts.rows.length + ") --");
    for (const p of prompts.rows) {
      console.log("   [" + p.created_at + "] event=" + p.event + " tier=" + (p.model_tier ?? "-") + " intent=" + (p.build_intent ?? "-"));
      console.log("     original:  " + trunc(p.prompt_original));
    }

    const gens = await pool.query(
      `SELECT model, prompt_tokens, completion_tokens, duration_ms, success, error_message, created_at
         FROM engine_generation_logs WHERE chat_id = $1 ORDER BY created_at ASC`,
      [c.id],
    );
    console.log("\n  -- GENERERINGAR (" + gens.rows.length + ") --");
    for (const g of gens.rows) {
      console.log("   [" + g.created_at + "] " + g.model + " ok=" + g.success +
        " tokens=" + (g.prompt_tokens ?? "?") + "/" + (g.completion_tokens ?? "?") +
        " dur=" + (g.duration_ms ?? "?") + "ms" + (g.error_message ? " ERR=" + trunc(g.error_message, 160) : ""));
    }

    const vers = await pool.query(
      `SELECT version_number, verification_state, edit_kind, created_at,
              left(coalesce(verification_summary,''), 160) AS summary
         FROM engine_versions WHERE chat_id = $1 ORDER BY version_number ASC`,
      [c.id],
    );
    console.log("\n  -- VERSIONER (" + vers.rows.length + ") --");
    for (const v of vers.rows) {
      console.log("   v" + v.version_number + " [" + v.verification_state + "] " +
        (v.edit_kind ? "(" + v.edit_kind + ") " : "") + v.created_at + "  " + v.summary);
    }
  }
} catch (err) {
  console.error("Query error:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
