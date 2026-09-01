import { chmodSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  HOOK_MARKER,
  HOOK_VERSION,
  MANAGED_HOOKS,
  decideHookInstall,
  renderHookScript,
} from "./install-git-hooks.mjs";

// Tre tester nedan kör den riktiga hooken genom en POSIX-shell. På Windows
// ligger Git Bash ofta utanför PATH trots att `git` finns. Hitta då sh.exe via
// Git-installationens exec-path så testerna inte blir falskt gröna genom skip.
const POSIX_HOOK_TEST_TIMEOUT_MS = 30_000;
const POSIX_HOOK_CHILD_TIMEOUT_MS = 10_000;

function resolvePosixShell(): string | null {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const gitExecPath = spawnSync("git", ["--exec-path"], {
      encoding: "utf8",
      timeout: POSIX_HOOK_CHILD_TIMEOUT_MS,
    });
    if (gitExecPath.error) {
      const code = (gitExecPath.error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw gitExecPath.error;
    } else if (gitExecPath.status === 0) {
      const gitBash = resolve(gitExecPath.stdout.trim(), "..", "..", "..", "bin", "sh.exe");
      if (existsSync(gitBash)) candidates.push(gitBash);
    }
  }
  candidates.push("sh");

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "exit 0"], {
      timeout: POSIX_HOOK_CHILD_TIMEOUT_MS,
    });
    if (!probe.error && probe.status === 0) return candidate;
    if (probe.error && (probe.error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw probe.error;
    }
  }
  return null;
}

const posixShell = resolvePosixShell();
const hasPosixShell = posixShell !== null;
const itWithPosixShell = hasPosixShell ? it : it.skip;

type HookSpawnOptions = {
  cwd: string;
  input: string;
  env: NodeJS.ProcessEnv;
  encoding: BufferEncoding;
  testBin?: string;
  // Git anropar pre-push med remote-namn och URL. Namnet styr vilken
  // remote-tracking-yta hooken räknar som redan publicerad.
  remote?: string;
};

function runHookSync(
  hook: string,
  options: HookSpawnOptions,
  timeoutMs = POSIX_HOOK_CHILD_TIMEOUT_MS,
) {
  if (!posixShell) throw new Error("POSIX shell saknas");
  const { testBin = "", remote = "", ...spawnOptions } = options;
  const wrapper =
    'hook="$1"; test_bin="$2"; ' +
    'if command -v cygpath >/dev/null 2>&1; then hook=$(cygpath -u "$hook"); test_bin=$(cygpath -u "$test_bin"); fi; ' +
    'if [ -n "$test_bin" ]; then PATH="$test_bin:$PATH"; export PATH; fi; ' +
    'exec sh "$hook" "$3" "https://example.invalid/repo.git"';
  const result = spawnSync(posixShell, ["-c", wrapper, "hook-test", hook, testBin, remote], {
    ...spawnOptions,
    timeout: timeoutMs,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code ?? "UNKNOWN";
    throw new Error(`pre-push child failed (${code}): ${result.error.message}`);
  }
  return result;
}

// Stubbat git. `rev-parse --verify --quiet <rev>^{commit}` peelar: ett
// tagg-objekt (HOOK_GIT_TAG_OBJECT) svarar med sin commit, allt annat med sig
// självt. `for-each-ref` avgör om commiten redan finns på push-remoten.
const FAKE_GIT = [
  "#!/bin/sh",
  'if [ "$1" = "rev-parse" ] && [ "$2" = "HEAD" ]; then printf "%s\\n" "$HOOK_GIT_HEAD"; exit 0; fi',
  'if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then printf "%s\\n" "$HOOK_GIT_TOPLEVEL"; exit 0; fi',
  'if [ "$1" = "rev-parse" ] && [ "$2" = "--local-env-vars" ]; then printf "GIT_ALTERNATE_OBJECT_DIRECTORIES\\nGIT_CONFIG\\nGIT_CONFIG_PARAMETERS\\nGIT_CONFIG_COUNT\\nGIT_OBJECT_DIRECTORY\\nGIT_DIR\\nGIT_WORK_TREE\\nGIT_IMPLICIT_WORK_TREE\\nGIT_GRAFT_FILE\\nGIT_INDEX_FILE\\nGIT_NO_REPLACE_OBJECTS\\nGIT_REPLACE_REF_BASE\\nGIT_PREFIX\\nGIT_SHALLOW_FILE\\nGIT_COMMON_DIR\\n"; exit 0; fi',
  'if [ "$1" = "rev-parse" ] && [ "$2" = "--verify" ]; then rev=${4%%^*}; if [ -n "$HOOK_GIT_TAG_OBJECT" ] && [ "$rev" = "$HOOK_GIT_TAG_OBJECT" ]; then printf "%s\\n" "$HOOK_GIT_TAG_COMMIT"; else printf "%s\\n" "$rev"; fi; exit 0; fi',
  'if [ "$1" = "for-each-ref" ]; then [ "$HOOK_GIT_PUBLISHED" = "1" ] && printf "refs/remotes/origin/master\\n"; exit 0; fi',
  'if [ "$1" = "status" ]; then [ "$HOOK_GIT_DIRTY" = "1" ] && printf " M src/example.ts\\n"; exit 0; fi',
  '[ "$HOOK_GIT_ANCESTOR" = "1" ] && exit 0',
  "exit 1",
  "",
].join("\n");

// Skyddar dev/prod-symmetrin: prod migreras av CI vid push till master, dev av
// dessa hooks när master dras hem. Går de sönder tyst är vi tillbaka i "kör mot
// ett schema koden lämnat bakom sig".
describe("renderHookScript", () => {
  it("hittar Git Bash på Windows när git är installerat", () => {
    if (process.platform === "win32" && spawnSync("git", ["--version"]).status === 0) {
      expect(posixShell).not.toBeNull();
    }
  });

  it("bär markören så en senare installation känner igen sin egen fil", () => {
    expect(HOOK_VERSION).toBe(16);
    expect(MANAGED_HOOKS).toContain("pre-push");
    for (const hook of MANAGED_HOOKS) {
      expect(renderHookScript(hook)).toContain(`${HOOK_MARKER} v${HOOK_VERSION}`);
    }
  });

  it("kör schema-synken soft och tyst — en hook får aldrig avbryta git", () => {
    const script = renderHookScript("post-merge");
    expect(script).toContain("scripts/db/ensure-schema.mjs --soft --quiet-ok");
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
  });

  it("hoppar över schema-synken tills worktree:setup har gett node_modules", () => {
    const script = renderHookScript("post-merge");
    expect(script).toContain("[ -f node_modules/pg/package.json ] || exit 0");
    expect(script).toContain("[ -f node_modules/dotenv/package.json ] || exit 0");
    expect(script.indexOf("[ -f node_modules/pg/package.json ] || exit 0")).toBeLessThan(
      script.indexOf("scripts/db/ensure-schema.mjs --soft --quiet-ok"),
    );
  });

  it("har en exakt escape hatch och står bara över vid sann CI-signal", () => {
    const script = renderHookScript("post-merge");
    expect(script).toContain('[ "$SAJTMASKIN_SKIP_DB_HOOKS" = "1" ]');
    expect(script).toContain('[ "${CI:-}" = "true" ]');
    expect(script).not.toContain('[ -n "$CI" ]');
  });

  // resolveHooksDir hedrar `git config core.hooksPath` utan `--local`, alltså
  // även en GLOBAL katalog — och den delas med alla andra repon på maskinen.
  // Utan den här grinden hade hooken kört `node scripts/db/ensure-schema.mjs`
  // där och spytt module-not-found i orelaterade projekt.
  it("är en no-op i repon som saknar skriptet (global core.hooksPath)", () => {
    for (const hook of ["post-merge", "post-checkout", "post-rewrite"] as const) {
      expect(renderHookScript(hook)).toContain("[ -f scripts/db/ensure-schema.mjs ] || exit 0");
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

  it("pre-push kör verify:pr --plan och låter dess exitkod stoppa pushen", () => {
    const script = renderHookScript("pre-push");
    expect(script).toContain("npm run verify:pr -- --plan");
    expect(script).not.toMatch(/npm run verify:pr\s*$/m);
    expect(script).toContain('exit "$status"');
    expect(script).not.toContain("--soft");
    expect(script.trimEnd().endsWith("exit 0")).toBe(false);
  });

  it("pre-push står över först efter refsäkerheten vid sann CI eller exakt escape", () => {
    const script = renderHookScript("pre-push");
    expect(script).toContain('[ "${GITHUB_ACTIONS:-}" = "true" ]');
    expect(script).toContain('[ "${CI:-}" = "true" ]');
    expect(script).not.toContain('[ -n "$CI" ]');
    expect(script).toContain('[ "$SAJTMASKIN_SKIP_VERIFY_HOOKS" = "1" ]');
    expect(script).not.toContain("SAJTMASKIN_SKIP_DB_HOOKS");
    expect(script.indexOf("refs/heads/master")).toBeLessThan(
      script.indexOf('[ "${GITHUB_ACTIONS:-}" = "true" ]'),
    );
    expect(script.indexOf("git status --porcelain")).toBeLessThan(
      script.indexOf('[ "${GITHUB_ACTIONS:-}" = "true" ]'),
    );
    expect(script).toContain("unset GIT_NAMESPACE GIT_INTERNAL_SUPER_PREFIX");
    expect(script.indexOf("unset GIT_NAMESPACE GIT_INTERNAL_SUPER_PREFIX")).toBeLessThan(
      script.indexOf("git rev-parse HEAD"),
    );
    expect(script).toContain("git rev-parse --local-env-vars");
    expect(script).not.toContain("git rev-parse --local-env-vars |");
    expect(script.indexOf("git rev-parse --local-env-vars")).toBeLessThan(
      script.indexOf("npm run verify:pr"),
    );
    expect(script).toContain("GIT_CONFIG_KEY_0=safe.directory");
    expect(script).toContain("git rev-parse --show-toplevel");
    expect(script).not.toContain("VERIFY_ROOT=$(pwd -P)");
    expect(script.indexOf("VERIFY_ROOT=$(git rev-parse --show-toplevel")).toBeLessThan(
      script.indexOf("GIT_LOCAL_ENV_VARS=$(git rev-parse --local-env-vars"),
    );
    expect(script.indexOf("GIT_CONFIG_KEY_0=safe.directory")).toBeLessThan(
      script.indexOf("npm run verify:pr"),
    );
  });

  itWithPosixShell(
    "avbryter en hängd hook-child med ett tydligt timeoutfel",
    () => {
      const root = mkdtempSync(join(tmpdir(), "sajtmaskin-pre-push-timeout-"));
      const hook = join(root, "pre-push");
      // En tidsbegränsad child bevisar timeouten utan att lämna en evig orphan
      // när Windows avslutar shell-parenten men inte hela processträdet.
      writeFileSync(hook, "#!/bin/sh\nsleep 2\n");
      chmodSync(hook, 0o755);

      expect(() =>
        runHookSync(hook, { cwd: root, input: "", env: process.env, encoding: "utf8" }, 100),
      ).toThrow(/ETIMEDOUT/);
    },
    POSIX_HOOK_TEST_TIMEOUT_MS,
  );

  itWithPosixShell(
    "pre-push nekar non-fast-forward men tillåter fast-forward",
    () => {
      const root = mkdtempSync(join(tmpdir(), "sajtmaskin-pre-push-"));
      const bin = join(root, "bin");
      mkdirSync(join(root, "scripts", "dev"), { recursive: true });
      mkdirSync(bin);
      writeFileSync(join(root, "scripts", "dev", "install-git-hooks.mjs"), "marker\n");
      writeFileSync(join(bin, "git"), FAKE_GIT);
      writeFileSync(
        join(bin, "npm"),
        '#!/bin/sh\n[ -z "${GIT_DIR:-}" ] && [ -z "${GIT_WORK_TREE:-}" ] && [ -z "${GIT_CONFIG_PARAMETERS:-}" ] && [ -z "${GIT_REPLACE_REF_BASE:-}" ] && [ -z "${GIT_SHALLOW_FILE:-}" ] && [ -z "${GIT_NAMESPACE:-}" ] && [ -z "${GIT_INTERNAL_SUPER_PREFIX:-}" ] && [ "$GIT_CONFIG_COUNT" = "1" ] && [ "$GIT_CONFIG_KEY_0" = "safe.directory" ] && [ "$GIT_CONFIG_VALUE_0" = "$HOOK_GIT_TOPLEVEL" ]\n',
      );
      chmodSync(join(bin, "git"), 0o755);
      chmodSync(join(bin, "npm"), 0o755);
      const hook = join(root, "pre-push");
      writeFileSync(hook, renderHookScript("pre-push"));
      chmodSync(hook, 0o755);
      const refLine = `refs/heads/fix/x ${"a".repeat(40)} refs/heads/fix/x ${"b".repeat(40)}\n`;
      const env = {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        HOOK_GIT_HEAD: "a".repeat(40),
        HOOK_GIT_TOPLEVEL: "C:/workspace/sajtmaskin",
        GIT_DIR: "parent.git",
        GIT_WORK_TREE: root,
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: "safe.directory",
        GIT_CONFIG_VALUE_0: root,
        GIT_CONFIG_KEY_1: "core.worktree",
        GIT_CONFIG_VALUE_1: join(root, "poisoned-worktree"),
        GIT_CONFIG_PARAMETERS: "'core.bare'='true'",
        GIT_REPLACE_REF_BASE: "refs/poisoned",
        GIT_SHALLOW_FILE: join(root, "poisoned-shallow"),
        GIT_NAMESPACE: "poisoned-hook-namespace",
        GIT_INTERNAL_SUPER_PREFIX: "poisoned/super-prefix/",
      };

      const rejected = runHookSync(hook, {
        cwd: root,
        input: refLine,
        env: { ...env, CI: "false" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("non-fast-forward");

      const accepted = runHookSync(hook, {
        cwd: root,
        input: refLine,
        env: { ...env, HOOK_GIT_ANCESTOR: "1" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(accepted.status).toBe(0);

      const dirty = runHookSync(hook, {
        cwd: root,
        input: refLine,
        env: { ...env, HOOK_GIT_ANCESTOR: "1", HOOK_GIT_DIRTY: "1" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(dirty.status).toBe(1);
      expect(dirty.stderr).toContain("arbetskopian har ocommitterade");

      const masterLine = `refs/heads/master ${"a".repeat(40)} refs/heads/master ${"b".repeat(40)}\n`;
      const directMaster = runHookSync(hook, {
        cwd: root,
        input: masterLine,
        env: { ...env, HOOK_GIT_ANCESTOR: "1" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(directMaster.status).toBe(0);

      const breakGlass = {
        ...env,
        HOOK_GIT_ANCESTOR: "1",
        SAJTMASKIN_BREAK_GLASS: "1",
        SAJTMASKIN_BREAK_GLASS_REASON: "Akut aterstallning av trasig mergegrind",
      };
      expect(
        runHookSync(hook, {
          cwd: root,
          input: masterLine,
          env: breakGlass,
          encoding: "utf8",
          testBin: bin,
        }).status,
      ).toBe(0);

      const forcedMaster = runHookSync(hook, {
        cwd: root,
        input: masterLine,
        env: { ...breakGlass, HOOK_GIT_ANCESTOR: "0" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(forcedMaster.status).toBe(1);
      expect(forcedMaster.stderr).toContain("master far aldrig force-pushas");

      const frozenBackupDelete = runHookSync(hook, {
        cwd: root,
        input: `refs/heads/BRA_snapshot ${"0".repeat(40)} refs/heads/BRA_snapshot ${"b".repeat(40)}\n`,
        env,
        encoding: "utf8",
        testBin: bin,
      });
      expect(frozenBackupDelete.status).toBe(1);
      expect(frozenBackupDelete.stderr).toContain("far aldrig raderas");

      // Fast-forward av en BEFINTLIG backup är fortfarande stängt: att den råkar
      // vara en ren framåtflytt gör den inte till en snapshot igen.
      const frozenRescueUpdate = runHookSync(hook, {
        cwd: root,
        input: `refs/heads/rescue/owner ${"a".repeat(40)} refs/heads/rescue/owner ${"b".repeat(40)}\n`,
        env: { ...env, HOOK_GIT_ANCESTOR: "1" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(frozenRescueUpdate.status).toBe(1);
      expect(frozenRescueUpdate.stderr).toContain("far aldrig andras");

      // Att SKAPA en ny fryst backup är hela poängen med namnen, och
      // GitHub-rulesetet tillåter exakt det. Hooken sa förr nej även här, så
      // ägaren kunde inte ta en snapshot med git push.
      const frozenBackupCreate = runHookSync(hook, {
        cwd: root,
        input: `refs/heads/BRA_snapshot ${"a".repeat(40)} refs/heads/BRA_snapshot ${"0".repeat(40)}\n`,
        env: { ...env, HOOK_GIT_ANCESTOR: "1" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(frozenBackupCreate.status).toBe(0);

      const ghaStillRejectsUnsafeRef = runHookSync(hook, {
        cwd: root,
        input: refLine,
        env: { ...env, GITHUB_ACTIONS: "true" },
        encoding: "utf8",
        testBin: bin,
      });
      expect(ghaStillRejectsUnsafeRef.status).toBe(1);
      expect(ghaStillRejectsUnsafeRef.stderr).toContain("non-fast-forward");

      const otherLocalRef = runHookSync(hook, {
        cwd: root,
        input: `refs/heads/fix/other ${"c".repeat(40)} refs/heads/fix/other ${"0".repeat(40)}\n`,
        env,
        encoding: "utf8",
        testBin: bin,
      });
      expect(otherLocalRef.status).toBe(1);
      expect(otherLocalRef.stderr).toContain("inte utcheckad HEAD");
    },
    POSIX_HOOK_TEST_TIMEOUT_MS,
  );

  itWithPosixShell(
    "blockerar vanlig branch-delete men tillåter exakt proof-bunden cleanup",
    () => {
      const root = mkdtempSync(join(tmpdir(), "sajtmaskin-pre-push-delete-"));
      const bin = join(root, "bin");
      mkdirSync(join(root, "scripts", "dev"), { recursive: true });
      mkdirSync(bin);
      writeFileSync(join(root, "scripts", "dev", "install-git-hooks.mjs"), "marker\n");
      writeFileSync(
        join(bin, "git"),
        '#!/bin/sh\nif [ "$1" = "rev-parse" ]; then printf "%s\\n" "$HOOK_GIT_HEAD"; fi\nexit 0\n',
      );
      writeFileSync(join(bin, "npm"), "#!/bin/sh\nexit 99\n");
      chmodSync(join(bin, "git"), 0o755);
      chmodSync(join(bin, "npm"), 0o755);
      const hook = join(root, "pre-push");
      writeFileSync(hook, renderHookScript("pre-push"));
      chmodSync(hook, 0o755);
      const deleteLine = `refs/heads/fix/merged ${"0".repeat(40)} refs/heads/fix/merged ${"b".repeat(40)}\n`;

      const rejected = runHookSync(hook, {
        cwd: root,
        input: deleteLine,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          HOOK_GIT_HEAD: "a".repeat(40),
        },
        encoding: "utf8",
        testBin: bin,
      });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("remote-delete kraver exakt terminal PR/head-bevis");

      const accepted = runHookSync(hook, {
        cwd: root,
        input: deleteLine,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          HOOK_GIT_HEAD: "a".repeat(40),
          SAJTMASKIN_PROVEN_REMOTE_DELETE_BRANCH: "fix/merged",
          SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA: "b".repeat(40),
        },
        encoding: "utf8",
        testBin: bin,
      });
      expect(accepted.status).toBe(0);
    },
    POSIX_HOOK_TEST_TIMEOUT_MS,
  );

  // Annoterade taggar var omöjliga att pusha härifrån: git skickar
  // TAGG-objektets sha, hooken jämförde det rakt mot HEAD:s commit-sha, och de
  // två kan aldrig vara lika. En snapshot-tagg av master fastnade alltså i den
  // egna grinden.
  itWithPosixShell(
    "pre-push peelar annoterade taggar och hoppar över planen för publicerade commits",
    () => {
      const root = mkdtempSync(join(tmpdir(), "sajtmaskin-pre-push-tag-"));
      const bin = join(root, "bin");
      mkdirSync(join(root, "scripts", "dev"), { recursive: true });
      mkdirSync(bin);
      writeFileSync(join(root, "scripts", "dev", "install-git-hooks.mjs"), "marker\n");
      writeFileSync(join(bin, "git"), FAKE_GIT);
      // En röd plan gör skillnaden synlig: en ren etikett ska inte ens starta
      // verify:pr, medan ny kod fortfarande måste passera den.
      writeFileSync(join(bin, "npm"), "#!/bin/sh\nexit 97\n");
      chmodSync(join(bin, "git"), 0o755);
      chmodSync(join(bin, "npm"), 0o755);
      const hook = join(root, "pre-push");
      writeFileSync(hook, renderHookScript("pre-push"));
      chmodSync(hook, 0o755);

      const head = "a".repeat(40);
      const tagObject = "d".repeat(40);
      const zero = "0".repeat(40);
      const baseEnv = {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        HOOK_GIT_HEAD: head,
        HOOK_GIT_TOPLEVEL: root,
        HOOK_GIT_TAG_OBJECT: tagObject,
        // Testet får aldrig bli grönt av att det råkar köra i CI.
        CI: "false",
        GITHUB_ACTIONS: "false",
      };
      const tagLine = `refs/tags/snapshot ${tagObject} refs/tags/snapshot ${zero}\n`;

      const publishedTag = runHookSync(hook, {
        cwd: root,
        input: tagLine,
        env: { ...baseEnv, HOOK_GIT_TAG_COMMIT: head, HOOK_GIT_PUBLISHED: "1" },
        encoding: "utf8",
        testBin: bin,
        remote: "origin",
      });
      expect(publishedTag.status).toBe(0);
      expect(publishedTag.stdout).not.toContain("verify:pr");

      // Samma tagg utan publicerad commit laddar upp ny kod och måste planeras.
      const unpublishedTag = runHookSync(hook, {
        cwd: root,
        input: tagLine,
        env: { ...baseEnv, HOOK_GIT_TAG_COMMIT: head },
        encoding: "utf8",
        testBin: bin,
        remote: "origin",
      });
      expect(unpublishedTag.status).toBe(97);

      // Felmeddelandet ska peka ut commiten, inte tagg-objektet, annars går det
      // inte att förstå vad som ska checkas ut.
      const foreignCommit = "c".repeat(40);
      const strayTag = runHookSync(hook, {
        cwd: root,
        input: tagLine,
        env: { ...baseEnv, HOOK_GIT_TAG_COMMIT: foreignCommit },
        encoding: "utf8",
        testBin: bin,
        remote: "origin",
      });
      expect(strayTag.status).toBe(1);
      expect(strayTag.stderr).toContain("inte utcheckad HEAD");
      expect(strayTag.stderr).toContain(foreignCommit);
      expect(strayTag.stderr).not.toContain(tagObject);
    },
    POSIX_HOOK_TEST_TIMEOUT_MS,
  );

  it("pre-push nekar alltid non-fast-forward på master", () => {
    const script = renderHookScript("pre-push");
    expect(script).toContain('if [ "$remote_ref" = "refs/heads/master" ]');
    expect(script.indexOf("refs/heads/master")).toBeLessThan(
      script.indexOf('SAJTMASKIN_BREAK_GLASS" != "1"'),
    );
  });

  it("pre-push är fail-closed när npm saknas i Sajtmaskin", () => {
    const script = renderHookScript("pre-push");
    expect(script).toContain("command -v npm >/dev/null 2>&1 || {");
    expect(script).toContain("exit 1");
  });

  it("pre-push är en no-op i andra repon med global core.hooksPath", () => {
    expect(renderHookScript("pre-push")).toContain(
      "[ -f scripts/dev/install-git-hooks.mjs ] || exit 0",
    );
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

  it("låter inte en gammal worktree nedgradera en nyare delad hook", () => {
    const newer = desired.replace(`v${HOOK_VERSION}`, `v${HOOK_VERSION + 1}`);
    const decision = decideHookInstall({ existing: newer, desired });
    expect(decision.action).toBe("conflict");
    expect(decision.reason).toContain("får inte nedgraderas");
  });

  it("failar stängt när samma managed version har annat innehåll", () => {
    const altered = desired.replace("--soft --quiet-ok", "--soft");
    const decision = decideHookInstall({ existing: altered, desired });
    expect(decision.action).toBe("conflict");
    expect(decision.reason).toContain("oväntat annat innehåll");
  });

  it("rör ALDRIG en främmande hook", () => {
    // Någon annans pre-push/post-hook får inte försvinna för att vi ville vara hjälpsamma.
    const foreign = "#!/bin/sh\necho min egen hook\n";
    expect(decideHookInstall({ existing: foreign, desired }).action).toBe("conflict");
  });

  it("tillämpas likadant på den managed pre-push-hooken", () => {
    const prePush = renderHookScript("pre-push");
    expect(decideHookInstall({ existing: null, desired: prePush }).action).toBe("write");
    expect(decideHookInstall({ existing: prePush, desired: prePush }).action).toBe("skip");
    expect(
      decideHookInstall({ existing: "#!/bin/sh\necho foreign\n", desired: prePush }).action,
    ).toBe("conflict");
  });
});
