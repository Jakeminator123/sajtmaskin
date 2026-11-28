import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(repo, ".cache/alina-local");
const state = path.join(cache, "gateway");
const infra = path.join(repo, "infra/openclaw");
const cliHome = path.join(cache, "openclaw-cli");
const cli = path.join(cliHome, "node_modules/openclaw/openclaw.mjs");
const port = 18792;
const base = "http://127.0.0.1:" + port;
mkdirSync(state, { recursive: true });
function privateToken(file) {
  if (!existsSync(file))
    writeFileSync(file, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
  return readFileSync(file, "utf8").trim();
}
const gatewayToken = privateToken(path.join(cache, "gateway-token"));
const modelToken = privateToken(path.join(cache, "model-token"));
const family = "alina-runpod/qwen3-32b";
const fastHome = path.join(cache, "fast-model");
const fastBinary = process.env.ALINA_LLAMA_SERVER || path.join(fastHome, "runtime", "llama-server.exe");
const fastWeights = process.env.ALINA_FAST_GGUF || path.join(fastHome, "Qwen3-1.7B-Q8_0.gguf");
// The CPU trial on this laptop missed its latency target. Enable it explicitly for further A/B runs.
const fastAvailable = process.env.ALINA_FAST_MODEL === "local" && existsSync(fastBinary) && existsSync(fastWeights);
if (!existsSync(cli)) {
  const version = readFileSync(path.join(infra, "Dockerfile"), "utf8")
    .match(/^ARG OPENCLAW_VERSION=(.+)$/m)?.[1]
    ?.trim();
  if (!version) throw Error("OpenClaw-versionen saknas i projektets Dockerfile.");
  const npm = process.env.npm_execpath;
  if (!npm) throw Error("Starta med npm run alina:chat.");
  const install = spawnSync(
    process.execPath,
    [
      npm,
      "install",
      "--prefix",
      cliHome,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-save",
      "openclaw@" + version,
    ],
    {
      stdio: "inherit",
      cwd: repo,
      env: { ...process.env, NODE_LLAMA_CPP_SKIP_DOWNLOAD: "true" },
    },
  );
  if (install.status !== 0) throw Error("Den lokala gatewayen kunde inte installeras.");
}
const env = {
  ...process.env,
  OPENCLAW_STATE_DIR: state,
  OPENCLAW_CONFIG_PATH: path.join(state, "openclaw.json"),
  OPENCLAW_GATEWAY_TOKEN: gatewayToken,
  OPENCLAW_GATEWAY_BIND: "loopback",
  OPENCLAW_GATEWAY_PORT: String(port),
  OPENCLAW_MODEL_PRIMARY: family,
  OPENCLAW_MODEL_FAST: fastAvailable ? "alina-fast/qwen3-1.7b" : family,
  OPENCLAW_MODEL_BALANCED: family,
  OPENCLAW_MODEL_FALLBACK: "",
  OPENCLAW_MODEL_FAST_FALLBACK: "",
  OPENCLAW_MODEL_BALANCED_FALLBACK: "",
  ALINA_LOCAL_MODEL_TOKEN: modelToken,
  SAJTAGENT_TARGET_SITE_URL: "http://127.0.0.1:3000",
  OPENCLAW_HEARTBEAT_EVERY: "0m",
};
cpSync(path.join(infra, "config/workspace"), path.join(state, "workspace-sajtagenten"), {
  recursive: true,
});
for (const id of ["sajtagenten", "sajtagenten-balanced", "sajtagenten-fast"]) {
  const dir = path.join(state, "agents", id, "agent");
  mkdirSync(dir, { recursive: true });
  cpSync(
    path.join(infra, "config/agents/sajtagenten/agent/IDENTITY.md"),
    path.join(dir, "IDENTITY.md"),
  );
}
const generated = spawnSync(
  process.execPath,
  [path.join(infra, "generate-config.mjs"), env.OPENCLAW_CONFIG_PATH, state],
  { cwd: repo, env, stdio: "inherit" },
);
if (generated.status !== 0) throw Error("Lokala agentinställningar kunde inte skapas.");
const config = JSON.parse(readFileSync(env.OPENCLAW_CONFIG_PATH, "utf8"));
config.models = {
  mode: "merge",
  providers: {
    "alina-runpod": {
      baseUrl: "http://127.0.0.1:5814/internal/model/v1",
      apiKey: "${ALINA_LOCAL_MODEL_TOKEN}",
      api: "openai-completions",
      models: [
        {
          id: "qwen3-32b",
          name: "Qwen3 32B",
          reasoning: false,
          input: ["text"],
          contextWindow: 64000,
          maxTokens: 1200,
        },
      ],
    },
  },
};
if (fastAvailable) {
  config.models.providers["alina-fast"] = {
    baseUrl: "http://127.0.0.1:5816/v1", apiKey: "${ALINA_LOCAL_MODEL_TOKEN}",
    api: "openai-completions",
    models: [{id: "qwen3-1.7b", name: "Qwen3 1.7B", reasoning: false,
      input: ["text"], contextWindow: 16384, maxTokens: 650}],
  };
}
for (const agent of config.agents.list) agent.thinkingDefault = "off";
writeFileSync(env.OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
const children = new Set();
function start(args, childEnv) {
  const child = spawn(process.execPath, args, {
    cwd: repo,
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}
function stop() {
  for (const p of children) p.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
if (fastAvailable) {
  const small = spawn(fastBinary, ["--model", fastWeights, "--alias", "qwen3-1.7b",
    "--host", "127.0.0.1", "--port", "5816", "--ctx-size", "16384", "--parallel", "1",
    "--device", "none", "--threads", "4", "--reasoning", "off", "--no-ui", "--no-warmup", "--jinja"], {
    stdio: ["ignore", "ignore", "inherit"], windowsHide: true,
    env: { ...process.env, LLAMA_API_KEY: modelToken },
  });
  children.add(small);
  small.on("exit", () => children.delete(small));
  let healthy = false;
  for (let attempt = 0; attempt < 180 && small.exitCode === null; attempt++) {
    try {
      const result = await fetch("http://127.0.0.1:5816/v1/models", {
        headers: {Authorization: "Bearer " + modelToken}, signal: AbortSignal.timeout(1000),
      });
      healthy = result.ok && (await result.json()).data?.some(model => model.id === "qwen3-1.7b");
    } catch {}
    if (healthy) break;
    await delay(500);
  }
  if (!healthy) { const code = small.exitCode; stop(); throw Error("Den lokala Qwen3 1.7B-modellen blev inte redo. Processkod " + code); }
  console.log("Alinas snabbmodell Qwen3 1.7B är redo på loopback.");
} else console.info("Alinas ordinarie textväg använder Qwen3 32B. CPU-provet väljs med ALINA_FAST_MODEL=local.");
const gateway = start([cli, "gateway", "--port", String(port), "--bind", "loopback"], env);
let healthy = false;
for (let attempt = 0; attempt < 140 && gateway.exitCode === null; attempt++) {
  try {
    const r = await fetch(base + "/v1/models", {
      headers: { Authorization: "Bearer " + gatewayToken },
      signal: AbortSignal.timeout(2000),
    });
    healthy = r.ok;
    await r.body?.cancel();
  } catch {}
  if (healthy) break;
  await delay(1800);
}
if (!healthy) {
  stop();
  throw Error("Den lokala OpenClaw-gatewayen blev inte redo.");
}
console.log("Alinas lokala OpenClaw är redo. Sajtmaskin startar på http://127.0.0.1:3000.");
const web = start(
  [
    path.join(repo, "scripts/dev/next-runner.mjs"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  {
    ...process.env,
    OPENCLAW_GATEWAY_URL: base,
    OPENCLAW_GATEWAY_TOKEN: gatewayToken,
    OPENCLAW_MODEL_ROUTING_ENABLED: "true",
    IMPLEMENT_UNDERSCORE_CLAW: "true",
  },
);
web.on("exit", (code, signal) => {
  console.log("Alinas lokala sajt avslutades.", code, signal);
  stop();
  process.exitCode = code ?? 1;
});
gateway.on("exit", (code, signal) => {
  console.log("Alinas lokala gateway avslutades.", code, signal);
  if (web.exitCode === null) web.kill();
});
