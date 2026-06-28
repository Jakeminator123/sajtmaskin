#!/usr/bin/env node
/**
 * OpenClaw debug-mode bug-hunt runner (Mode B — owner autopilot).
 *
 * Thin CLI that drives the gated server route `POST /api/openclaw/debug/run`
 * one scenario at a time. The route runs the real generation/repair pipeline
 * and persists `oc_debug_findings`; this script provides the unbounded outer
 * loop (no serverless total-timeout) and a Ctrl+C kill-switch.
 *
 * Requirements:
 *   - The target app has OC_DEBUG enabled (and OC_DEBUG_ALLOW_PROD if prod).
 *   - You pass an authenticated owner session so generated chats belong to the
 *     owner / a dedicated debug tenant (never run against real user tenants).
 *
 * Usage (PowerShell):
 *   node scripts/openclaw/bug-hunt.mjs --base-url http://localhost:3000 --cookie "<session-cookie>"
 *   node scripts/openclaw/bug-hunt.mjs --scenario jakobs-biljard-forum
 *   node scripts/openclaw/bug-hunt.mjs --all          # send every scenario in one call
 *
 * Env fallbacks: OC_DEBUG_BASE_URL, OC_DEBUG_COOKIE, OC_DEBUG_AUTH (bearer).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function loadScenarios() {
  const path = join(process.cwd(), "data", "openclaw", "debug-scenarios.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.scenarios)) {
    throw new Error("debug-scenarios.json missing a `scenarios` array");
  }
  return parsed.scenarios;
}

let stopRequested = false;
process.on("SIGINT", () => {
  if (stopRequested) process.exit(130);
  stopRequested = true;
  console.log("\n[bug-hunt] Stop requested — finishing current scenario then exiting…");
});

async function postRun({ baseUrl, headers, runId, scenario, scenarios }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/openclaw/debug/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(scenarios ? { runId, scenarios } : { runId, scenario }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, error: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` };
  }
  return { status: res.status, json };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args["base-url"] || process.env.OC_DEBUG_BASE_URL || "http://localhost:3000";
  const cookie = args.cookie || process.env.OC_DEBUG_COOKIE || "";
  const bearer = args.auth || process.env.OC_DEBUG_AUTH || "";

  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (bearer) headers.authorization = bearer.startsWith("Bearer ") ? bearer : `Bearer ${bearer}`;

  if (!headers.cookie && !headers.authorization) {
    console.error(
      "[bug-hunt] No owner auth provided. Pass --cookie \"<session>\" or --auth <bearer> " +
        "(or set OC_DEBUG_COOKIE / OC_DEBUG_AUTH).",
    );
    process.exit(1);
  }

  const allScenarios = await loadScenarios();
  const selected = args.scenario
    ? allScenarios.filter((s) => s.id === args.scenario)
    : allScenarios;

  if (selected.length === 0) {
    console.error(`[bug-hunt] No scenario matched "${args.scenario}".`);
    process.exit(1);
  }

  const runId = args["run-id"] || `oc-debug-${randomUUID()}`;
  console.log(`[bug-hunt] runId=${runId} baseUrl=${baseUrl} scenarios=${selected.length}`);

  const summaries = [];

  if (args.all) {
    // Single call with every scenario — simplest, but bounded by one serverless
    // invocation's budget. Prefer the per-scenario loop for long runs.
    const { status, json } = await postRun({ baseUrl, headers, runId, scenarios: selected });
    console.log(`[bug-hunt] all → HTTP ${status}`, json);
    summaries.push(json);
  } else {
    for (const scenario of selected) {
      if (stopRequested) {
        console.log("[bug-hunt] Stopped before scenario:", scenario.id);
        break;
      }
      console.log(`[bug-hunt] → scenario ${scenario.id} (${scenario.label ?? ""})`);
      const { status, json } = await postRun({ baseUrl, headers, runId, scenario });
      console.log(
        `[bug-hunt]   ${scenario.id} → HTTP ${status}` +
          (json && typeof json === "object"
            ? ` findings=${json.findingsWritten ?? "?"} build/prompts=${json.promptsUsed ?? "?"} stop=${json.stopReason ?? json.error ?? "?"}`
            : ""),
      );
      summaries.push({ scenario: scenario.id, status, ...json });
    }
  }

  const totalFindings = summaries.reduce(
    (sum, s) => sum + (typeof s.findingsWritten === "number" ? s.findingsWritten : 0),
    0,
  );
  console.log(`[bug-hunt] done. runId=${runId} totalFindings≈${totalFindings}`);
  console.log("[bug-hunt] Inspect findings in oc_debug_findings (run_id) and logs/bug-register.jsonl.");
}

main().catch((err) => {
  console.error("[bug-hunt] fatal:", err);
  process.exit(1);
});
