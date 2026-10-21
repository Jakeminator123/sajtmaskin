#!/usr/bin/env node
/**
 * Claude Code PreToolUse-adapter för repots Cursor-skalgrindar.
 *
 * Cursor kör `scripts/workflow/commit-guard.mjs` och
 * `.cursor/hooks/worktree-force-guard.mjs` som `beforeShellExecution`
 * (fail-closed). Claude Code har ett annat hookformat, så utan den här filen
 * når grindarna aldrig Claude. Beslutslogiken ägs fortfarande av de två
 * skripten — här översätts bara in- och utdata.
 *
 * heredoc-guard tas medvetet inte med: Claudes Bash-verktyg är Git Bash där
 * heredoc är giltigt, och PowerShell-verktygets egna instruktioner förbjuder
 * redan heredoc. Kvar blir commit-guardens deny av `$(...)` i skrivande git.
 *
 * Fail-closed som i Cursor: kraschar en grind på ett git-kommando nekas det.
 * Ett `allow` från grinden ger ingen auto-approve — Claudes vanliga
 * behörighetsflöde avgör då som vanligt.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Samma förfilter som matcherna i .cursor/hooks.json.
const RELEVANT_RE = /\bgit\b|\bcommit\b|\bworktree\b/u;

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function deny(reason) {
  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
}

function messageOf(verdict) {
  return verdict.agent_message || verdict.user_message || "Blockerat av repots skalgrind.";
}

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // Ingen tolkbar input: inget att bedöma.
  }
  const command = input?.tool_input?.command;
  if (typeof command !== "string" || !RELEVANT_RE.test(command)) return;

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : root;
  const load = (rel) => import(pathToFileURL(resolve(root, rel)).href);

  try {
    const { decide } = await load(".cursor/hooks/worktree-force-guard.mjs");
    const worktree = decide(command);
    if (worktree?.permission === "deny") return deny(messageOf(worktree));

    const { decideCommitCommand } = await load("scripts/workflow/commit-guard.mjs");
    const commit = decideCommitCommand(command, { cwd });
    if (commit?.permission === "deny") return deny(messageOf(commit));
    if (commit?.agent_message) {
      emit({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: commit.agent_message,
        },
      });
    }
  } catch (error) {
    deny(
      `Skalgrinden kunde inte köras (${error instanceof Error ? error.message : "okänt fel"}). ` +
        "Kontrollera git-läget och kör npm run verify:pr -- --plan.",
    );
  }
}

await main();
