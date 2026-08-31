#!/usr/bin/env node
/**
 * Blocks bash heredocs (`<<EOF`, `<<'EOF'`, `<<-EOF`) in shell commands.
 *
 * PowerShell has no heredoc. A heredoc there does not fail with "unknown
 * syntax" — it fails with `Missing file specification after redirection
 * operator`, because pwsh reads `<` as redirection. That error names neither
 * the heredoc nor the fix, so it costs a full round trip to diagnose.
 *
 * Why a hook and not another rule line: `bash-och-pwsh.mdc` has said "use a
 * here-string, not `<<EOF`" from the start, and agents still emit it. The
 * trigger sits elsewhere — the generic "always pass a commit message via a
 * HEREDOC" template is bash, and it gets copied verbatim at commit time
 * without the platform table being re-read. A rule cannot beat a template that
 * is only recalled at the moment of use; a `beforeShellExecution` deny can.
 *
 * The matcher in `hooks.json` is deliberately BROADER than the decision here
 * (it fires on any `<<` + identifier). It is only a cheap pre-filter; this file
 * makes the call, and answering `allow` is a normal outcome.
 *
 * Same two Windows-specific rules as `worktree-force-guard.mjs`:
 *   - never call `process.exit()` after writing (stdout to a pipe is async on
 *     Windows; exiting can discard the response, which reads as a crashed hook);
 *   - never throw. Anything unexpected resolves to `allow`, so a bug here can
 *     only fail open, never wedge the shell.
 */
import { readFileSync } from "node:fs";

import { writeHookResponse } from "./hook-io.mjs";

/** `<<WORD`, `<< 'WORD'`, `<<-"WORD"` — the delimiter form, not a bare `<<`. */
const HEREDOC_RE = /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;

/**
 * Commands that actually consume a heredoc body, recognised only at the START
 * of a segment (optionally via a path, `…/bin/sh <<EOF`).
 *
 * Anchoring matters. Matching the consumer ANYWHERE in the segment denied
 * `git commit -m "fix deploy.sh and document <<EOF antipattern"`, because
 * `\bsh\b` also matches the `.sh` suffix in a filename. A real heredoc opener
 * always stands first in its own segment; anything after a `-m` is prose.
 */
const HEREDOC_CONSUMER_AT_START =
  /^(?:\S*[\\/])?(?:cat|tee|read|bash|sh|zsh|ssh|dd|psql|sqlite3)(?:\.exe)?(?=$|\s)/i;

/**
 * Split into independently executed parts.
 *
 * Newlines split unconditionally. A heredoc's opening line leaves a quote OPEN
 * by construction (`-m "$(cat <<'EOF'`), so quote tracking has to restart per
 * line — otherwise the whole body counts as one quoted string and the opener
 * never ends a segment.
 *
 * Within a line, `;` `|` `&` `&&` `||` separate only OUTSIDE quotes. A splitter
 * that ignored quoting carved `git commit -m "fix: rensa a; cat <<EOF …"` into
 * fake segments and denied a single valid commit. `&` is included because pwsh
 * accepts it as a separator; leaving it out was a bypass — a real heredoc after
 * `rg foo src &` was allowed while the `;` form was denied.
 */
function shellSegments(command) {
  const segments = [];
  let hereStringEnd = null;
  for (const rawLine of command.split(/\n/)) {
    let line = rawLine;
    // A here-string BODY is literal text, and pwsh closes it only on a line
    // that STARTS with the closing token — so nothing inside can open a
    // heredoc. Skipping it is what lets the deny message practise what it
    // preaches: `$msg = @'` … `cat <<EOF` … `'@` documents the antipattern and
    // must not itself be denied.
    if (hereStringEnd) {
      if (!line.startsWith(hereStringEnd)) continue;
      line = line.slice(hereStringEnd.length); // rest of the closing line is code again
      hereStringEnd = null;
    }
    let current = "";
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote) {
        current += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === ";" || ch === "|" || ch === "&") {
        if (line[i + 1] === ch) i += 1; // `&&` / `||`
        segments.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    segments.push(current);
    // `@'` / `@"` must be the last thing on their line, so this is checked
    // AFTER scanning it — the opening line itself is still ordinary code.
    const opener = /@(['"])[ \t]*$/.exec(line);
    if (opener) hereStringEnd = `${opener[1]}@`;
  }
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

/**
 * True when this segment opens a real heredoc rather than merely containing the
 * characters. Two accepted shapes:
 *   - the delimiter ends the segment (`… -m "$(cat <<'EOF'` + newline), which is
 *     what every real heredoc opener looks like;
 *   - the segment STARTS with a command that reads one (`cat <<EOF > out.txt`).
 * Anything else is literal text, so `git commit -m "förklara <<EOF-syntax"`,
 * `git log -S"<<EOF"` and `rg "<<EOF" docs` run untouched — no search-tool
 * allowlist needed, since a search tool is simply not a consumer. That
 * allowlist used to exist and was itself a bypass: it returned early on the
 * whole segment, so a genuine opener at the segment end slipped through
 * whenever a search tool appeared earlier on the line.
 *
 * The residual is a heredoc opener written mid-segment by a command not on the
 * consumer list; that fails open, and pwsh's own parse error is the backstop.
 */
function heredocOpener(segment) {
  const match = HEREDOC_RE.exec(segment);
  if (!match) return null;

  const endsSegment = match.index + match[0].length === segment.length;
  if (!endsSegment && !HEREDOC_CONSUMER_AT_START.test(segment)) return null;

  return match[2];
}

export function decide(command) {
  let token = null;
  for (const segment of shellSegments(command)) {
    token = heredocOpener(segment);
    if (token) break;
  }
  if (!token) return { permission: "allow" };

  return {
    permission: "deny",
    user_message:
      `Blockerat: \`<<${token}\` är en bash-heredoc, och den här maskinen kör PowerShell 7.\n\n` +
      "pwsh tolkar `<` som omdirigering, så felet blir `Missing file specification after " +
      "redirection operator` — ett meddelande som varken nämner heredocen eller fixen.\n\n" +
      "Använd en here-string i stället (`@'` och `'@` måste stå i kolumn 0):\n\n" +
      "    $msg = @'\n" +
      "    rad ett\n" +
      "\n" +
      "    rad tva\n" +
      "    '@\n" +
      "    git commit -m $msg\n\n" +
      "`@'...'@` är literal, `@\"...\"@` expanderar variabler.",
    agent_message:
      `Denied: \`<<${token}\` is a bash heredoc and this machine runs PowerShell 7 (see ` +
      "`.cursor/rules/bash-och-pwsh.mdc`). pwsh reads `<` as redirection, so this would fail " +
      "with `Missing file specification after redirection operator` rather than a useful error. " +
      "Use a here-string: assign `$msg = @'` … `'@` (both tokens at column 0, nothing after the " +
      "opening token) and pass `-m $msg`. Use `@'...'@` for literal text and `@\"...\"@` when you " +
      "want variable expansion. This applies to the generic 'pass the commit message via a " +
      "HEREDOC' template too — that template is bash and does not hold here. Do not work around " +
      "this by hiding the heredoc behind another command.",
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

writeHookResponse(response);
