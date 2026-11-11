// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertVercelLink, checkDevelopmentEnv, IDENTITY, repositorySlug } from "./local-setup.mjs";
import { pullDevelopmentEnv } from "./pull-development-env.mjs";

const roots: string[] = [];
const dev = "POSTGRES_URL=postgres://postgres:placeholder@db.yubbckduwblyrbnlglwf.supabase.co:5432/postgres\n";
const prod = "postgres://postgres:placeholder@db.egcitvwgettkftkyzbvn.supabase.co:5432/postgres";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sajtmaskin portable setup "));
  roots.push(root);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["remote", "add", "origin", `git@github.com:${IDENTITY.repository}.git`], { cwd: root });
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module", volta: { node: process.versions.node } }));
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("local setup identity", () => {
  it("accepts both Git transports without depending on a machine username", () => {
    expect(repositorySlug("git@github.com:Jakeminator123/sajtmaskin.git")).toBe(IDENTITY.repository);
    expect(repositorySlug("https://github.com/Jakeminator123/sajtmaskin.git")).toBe(IDENTITY.repository);
    expect(repositorySlug("https://github.com.evil.invalid/Jakeminator123/sajtmaskin")).toBeNull();
  });
  it("rejects the wrong linked project without rewriting the file", () => {
    const root = fixture();
    mkdirSync(join(root, ".vercel"));
    const path = join(root, ".vercel/project.json");
    const original = JSON.stringify({ projectId: "other", orgId: IDENTITY.vercel.orgId });
    writeFileSync(path, original);
    expect(() => assertVercelLink(root)).toThrow("annat projekt/team");
    expect(readFileSync(path, "utf8")).toBe(original);
  });
  it("rejects production even as a fallback behind a valid DEV URL", async () => {
    await expect(checkDevelopmentEnv(`${dev}STORAGE_POSTGRES_URL=${prod}\n`)).rejects.toThrow("STORAGE_POSTGRES_URL");
    await expect(checkDevelopmentEnv("POSTGRES_URL=postgres://user:password@localhost/postgres\n")).rejects.toThrow();
  });
});

describe("Development env pull preserves local work", () => {
  function downloader(root: string, contents: string, extra = "") {
    const file = join(root, "fake-npm.js");
    writeFileSync(file, `import fs from 'node:fs';
      if (!process.argv.includes('--environment=development') || process.env.VERCEL_PROJECT_ID !== '${IDENTITY.vercel.projectId}' || process.env.VERCEL_ORG_ID !== '${IDENTITY.vercel.orgId}') process.exit(9);
      fs.writeFileSync(process.argv[process.argv.indexOf('pull') + 1], ${JSON.stringify(contents)});
      ${extra}`);
    return file;
  }
  it("rejects wrong-env output and keeps the existing local secrets byte-for-byte", async () => {
    const root = fixture();
    writeFileSync(join(root, ".env.local"), "LOCAL_ONLY=placeholder\r\n");
    await expect(pullDevelopmentEnv({ root, npmCli: downloader(root, `POSTGRES_URL=${prod}\n`) })).rejects.toThrow();
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe("LOCAL_ONLY=placeholder\r\n");
    expect(readdirSync(root).some((name) => name.startsWith(".env.development-pull-"))).toBe(false);
  });
  it("uses explicit identity, handles a path with spaces and backs up before replacement", async () => {
    const root = fixture();
    writeFileSync(join(root, ".env.local"), "LOCAL_ONLY=placeholder\r\n");
    await pullDevelopmentEnv({ root, npmCli: downloader(root, dev) });
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe(dev);
    const backups = readdirSync(join(root, ".env-backups"));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(root, ".env-backups", backups[0]), "utf8")).toBe("LOCAL_ONLY=placeholder\r\n");
  });
  it("does not overwrite a concurrent local edit", async () => {
    const root = fixture();
    writeFileSync(join(root, ".env.local"), "LOCAL_ONLY=before\n");
    await expect(pullDevelopmentEnv({ root, npmCli: downloader(root, dev, "fs.writeFileSync('.env.local', 'LOCAL_ONLY=after\\n');") })).rejects.toThrow("ändrades under hämtningen");
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe("LOCAL_ONLY=after\n");
  });
});
