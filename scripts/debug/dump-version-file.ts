import { config } from "dotenv";
import { writeFile } from "fs/promises";
import { Pool } from "pg";

config({ path: ".env.local" });

const VERSION_ID = process.argv[2] || "c419bd00-5c0b-4772-82d3-0a15981d0a40";
const FILE_PATH = process.argv[3] || "components/floating-bike-scene.tsx";
const OUT = process.argv[4] || ".tmp-floating-bike-scene.tsx";

async function main() {
  const url = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("Missing POSTGRES_URL");
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });
  try {
    const { rows } = await pool.query(
      `SELECT id, files_json, repaired_files_json, release_state, verification_state, version_number
       FROM engine_versions WHERE id = $1`,
      [VERSION_ID],
    );
    if (rows.length === 0) {
      console.log("No version found");
      return;
    }
    const row = rows[0] as {
      files_json: string;
      repaired_files_json: string | null;
      release_state: string;
      verification_state: string;
      version_number: number;
    };
    console.log({
      versionNumber: row.version_number,
      releaseState: row.release_state,
      verificationState: row.verification_state,
      hasRepaired: !!row.repaired_files_json,
    });
    const parse = (s: string | null) => {
      if (!s) return null;
      try { return JSON.parse(s) as Array<{ path: string; content: string }>; } catch { return null; }
    };
    const main = parse(row.files_json);
    const repaired = parse(row.repaired_files_json);
    const findFile = (arr: Array<{ path: string; content: string }> | null) =>
      arr?.find((f) => f.path === FILE_PATH || f.path.endsWith("/" + FILE_PATH));
    const mainHit = findFile(main);
    const repairedHit = findFile(repaired);
    const out = {
      mainList: main?.map((f) => f.path) ?? null,
      repairedList: repaired?.map((f) => f.path) ?? null,
      mainContent: mainHit?.content ?? null,
      repairedContent: repairedHit?.content ?? null,
    };
    await writeFile(OUT, JSON.stringify(out, null, 2), "utf8");
    console.log(`Wrote to ${OUT}; main file ${mainHit ? "found" : "missing"}, repaired ${repairedHit ? "found" : "missing"}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
