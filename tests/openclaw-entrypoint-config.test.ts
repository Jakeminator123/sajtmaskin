import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The OpenClaw gateway boots from `infra/openclaw/docker-entrypoint.sh`, which
 * generates `openclaw.json` from environment variables. A parsing or
 * JSON-generation regression there takes the gateway offline on the next Render
 * deploy, with no TypeScript or vitest coverage to catch it — so this runs the
 * real script in a sandbox and validates the emitted config.
 *
 * `OPENCLAW_MODEL_FALLBACK` is the interesting part: it accepts a
 * comma-separated chain so the steps can span different provider quotas.
 */

const REPO_ROOT = path.resolve(__dirname, "..");
const ENTRYPOINT = path.join(REPO_ROOT, "infra", "openclaw", "docker-entrypoint.sh");

/** Git-for-Windows `sh` needs forward slashes; a no-op on POSIX. */
function toShellPath(value: string): string {
  return value.replace(/\\/g, "/");
}

interface PosixShell {
  /** Absolute path to `sh`. */
  path: string;
  /** Directories prepended to PATH so `tr` and `sed` resolve inside the shell. */
  toolDirs: string[];
}

/**
 * A POSIX shell that can also reach the coreutils the entrypoint calls. Finding
 * `sh.exe` is not enough on Windows: Git ships it separately from `tr`/`sed`, so
 * a shell found without its `usr/bin` on PATH fails on the entrypoint's first
 * `tr` and reports it as a config-generation failure. Probing for the utilities
 * too means the suite either runs truthfully or skips, never fails on setup.
 */
function resolveShell(): PosixShell | null {
  const gitUsrBin = "C:\\Program Files\\Git\\usr\\bin";
  const candidates: PosixShell[] =
    process.platform === "win32"
      ? [
          { path: `${gitUsrBin}\\sh.exe`, toolDirs: [gitUsrBin] },
          { path: "C:\\Program Files\\Git\\bin\\sh.exe", toolDirs: [gitUsrBin] },
        ]
      : [{ path: "/bin/sh", toolDirs: [] }];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate.path, ["-c", "command -v tr >/dev/null && command -v sed >/dev/null"], {
        env: { NODE_ENV: process.env.NODE_ENV ?? "test", PATH: buildShellPath(candidate) },
        stdio: "ignore",
      });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function buildShellPath(target: PosixShell): string {
  return [...target.toolDirs, process.env.PATH ?? ""].join(path.delimiter);
}

const shell = resolveShell();
const sandboxes: string[] = [];

afterAll(() => {
  for (const dir of sandboxes) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface GeneratedConfig {
  agents: {
    defaults: {
      heartbeat: { every: string };
      model: { primary: string; fallbacks: string[] };
    };
    list: Array<{ id: string; model: { primary: string; fallbacks: string[] } }>;
  };
  gateway: {
    mode: string;
    auth: {
      mode: string;
      rateLimit: {
        maxAttempts: number;
        windowMs: number;
        lockoutMs: number;
        exemptLoopback: boolean;
      };
    };
    http: { endpoints: { chatCompletions: { enabled: boolean } } };
  };
}

/**
 * Run the entrypoint with a stubbed `openclaw` binary and a sandboxed home/seed
 * directory, then parse the config it wrote.
 */
function bootAndReadConfig(env: Record<string, string>): GeneratedConfig {
  const sandbox = mkdtempSync(path.join(tmpdir(), "openclaw-entrypoint-"));
  sandboxes.push(sandbox);

  const home = path.join(sandbox, "home");
  const seed = path.join(sandbox, "seed");
  const binDir = path.join(sandbox, "bin");
  mkdirSync(path.join(seed, "workspace"), { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(path.join(seed, "IDENTITY.md"), "# stub identity\n");

  // The entrypoint calls `openclaw --version` and ends with `exec openclaw
  // gateway ...`; a stub keeps it from needing the real package.
  const stub = path.join(binDir, "openclaw");
  writeFileSync(stub, '#!/bin/sh\necho "openclaw-stub 0.0.0"\nexit 0\n');
  chmodSync(stub, 0o755);

  // Deliberately NOT spreading process.env: a developer with OPENCLAW_MODEL_*
  // set locally would otherwise change what the default case asserts.
  execFileSync(shell!.path, [toShellPath(ENTRYPOINT)], {
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "test",
      PATH: `${binDir}${path.delimiter}${buildShellPath(shell!)}`,
      SAJTAGENT_HOME_DIR: toShellPath(home),
      SAJTAGENT_SEED_DIR: toShellPath(seed),
      OPENCLAW_GATEWAY_TOKEN: "test-token",
      ...env,
    },
    stdio: "pipe",
  });

  return JSON.parse(readFileSync(path.join(home, "openclaw.json"), "utf8")) as GeneratedConfig;
}

// Each case boots the real entrypoint in `sh`; on Windows a single boot can
// take 3–6 s, so the default 5 s per-test timeout is too tight.
describe.skipIf(!shell)("docker-entrypoint.sh config generation", { timeout: 30_000 }, () => {
  it("emits the documented defaults when no model env is set", () => {
    const config = bootAndReadConfig({});

    expect(config.agents.defaults.model.primary).toBe("openai/gpt-5.5");
    expect(config.agents.defaults.model.fallbacks).toEqual(["openai/gpt-5.4"]);
    // The proxy targets this agent id by name; renaming it breaks every chat.
    expect(config.agents.list[0].id).toBe("sajtagenten");
    expect(config.gateway.http.endpoints.chatCompletions.enabled).toBe(true);
  });

  it("disables the heartbeat by default and honours an override", () => {
    // Default 30m heartbeats woke gpt-5.5 with full agent context every half
    // hour on an instance with no delivery channel — pure credit burn
    // (2026-08-17). "0m" must survive every redeploy since this config is
    // regenerated on boot.
    expect(bootAndReadConfig({}).agents.defaults.heartbeat).toEqual({ every: "0m" });
    expect(
      bootAndReadConfig({ OPENCLAW_HEARTBEAT_EVERY: "45m" }).agents.defaults.heartbeat,
    ).toEqual({ every: "45m" });
  });

  it("splits a comma-separated fallback chain across providers", () => {
    const config = bootAndReadConfig({
      OPENCLAW_MODEL_FALLBACK: "openai/gpt-5.4,juicefactory/qwen3-vl",
    });

    expect(config.agents.defaults.model.fallbacks).toEqual([
      "openai/gpt-5.4",
      "juicefactory/qwen3-vl",
    ]);
    expect(config.agents.list[0].model.fallbacks).toEqual([
      "openai/gpt-5.4",
      "juicefactory/qwen3-vl",
    ]);
  });

  it("trims whitespace and drops blanks and duplicates", () => {
    const config = bootAndReadConfig({
      OPENCLAW_MODEL_FALLBACK: " openai/gpt-5.4 ,, openai/gpt-5.4 ,  juicefactory/qwen3-vl  ",
    });

    expect(config.agents.defaults.model.fallbacks).toEqual([
      "openai/gpt-5.4",
      "juicefactory/qwen3-vl",
    ]);
  });

  it("honours a primary override", () => {
    const config = bootAndReadConfig({
      OPENCLAW_MODEL_PRIMARY: "openai/gpt-5.4-mini",
      OPENCLAW_MODEL_FALLBACK: "juicefactory/qwen3-vl",
    });

    expect(config.agents.defaults.model.primary).toBe("openai/gpt-5.4-mini");
    expect(config.agents.list[0].model.primary).toBe("openai/gpt-5.4-mini");
  });

  it("keeps the config parseable when every fallback entry is blank", () => {
    const config = bootAndReadConfig({ OPENCLAW_MODEL_FALLBACK: " , , " });

    expect(config.agents.defaults.model.fallbacks).toEqual([]);
  });

  it("writes the failed-auth rate limit explicitly", () => {
    // Implicit defaults are not enough: `openclaw security audit` reports a
    // non-loopback gateway without the explicit key as a finding on every run.
    const config = bootAndReadConfig({});

    expect(config.gateway.auth.rateLimit).toEqual({
      maxAttempts: 10,
      windowMs: 60000,
      lockoutMs: 300000,
      exemptLoopback: true,
    });
  });

  it("builds allowedOrigins from env without hardcoding a hostname", () => {
    const config = bootAndReadConfig({
      SAJTAGENT_TARGET_SITE_URL: "https://example.test",
      SAJTAGENT_ALLOWED_ORIGINS: "https://staging.example.test,https://example.test",
    }) as GeneratedConfig & {
      gateway: { controlUi: { allowedOrigins: string[] } };
    };

    expect(config.gateway.controlUi.allowedOrigins).toEqual([
      "http://localhost:3000",
      "https://example.test",
      "https://staging.example.test",
    ]);
  });
});
