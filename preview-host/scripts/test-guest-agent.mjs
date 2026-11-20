/**
 * Guard tests for the SM-080 guest agent (`guest/agent.js`), run against a
 * real agent process on loopback:
 *
 *   1. Fail-closed startup config (no token / no chatId refuses).
 *   2. Every endpoint requires the per-machine bearer token; the proxy too.
 *   3. Workspace writes stay inside the workspace (traversal, absolute, drive
 *      letter) and binary transport entries land as bytes.
 *   4. exec settles on timeout; dev start/status/proxy/stop lifecycle works.
 *   5. The warm-layer fingerprint equals the host's dependencyFingerprint for
 *      the same files (the policy string is duplicated on purpose).
 *
 * Plain node, no framework: node scripts/test-guest-agent.mjs
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const agentModule = require("../guest/agent.js");
const warmState = require("../guest/scripts/write-warm-state.cjs");

const tmp = mkdtempSync(join(tmpdir(), "preview-guest-test-"));
process.env.PREVIEW_HOST_DATA_DIR = join(tmp, "host-data");
const packageInstall = require("../src/runtime/package-install.js");

let failures = 0;
function check(label, condition) {
  if (condition) console.log(`  OK    ${label}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// 0. The stop predicate treats a signal-ended child as ended (CI hang 2026-10-22).
{
  const { createDevProcessManager } = require("../guest/lib/process.js");
  const probe = createDevProcessManager().childHasEndedForTesting;
  check("signal-killed child counts as ended", probe({ exitCode: null, child: { exitCode: null, signalCode: "SIGKILL" } }));
  check("exit-0 child counts as ended", probe({ exitCode: null, child: { exitCode: 0, signalCode: null } }));
  check("recorded entry exit counts as ended", probe({ exitCode: 1, child: { exitCode: null, signalCode: null } }));
  check("running child does not count as ended", !probe({ exitCode: null, child: { exitCode: null, signalCode: null } }));
}

// 1. Config fail-closed.
{
  const bad = agentModule.loadConfig({});
  check("config without token/chatId reports problems", bad.problems.length === 2);
  const short = agentModule.loadConfig({ SAJTMASKIN_GUEST_TOKEN: "short", SAJTMASKIN_GUEST_CHAT_ID: "c" });
  check("short token is rejected", short.problems.some((p) => /16 characters/.test(p)));
  check("tokenMatches is exact", agentModule.tokenMatches("abcdefghijklmnop", "abcdefghijklmnop") && !agentModule.tokenMatches("abcdefghijklmnop", "abcdefghijklmnoq"));
}

// 5. Fingerprint parity with the host.
{
  const baseline = { "package.json": JSON.stringify({ name: "x", dependencies: { next: "16.4.2" } }) };
  check(
    "warm fingerprint equals host dependencyFingerprint",
    warmState.dependencyFingerprintFromFiles(baseline) === packageInstall.dependencyFingerprint(baseline),
  );
  check(
    "warm policy string equals host DEPENDENCY_INSTALL_POLICY",
    warmState.DEPENDENCY_INSTALL_POLICY === packageInstall.DEPENDENCY_INSTALL_POLICY,
  );
  const warmDir = join(tmp, "warm");
  mkdirSync(join(warmDir, "project"), { recursive: true });
  writeFileSync(join(warmDir, "project", "package.json"), baseline["package.json"]);
  const state = warmState.writeWarmState(warmDir);
  check("writeWarmState stamps the same fingerprint", state.fingerprint === packageInstall.dependencyFingerprint(baseline));
}

// Spawn a real agent.
const token = "test-token-0123456789abcdef";
const chatId = "chat-guest-test";
const port = await freePort();
const root = join(tmp, "root");
const agent = spawn(process.execPath, [join(process.cwd(), "guest", "agent.js")], {
  env: {
    ...process.env,
    SAJTMASKIN_GUEST_TOKEN: token,
    SAJTMASKIN_GUEST_CHAT_ID: chatId,
    SAJTMASKIN_GUEST_PORT: String(port),
    SAJTMASKIN_GUEST_BIND: "127.0.0.1",
    SAJTMASKIN_GUEST_ROOT: root,
    SAJTMASKIN_GUEST_DEV_PORT: String(await freePort()),
    SAJTMASKIN_GUEST_WARM_DIR: join(tmp, "warm"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const agentLog = [];
agent.stdout.on("data", (chunk) => agentLog.push(String(chunk)));
agent.stderr.on("data", (chunk) => agentLog.push(String(chunk)));
const base = `http://127.0.0.1:${port}`;
const auth = { authorization: `Bearer ${token}` };

async function call(method, path, body, headers = auth) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...headers, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, text };
}

async function waitForAgent() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await call("GET", "/health");
      if (res.status === 200) return res.body;
    } catch { /* not yet */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`agent did not start: ${agentLog.join("")}`);
}

try {
  const health = await waitForAgent();
  check("health reports agent identity and chatId", health.agent === "sajtmaskin-preview-guest" && health.chatId === chatId);
  check("health reports warm fingerprint", typeof health.warm?.fingerprint === "string");

  // 2. Auth.
  const noAuth = await call("GET", "/health", undefined, {});
  check("health without token is 401", noAuth.status === 401);
  const wrongAuth = await call("GET", "/health", undefined, { authorization: "Bearer nope-nope-nope-nope" });
  check("health with wrong token is 401", wrongAuth.status === 401);
  const proxyNoAuth = await call("GET", "/proxy/", undefined, {});
  check("proxy without token is 401", proxyNoAuth.status === 401);
  const proxyNoDev = await call("GET", "/proxy/");
  check("proxy before dev start is 503", proxyNoDev.status === 503 && proxyNoDev.body.error === "dev_not_running");

  // 3. Workspace writes.
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const put = await call("PUT", "/workspaces/live", {
    files: {
      "package.json": { encoding: "utf8", content: JSON.stringify({ name: "p", private: true, scripts: { dev: "node server.js" } }) },
      "server.js": {
        encoding: "utf8",
        content: [
          "const http = require('node:http');",
          "const fs = require('node:fs');",
          "const port = Number(process.env.PORT);",
          "http.createServer((req, res) => {",
          "  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
          "  res.end('<html><body><h1>' + fs.readFileSync('message.txt', 'utf8') + '</h1><p>' + req.url + ' filler filler filler filler filler filler filler</p></body></html>');",
          "}).listen(port, process.env.HOSTNAME || '127.0.0.1');",
        ].join("\n"),
      },
      "message.txt": "hello-v1",
      "public/img.png": { encoding: "base64", content: png.toString("base64") },
    },
  });
  check("full snapshot write succeeds", put.status === 200 && put.body.written === 4);
  check("utf8 file landed", readFileSync(join(root, "live", "message.txt"), "utf8") === "hello-v1");
  check("binary file landed as bytes", readFileSync(join(root, "live", "public", "img.png")).equals(png));

  const traversal = await call("PATCH", "/workspaces/live", { files: { "../escape.txt": "x" } });
  check("traversal path is rejected", traversal.status === 400 && traversal.body.error === "unsafe_path");
  check("traversal wrote nothing", !existsSync(join(root, "escape.txt")));
  const absolute = await call("PATCH", "/workspaces/live", { files: { "/etc/passwd": "x" } });
  check("absolute path is rejected", absolute.status === 400);
  const drive = await call("PATCH", "/workspaces/live", { files: { "C:/x.txt": "x" } });
  check("drive-letter path is rejected", drive.status === 400);
  const badWs = await call("PUT", "/workspaces/../live", { files: {} });
  check("invalid workspace name is rejected", badWs.status === 400 || badWs.status === 404);

  const patch = await call("PATCH", "/workspaces/live", { files: { "message.txt": "hello-v2" }, removedPaths: ["public/img.png"] });
  check("patch writes and removes", patch.status === 200 && patch.body.written === 1 && patch.body.removed === 1);
  check("patch removed the binary", !existsSync(join(root, "live", "public", "img.png")));
  const file = await call("GET", "/workspaces/live/file?path=message.txt");
  check("file read returns content", file.body.exists === true && file.body.content === "hello-v2");
  const badRead = await call("GET", `/workspaces/live/file?path=${encodeURIComponent("../x")}`);
  check("file read rejects traversal", badRead.status === 400);

  const deps = await call("POST", "/workspaces/live/deps-state", { fingerprint: "a".repeat(64) });
  const state = await call("GET", "/workspaces/live/state?probe=message.txt,node_modules/x");
  check("deps-state round-trips through state", deps.status === 200 && state.body.dependencyState?.fingerprint === "a".repeat(64));
  check("state probes report existence", state.body.probes["message.txt"] === true && state.body.probes["node_modules/x"] === false);

  // 4. exec + dev lifecycle.
  const exec = await call("POST", "/workspaces/live/exec", { command: "node -p 40+2", timeoutMs: 20_000 });
  check("exec runs a command", exec.status === 200 && exec.body.exitCode === 0 && /42/.test(exec.body.output));
  const hang = join(tmp, "hang.mjs");
  writeFileSync(hang, "setTimeout(() => {}, 60000)\n");
  const startedAt = Date.now();
  const timeout = await call("POST", "/workspaces/live/exec", { command: `node ${hang}`, timeoutMs: 1500 });
  check("exec settles on timeout", timeout.body.timedOut === true && timeout.body.exitCode === 124 && Date.now() - startedAt < 20_000);
  // A script FILE, not `node -e`/`-p`: the command goes through `sh -lc` on
  // Linux, where parentheses are shell syntax (the same lesson as
  // test-runtime-guards.mjs).
  const envProbe = join(tmp, "env-probe.cjs");
  writeFileSync(envProbe, "console.log(String(process.env.SAJTMASKIN_GUEST_TOKEN) + String(process.env.LD_PRELOAD));\n");
  const envLeak = await call("POST", "/workspaces/live/exec", {
    command: `node ${envProbe}`,
    env: { LD_PRELOAD: "/evil.so" },
    timeoutMs: 20_000,
  });
  check("guest token and non-allowlisted env never reach child processes", /^undefinedundefined/m.test(envLeak.body.output.trim()));

  const devStart = await call("POST", "/dev/start", { args: ["run", "dev"], env: { SAJTMASKIN_PREVIEW_BASE_PATH: "/x" } });
  check("dev start returns a generation", devStart.status === 200 && devStart.body.generation === 1);
  let page = null;
  for (let i = 0; i < 40 && !page; i += 1) {
    const res = await call("GET", "/proxy/x/");
    if (res.status === 200) page = res.text;
    else await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check("proxy serves the dev process", typeof page === "string" && page.includes("hello-v2") && page.includes("/x/"));
  const viaHeader = await call("GET", "/proxy/x/with-header", undefined, {
    "x-sajtmaskin-guest-token": token,
    authorization: "Bearer browser-token-passes-through",
  });
  check("proxy accepts the dedicated token header and keeps the browser Authorization", viaHeader.status === 200 && viaHeader.text.includes("/x/with-header"));
  // fetch() normalizes dot segments before sending, so use a raw socket.
  const rawRequest = (path) =>
    new Promise((resolve, reject) => {
      const socket = connect(port, "127.0.0.1");
      let data = "";
      socket.on("data", (chunk) => { data += String(chunk); });
      socket.on("end", () => resolve(data));
      socket.on("error", reject);
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer ${token}\r\nConnection: close\r\n\r\n`);
    });
  const dotControl = await rawRequest("/proxy/%2e%2e/dev/status");
  check("dot-segment reach through proxy is proxied, not a control call", !dotControl.includes('"generation"'));
  const dotRaw = await rawRequest("/workspaces/live/../live/state");
  check("dot segments on control routes are refused", /^HTTP\/1\.1 400/.test(dotRaw));
  const status = await call("GET", "/dev/status?since=0");
  check("dev status reports running", status.body.running === true && status.body.generation === 1);
  const mismatch = await call("POST", "/dev/stop", { generation: 99 });
  check("dev stop with wrong generation is a no-op", mismatch.body.stopped === false);
  const stop = await call("POST", "/dev/stop", { generation: 1 });
  check("dev stop stops the process", stop.body.stopped === true);
  const after = await call("GET", "/dev/status");
  check("dev status reports stopped", after.body.running === false);

  // Regression (CI 2026-10-22): a second stop of a signal-killed process must
  // return immediately, not wait for a `close` that already fired.
  const stopAgainAt = Date.now();
  const stopAgain = await call("POST", "/dev/stop", { generation: 1 });
  check("stop after a signal-ended process returns at once", stopAgain.status === 200 && Date.now() - stopAgainAt < 3000);

  // Crash → restart: the next start must not wait on the dead process either.
  await call("PATCH", "/workspaces/live", { files: { "server.js": "process.exit(3);" } });
  const crashStart = await call("POST", "/dev/start", { args: ["run", "dev"] });
  check("start after stop yields a new generation", crashStart.body.generation === 2);
  let crashed = null;
  for (let i = 0; i < 40 && !crashed; i += 1) {
    const res = await call("GET", "/dev/status");
    if (res.body.running === false && res.body.generation === 2) crashed = res.body;
    else await new Promise((resolve) => setTimeout(resolve, 250));
  }
  check("crashed dev process reports its exit code", crashed?.exitCode === 3);
  const restartAt = Date.now();
  const restart = await call("POST", "/dev/start", { args: ["run", "dev"] });
  check("restart after crash does not hang", restart.body.generation === 3 && Date.now() - restartAt < 3000);
  await call("POST", "/dev/stop", { generation: 3 });

  const delAt = Date.now();
  const del = await call("DELETE", "/workspaces/live");
  check("workspace delete removes the directory", del.status === 200 && !existsSync(join(root, "live")));
  check("workspace delete after a stopped dev process is prompt", Date.now() - delAt < 8000);

  // IPv6: Fly's private network is IPv6-only, so the default bind must answer
  // on an IPv6 address. Second agent with the default bind, reached via ::1.
  const v6Port = await freePort();
  const v6Agent = spawn(process.execPath, [join(process.cwd(), "guest", "agent.js")], {
    env: {
      ...process.env,
      SAJTMASKIN_GUEST_TOKEN: token,
      SAJTMASKIN_GUEST_CHAT_ID: "chat-v6",
      SAJTMASKIN_GUEST_PORT: String(v6Port),
      SAJTMASKIN_GUEST_ROOT: join(tmp, "root-v6"),
      SAJTMASKIN_GUEST_DEV_PORT: String(await freePort()),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    let v6 = null;
    for (let i = 0; i < 60 && !v6; i += 1) {
      try {
        const res = await fetch(`http://[::1]:${v6Port}/health`, { headers: auth });
        if (res.status === 200) v6 = await res.json();
      } catch { /* not yet */ }
      if (!v6) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    check("default bind answers over IPv6 (Fly 6PN)", v6?.chatId === "chat-v6");
    const v4 = await fetch(`http://127.0.0.1:${v6Port}/health`, { headers: auth }).then((r) => r.status).catch(() => 0);
    check("default bind still answers over IPv4", v4 === 200);
  } finally {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(v6Agent.pid), "/t", "/f"], { stdio: "ignore" });
    else v6Agent.kill("SIGTERM");
  }
} catch (error) {
  failures += 1;
  console.error(`  FAIL  unexpected error: ${error instanceof Error ? error.stack : error}`);
  console.error(agentLog.join(""));
} finally {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(agent.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    agent.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  // Windows: `taskkill` is asynchronous, so the agent's dev child can still
  // hold `root/live` open for a moment (EBUSY). Retry, and never let a temp
  // cleanup turn green guards red.
  try {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.warn(`  WARN  temp cleanup left ${tmp}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} guest-agent guard(s) failed`);
  process.exit(1);
}
console.log("\nguest-agent guards passed");
