#!/usr/bin/env node
/**
 * Claude Code PreToolUse-adapter (Read) för `.cursor/hooks/mcp-secret-read-guard.mjs`.
 *
 * `.cursor/mcp.json` är medvetet läsbar (ägarbeslut 2026-09-11) så länge den
 * inte bär något secret-format; Cursor kontrollerar innehållet i
 * `beforeReadFile`. Claude skickar bara sökvägen, så adaptern läser filen själv
 * och låter samma `decide` avgöra. Alla andra sökvägar släpps direkt utan import.
 * Deny = exitkod 2 + stderr (synkront), samma skäl som i shell-guard.mjs.
 */
import { existsSync, readFileSync, writeSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const GUARDED_PATH_RE = /(?:^|[\\/])\.cursor[\\/]mcp\.json$/iu;

function deny(reason) {
  try {
    writeSync(2, `${reason}\n`);
  } catch {
    // stderr stängd: exitkoden bär ändå beslutet.
  }
  process.exitCode = 2;
}

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8").replace(/^﻿/u, ""));
  } catch {
    return; // Ingen tolkbar sökväg: inget att skydda (som Cursor-grinden, failClosed: false).
  }
  // Cursor kör sin egen mcp-secret-read-guard via .cursor/hooks.json; en
  // importerad kopia av den här hooken ska inte göra något där.
  if (input?.cursor_version || input?.conversation_id) return;
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || !GUARDED_PATH_RE.test(filePath.trim())) return;

  try {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const { decide } = await import(
      pathToFileURL(resolve(root, ".cursor/hooks/mcp-secret-read-guard.mjs")).href
    );
    const content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    const verdict = decide({ file_path: filePath, content });
    if (verdict?.permission === "deny") {
      deny(verdict.agent_message || verdict.user_message || "Blockerat: .cursor/mcp.json.");
    }
  } catch (error) {
    // Den här filen nekas hellre än släpps när kontrollen inte kan köras.
    deny(
      `Secret-kontrollen för .cursor/mcp.json kunde inte köras (${error?.message ?? "okänt fel"}).`,
    );
  }
}

await main();
