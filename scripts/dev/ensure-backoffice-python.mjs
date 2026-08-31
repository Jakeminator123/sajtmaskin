#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { managedVenvPython, resolvePython } from "./python-runtime.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIREMENTS_PATH = resolve(REPO_ROOT, "requirements.backoffice.txt");
const IMPORT_PROBE = "import streamlit, pandas, jsonschema, dotenv";

export function requirementsFingerprint(content) {
  return createHash("sha256").update(content).digest("hex");
}

function run(interpreter, args, { inherit = true } = {}) {
  return spawnSync(interpreter.command, [...interpreter.args, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function importsAvailable(interpreter) {
  return run(interpreter, ["-c", IMPORT_PROBE], { inherit: false }).status === 0;
}

function stop(message) {
  console.error(`[python-env] STOPP: ${message}`);
  process.exitCode = 1;
}

function main() {
  const forced = process.env.SAJTMASKIN_PYTHON?.trim();
  const isCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  if (forced || isCi) {
    const interpreter = resolvePython({ root: REPO_ROOT, forced, includeManaged: !isCi });
    if (!interpreter) return stop("Python 3 saknas eller SAJTMASKIN_PYTHON är ogiltig.");
    if (importsAvailable(interpreter)) {
      console.log(`[python-env] OK — deklarerade Backoffice-beroenden finns.`);
      return;
    }
    if (isCi) {
      return stop(
        "CI saknar requirements.backoffice.txt; kontrollera workflowets pip-installation.",
      );
    }
    const install = run(interpreter, [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "-r",
      REQUIREMENTS_PATH,
    ]);
    if (install.status !== 0 || !importsAvailable(interpreter)) {
      return stop("kunde inte installera Backoffice-beroenden i SAJTMASKIN_PYTHON.");
    }
    console.log("[python-env] OK — Backoffice-beroenden installerade.");
    return;
  }

  const venvPython = managedVenvPython(REPO_ROOT);
  if (!existsSync(venvPython)) {
    const systemPython = resolvePython({
      root: REPO_ROOT,
      forced: "",
      includeManaged: false,
    });
    if (!systemPython) return stop("Python 3 saknas; installera Python 3 och försök igen.");
    console.log("[python-env] Skapar .venv för Backoffice…");
    const created = run(systemPython, ["-m", "venv", resolve(REPO_ROOT, ".venv")]);
    if (created.status !== 0 || !existsSync(venvPython)) {
      return stop("kunde inte skapa .venv; installera Python-komponenten venv/ensurepip.");
    }
  }

  const interpreter = { command: venvPython, args: [] };
  const fingerprint = requirementsFingerprint(readFileSync(REQUIREMENTS_PATH, "utf8"));
  const stampPath = resolve(REPO_ROOT, ".venv", ".sajtmaskin-backoffice-requirements.sha256");
  const stamped = existsSync(stampPath) ? readFileSync(stampPath, "utf8").trim() : "";
  if (stamped === fingerprint && importsAvailable(interpreter)) {
    console.log("[python-env] OK — .venv är aktuell.");
    return;
  }

  console.log("[python-env] Installerar requirements.backoffice.txt i .venv…");
  const installed = run(interpreter, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "-r",
    REQUIREMENTS_PATH,
  ]);
  if (installed.status !== 0 || !importsAvailable(interpreter)) {
    return stop("pip-installationen misslyckades; se felet ovan.");
  }
  writeFileSync(stampPath, `${fingerprint}\n`, "utf8");
  console.log("[python-env] OK — .venv är installerad och verifierad.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
