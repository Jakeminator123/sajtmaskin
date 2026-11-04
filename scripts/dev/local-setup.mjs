#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const IDENTITY = JSON.parse(readFileSync(join(ROOT, "config/local-development.json"), "utf8"));

export function repositorySlug(remote) {
  const match = String(remote).trim().match(/^(?:git@github\.com:|https:\/\/github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/u);
  return match?.[1] ?? null;
}

export function assertCheckout(root = ROOT) {
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (resolve(git(["rev-parse", "--show-toplevel"])) !== resolve(root)) throw new Error("Fel checkout-root.");
  if (repositorySlug(git(["remote", "get-url", "origin"])) !== IDENTITY.repository) {
    throw new Error("origin matchar inte config/local-development.json; inga lokala filer ändras.");
  }
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (process.versions.node !== manifest.volta.node) {
    throw new Error(`Använd repoets Volta-version ${manifest.volta.node}; kör nu ${process.versions.node}.`);
  }
}

export function assertVercelLink(root = ROOT) {
  const projectFile = join(root, ".vercel/project.json");
  if (existsSync(projectFile)) {
    const project = JSON.parse(readFileSync(projectFile, "utf8"));
    if (project.projectId !== IDENTITY.vercel.projectId || project.orgId !== IDENTITY.vercel.orgId) {
      throw new Error(".vercel/project.json pekar på ett annat projekt/team; lämnas orörd.");
    }
  }
  const repoFile = join(root, ".vercel/repo.json");
  if (existsSync(repoFile)) {
    const projects = JSON.parse(readFileSync(repoFile, "utf8")).projects ?? [];
    const project = projects.find((item) => item.directory === "." || item.directory === "");
    if (!project || project.id !== IDENTITY.vercel.projectId || project.orgId !== IDENTITY.vercel.orgId) {
      throw new Error(".vercel/repo.json saknar rätt projekt i repo-roten; lämnas orörd.");
    }
  }
}

export async function checkDevelopmentEnv(text) {
  const { checkDbEnvTarget, loadDbTargets, normalizeDbUrlValue, resolveConfiguredDbUrl } = await import("../db/check-db-env-target.mjs");
  const env = parseEnv(text);
  const targets = loadDbTargets();
  const selected = resolveConfiguredDbUrl(env);
  if (!selected) throw new Error("Development saknar databas-URL.");
  // Reject a hidden production fallback as well as the active URL.
  for (const key of ["POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "STORAGE_POSTGRES_URL", "STORAGE_POSTGRES_URL_NON_POOLING", "DATABASE_URL"]) {
    const value = normalizeDbUrlValue(env[key]);
    if (!value) continue;
    const result = checkDbEnvTarget({ expect: "dev", urlValue: value, targets });
    if (!result.ok || result.level !== "ok") throw new Error(`${key}: ${result.message}`);
  }
  return { env, message: checkDbEnvTarget({ expect: "dev", urlValue: selected.value, targets }).message };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check")) throw new Error("Använd setup:local eller setup:local -- --check.");
  const checkOnly = args.includes("--check");
  assertCheckout();
  assertVercelLink();
  console.log(`[setup] ${IDENTITY.repository}; Node ${process.versions.node}; leveransgren ${IDENTITY.branch}`);
  for (const [relative, contents] of [
    [".vercel/project.json", `${JSON.stringify(IDENTITY.vercel, null, 2)}\n`],
    [".cursor/mcp.json", readFileSync(join(ROOT, ".cursor/mcp.json.example"), "utf8")],
  ]) {
    const path = join(ROOT, relative);
    if (existsSync(path)) console.log(`[setup] Behåller ${relative}`);
    else if (checkOnly) console.log(`[setup] Saknas: ${relative}; kör npm run setup:local`);
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, { flag: "wx", mode: 0o600 });
      console.log(`[setup] Skapad: ${relative}`);
    }
  }
  if (!checkOnly) execFileSync(process.execPath, [join(ROOT, "scripts/dev/install-git-hooks.mjs")], { cwd: ROOT, stdio: "inherit", windowsHide: true });
  if (!existsSync(join(ROOT, "node_modules/next/package.json"))) throw new Error("Beroenden saknas; kör npm ci först.");
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) throw new Error(".env.local saknas; logga in i Vercel och kör npm run env:pull.");
  const { env, message } = await checkDevelopmentEnv(readFileSync(envFile, "utf8"));
  console.log(`[setup] ${message}`);
  for (const key of ["OPENAI_API_KEY", "JWT_SECRET", "OPENCLAW_GATEWAY_URL", "OPENCLAW_GATEWAY_TOKEN"]) {
    console.log(`[setup] ${key}: ${env[key]?.trim() ? "finns" : "saknas"}`);
  }
  console.log("[setup] Lokala filer kontrollerade. OAuth, API-nycklars giltighet och tjänsters hälsa kräver separata livekontroller.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[setup] ${error.message}`); process.exitCode = 1; });
}
