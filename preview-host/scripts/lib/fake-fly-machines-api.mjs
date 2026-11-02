/**
 * In-process stand-in for the Fly Machines REST API (SM-080 tests).
 *
 * Implements the subset `src/machines/fly-machines-client.js` uses: create,
 * get, wait, start, stop, delete and list-with-metadata-filter. Every created
 * machine gets its own loopback address (127.0.0.N) and a REAL guest agent
 * process (`guest/agent.js`) bound to that address, so the control plane is
 * exercised end to end over HTTP exactly as on Fly — only the machine
 * boundary is simulated. Tokens and chatIds flow from the create payload the
 * control plane sent, so identity proofs are tested for real.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function allocateDevPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function startFakeFlyMachinesApi({
  apiToken,
  appName,
  agentScript,
  rootDir,
  warmDir = null,
  chatIdOverride = null,
  startDelayMs = 0,
}) {
  const machines = new Map();
  const calls = [];
  let nextHostOctet = 2;
  const options = { chatIdOverride };

  async function spawnAgent(machine) {
    const env = { ...machine.config.env };
    const chatId = options.chatIdOverride ? options.chatIdOverride(env.SAJTMASKIN_GUEST_CHAT_ID) : env.SAJTMASKIN_GUEST_CHAT_ID;
    const root = join(rootDir, machine.id);
    mkdirSync(root, { recursive: true });
    const devPort = await allocateDevPort();
    const child = spawn(process.execPath, [agentScript], {
      env: {
        // Only what a real machine would have: its own env from the create
        // payload plus the OS basics. Nothing from the control plane's shell.
        PATH: process.env.PATH,
        HOME: process.env.HOME ?? process.env.USERPROFILE ?? root,
        SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "",
        COMSPEC: process.env.COMSPEC ?? process.env.ComSpec ?? "",
        PATHEXT: process.env.PATHEXT ?? "",
        APPDATA: process.env.APPDATA ?? "",
        LOCALAPPDATA: process.env.LOCALAPPDATA ?? "",
        USERPROFILE: process.env.USERPROFILE ?? "",
        TEMP: process.env.TEMP ?? "",
        TMP: process.env.TMP ?? "",
        SAJTMASKIN_GUEST_TOKEN: env.SAJTMASKIN_GUEST_TOKEN ?? "",
        SAJTMASKIN_GUEST_CHAT_ID: chatId ?? "",
        SAJTMASKIN_GUEST_PORT: env.SAJTMASKIN_GUEST_PORT ?? "",
        SAJTMASKIN_GUEST_BIND: machine.private_ip,
        SAJTMASKIN_GUEST_ROOT: root,
        SAJTMASKIN_GUEST_DEV_PORT: String(devPort),
        ...(warmDir ? { SAJTMASKIN_GUEST_WARM_DIR: warmDir } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    machine.agentOutput = [];
    const capture = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) machine.agentOutput.push(line);
      }
      if (machine.agentOutput.length > 200) machine.agentOutput.splice(0, machine.agentOutput.length - 200);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    machine.agent = child;
    machine.agentEnv = { chatId, devPort, root };
  }

  function killAgent(machine) {
    const child = machine.agent;
    machine.agent = null;
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      child.once("close", () => resolve());
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      } else {
        child.kill("SIGTERM");
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* gone */ }
        }, 2000).unref();
      }
    });
  }

  function publicMachine(machine) {
    return {
      id: machine.id,
      name: machine.name,
      state: machine.state,
      region: machine.region,
      private_ip: machine.private_ip,
      config: machine.config,
      created_at: machine.created_at,
      updated_at: new Date().toISOString(),
    };
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://fake.invalid");
      calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams) });
      const auth = req.headers.authorization ?? "";
      // Same scheme rule as the real API: `fly tokens create` macaroons are
      // FlyV1, only `flyctl auth token` output is Bearer.
      const expectedAuth = /^FlyV1\s+/i.test(apiToken) ? apiToken : `Bearer ${apiToken}`;
      if (auth !== expectedAuth) return json(res, 401, { error: "unauthorized" });
      const prefix = `/v1/apps/${encodeURIComponent(appName)}/machines`;
      if (!url.pathname.startsWith(prefix)) return json(res, 404, { error: "app not found" });
      const rest = url.pathname.slice(prefix.length);

      if (rest === "" && req.method === "POST") {
        const body = await readJson(req);
        const id = randomBytes(7).toString("hex");
        const machine = {
          id,
          name: body.name ?? id,
          region: body.region ?? "arn",
          state: "started",
          private_ip: `127.0.0.${nextHostOctet++}`,
          config: body.config ?? {},
          created_at: new Date().toISOString(),
          agent: null,
        };
        machines.set(id, machine);
        if (startDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, startDelayMs));
        await spawnAgent(machine);
        return json(res, 200, publicMachine(machine));
      }
      if (rest === "" && req.method === "GET") {
        const filters = [...url.searchParams.entries()].filter(([key]) => key.startsWith("metadata."));
        const list = [...machines.values()].filter((machine) =>
          filters.every(([key, value]) => machine.config?.metadata?.[key.slice("metadata.".length)] === value),
        );
        return json(res, 200, list.map(publicMachine));
      }
      const match = rest.match(/^\/([^/]+)(?:\/(wait|start|stop))?$/);
      if (!match) return json(res, 404, { error: "not found" });
      const machine = machines.get(match[1]);
      if (!machine) return json(res, 404, { error: "machine not found" });
      const action = match[2];
      if (!action && req.method === "GET") return json(res, 200, publicMachine(machine));
      if (!action && req.method === "DELETE") {
        await killAgent(machine);
        machine.state = "destroyed";
        machines.delete(machine.id);
        return json(res, 200, { ok: true });
      }
      if (action === "wait" && req.method === "GET") {
        const wanted = url.searchParams.get("state") ?? "started";
        return json(res, 200, { ok: machine.state === wanted, state: machine.state });
      }
      if (action === "start" && req.method === "POST") {
        const previous = machine.state;
        machine.state = "started";
        if (!machine.agent) await spawnAgent(machine);
        return json(res, 200, { previous_state: previous });
      }
      if (action === "stop" && req.method === "POST") {
        await killAgent(machine);
        machine.state = "stopped";
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: "not found" });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : "fake api error" });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    calls,
    machines,
    options,
    callsFor(method, suffixRe) {
      return calls.filter((call) => call.method === method && suffixRe.test(call.path));
    },
    async close() {
      for (const machine of machines.values()) await killAgent(machine);
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
