#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { assertCheckout, assertVercelLink, checkDevelopmentEnv, IDENTITY, ROOT } from "./local-setup.mjs";

export async function pullDevelopmentEnv({ root = ROOT, npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js") } = {}) {
  assertCheckout(root);
  assertVercelLink(root);
  if (!existsSync(npmCli) || !npmCli.endsWith(".js")) throw new Error("Starta via npm run env:pull.");
  const temporary = join(root, `.env.development-pull-${randomUUID()}`);
  const destination = join(root, ".env.local");
  const original = existsSync(destination) ? readFileSync(destination) : null;
  try {
    const result = spawnSync(process.execPath, [npmCli, "exec", "--yes", "--package=vercel@58", "--", "vercel", "env", "pull", temporary, "--environment=development", "--yes", "--scope", IDENTITY.vercel.orgId], {
      cwd: root,
      env: { ...process.env, VERCEL_ORG_ID: IDENTITY.vercel.orgId, VERCEL_PROJECT_ID: IDENTITY.vercel.projectId },
      stdio: "inherit", windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error("Vercel-hämtningen misslyckades; befintlig .env.local är orörd.");
    const { message } = await checkDevelopmentEnv(readFileSync(temporary, "utf8"));
    const current = existsSync(destination) ? readFileSync(destination) : null;
    if (Boolean(original) !== Boolean(current) || (original && !original.equals(current))) {
      throw new Error(".env.local ändrades under hämtningen; lämnas orörd. Kör om när ingen annan skriver filen.");
    }
    if (existsSync(destination)) {
      const directory = join(root, ".env-backups");
      mkdirSync(directory, { recursive: true });
      const backup = join(directory, `development-${Date.now()}-${randomUUID()}.env`);
      copyFileSync(destination, backup);
      console.log(`[env:pull] Tidigare lokala värden sparade i ${backup}`);
    }
    renameSync(temporary, destination);
    console.log(`[env:pull] Development hämtad och verifierad: ${message}`);
    console.log("[env:pull] Maskinlokala tillägg kan återföras selektivt från backupen; filen innehåller endast Vercels Development-värden.");
  } finally {
    rmSync(temporary, { force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const work = process.argv.length > 2
    ? Promise.reject(new Error("env:pull hämtar endast Development; inga extra flaggor accepteras."))
    : pullDevelopmentEnv();
  work.catch((error) => { console.error(`[env:pull] ${error.message}`); process.exitCode = 1; });
}
