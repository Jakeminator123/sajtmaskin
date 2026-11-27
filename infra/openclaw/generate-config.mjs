import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";

const [configFile, openClawDir] = process.argv.slice(2);

if (!configFile || !openClawDir) {
  throw new Error("Usage: generate-config.mjs <config-file> <openclaw-dir>");
}

function env(name, fallback = "") {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

function parseHttpUrl(name, value, { originOnly = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials`);
  }
  if (originOnly && (parsed.pathname !== "/" || parsed.search || parsed.hash)) {
    throw new Error(`${name} entries must not contain paths, queries, or fragments`);
  }
  return parsed;
}

function parseModelRef(name, value) {
  const trimmed = value.trim();
  if (!/^[a-z0-9][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(trimmed)) {
    throw new Error(`${name} must use provider/model format`);
  }
  return trimmed;
}

function parseModelChain(name, value) {
  const seen = new Set();
  const models = [];
  for (const raw of value.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const model = parseModelRef(name, trimmed);
    if (seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models;
}

function unique(values) {
  return [...new Set(values)];
}

const targetUrl = parseHttpUrl(
  "SAJTAGENT_TARGET_SITE_URL",
  env("SAJTAGENT_TARGET_SITE_URL", "http://localhost:3000"),
);
const allowedOrigins = unique([
  "http://localhost:3000",
  targetUrl.origin,
  ...env("SAJTAGENT_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) =>
      parseHttpUrl("SAJTAGENT_ALLOWED_ORIGINS", value, { originOnly: true }).origin,
    ),
]);

const strong = {
  primary: parseModelRef(
    "OPENCLAW_MODEL_PRIMARY",
    env("OPENCLAW_MODEL_PRIMARY", "openai/gpt-6.2-astra"),
  ),
  fallbacks: parseModelChain(
    "OPENCLAW_MODEL_FALLBACK",
    env("OPENCLAW_MODEL_FALLBACK", "openai/gpt-6.2-sol,openai/gpt-5.6-sol,openai/gpt-5.5"),
  ),
};
const balanced = {
  primary: parseModelRef(
    "OPENCLAW_MODEL_BALANCED",
    env("OPENCLAW_MODEL_BALANCED", "openai/gpt-6.2-sol"),
  ),
  fallbacks: parseModelChain(
    "OPENCLAW_MODEL_BALANCED_FALLBACK",
    env("OPENCLAW_MODEL_BALANCED_FALLBACK", "openai/gpt-5.6-sol,openai/gpt-5.5"),
  ),
};
const fast = {
  primary: parseModelRef(
    "OPENCLAW_MODEL_FAST",
    env("OPENCLAW_MODEL_FAST", "openai/gpt-6.2-sol"),
  ),
  fallbacks: parseModelChain(
    "OPENCLAW_MODEL_FAST_FALLBACK",
    env("OPENCLAW_MODEL_FAST_FALLBACK", "openai/gpt-5.6-terra,openai/gpt-5.5"),
  ),
};

const allModels = unique([
  strong.primary,
  ...strong.fallbacks,
  balanced.primary,
  ...balanced.fallbacks,
  fast.primary,
  ...fast.fallbacks,
]);
const modelSettings = Object.fromEntries(
  allModels.map((model) => [
    model,
    {
      // Keep OpenAI lanes on the built-in tools policy and API-key Responses route.
      ...(model.startsWith("openai/") ? { agentRuntime: { id: "openclaw" } } : {}),
      ...(model === fast.primary ? { params: { thinking: "low" } } : {}),
    },
  ]),
);
const workspace = path.join(openClawDir, "workspace-sajtagenten");

// Preserve the gateway's previous minimal tool set across OpenClaw releases.
// Version 2026.10.34 also includes gateway administration and presence in minimal.
const chatTools = {
  profile: "minimal",
  allow: ["session_status"],
  deny: ["gateway", "presence"],
};

function agent({ id, model, thinkingDefault }) {
  return {
    name: id,
    workspace,
    agentDir: path.join(openClawDir, "agents", id, "agent"),
    model,
    thinkingDefault,
    skills: [],
    tools: chatTools,
  };
}

const config = {
  gateway: {
    mode: "local",
    bind: env("RENDER") ? "loopback" : env("OPENCLAW_GATEWAY_BIND", "lan"),
    ...(env("RENDER") ? {
      port: Number(env("SAJTAGENT_INTERNAL_PORT", "18789")),
      trustedProxies: ["127.0.0.1"],
    } : {}),
    auth: {
      mode: "token",
      token: env("OPENCLAW_GATEWAY_TOKEN"),
      rateLimit: {
        maxAttempts: 10,
        windowMs: 60_000,
        lockoutMs: 300_000,
        exemptLoopback: true,
      },
    },
    controlUi: {
      enabled: true,
      allowedOrigins,
    },
    http: {
      endpoints: {
        chatCompletions: { enabled: true },
      },
    },
  },
  tools: chatTools,
  agents: {
    ownership: "explicit",
    defaults: {
      workspace,
      skipBootstrap: true,
      skills: [],
      heartbeat: { agentId: "sajtagenten", every: env("OPENCLAW_HEARTBEAT_EVERY", "0m") },
      systemAgent: { agentId: "sajtagenten" },
      model: strong,
      utilityModel: fast.primary,
      models: modelSettings,
    },
    entries: {
      sajtagenten: agent({
        id: "sajtagenten",
        model: strong,
        thinkingDefault: "high",
      }),
      "sajtagenten-balanced": agent({
        id: "sajtagenten-balanced",
        model: balanced,
        thinkingDefault: "medium",
      }),
      "sajtagenten-fast": agent({
        id: "sajtagenten-fast",
        model: fast,
        thinkingDefault: "low",
      }),
    },
  },
  session: {
    maintenance: {
      mode: "enforce",
      pruneAfter: "14d",
      maxEntries: 500,
      resetArchiveRetention: "7d",
      maxDiskBytes: "512mb",
      highWaterBytes: "400mb",
    },
  },
};

writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
chmodSync(configFile, 0o600);

process.stdout.write(
  `[entrypoint] Config written — agents=sajtagenten,sajtagenten-balanced,sajtagenten-fast, ` +
    `models=${strong.primary}|${balanced.primary}|${fast.primary}, ` +
    `heartbeat=${config.agents.defaults.heartbeat.every}\n`,
);
