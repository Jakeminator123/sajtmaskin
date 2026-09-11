#!/usr/bin/env node
/**
 * Denies an agent Read of `.cursor/mcp.json` ONLY when the file actually
 * contains something shaped like a credential.
 *
 * Background (ägarbeslut 2026-09-11): the file used to be `.cursorignore`d as
 * a blanket blindfold, which made MCP troubleshooting guesswork — an agent could
 * not see which servers even existed. The owner chose readability. The residual
 * risk is a token that later lands in `headers`, which a readable file would
 * pull straight into context. `npm run doctor` warns about that, but a warning
 * is not a gate. This hook is the gate: `beforeReadFile` sees the exact content
 * about to enter context and refuses it when `checkMcpSecrets` flags a field.
 *
 * The verdict is content-based, so the file stays readable in its normal,
 * secret-free state and only becomes opaque when there is something to hide.
 * The message names the offending FIELD PATH, never the value.
 *
 * Runs on every agent Read (matcher `Read`), so two rules keep it harmless:
 *   - every path that is not `.cursor/mcp.json` is allowed immediately;
 *   - never throw — anything unexpected on an unrelated file resolves to
 *     allow. `hooks.json` keeps `failClosed: false` for the same reason: a bug
 *     here must not wedge every file read in the editor.
 *
 * For `.cursor/mcp.json` itself, unparseable content is denied: if the
 * verdict cannot be computed, the safe answer for this one file is "not now".
 *
 * Same Windows rules as the sibling hooks: `writeHookResponse` (writeSync on
 * fd 1) and no `process.exit()` afterwards.
 */
import { readFileSync } from "node:fs";

import { checkMcpSecrets } from "../../scripts/dev/doctor.mjs";
import { writeHookResponse } from "./hook-io.mjs";

const GUARDED_SUFFIX = "/.cursor/mcp.json";

export function isGuardedPath(filePath) {
  if (typeof filePath !== "string") return false;
  return filePath.replace(/\\/g, "/").toLowerCase().endsWith(GUARDED_SUFFIX);
}

export function decide(input) {
  if (!input || typeof input !== "object" || !isGuardedPath(input.file_path)) {
    return { permission: "allow" };
  }

  let servers;
  try {
    const parsed = JSON.parse(String(input.content ?? ""));
    servers = parsed?.mcpServers ?? null;
  } catch {
    return {
      permission: "deny",
      user_message:
        "Blockerat: .cursor/mcp.json gick inte att tolka som JSON, så secret-kontrollen kunde inte köras. " +
        "Rätta filen (Settings → Tools & MCP) och försök igen.",
    };
  }

  const verdict = checkMcpSecrets(servers);
  if (verdict.level !== "warn") return { permission: "allow" };

  return {
    permission: "deny",
    user_message:
      `Blockerat: .cursor/mcp.json innehåller secret-formade fält (${verdict.message.replace(/^mcp\.json har secret-formade fält: /u, "")}). ` +
      "Filen är läsbar för agenten med flit, men inte när den bär credentials — då hade en Read dragit dem in i kontexten. " +
      "Flytta auth till OAuth via Settings → Tools & MCP, eller ta bort fältet. `npm run doctor` visar samma fynd.",
  };
}

let response = { permission: "allow" };
try {
  const raw = readFileSync(0, "utf8").trim();
  response = decide(raw ? JSON.parse(raw) : null);
} catch {
  response = { permission: "allow" };
}
writeHookResponse(response);
