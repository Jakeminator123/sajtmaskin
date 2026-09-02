#!/usr/bin/env node
/**
 * Best-effort backoffice Python bootstrap for Cloud snapshot / JIT pods.
 *
 * `environment.json` `install` must not fail after `npm ci` just because the
 * image still lacks `pip` (old snapshots and just-in-time pods). If pip is
 * already there, installing `requirements.backoffice.dev.txt` is hard — a
 * broken pip install is a real problem.
 *
 * Usage:
 *   node scripts/dev/ensure-backoffice-python.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIREMENTS = resolve(ROOT, "requirements.backoffice.dev.txt");

/**
 * @param {{ pipAvailable: boolean, aptAvailable: boolean }} input
 * @returns {{ action: "install-requirements" } | { action: "bootstrap-apt-then-install" } | { action: "skip", reason: string }}
 */
export function planBackofficePythonBootstrap(input) {
  if (input.pipAvailable) return { action: "install-requirements" };
  if (input.aptAvailable) return { action: "bootstrap-apt-then-install" };
  return {
    action: "skip",
    reason: "python3 -m pip missing and apt-get is not available",
  };
}

function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: opts.stdio ?? "inherit",
    windowsHide: true,
    env: opts.env ?? process.env,
  });
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

function pipAvailable() {
  return commandAvailable("python3", ["-m", "pip", "--version"]);
}

function aptAvailable() {
  return commandAvailable("apt-get", ["--version"]);
}

function runApt(args) {
  const env = { ...process.env, DEBIAN_FRONTEND: "noninteractive" };
  if (run("apt-get", args, { env }).status === 0) return true;
  return run("sudo", ["-n", "apt-get", ...args], { env }).status === 0;
}

function bootstrapPip() {
  if (!runApt(["update"])) return false;
  return runApt([
    "install",
    "-y",
    "--no-install-recommends",
    "python3-pip",
    "python3-venv",
  ]);
}

function installRequirements() {
  return run("python3", [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "--user",
    "--break-system-packages",
    "-r",
    REQUIREMENTS,
  ]);
}

export function main() {
  const plan = planBackofficePythonBootstrap({
    pipAvailable: pipAvailable(),
    aptAvailable: aptAvailable(),
  });

  if (plan.action === "skip") {
    console.warn(
      `[ensure-backoffice-python] ${plan.reason}; skipping so npm ci is not rolled back`,
    );
    return 0;
  }

  if (plan.action === "bootstrap-apt-then-install") {
    console.warn(
      "[ensure-backoffice-python] python3 -m pip missing; trying apt-get python3-pip python3-venv",
    );
    if (!bootstrapPip() || !pipAvailable()) {
      console.warn(
        "[ensure-backoffice-python] pip still missing after apt-get; skipping backoffice requirements",
      );
      return 0;
    }
  }

  return installRequirements().status ?? 1;
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  process.exit(main());
}
