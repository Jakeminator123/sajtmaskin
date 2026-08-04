#!/usr/bin/env node
/**
 * Blocks `git worktree remove --force`.
 *
 * That command deletes the worktree directory recursively and FOLLOWS the
 * `node_modules` junction that agent worktrees use, emptying the main
 * checkout's real `node_modules`. It has happened twice in this repo
 * (2026-07-27 and 2026-08-01) and both times surfaced much later as an
 * unrelated-looking `ERR_MODULE_NOT_FOUND`, which reads like a broken repo
 * rather than a cleanup that went wrong.
 *
 * `scripts/cursor/worktree.mjs` already implements the safe order (detach the
 * links first, then remove), but nothing stopped anyone from reaching past it
 * to raw git. This hook is that stop.
 *
 * Two Windows-specific rules this file follows on purpose:
 *   - never call `process.exit()` after writing, because stdout to a pipe is
 *     async on Windows and exiting can discard the response before Cursor
 *     reads it — an empty response reads as a crashed hook;
 *   - never throw. Any unexpected input resolves to `allow`, so a bug here can
 *     only fail open, never wedge the user's shell.
 */
import { readFileSync } from "node:fs";

/**
 * Split a shell line into independently executed parts.
 *
 * Judging the whole string at once is bypassable: `npm run worktree:remove --
 * ../a; git worktree remove ../b --force` mentions the sanctioned wrapper, so a
 * whole-string allowlist would pass it while the raw delete still runs.
 */
function shellSegments(command) {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** True for a segment that invokes git's own worktree removal, not the wrapper. */
function isRawWorktreeRemove(segment) {
  // Strip quoted strings first. A command that merely *names* the phrase — a
  // commit message, a grep pattern, an echo (`git commit -m "block raw git
  // worktree remove"`) — must not trip the guard; only a real invocation should.
  const unquoted = segment.replace(/"[^"]*"|'[^']*'/g, " ");
  if (/worktree\.mjs|worktree:remove|kedja-clean|kedja:clean/.test(unquoted)) return false;
  // The command actually run must be `git` (after optional leading VAR=val
  // assignments), with `worktree remove` as adjacent subcommands. Anchoring on
  // the command keeps `echo`/`grep`/`git commit -m` that only mention the phrase
  // from matching, while every real `git [global-opts] worktree remove` still does.
  const invocation = unquoted.trim().replace(/^(?:\w+=\S*\s+)*/, "");
  return /^git\b[^\n]*\bworktree\s+remove\b/.test(invocation);
}

function decide(command) {
  const offending = shellSegments(command).find(isRawWorktreeRemove);
  if (!offending) {
    return { permission: "allow" };
  }

  // Both variants are denied, not just the forced one. Git refuses to remove a
  // worktree that is dirty or has untracked files — but a junctioned
  // `node_modules` is *ignored*, not untracked, so `git status --porcelain`
  // (what that check reads, see `parseDirtyEntries` in worktree.mjs) reports the
  // worktree as clean. Plain `git worktree remove` therefore proceeds and
  // follows the junction exactly like `--force` does. The wrapper is the only
  // safe path in both cases.
  const forced = /(?:^|\s)(?:--force|-f)(?:\s|$)/.test(offending);
  const variant = forced ? "`git worktree remove --force`" : "`git worktree remove`";

  return {
    permission: "deny",
    user_message:
      `Blockerat: rå ${variant} följer node_modules-junctionen och tömmer ` +
      "huvudcheckoutens riktiga `node_modules`. Det har hänt två gånger i det här repot.\n\n" +
      "Att utelämna `--force` hjälper inte: git vägrar bara när worktreet är smutsigt eller har " +
      "**ospårade** filer, och en junctionad `node_modules` är *ignorerad* — alltså osynlig för " +
      "den kontrollen.\n\n" +
      "Använd i stället:\n\n" +
      "    npm run worktree:remove -- <sökväg> [--force]\n\n" +
      "Den kopplar loss länkarna först och vägrar dessutom röra huvudcheckouten.",
    agent_message:
      `Denied: raw ${variant} follows the node_modules junction and empties the main checkout's ` +
      "node_modules. Dropping --force does not help: git only refuses on dirty or UNTRACKED " +
      "entries, and a junctioned node_modules is IGNORED, so the worktree reads as clean. Use " +
      "`npm run worktree:remove -- <path> [--force]` instead — it detaches links first and " +
      "refuses to touch the main checkout. Do not work around this by deleting the directory " +
      "with another command.",
  };
}

let response = { permission: "allow" };
try {
  const raw = readFileSync(0, "utf8").trim();
  const input = raw ? JSON.parse(raw) : {};
  response = decide(String(input.command ?? ""));
} catch {
  response = { permission: "allow" };
}

process.stdout.write(`${JSON.stringify(response)}\n`);
