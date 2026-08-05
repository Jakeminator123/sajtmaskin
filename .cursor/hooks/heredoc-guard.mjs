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

/** `<<WORD`, `<< 'WORD'`, `<<-"WORD"` — the delimiter form, not a bare `<<`. */
const HEREDOC_RE = /<<-?[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;

/**
 * Commands whose whole job is to look for a literal string, so a `<<EOF` in
 * their arguments is a search pattern rather than a heredoc. Checked PER
 * SEGMENT: against the whole command it would be a bypass, since
 * `rg .; git commit -m "$(cat <<'EOF' … )"` mentions `rg` somewhere.
 */
const SEARCH_TOOLS = /(?:^|[\s;|(])(?:Select-String|rg|grep|findstr|ack|ag)(?:\.exe)?(?:$|[\s;|])/i;

/**
 * Commands that actually consume a heredoc body. Quote-stripping (the trick
 * `worktree-force-guard.mjs` uses to ignore mere mentions) is unavailable here,
 * because the real offender lives INSIDE quotes: `git commit -m "$(cat <<'EOF'`.
 */
const HEREDOC_CONSUMERS = /\b(?:cat|tee|read|bash|sh|zsh|ssh|dd|psql|sqlite3)\b/i;

/**
 * Split into independently executed parts. Newline counts as a separator, so a
 * heredoc's opening line becomes its own segment and its body does not leak
 * into the judgement.
 */
function shellSegments(command) {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * True when this segment opens a real heredoc rather than merely containing the
 * characters. Two accepted shapes:
 *   - the delimiter ends the segment (`… -m "$(cat <<'EOF'` + newline), which is
 *     what every real heredoc opener looks like;
 *   - the segment also names a command that reads one (`cat <<EOF > out.txt`).
 * Anything else is treated as literal text, so `git commit -m "förklara
 * <<EOF-syntax"` and `git log -S"<<EOF"` run untouched. The residual is a
 * heredoc opener written mid-segment by a command not on the consumer list;
 * that fails open, and pwsh's own parse error is the backstop.
 */
function heredocOpener(segment) {
  const match = HEREDOC_RE.exec(segment);
  if (!match) return null;
  if (SEARCH_TOOLS.test(segment)) return null;

  const endsSegment = match.index + match[0].length === segment.length;
  if (!endsSegment && !HEREDOC_CONSUMERS.test(segment)) return null;

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

process.stdout.write(`${JSON.stringify(response)}\n`);
