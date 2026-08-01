import { describe, expect, it } from "vitest";

import {
  HOOK_MARKER,
  HOOK_VERSION,
  decideHookInstall,
  renderHookScript,
} from "./install-git-hooks.mjs";

// Skyddar dev/prod-symmetrin: prod migreras av CI vid push till master, dev av
// dessa hooks när master dras hem. Går de sönder tyst är vi tillbaka i "kör mot
// ett schema koden lämnat bakom sig".
describe("renderHookScript", () => {
  it("bär markören så en senare installation känner igen sin egen fil", () => {
    const script = renderHookScript("post-merge");
    expect(script).toContain(`${HOOK_MARKER} v${HOOK_VERSION}`);
  });

  it("kör schema-synken soft och tyst — en hook får aldrig avbryta git", () => {
    const script = renderHookScript("post-merge");
    expect(script).toContain("scripts/db/ensure-schema.mjs --soft --quiet-ok");
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
  });

  it("har en escape hatch och står över i CI", () => {
    const script = renderHookScript("post-merge");
    expect(script).toContain("SAJTMASKIN_SKIP_DB_HOOKS");
    expect(script).toContain('[ -n "$CI" ]');
  });

  // resolveHooksDir hedrar `git config core.hooksPath` utan `--local`, alltså
  // även en GLOBAL katalog — och den delas med alla andra repon på maskinen.
  // Utan den här grinden hade hooken kört `node scripts/db/ensure-schema.mjs`
  // där och spytt module-not-found i orelaterade projekt.
  it("är en no-op i repon som saknar skriptet (global core.hooksPath)", () => {
    for (const hook of ["post-merge", "post-checkout", "post-rewrite"] as const) {
      expect(renderHookScript(hook)).toContain(
        "[ -f scripts/db/ensure-schema.mjs ] || exit 0",
      );
    }
  });

  it("post-checkout kör bara vid grenbyten, inte vid fil-utcheckning", () => {
    // Utan grinden skulle varje `git checkout -- <fil>` kosta en DB-rundtur.
    const script = renderHookScript("post-checkout");
    expect(script).toContain('if [ "$3" != "1" ]; then exit 0; fi');
  });

  it("post-merge har ingen grenflagga att titta på", () => {
    expect(renderHookScript("post-merge")).not.toContain('"$3"');
  });

  // `git pull --rebase` kör aldrig post-merge, och rebase med merge-backenden
  // (default sedan git 2.26) ger inget pålitligt post-checkout. Utan
  // post-rewrite är rebase-pull en blind fläck — den vanligaste vägen hem för
  // den som har pull.rebase=true.
  it("post-rewrite kör bara för rebase, inte för commit --amend", () => {
    const script = renderHookScript("post-rewrite");
    expect(script).toContain('if [ "$1" != "rebase" ]; then exit 0; fi');
    expect(script).toContain("scripts/db/ensure-schema.mjs --soft --quiet-ok");
  });

  it("varje hook har sin egen grind — ingen ärver en annans", () => {
    expect(renderHookScript("post-rewrite")).not.toContain('"$3"');
    expect(renderHookScript("post-checkout")).not.toContain('"$1" != "rebase"');
  });
});

describe("decideHookInstall", () => {
  const desired = renderHookScript("post-merge");

  it("skriver när hooken saknas", () => {
    expect(decideHookInstall({ existing: null, desired }).action).toBe("write");
  });

  it("hoppar över när filen redan är exakt vår aktuella", () => {
    expect(decideHookInstall({ existing: desired, desired }).action).toBe("skip");
  });

  it("skriver om vår egen hook när den är inaktuell", () => {
    const outdated = desired.replace(`v${HOOK_VERSION}`, "v0");
    expect(decideHookInstall({ existing: outdated, desired }).action).toBe("write");
  });

  it("rör ALDRIG en främmande hook", () => {
    // Någon annans post-merge får inte försvinna för att vi ville vara hjälpsamma.
    const foreign = "#!/bin/sh\necho min egen hook\n";
    expect(decideHookInstall({ existing: foreign, desired }).action).toBe("conflict");
  });
});
