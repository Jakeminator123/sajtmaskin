#!/usr/bin/env node
/**
 * Delad, självrensande inkorg för agenter som jobbar i samma repo.
 *
 *   npm run inbox                 läs (en gång vid sessionsstart)
 *   npm run inbox -- "meddelande" skriv en rad
 *
 * Filen ligger i huvudcheckoutens `.cursor/inbox.md` (gitignorerad) och nås
 * från alla worktrees via git-common-dir. Varje läsning och skrivning rensar:
 * högst MAX_MESSAGES rader, inget äldre än MAX_AGE_DAYS, varje rad kapad till
 * MAX_CHARS.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_MESSAGES = 20;
export const MAX_AGE_DAYS = 3;
export const MAX_CHARS = 280;

const HEADER = [
  "# Agentinkorg",
  "",
  `Skrivs med \`npm run inbox -- "…"\`. Rensas automatiskt: max ${MAX_MESSAGES} rader, max ${MAX_AGE_DAYS} dagar.`,
  "Skriv bara när du lämnar något som rör andra: huvudcheckouten på annan branch än preview,",
  "opushat arbete eller en yta du håller på med. En rad, ingen logg.",
  "",
];

const LINE_RE = /^- (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z) /u;

/** @typedef {{ at: number, line: string }} InboxMessage */

const stampOf = (ms) => `${new Date(ms).toISOString().slice(0, 16)}Z`;
const parseStamp = (stamp) => Date.parse(stamp.replace("Z", ":00Z"));

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  }).trim();
}

export function inboxPath(cwd = process.cwd()) {
  const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  return join(dirname(resolve(commonDir)), ".cursor", "inbox.md");
}

/** @param {string} text @returns {InboxMessage[]} */
export function parseMessages(text) {
  /** @type {InboxMessage[]} */
  const messages = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = LINE_RE.exec(line);
    const at = match ? parseStamp(match[1]) : Number.NaN;
    if (Number.isFinite(at)) messages.push({ at, line });
  }
  return messages;
}

/** @param {InboxMessage[]} messages @param {number} [now] @returns {InboxMessage[]} */
export function prune(messages, now = Date.now()) {
  const oldest = now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return messages.filter((message) => message.at >= oldest).slice(-MAX_MESSAGES);
}

/** @param {{ text: string, origin: string, now?: number }} input @returns {InboxMessage} */
export function formatMessage({ text, origin, now = Date.now() }) {
  const stamp = stampOf(now);
  const flat = String(text).replace(/\s+/gu, " ").trim();
  const body = flat.length > MAX_CHARS ? `${flat.slice(0, MAX_CHARS - 1)}…` : flat;
  return { at: parseStamp(stamp), line: `- ${stamp} · ${origin} · ${body}` };
}

/** @param {InboxMessage[]} messages */
export function render(messages) {
  return [...HEADER, ...messages.map((message) => message.line), ""].join("\n");
}

function originOf(cwd) {
  const top = basename(git(["rev-parse", "--show-toplevel"], cwd));
  let branch = "";
  try {
    branch = git(["branch", "--show-current"], cwd);
  } catch {
    // detached HEAD or unreadable branch: the checkout name still identifies the writer
  }
  return `${top}@${branch || "detached"}`;
}

/** @param {{ args?: string[], cwd?: string, now?: number }} [options] */
export function runInbox({ args = [], cwd = process.cwd(), now = Date.now() } = {}) {
  const path = inboxPath(cwd);
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  let messages = prune(parseMessages(before), now);
  const text = args.join(" ").trim();
  if (text)
    messages = prune([...messages, formatMessage({ text, origin: originOf(cwd), now })], now);
  const after = render(messages);
  if (after !== before && (text || before)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, after, "utf8");
  }
  return { path, messages, posted: Boolean(text) };
}

function main() {
  const { messages, posted } = runInbox({ args: process.argv.slice(2) });
  if (posted) {
    console.log(`[inbox] Skrivet. ${messages.length} rad(er) i inkorgen.`);
    return;
  }
  if (messages.length === 0) {
    console.log("[inbox] Tom.");
    return;
  }
  console.log(HEADER.slice(2, 5).join("\n"));
  for (const message of messages) console.log(message.line);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
