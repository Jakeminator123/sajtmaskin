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

function decide(command) {
  if (!/\bgit\b[\s\S]*\bworktree\b[\s\S]*\bremove\b/.test(command)) {
    return { permission: "allow" };
  }

  // The wrapper is the sanctioned path even though it shells out to git itself.
  if (/worktree\.mjs|worktree:remove|kedja-clean|kedja:clean/.test(command)) {
    return { permission: "allow" };
  }

  if (/(?:^|\s)(?:--force|-f)(?:\s|$)/.test(command)) {
    return {
      permission: "deny",
      user_message:
        "Blockerat: rå `git worktree remove --force` följer node_modules-junctionen och tömmer " +
        "huvudcheckoutens riktiga `node_modules`. Det har hänt två gånger i det här repot.\n\n" +
        "Använd i stället:\n\n" +
        "    npm run worktree:remove -- <sökväg> --force\n\n" +
        "Den kopplar loss länkarna först och vägrar dessutom röra huvudcheckouten.",
      agent_message:
        "Denied: raw `git worktree remove --force` follows the node_modules junction and empties " +
        "the main checkout's node_modules. Use `npm run worktree:remove -- <path> --force` instead — " +
        "it detaches links first and refuses to touch the main checkout. Do not work around this by " +
        "deleting the directory with another command.",
    };
  }

  return {
    permission: "ask",
    user_message:
      "Det här är rå `git worktree remove`. Den känner inte till node_modules-junctionen.\n\n" +
      "Säkrare: `npm run worktree:remove -- <sökväg>`. Godkänn bara om du vet att worktreet saknar länkar.",
    agent_message:
      "Raw `git worktree remove` is junction-unaware. Prefer `npm run worktree:remove -- <path>`.",
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
