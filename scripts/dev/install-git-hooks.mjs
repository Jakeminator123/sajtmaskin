#!/usr/bin/env node
/**
 * Installerar repots git-hooks — i dag bara schema-synken.
 *
 * Varför den finns: prod är idiotsäkert. `prod-migrations-apply` kör vid varje
 * push till master och `prod-migrations-applied` verifierar efterat, så en
 * migration kan inte bli deployad utan att köras. Dev hade ingen motsvarighet:
 * `db:init` applicerar bara på `npm run dev`-vägen, och den är soft. Kör du
 * `SKIP_PREDEV=1`, startar `next-runner.mjs` direkt, eller rör databasen från
 * något annat script, kunde du köra vidare på ett schema koden lämnat bakom sig
 * — vilket syns som obegripliga fel långt senare (`column ... does not exist`
 * mitt i en testsvit).
 *
 * Symmetrin hookarna ger: prod får migrationer när kod pushas till master, dev
 * får dem när master dras hem. Drift uppstår vid `git pull`/`git checkout`, så
 * det är där den ska botas — därav tre hooks och inte en: en merge-pull, ett
 * grenbyte och en rebase-pull är tre olika vägar hem, och bara den första ger
 * `post-merge`.
 *
 * Hookarna kör aldrig DDL själva — de anropar `ensure-schema.mjs`, som i sin tur
 * delegerar till `run-migrations.ts`. Där bor prod-skrivskyddet
 * (`assertSafeWriteTarget`), så en hook kan inte råka migrera prod.
 *
 * Säkerhet mot att skriva över någon annans hook: varje genererad fil bär en
 * markör. Saknas markören i en befintlig hook rör vi den inte, utan rapporterar.
 *
 * Användning:
 *   npm run hooks:install          # installera/uppgradera
 *   npm run hooks:install -- --quiet
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const HOOK_MARKER = "sajtmaskin-managed-hook";
export const HOOK_VERSION = 2;

/**
 * Hook-kroppen. `sh` och inte node-shebang: git kör hooks via sh även på
 * Windows (Git for Windows levererar sitt eget), medan en `.mjs` som hook
 * kräver att filen är exekverbar på ett sätt Windows inte ger oss.
 *
 * Varje hook är tyst i normalfallet och avbryter aldrig git-kommandot:
 * `--soft` ger alltid exit 0, `--quiet-ok` skriver inget när allt är i synk.
 *
 * @param {"post-merge" | "post-checkout" | "post-rewrite"} hookName
 * @returns {string}
 */
export function renderHookScript(hookName) {
  // post-checkout får (prevHEAD, newHEAD, branchFlag). branchFlag=0 betyder att
  // ENSTAKA FILER checkats ut, inte ett grenbyte — då kan inga nya migrationer
  // ha tillkommit och hooken ska inte kosta något.
  //
  // post-rewrite finns för `git pull --rebase`, som är en helt egen väg: den
  // kör aldrig post-merge, och rebase med merge-backenden (default sedan git
  // 2.26) ger inget palitligt post-checkout heller. post-rewrite kors med
  // "rebase" eller "amend" som arg 1 — bara rebase kan ha hamtat hem nya
  // migrationer, en amend kan det inte.
  const guards = {
    "post-checkout":
      '# Bara grenbyten (arg 3 = 1), inte fil-utcheckningar.\nif [ "$3" != "1" ]; then exit 0; fi\n',
    "post-rewrite":
      '# Bara rebase (git pull --rebase), inte commit --amend.\nif [ "$1" != "rebase" ]; then exit 0; fi\n',
  };
  const guard = guards[hookName] ?? "";

  return `#!/bin/sh
# ${HOOK_MARKER} v${HOOK_VERSION} (${hookName}: db-schema-sync)
#
# Genererad av scripts/dev/install-git-hooks.mjs — redigera inte för hand.
# Kör 'npm run hooks:install' for att uppgradera, ta bort filen for att sluta.
#
# Håller dev-databasen i kapp med migrationerna i repot. Tyst när allt är i
# synk. Avbryter aldrig git-kommandot.

# Escape hatch och CI: hookarna finns för lokal utveckling.
if [ -n "$SAJTMASKIN_SKIP_DB_HOOKS" ] || [ -n "$CI" ]; then exit 0; fi

# Kör bara i ett repo som faktiskt har skriptet. Har utvecklaren en GLOBAL
# core.hooksPath delas katalogen med alla andra repon, och dar vore det har
# bara ett module-not-found-brus.
[ -f scripts/db/ensure-schema.mjs ] || exit 0
${guard}
# Saknas node är det inget fel värt att larma om i en git-hook.
command -v node >/dev/null 2>&1 || exit 0

node scripts/db/ensure-schema.mjs --soft --quiet-ok
exit 0
`;
}

/**
 * Ren beslutsfunktion: vad ska installationen göra med en befintlig fil?
 *
 * Utbruten från IO:t så det som betyder något — "rör aldrig en främmande hook",
 * "skriv om vår egen när versionen är gammal" — går att testa utan filsystem.
 *
 * @param {{ existing?: string | null, desired: string }} input
 * @returns {{ action: "write" | "skip" | "conflict", reason: string }}
 */
export function decideHookInstall({ existing, desired }) {
  if (!existing) return { action: "write", reason: "saknas" };
  if (!existing.includes(HOOK_MARKER)) {
    return { action: "conflict", reason: "finns redan och är inte vår" };
  }
  if (existing === desired) return { action: "skip", reason: "redan aktuell" };
  return { action: "write", reason: "vår, men inaktuell" };
}

/**
 * Katalogen git faktiskt letar hooks i. `--git-common-dir` och inte `--git-dir`:
 * länkade worktrees har en egen `.git`-fil men DELAR hooks med huvudcheckouten,
 * så en installation räcker för alla worktrees.
 *
 * @returns {string | null}
 */
export function resolveHooksDir() {
  const configured = spawnSync("git", ["config", "core.hooksPath"], {
    encoding: "utf8",
  });
  if (configured.status === 0 && configured.stdout.trim()) {
    return resolve(configured.stdout.trim());
  }

  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    encoding: "utf8",
  });
  if (common.status !== 0 || !common.stdout.trim()) return null;
  return resolve(join(common.stdout.trim(), "hooks"));
}

function main() {
  const quiet = process.argv.includes("--quiet");
  const log = (msg) => {
    if (!quiet) console.log(msg);
  };

  const hooksDir = resolveHooksDir();
  if (!hooksDir) {
    log("[hooks] Inget git-repo hittat - hoppar over.");
    return 0;
  }
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

  const conflicts = [];
  let written = 0;

  for (const hookName of ["post-merge", "post-checkout", "post-rewrite"]) {
    const target = join(hooksDir, hookName);
    const desired = renderHookScript(hookName);
    const existing = existsSync(target) ? readFileSync(target, "utf8") : null;
    const { action, reason } = decideHookInstall({ existing, desired });

    if (action === "conflict") {
      conflicts.push(`${hookName} (${reason})`);
      continue;
    }
    if (action === "skip") continue;

    writeFileSync(target, desired, { encoding: "utf8" });
    // Git kraver exekveringsratt pa unix; pa Windows ar chmod en no-op.
    try {
      chmodSync(target, 0o755);
    } catch {
      /* Windows: ratten finns inte, och git bryr sig inte dar. */
    }
    written += 1;
    log(`[hooks] ${hookName} installerad (${reason}).`);
  }

  if (conflicts.length > 0) {
    console.warn(
      `[hooks] Rorde INTE: ${conflicts.join(", ")}. ` +
        "Ta bort filen och kor 'npm run hooks:install' igen om du vill ha vår.",
    );
  }
  if (written === 0 && conflicts.length === 0) {
    log("[hooks] Redan aktuella.");
  }
  return 0;
}

// Kör bara som CLI, inte när testet importerar de rena funktionerna.
if (process.argv[1] && process.argv[1].endsWith("install-git-hooks.mjs")) {
  process.exit(main());
}
