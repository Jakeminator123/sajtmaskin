import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Kör hooken som Cursor kör den — som ett eget nodeanrop med JSON på stdin —
 * i stället för att importera `decide`. Det är kontraktet som gäller: en hook
 * som svarar fel, eller inte svarar alls, läses som kraschad.
 */
const HOOK = resolve(process.cwd(), ".cursor/hooks/heredoc-guard.mjs");

function ask(command: string): { permission: string; agent_message?: string } {
  const stdout = execFileSync(process.execPath, [HOOK], {
    input: JSON.stringify({ command }),
    encoding: "utf8",
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

  it("denies a heredoc that is redirected mid-segment", () => {
    expect(ask("cat <<EOF > out.txt\ntext\nEOF").permission).toBe("deny");
  });

  it("denies a heredoc hidden behind a search command in an earlier segment", () => {
    // Bypass-lås: allowlistan för sökverktyg vägs per segment. Mot hela
    // kommandosträngen räckte det att nämna `rg` någonstans för att slippa
    // igenom med en riktig heredoc i nästa segment.
    expect(ask(`rg foo src; ${COMMIT_HEREDOC}`).permission).toBe("deny");
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
