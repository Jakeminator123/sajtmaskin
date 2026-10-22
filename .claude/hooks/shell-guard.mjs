#!/usr/bin/env node
/**
 * Claude Code PreToolUse-adapter (Bash/PowerShell) för repots Cursor-skalgrindar.
 *
 * Cursor kör `scripts/workflow/commit-guard.mjs` och
 * `.cursor/hooks/worktree-force-guard.mjs` som `beforeShellExecution`
 * (fail-closed). Claude Code har ett annat hookformat, så utan den här filen
 * når grindarna aldrig Claude. Beslutslogiken ägs fortfarande av de två
 * skripten — här översätts bara in- och utdata.
 *
 * - Deny skrivs som exitkod 2 + stderr (synkront). Claude blockerar på exit 2
 *   oavsett stdout, så ett tappat pipe-chunk kan inte bli ett tyst allow.
 * - Fail-closed: oläsbar indata eller en grind som kastar nekas.
 * - Grindarna körs på varje skalanrop, inte bara när ordet `git` syns:
 *   `$(printf g)it push --force` innehåller inget `git`. Deras billiga väg
 *   släpper vanliga kommandon utan subprocess.
 * - Ett allow ger ingen auto-approve; Claudes behörighetsflöde avgör som vanligt.
 *
 * heredoc-guard tas medvetet inte med: Claudes Bash-verktyg är Git Bash där
 * heredoc är giltigt; commit-guarden nekar ändå `$(...)` i skrivande git.
 */
import { readFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function deny(reason) {
  try {
    writeSync(2, `${reason}\n`);
  } catch {
    // stderr stängd: exitkoden bär ändå beslutet.
  }
  process.exitCode = 2;
}

function context(message) {
  try {
    writeSync(
      1,
      `${JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: message },
      })}\n`,
    );
  } catch {
    // Bara information; beslutet är redan allow.
  }
}

function messageOf(verdict) {
  return verdict.agent_message || verdict.user_message || "Blockerat av repots skalgrind.";
}

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8").replace(/^﻿/u, ""));
  } catch {
    return deny("Skalgrinden kunde inte tolka hook-indata; kommandot nekas (fail-closed).");
  }
  // Cursor importerar .claude/settings.json-hookar (Third-Party Imports, på som
  // standard) och kör dem utöver .cursor/hooks.json, som redan kör samma
  // grindar. Cursor-indata känns igen på fält som Claude aldrig skickar; miljön
  // duger inte eftersom Claude Code i Cursor ärver CURSOR_*-variabler.
  if (input?.cursor_version || input?.conversation_id) return;
  const command = input?.tool_input?.command;
  if (typeof command !== "string") {
    return deny("Skalgrinden fick inget kommando att bedöma; kommandot nekas (fail-closed).");
  }

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
    if (commit?.agent_message) context(commit.agent_message);
  } catch (error) {
    deny(
      `Skalgrinden kunde inte köras (${error instanceof Error ? error.message : "okänt fel"}). ` +
        "Kontrollera git-läget och kör npm run verify:pr -- --plan.",
    );
  }
}

await main();
