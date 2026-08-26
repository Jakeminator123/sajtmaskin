#!/usr/bin/env node
/**
 * Installerar repots git-hooks: en fail-closed PR-verifiering före push och
 * soft schema-synk efter att arbetskopians git-läge har ändrats.
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
 * Samma glömskerisk fanns före push: `verify:pr` kunde hoppas över och GitHub
 * fick upptäcka följdfel flera minuter senare. Därför är pre-push-hooken hård,
 * medan DB-hookarna nedan fortsätter vara soft.
 *
 * Symmetrin hookarna ger: prod får migrationer när kod pushas till master, dev
 * får dem när master dras hem. Drift uppstår vid `git pull`/`git checkout`, så
 * det är där den ska botas — därav tre DB-hooks och inte en: en merge-pull, ett
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
export const HOOK_VERSION = 8;

/** @typedef {"pre-push" | "post-merge" | "post-checkout" | "post-rewrite"} HookName */
/** @type {readonly HookName[]} */
export const MANAGED_HOOKS = Object.freeze([
  "pre-push",
  "post-merge",
  "post-checkout",
  "post-rewrite",
]);

/**
 * Hook-kroppen. `sh` och inte node-shebang: git kör hooks via sh även på
 * Windows (Git for Windows levererar sitt eget), medan en `.mjs` som hook
 * kräver att filen är exekverbar på ett sätt Windows inte ger oss.
 *
 * DB-hookarna är tysta i normalfallet och avbryter aldrig git-kommandot:
 * `--soft` ger alltid exit 0, `--quiet-ok` skriver inget när allt är i synk.
 * `pre-push` är avsiktligt motsatsen: `verify:pr` måste bli grönt, annars
 * stoppas pushen. Bara CI och den uttryckliga escape hatchen får hoppa över den.
 *
 * @param {HookName} hookName
 * @returns {string}
 */
export function renderHookScript(hookName) {
  if (hookName === "pre-push") {
    return `#!/bin/sh
# ${HOOK_MARKER} v${HOOK_VERSION} (${hookName}: verify-pr)
#
# Genererad av scripts/dev/install-git-hooks.mjs — redigera inte for hand.
# Kor 'npm run hooks:install' for att uppgradera, ta bort filen for att sluta.
#
# Fail-closed: en rod lokal PR-verifiering eller non-fast-forward stoppar
# pushen. Test-escape far inte samtidigt bli en force-push-escape.

# Global core.hooksPath delas mellan repon. Utan den har repo-signaturen ska
# hooken inte gora nagonting i ett annat projekt.
[ -f scripts/dev/install-git-hooks.mjs ] || exit 0

ZERO_SHA=0000000000000000000000000000000000000000
CHECKOUT_SHA=$(git rev-parse HEAD 2>/dev/null) || {
  echo "[hooks] Push stoppad: kunde inte lasa aktuell HEAD." >&2
  exit 1
}
case "$CHECKOUT_SHA" in
  *[!0-9a-fA-F]*)
    echo "[hooks] Push stoppad: aktuell HEAD ar inte en full 40-teckens SHA." >&2
    exit 1
    ;;
esac
if [ "\${#CHECKOUT_SHA}" -ne 40 ]; then
  echo "[hooks] Push stoppad: aktuell HEAD ar inte en full 40-teckens SHA." >&2
  exit 1
fi

require_current_head() {
  pushed_sha="$1"
  if [ "$pushed_sha" != "$CHECKOUT_SHA" ]; then
    echo "[hooks] Push stoppad: \${pushed_sha} ar inte utcheckad HEAD \${CHECKOUT_SHA}." >&2
    echo "[hooks] Checka ut refen i dess worktree och verifiera den fore push." >&2
    exit 1
  fi
}

verify_needed=0
while read -r local_ref local_sha remote_ref remote_sha; do
  # Agarnas frysta aterstallningspunkter ar write-once. Alla remote-operationer
  # nekas: delete, fast-forward, force-push och namnatervinning. Det finns ingen
  # generell break-glass for dessa refs.
  case "$remote_ref" in
    refs/heads/*BRA*|refs/heads/rescue/*)
      echo "[hooks] Push stoppad: \${remote_ref} ar en fryst backup och far inte andras." >&2
      exit 1
      ;;
  esac

  # master ar stangd aven for fast-forward. Non-fast-forward/delete nekas
  # alltid; en vanlig direktuppdatering kraver samma reasoned break-glass som
  # workflow-policyn.
  if [ "$remote_ref" = "refs/heads/master" ]; then
    if [ "$local_sha" = "$ZERO_SHA" ]; then
      echo "[hooks] Push stoppad: master far aldrig raderas." >&2
      exit 1
    fi
    require_current_head "$local_sha"
    verify_needed=1
    if [ "$remote_sha" != "$ZERO_SHA" ] && ! git merge-base --is-ancestor "$remote_sha" "$local_sha" >/dev/null 2>&1; then
      echo "[hooks] Push stoppad: master far aldrig force-pushas." >&2
      exit 1
    fi
    reason=\${SAJTMASKIN_BREAK_GLASS_REASON:-}
    if [ "$SAJTMASKIN_BREAK_GLASS" != "1" ] || [ "\${#reason}" -lt 12 ]; then
      echo "[hooks] Push stoppad: direkt master ar stangd; skapa branch och PR." >&2
      exit 1
    fi
    echo "[hooks] BREAK-GLASS direkt master: \${reason}" >&2
    continue
  fi

  # Ny branch och branch-delete ar inte non-fast-forward. Alla uppdateringar av
  # en befintlig ref maste bevisa att remote-tip ar ancestor till local-tip.
  # Remote-delete ags av GitHub deleteBranchOnMerge eller en wrapper som redan
  # bevisat exakt terminal PR/head. Ett vanligt git push --delete far aldrig
  # kunna radera en annan agents oppna branch.
  if [ "$local_sha" = "$ZERO_SHA" ]; then
    delete_branch=\${remote_ref#refs/heads/}
    if [ "\${SAJTMASKIN_PROVEN_REMOTE_DELETE_BRANCH:-}" != "$delete_branch" ] || \
       [ "\${SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA:-}" != "$remote_sha" ]; then
      echo "[hooks] Push stoppad: remote-delete kraver exakt terminal PR/head-bevis." >&2
      echo "[hooks] Lat GitHub deleteBranchOnMerge eller den kanoniska cleanup-wrappern aga delete." >&2
      exit 1
    fi
    continue
  fi
  require_current_head "$local_sha"
  verify_needed=1
  if [ "$remote_sha" = "$ZERO_SHA" ]; then continue; fi
  if git merge-base --is-ancestor "$remote_sha" "$local_sha" >/dev/null 2>&1; then continue; fi

  reason=\${SAJTMASKIN_BREAK_GLASS_REASON:-}
  if [ "$SAJTMASKIN_BREAK_GLASS" != "1" ] || [ "\${#reason}" -lt 12 ]; then
    echo "[hooks] Push stoppad: \${remote_ref} skulle skrivas om non-fast-forward." >&2
    echo "[hooks] Hamta remote och bevara commits. Break-glass kraver agarsbeslut och tydlig orsak." >&2
    exit 1
  fi
  echo "[hooks] BREAK-GLASS non-fast-forward \${remote_ref}: \${reason}" >&2
done

if [ "$verify_needed" = "0" ]; then exit 0; fi

# verify:pr laser arbetskopian. Om den ar smutsig kan en ocommitterad fix gora
# testerna grona trots att den aldre, trasiga HEAD-commiten ar det som pushas.
# Krav darfor exakt rent trad innan nagon verifierings-/CI-escape tillats.
WORKTREE_STATUS=$(git status --porcelain --untracked-files=normal 2>/dev/null) || {
  echo "[hooks] Push stoppad: kunde inte verifiera att arbetskopian ar ren." >&2
  exit 1
}
if [ -n "$WORKTREE_STATUS" ]; then
  echo "[hooks] Push stoppad: arbetskopian har ocommitterade eller osparade filer." >&2
  echo "[hooks] Commit:a exakta paths eller radda arbetet innan push; verify:pr ska prova exakt HEAD." >&2
  exit 1
fi

# Runner-signaler far bara hoppa over den dyra lokala verifieringen, aldrig
# ref-sakerheten ovan. Exakt "true" gor att ett vanligt CI=false inte blir en
# oavsiktlig bypass.
if [ "\${GITHUB_ACTIONS:-}" = "true" ] || [ "\${CI:-}" = "true" ]; then exit 0; fi

if [ "$SAJTMASKIN_SKIP_VERIFY_HOOKS" = "1" ]; then exit 0; fi

# Git exporterar repository-lokala variabler till hooken. Verifieringen startar
# tester och verktyg som avsiktligt arbetar i egna temporara repon; de maste fa
# losa sitt repo fran cwd i stallet for att arva pushens GIT_DIR/GIT_WORK_TREE.
GIT_LOCAL_ENV_VARS=$(git rev-parse --local-env-vars 2>/dev/null) || {
  echo "[hooks] Push stoppad: kunde inte isolera git-miljon for verifieringen." >&2
  exit 1
}
for GIT_LOCAL_ENV_VAR in $GIT_LOCAL_ENV_VARS; do
  unset "$GIT_LOCAL_ENV_VAR"
done

command -v npm >/dev/null 2>&1 || {
  echo "[hooks] STOPP: npm saknas; kan inte kora npm run verify:pr." >&2
  echo "[hooks] Endast med agarsbeslut: SAJTMASKIN_SKIP_VERIFY_HOOKS=1 git push" >&2
  exit 1
}

echo "[hooks] Verifierar diffen med npm run verify:pr fore push..."
npm run verify:pr
status=$?
if [ "$status" -ne 0 ]; then
  echo "[hooks] Push stoppad: npm run verify:pr blev rod." >&2
  echo "[hooks] Ratta felet och forsok igen. Escape hatch kraver agarsbeslut." >&2
fi
exit "$status"
`;
  }

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

# Escape hatch och CI: hookarna finns för lokal utveckling. Exakta värden gör
# att CI=false eller SAJTMASKIN_SKIP_DB_HOOKS=0 inte hoppar över av misstag.
if [ "$SAJTMASKIN_SKIP_DB_HOOKS" = "1" ] || [ "\${GITHUB_ACTIONS:-}" = "true" ] || [ "\${CI:-}" = "true" ]; then exit 0; fi

# Kör bara i ett repo som faktiskt har skriptet. Har utvecklaren en GLOBAL
# core.hooksPath delas katalogen med alla andra repon, och dar vore det har
# bara ett module-not-found-brus.
[ -f scripts/db/ensure-schema.mjs ] || exit 0
${guard}
# Saknas node är det inget fel värt att larma om i en git-hook.
command -v node >/dev/null 2>&1 || exit 0

# En ny worktree har de spårade skripten före worktree:setup har installerat
# dependencies. Försök inte importera pg/dotenv i det mellanläget.
[ -f node_modules/pg/package.json ] || exit 0
[ -f node_modules/dotenv/package.json ] || exit 0

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
  const version = (value) => {
    const match = new RegExp(`#\\s*${HOOK_MARKER}\\s+v(\\d+)\\b`, "u").exec(value);
    return match ? Number.parseInt(match[1], 10) : null;
  };
  const existingVersion = version(existing);
  const desiredVersion = version(desired);
  if (existingVersion === null || desiredVersion === null) {
    return { action: "conflict", reason: "managed versionsmarkör saknas" };
  }
  if (existingVersion > desiredVersion) {
    return {
      action: "conflict",
      reason: `nyare managed hook v${existingVersion} får inte nedgraderas till v${desiredVersion}`,
    };
  }
  if (existingVersion === desiredVersion) {
    return {
      action: "conflict",
      reason: `managed hook v${existingVersion} har oväntat annat innehåll`,
    };
  }
  return { action: "write", reason: `uppgradering v${existingVersion} → v${desiredVersion}` };
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

  for (const hookName of MANAGED_HOOKS) {
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
    console.error(
      `[hooks] Rorde INTE: ${conflicts.join(", ")}. ` +
        "Kedja in den befintliga hooken eller ta bort den och kor 'npm run hooks:install' igen.",
    );
  }
  if (written === 0 && conflicts.length === 0) {
    log("[hooks] Redan aktuella.");
  }
  // En främmande hook får aldrig skrivas över, men installationen får heller
  // inte påstå att den lyckades: särskilt en konflikt på pre-push lämnar den
  // lokala verifieringsgrinden frånkopplad. `hooks:install:soft` kan fortfarande
  // användas av predev för att rapportera utan att blockera appstart.
  return conflicts.length > 0 ? 1 : 0;
}

// Kör bara som CLI, inte när testet importerar de rena funktionerna.
if (process.argv[1] && process.argv[1].endsWith("install-git-hooks.mjs")) {
  process.exit(main());
}
