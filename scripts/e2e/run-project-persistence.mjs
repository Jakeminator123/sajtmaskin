import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import {
  assertNoDotenv,
  assertOwnedContainer,
  assertPassingPlaywrightReport,
  assertRuntimeIsolation,
  BASE_URL,
  databaseConfig,
  DB_NAME,
  DB_USER,
  FIXTURE_FILES,
  OWNER_LABEL,
  POSTGRES_IMAGE,
  runtimeEnvironment,
} from "./project-persistence-env.mjs";

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), "../..");
const children = new Set();
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = true;
    for (const child of children) {
      if (!child.pid) continue;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") console.error(error);
      }
    }
  });

function start(command, args, env) {
  assert(!interrupted, "Run was interrupted");
  const child = spawn(command, args, { cwd: root, env, stdio: "inherit", detached: true });
  children.add(child);
  child.done = new Promise((done) => {
    child.once("error", (error) => {
      child.spawnError = error;
      done({ error });
    });
    child.once("exit", (code, signal) => done({ code, signal }));
  });
  return child;
}

async function stop(child) {
  if (!child) return;
  if (!child.pid) {
    await child.done;
    children.delete(child);
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await Promise.race([child.done, delay(5_000, undefined, { ref: false })]);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  await child.done;
  children.delete(child);
}

async function run(command, args, env) {
  const child = start(command, args, env);
  try {
    const result = await child.done;
    if (result.error) throw result.error;
    assert(
      result.code === 0 && !interrupted,
      `${command} failed (${result.code ?? result.signal})`,
    );
  } finally {
    await stop(child);
  }
}

function docker(args) {
  // Never inherit a remote Docker context/DOCKER_HOST from the invoking job.
  return execFileSync("/usr/bin/docker", ["--host", "unix:///var/run/docker.sock", ...args], {
    cwd: root,
    env: { PATH: "/usr/bin:/bin" },
    encoding: "utf8",
    timeout: 30_000,
  }).trim();
}

async function outside() {
  assert(
    process.platform === "linux" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.RUNNER_ENVIRONMENT === "github-hosted",
    "Real run is CI-only; use the list command locally (no Docker/DB startup)",
  );
  assert(realpathSync(process.env.GITHUB_WORKSPACE) === realpathSync(root), "Wrong CI checkout");
  assert(
    process.version === `v${readFileSync(join(root, ".node-version"), "utf8").trim()}`,
    "Use the repository's pinned Node version",
  );
  assertNoDotenv(root);
  const uid = process.getuid();
  const gid = process.getgid();
  assert(uid > 0 && gid > 0, "CI launcher must run as its non-root runner user");
  for (const binary of [
    "/usr/bin/nsenter",
    "/usr/bin/setpriv",
    "/usr/bin/env",
    "/usr/bin/sudo",
    "/usr/bin/docker",
  ])
    assert(existsSync(binary), `Missing ${binary}; no installation/fallback is allowed`);
  execFileSync("/usr/bin/sudo", ["-n", "true"]);
  docker(["image", "inspect", POSTGRES_IMAGE]); // Pulled by the explicit CI setup step, never during runtime.
  const nonce = randomUUID();
  const password = randomBytes(24).toString("hex");
  const home = mkdtempSync(join(tmpdir(), "sajtmaskin-persistence-"));
  const fixture = {
    projectId: `a4_project_${nonce}`,
    chatId: `chat_a4_${nonce}`,
    versionId: `ver_a4_${nonce}`,
    sessionA: `sess_${randomUUID()}`,
    sessionB: `sess_${randomUUID()}`,
    files: FIXTURE_FILES,
  };
  let id;
  try {
    id = docker([
      "create",
      "--network",
      "none",
      "--label",
      `${OWNER_LABEL}=${nonce}`,
      "--tmpfs",
      "/var/lib/postgresql/data:rw,nosuid,noexec,size=512m",
      "--memory",
      "1g",
      "--cpus",
      "2",
      "--env",
      `POSTGRES_USER=${DB_USER}`,
      "--env",
      `POSTGRES_DB=${DB_NAME}`,
      "--env",
      `POSTGRES_PASSWORD=${password}`,
      POSTGRES_IMAGE,
    ]);
    assert(/^[a-f0-9]{64}$/.test(id), "Docker did not return an exact container ID");
    docker(["start", id]);
    const inspect = () => JSON.parse(docker(["inspect", id]))[0];
    const container = inspect();
    assertOwnedContainer(container, id, nonce);
    const namespacePath = `/proc/${container.State.Pid}/ns/net`;
    const namespace = execFileSync("/usr/bin/sudo", ["-n", "readlink", namespacePath], {
      encoding: "utf8",
    }).trim();
    const hostNamespace = readlinkSync("/proc/self/ns/net");
    assert(namespace !== hostNamespace, "Container unexpectedly shares the host network");
    const env = runtimeEnvironment({
      nodeDirectory: dirname(process.execPath),
      home,
      dbUrl: `postgresql://${DB_USER}:${password}@127.0.0.1:5432/${DB_NAME}`,
      namespace,
      hostNamespace,
      fixture,
    });
    // Namespace entry happens while privileged; application code runs only AFTER
    // dropping uid/gid, supplementary Docker group, ALL caps and setuid escalation.
    await run(
      "/usr/bin/sudo",
      [
        "-n",
        "/usr/bin/nsenter",
        `--net=${namespacePath}`,
        "--",
        "/usr/bin/setpriv",
        `--reuid=${uid}`,
        `--regid=${gid}`,
        "--clear-groups",
        "--inh-caps=-all",
        "--ambient-caps=-all",
        "--bounding-set=-all",
        "--no-new-privs",
        "--",
        "/usr/bin/env",
        "-i",
        ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
        process.execPath,
        script,
        "--inside",
      ],
      { PATH: "/usr/bin:/bin" },
    );
  } finally {
    if (id) {
      assert(/^[a-f0-9]{64}$/.test(id), "Refusing cleanup of an unverified container ID");
      const current = JSON.parse(docker(["inspect", id]))[0];
      assert(
        current.Id === id &&
          current.Config?.Labels?.[OWNER_LABEL] === nonce &&
          current.Config?.Image === POSTGRES_IMAGE,
        "Refusing cleanup of another container",
      );
      docker(["rm", "--force", "--volumes", id]);
      console.info(`[project-persistence] removed own disposable container ${id}`);
    }
    assert(
      dirname(home) === realpathSync(tmpdir()) &&
        home.startsWith(join(tmpdir(), "sajtmaskin-persistence-")),
      "Refusing unrelated temp cleanup",
    );
    rmSync(home, { recursive: true });
  }
}

async function inside() {
  assertRuntimeIsolation(root); // Before ANY database operation, app or browser.
  const fixture = JSON.parse(process.env.A4_FIXTURE);
  const pool = new Pool(databaseConfig(process.env.A4_POSTGRES_URL));
  let app;
  let seeded = false;
  console.info(
    `[project-persistence] verified isolated namespace ${process.env.A4_NAMESPACE}; loopback only, no capabilities, no_new_privs, no Docker access`,
  );
  try {
    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        await pool.query("SELECT 1");
        break;
      } catch (error) {
        if (interrupted || Date.now() >= deadline) throw error;
        await delay(500);
      }
    }
    // POSTGRES_USER gives this fresh container only our fixture login. Existing
    // migrations/RLS name `postgres`; provide that compatibility principal
    // without another login or any role-management/superuser privileges.
    // This writes ONLY the verified, fresh disposable container, never a supplied DB.
    await pool.query(
      "CREATE ROLE postgres NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
    const compatibilityRole = await pool.query(
      "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname='postgres'",
    );
    assert.equal(compatibilityRole.rowCount, 1);
    assert(Object.values(compatibilityRole.rows[0]).every((value) => value === false));
    console.info("[project-persistence] disposable postgres NOLOGIN compatibility role verified");
    await run(process.execPath, ["scripts/db/db-init.mjs"], process.env);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO app_projects (id, user_id, session_id, name) VALUES ($1, NULL, $2, 'A4 disposable persistence fixture')",
        [fixture.projectId, fixture.sessionA],
      );
      await client.query("INSERT INTO engine_chats (id, project_id) VALUES ($1, $2)", [
        fixture.chatId,
        fixture.projectId,
      ]);
      await client.query(
        "INSERT INTO engine_versions (id, chat_id, version_number, files_json, release_state, verification_state, promoted_at, edit_kind, lifecycle_stage) VALUES ($1, $2, 1, $3, 'promoted', 'passed', NOW(), 'quick_edit', 'design')",
        [fixture.versionId, fixture.chatId, JSON.stringify(fixture.files)],
      );
      await client.query("COMMIT");
      seeded = true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // Direct supported CLI: the normal dev wrapper loads dotenv and starts unrelated indexers.
    // Webpack dev has Next's built-in local font fallback; production Turbopack CI is unchanged.
    app = start(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--webpack", "-H", "127.0.0.1", "-p", "3107"],
      process.env,
    );
    const readyDeadline = Date.now() + 120_000;
    while (true) {
      assert(
        !app.spawnError && app.exitCode === null && !interrupted,
        "Next exited before readiness",
      );
      try {
        const response = await fetch(`${BASE_URL}/api/projects/${fixture.projectId}`, {
          headers: { cookie: `sajtmaskin_session=${fixture.sessionA}` },
          signal: AbortSignal.timeout(10_000),
        });
        assert(response.status === 200, `Project readiness returned ${response.status}`);
        await response.arrayBuffer();
        break;
      } catch (error) {
        if (error instanceof assert.AssertionError || Date.now() >= readyDeadline || interrupted)
          throw error;
        await delay(500);
      }
    }
    await run(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "-c",
        "playwright.project-persistence.config.ts",
      ],
      process.env,
    );
    assertPassingPlaywrightReport(
      JSON.parse(readFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, "utf8")),
    );
    console.info(
      "[project-persistence] real executed Playwright results verified; no skipped tests",
    );
  } finally {
    try {
      await stop(app); // Stop app/after() work before deleting fixture rows.
      if (seeded) {
        const drainedBy = Date.now() + 5_000;
        while (true) {
          const clients = await pool.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend' AND application_name <> 'a4_fixture'",
            [DB_NAME],
          );
          if (clients.rows[0].n === 0) break;
          assert(Date.now() < drainedBy, "App database connections did not drain before cleanup");
          await delay(100);
        }
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("DELETE FROM page_views WHERE session_id = ANY($1::text[])", [
            [fixture.sessionA, fixture.sessionB],
          ]);
          const removed = await client.query(
            "DELETE FROM app_projects WHERE id=$1 AND user_id IS NULL AND session_id=$2 RETURNING id",
            [fixture.projectId, fixture.sessionA],
          );
          assert.equal(
            removed.rowCount,
            1,
            "Fixture project ownership changed; refusing broad cleanup",
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
        for (const [table, column, id] of [
          ["app_projects", "id", fixture.projectId],
          ["project_data", "project_id", fixture.projectId],
          ["project_files", "project_id", fixture.projectId],
          ["engine_chats", "id", fixture.chatId],
          ["engine_versions", "id", fixture.versionId],
        ]) {
          assert.equal(
            (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`, [id]))
              .rows[0].n,
            0,
            `Fixture remains in ${table}`,
          );
        }
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM page_views WHERE session_id=ANY($1::text[])",
              [[fixture.sessionA, fixture.sessionB]],
            )
          ).rows[0].n,
          0,
        );
        console.info("[project-persistence] exact fixture/cascade/session cleanup verified");
      }
    } finally {
      await pool.end();
    }
  }
}

try {
  assert(
    process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === "--inside"),
    "Unexpected launcher argument",
  );
  if (process.argv[2] === "--inside") await inside();
  else await outside();
} catch (error) {
  console.error(`[project-persistence] ${error.message}`);
  process.exitCode = 1;
}
