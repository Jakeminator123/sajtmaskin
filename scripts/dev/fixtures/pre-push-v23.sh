#!/bin/sh
# sajtmaskin-managed-hook v23 (pre-push: verify-pr-plan)
#
# Genererad av scripts/dev/install-git-hooks.mjs — redigera inte for hand.
# Kor 'npm run hooks:install' for att uppgradera, ta bort filen for att sluta.
#
# Fail-closed: en rod lokal PR-plan eller non-fast-forward stoppar
# pushen. Riktade kontroller kors lokalt och fullprofilen i GitHub Actions.
# Test-escape far inte samtidigt bli en force-push-escape.

# Global core.hooksPath delas mellan repon. Utan den har repo-signaturen ska
# hooken inte gora nagonting i ett annat projekt.
[ -f scripts/dev/install-git-hooks.mjs ] || exit 0

ZERO_SHA=0000000000000000000000000000000000000000
# Namespace ingar inte i git rev-parse --local-env-vars och super-prefix finns
# bara i vissa Git-versioner. Bada kan styra ref- eller pathuppslag. Hooken ska
# verifiera den utcheckade arbetskopian och rensar dem fore forsta git-anropet.
unset GIT_NAMESPACE GIT_INTERNAL_SUPER_PREFIX

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
if [ "${#CHECKOUT_SHA}" -ne 40 ]; then
  echo "[hooks] Push stoppad: aktuell HEAD ar inte en full 40-teckens SHA." >&2
  exit 1
fi

# Git ger hooken remote-namnet som $1 och URL:en som $2. Namnet avgor vilken
# remote-tracking-yta som far rakna som "redan publicerat" langre ner.
PUSH_REMOTE=${1:-}

require_current_head() {
  pushed_sha="$1"
  if [ "$pushed_sha" != "$CHECKOUT_SHA" ]; then
    echo "[hooks] Push stoppad: ${pushed_sha} ar inte utcheckad HEAD ${CHECKOUT_SHA}." >&2
    echo "[hooks] Checka ut refen i dess worktree och verifiera den fore push." >&2
    exit 1
  fi
}

# En annoterad tagg bar ett eget tagg-objekt, och git skickar DESS sha som
# local_sha. Ett tagg-objekt kan per definition aldrig vara lika med en
# commit-sha, sa utan peeling var varje annoterad tagg omojlig att pusha
# harifran. Lattviktiga taggar och grenar peelar till sig sjalva.
peel_to_commit() {
  git rev-parse --verify --quiet "$1^{commit}" 2>/dev/null
}

# Ar commiten redan hamtad fran samma remote? Da laddar pushen inte upp nagon ny
# kod. Undantaget far BARA slappa rena etiketter: ny tagg eller ny fryst backup.
# En vanlig featurebranch som flyttas till en redan publicerad commit kraver
# fortfarande HEAD, rent trad och planen — annars kan en smutsig checkout
# flytta fel remote-ref utan att nagot granskas.
already_on_push_remote() {
  [ -n "$PUSH_REMOTE" ] || return 1
  [ -n "$(git for-each-ref --contains "$1" --count=1 --format='%(refname)' "refs/remotes/$PUSH_REMOTE/" 2>/dev/null)" ]
}

is_published_label_create() {
  [ "$remote_sha" = "$ZERO_SHA" ] || return 1
  case "$remote_ref" in
    refs/tags/*|refs/heads/*BRA*|refs/heads/rescue/*) ;;
    *) return 1 ;;
  esac
  already_on_push_remote "$1"
}

verify_needed=0
while read -r local_ref local_sha remote_ref remote_sha; do
  # Direkt preview: aldrig delete/force, alltid exakt manniskobekraftad HEAD
  # och aktuellt review-/plankvitto fran wrappern. CI/skip far inte kringga detta.
  if [ "$remote_ref" = "refs/heads/preview" ]; then
    if [ "$local_sha" = "$ZERO_SHA" ] || [ "$remote_sha" = "$ZERO_SHA" ]; then
      echo "[hooks] STOPP: preview far inte raderas/aterskapas med vanlig direktpush." >&2
      exit 1
    fi
    require_current_head "$local_sha"
    if ! git merge-base --is-ancestor "$remote_sha" "$local_sha" >/dev/null 2>&1; then
      echo "[hooks] STOPP: preview far aldrig force-pushas." >&2
      exit 1
    fi
    node scripts/workflow/preview-push.mjs --hook "$remote_sha" "$local_sha" || exit 1
    # Exakt base/head-plan finns redan; kor inte samma plan igen nedan.
    continue
  fi
  # Agarnas frysta aterstallningspunkter ar write-once i HOOKEN, inte
  # create-once: att SKAPA en ny backup ar hela poangen, medan varje andring
  # eller radering av en befintlig ar stangd har. GitHub-rulesetet
  # "Protect BRA backups" blockerar bara deletion och non_fast_forward —
  # en vanlig fast-forward kan fortfarande slappas igenom server-side.
  # Hooken ar darfor ensam om att stoppa FF. Ingen break-glass har.
  case "$remote_ref" in
    refs/heads/*BRA*|refs/heads/rescue/*)
      if [ "$local_sha" = "$ZERO_SHA" ]; then
        echo "[hooks] Push stoppad: ${remote_ref} ar en fryst backup och far aldrig raderas." >&2
        exit 1
      fi
      if [ "$remote_sha" != "$ZERO_SHA" ]; then
        echo "[hooks] Push stoppad: ${remote_ref} ar en fryst backup och far aldrig andras." >&2
        exit 1
      fi
      ;;
  esac

  # master far fast-forward-pushas. Force-push och delete ar fortfarande stangda.
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
    continue
  fi

  # Ny branch och branch-delete ar inte non-fast-forward. Alla uppdateringar av
  # en befintlig ref maste bevisa att remote-tip ar ancestor till local-tip.
  # Remote-delete ags av GitHub deleteBranchOnMerge eller en wrapper som redan
  # bevisat exakt tip (mergad PR-head eller archive/<branch>-tagg). Ett vanligt
  # git push --delete far aldrig kunna radera en annan agents oppna branch.
  if [ "$local_sha" = "$ZERO_SHA" ]; then
    delete_branch=${remote_ref#refs/heads/}
    if [ "${SAJTMASKIN_PROVEN_REMOTE_DELETE_BRANCH:-}" != "$delete_branch" ] ||        [ "${SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA:-}" != "$remote_sha" ]; then
      echo "[hooks] Push stoppad: remote-delete kraver bevis bundet till exakt remote-tip." >&2
      echo "[hooks] Kor: npm run tidy -- --delete-remote ${delete_branch} --apply" >&2
      exit 1
    fi
    continue
  fi
  pushed_commit=$(peel_to_commit "$local_sha")
  if [ -z "$pushed_commit" ]; then
    echo "[hooks] Push stoppad: kunde inte lasa commiten bakom ${local_ref}." >&2
    exit 1
  fi
  if ! is_published_label_create "$pushed_commit"; then
    require_current_head "$pushed_commit"
    verify_needed=1
  fi
  if [ "$remote_sha" = "$ZERO_SHA" ]; then continue; fi
  if git merge-base --is-ancestor "$remote_sha" "$pushed_commit" >/dev/null 2>&1; then continue; fi

  reason=${SAJTMASKIN_BREAK_GLASS_REASON:-}
  if [ "$SAJTMASKIN_BREAK_GLASS" != "1" ] || [ "${#reason}" -lt 12 ]; then
    echo "[hooks] Push stoppad: ${remote_ref} skulle skrivas om non-fast-forward." >&2
    echo "[hooks] Hamta remote och bevara commits. Break-glass kraver agarsbeslut och tydlig orsak." >&2
    exit 1
  fi
  echo "[hooks] BREAK-GLASS non-fast-forward ${remote_ref}: ${reason}" >&2
done

if [ "$verify_needed" = "0" ]; then exit 0; fi

# verify:pr --plan laser arbetskopian. Om den ar smutsig kan en ocommitterad
# fix dolja att den aldre HEAD-commiten ar det som pushas. Krav darfor exakt
# rent trad innan nagon plan-/CI-escape tillats.
WORKTREE_STATUS=$(git status --porcelain --untracked-files=normal 2>/dev/null) || {
  echo "[hooks] Push stoppad: kunde inte verifiera att arbetskopian ar ren." >&2
  exit 1
}
if [ -n "$WORKTREE_STATUS" ]; then
  echo "[hooks] Push stoppad: arbetskopian har ocommitterade eller osparade filer." >&2
  echo "[hooks] Commit:a exakta paths eller radda arbetet innan push; planen ska prova exakt HEAD." >&2
  exit 1
fi

# Runner-signaler far bara hoppa over den dyra lokala verifieringen, aldrig
# ref-sakerheten ovan. Exakt "true" gor att ett vanligt CI=false inte blir en
# oavsiktlig bypass.
if [ "${GITHUB_ACTIONS:-}" = "true" ] || [ "${CI:-}" = "true" ]; then exit 0; fi

if [ "$SAJTMASKIN_SKIP_VERIFY_HOOKS" = "1" ]; then exit 0; fi

# Git exporterar repository-lokala variabler till hooken. Verifieringen startar
# tester och verktyg som avsiktligt arbetar i egna temporara repon; de maste fa
# losa sitt repo fran cwd. Codex kan samtidigt injicera safe.directory via
# GIT_CONFIG_COUNT, sa efter saneringen byggs exakt arbetsrotens safe-entry ater.
# Git far sjalv kanonisera sokvagen: Git Bash pwd ger /c/... medan git.exe
# jamfor safe.directory mot C:/..., och de formerna ar inte alltid likvardiga.
VERIFY_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "[hooks] Push stoppad: kunde inte lasa verifieringens arbetsrot." >&2
  exit 1
}
if [ -z "$VERIFY_ROOT" ]; then
  echo "[hooks] Push stoppad: verifieringens arbetsrot ar tom." >&2
  exit 1
fi
GIT_LOCAL_ENV_VARS=$(git rev-parse --local-env-vars 2>/dev/null) || {
  echo "[hooks] Push stoppad: kunde inte isolera git-miljon for verifieringen." >&2
  exit 1
}
for GIT_LOCAL_ENV_VAR in $GIT_LOCAL_ENV_VARS; do
  unset "$GIT_LOCAL_ENV_VAR"
done
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=safe.directory
GIT_CONFIG_VALUE_0=$VERIFY_ROOT
export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0

command -v npm >/dev/null 2>&1 || {
  echo "[hooks] STOPP: npm saknas; kan inte kora npm run verify:pr -- --plan." >&2
  echo "[hooks] Endast med agarsbeslut: SAJTMASKIN_SKIP_VERIFY_HOOKS=1 git push" >&2
  exit 1
}

echo "[hooks] Planerar diffen med npm run verify:pr -- --plan fore push..."
npm run verify:pr -- --plan
status=$?
if [ "$status" -ne 0 ]; then
  echo "[hooks] Push stoppad: npm run verify:pr -- --plan blev rod." >&2
  echo "[hooks] Ratta felet och forsok igen. Escape hatch kraver agarsbeslut." >&2
fi
exit "$status"
