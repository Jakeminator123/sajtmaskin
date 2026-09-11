import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Kör hooken som Cursor kör den — som ett eget nodeanrop med JSON på stdin —
 * i stället för att importera `decide`. Det är kontraktet som gäller: en hook
 * som svarar fel, eller inte svarar alls, läses som kraschad.
 */
const HOOK = resolve(process.cwd(), ".cursor/hooks/heredoc-guard.mjs");

/**
 * The guard only denies where the shell is PowerShell, so every Windows-verdict
 * case pins the platform explicitly. Without it these assertions would flip on
 * the Linux CI runner and on the cloud agent image.
 */
function ask(
  command: string,
  platform = "win32",
  shell = "/bin/bash",
): { permission: string; agent_message?: string } {
  // `SHELL` is pinned too, so the runner's own login shell never decides the
  // verdict — a CI box with SHELL=/bin/zsh must behave like a laptop with bash.
  const stdout = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify({ command }),
    encoding: "utf8",
    env: { ...process.env, SAJTMASKIN_SHELL_PLATFORM: platform, SHELL: shell },
  });
  return JSON.parse(stdout);
}

const COMMIT_HEREDOC = ['git commit -m "$(cat <<\'EOF\'', "rubrik", "", "brodtext", "EOF", ')"'].join("\n");

describe("heredoc-guard hook", () => {
  it("denies the commit-message heredoc that pwsh cannot parse", () => {
    const verdict = ask(COMMIT_HEREDOC);
    expect(verdict.permission).toBe("deny");
    expect(verdict.agent_message).toContain("here-string");
  });

  it("points at the one commit form the other guards also allow", () => {
    // `-m $msg` was the old advice and is denied by commit-guard's shared
    // expansion check, so recommending it here made the two hooks contradict.
    const verdict = ask(COMMIT_HEREDOC);
    expect(verdict.agent_message).toContain("git commit -F");
    // Naming `-m $msg` is fine — as the antipattern. What must never come back
    // is recommending it, so require the explicit negative next to the mention.
    expect(verdict.agent_message).toContain("Do NOT use `-m $msg`");
  });

  it("allows a heredoc where the shell is not PowerShell", () => {
    // The project's hooks travel to the Linux cloud agent image, where a
    // heredoc is valid shell and denying it would block correct code.
    expect(ask(COMMIT_HEREDOC, "linux").permission).toBe("allow");
    expect(ask("cat <<EOF > out.txt\ntext\nEOF", "linux").permission).toBe("allow");
    expect(ask(COMMIT_HEREDOC, "darwin", "/bin/zsh").permission).toBe("allow");
  });

  it("still denies on Linux/mac when the shell itself is PowerShell", () => {
    // Extern granskning: nyckeln var OS, inte skal. pwsh på Linux fick en
    // heredoc släppt igenom som sedan föll i pwsh ändå. `$SHELL` avgör nu.
    expect(ask(COMMIT_HEREDOC, "linux", "/usr/bin/pwsh").permission).toBe("deny");
    expect(ask(COMMIT_HEREDOC, "darwin", "/opt/homebrew/bin/pwsh").permission).toBe("deny");
    expect(ask(COMMIT_HEREDOC, "linux", "/usr/local/bin/powershell").permission).toBe("deny");
    // …men inte ett skal som bara innehåller bokstäverna.
    expect(ask(COMMIT_HEREDOC, "linux", "/usr/bin/pwshell-compat").permission).toBe("allow");
  });

  it("denies a heredoc that is redirected mid-segment", () => {
    expect(ask("cat <<EOF > out.txt\ntext\nEOF").permission).toBe("deny");
  });

  it("denies a heredoc hidden behind a search command in an earlier segment", () => {
    // Bypass-lås: att nämna ett sökverktyg tidigare på raden fick förr hela
    // segmentet att undantas, så en riktig heredoc slank igenom.
    expect(ask(`rg foo src; ${COMMIT_HEREDOC}`).permission).toBe("deny");
  });

  it("denies a heredoc hidden behind pwsh:s `&`-separator", () => {
    // Samma bypass som ovan men med `&` i stället för `;`. Segmentdelningen
    // saknade `&`, så `;`-formen nekades medan denna släpptes igenom.
    expect(ask(`rg foo src & ${COMMIT_HEREDOC}`).permission).toBe("deny");
    expect(ask(`findstr foo src & ${COMMIT_HEREDOC}`).permission).toBe("deny");
  });

  it("allows a commit message whose quoted text contains a semicolon", () => {
    // Segmentdelningen respekterar citat. Utan det carvades meddelandet i
    // falska segment, varav ett började med `cat` och nekades.
    expect(
      ask('git commit -m "fix: rensa a; cat <<EOF namns bara som text"').permission,
    ).toBe("allow");
  });

  it("allows a commit message that names a .sh file next to the token", () => {
    // Konsumenten känns igen först i segmentet. Matchad var som helst träffade
    // `\bsh\b` även i `.sh`-suffixet och nekade ett giltigt commit-meddelande.
    expect(
      ask('git commit -m "fix deploy.sh and document <<EOF antipattern"').permission,
    ).toBe("allow");
  });

  it("still denies a path-invoked shell that reads a heredoc", () => {
    expect(ask("/usr/bin/sh <<EOF\necho hej\nEOF").permission).toBe("deny");
  });

  it("allows a here-string whose body documents the antipattern", () => {
    // Hooken rekommenderar here-strings i sin egen neka-text, så en here-string
    // som beskriver `<<EOF` måste gå igenom — annars motsäger den sig själv.
    expect(
      ask(["$msg = @'", "docs: forbjud bash-heredoc cat <<EOF", "'@", "git commit -m $msg"].join("\n"))
        .permission,
    ).toBe("allow");
    expect(
      ask(["$msg = @'", "regeln galler aven <<EOF", "'@", "git commit -m $msg"].join("\n")).permission,
    ).toBe("allow");
    expect(
      ask(['$msg = @"', "se cat <<EOF", '"@', "git commit -m $msg"].join("\n")).permission,
    ).toBe("allow");
  });

  it("still denies a real heredoc after a closed here-string", () => {
    // Motprov till ovan: kroppen hoppas över, men koden efter sluttoken gör det
    // inte — annars vore here-strings en bypass.
    expect(ask(["$x = @'", "text", "'@", COMMIT_HEREDOC].join("\n")).permission).toBe("deny");
    expect(ask(["$x = @'", "text", `'@ ; ${COMMIT_HEREDOC}`].join("\n")).permission).toBe("deny");
  });

  it("allows a commit message that only mentions the token as text", () => {
    expect(ask('git commit -m "docs: forklara <<EOF-syntax i pwsh-regeln"').permission).toBe("allow");
  });

  it("allows searching for the literal token", () => {
    expect(ask('Select-String -Pattern "<<EOF" -Path docs\\testing.md').permission).toBe("allow");
    expect(ask('rg "<<EOF" docs').permission).toBe("allow");
    expect(ask('git log -S"<<EOF"').permission).toBe("allow");
  });

  it("allows ordinary PowerShell", () => {
    expect(ask("git status --short; npm run typecheck").permission).toBe("allow");
    expect(ask("$msg = @'\nrubrik\n'@\ngit commit -m $msg").permission).toBe("allow");
  });

  it("fails open on unusable input instead of wedging the shell", () => {
    expect(JSON.parse(execFileSync(process.execPath, [HOOK], { input: "", encoding: "utf8" })).permission).toBe(
      "allow",
    );
    expect(
      JSON.parse(execFileSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" })).permission,
    ).toBe("allow");
  });
});
