# PR-, review-, merge- och cleanup-gate

Körprotokoll för full mode, inte en ersättare för `.cursor/rules/pr-merge.mdc`,
`git.mdc`, `workflow.mdc`, `agent-worktree.mdc` och backloggens same-PR-regel.
Läs dem på nytt vid varje pass.

Före PR gäller SKILL.md steg 5–7: full diff inklusive ospårade filer,
regression/countertest och tillämpliga quality-, backoffice-, schema- och
buildkontroller, oberoende bugggranskning, draft-PR och same-PR-backlogg.

## Läs hela PR-tillståndet

    gh pr view PR --json number,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,createdAt,labels,reviews,reviewDecision,statusCheckRollup,url
    gh pr checks PR
    gh api repos/OWNER/REPO/pulls/PR/comments --paginate
    gh api repos/OWNER/REPO/issues/PR/comments --paginate
    gh api repos/OWNER/REPO/pulls/PR/reviews --paginate

Kommentarer och reviews ska gälla aktuell head-SHA. En budget-/usage-limit- eller
quota-/neutral-kommentar är inte review och utlöser lokal fallback; ingen
automatisk betald API-review eller kontofallback. Required checks är
verifieringsgrind, inte reviewbevis. Ny head eller flyttad integrationsbas gör
äldre resultat stale; gör en färsk helhetsavläsning före merge.

Efter ett reviewfynd: triagera mot faktisk kod och hela branchdiffen, fixa P0/P1
eller pausa, kör regression/countertest och berörda gates igen, commitera/pusha
och betrakta tidigare granskning som stale. Högst tre korrigeringsvarv; taket är
en eskaleringsgräns, aldrig tillåtelse att merga kvarvarande fel.

## Full merge-gate

Merge kräver batchens uttryckliga eller förhandsvillkorade preview-mandat (ett
villkorat mandat frågas inte om igen när native villkor är uppfyllda; ett vanligt
fixuppdrag är inte mergemandat). Merga endast när allt är sant:

- PR är ej draft, base är preview och mergeable.
- Required checks är gröna för aktuell head och integrationsbas.
- Vercel är grön eller saknas enligt reporegeln.
- Inga requested changes, blockerande trådar eller öppna P0/P1.
- Labels `do-not-merge`, `agent:needs-human`, `risk:4` eller `risk:5` saknas
  eller har uttryckligt ägarbeslut.
- Oberoende bugggranskning och triage gäller exakt head- och live preview-base-SHA.
- PR-body och backloggändring beskriver det som faktiskt mergeas.

Använd GitHubs vanliga mergefunktion enligt `pr-merge.mdc`, ingen admin-bypass.
Känsliga ytor kräver ownerbeslut i PR:n; okända effekter mot delad
produktions-DB är stopp. Passet promoterar eller mergar aldrig master.

## Cleanup-handoff

Appens current worktree är pass-worktree; kör aldrig `worktree:remove` eller rå
`git worktree remove` på det. Desktop äger teardown. Efter verifierad merge:

    cleanup_pass_remote() {
      case "$PASS_BRANCH" in
        fix/*|feat/*|docs/*|chore/*) ;;
        *) echo "STOPP: ogiltig cleanup-branch: $PASS_BRANCH" >&2; return 1 ;;
      esac
      printf '%s\n' "$PASS_BRANCH" | grep -Eq '^(fix|feat|docs|chore)/[a-z0-9][a-z0-9._/-]*$' || return 1
      git fetch origin preview || return 1
      PASS_SHA=$(git rev-parse --verify "${PASS_BRANCH}^{commit}") || return 1
      printf '%s\n' "$PASS_SHA" | grep -Eq '^[0-9a-fA-F]{40}$' || return 1

      if ! git merge-base --is-ancestor "$PASS_BRANCH" origin/preview; then
        MERGED_SHA=$(gh pr list --state merged --base preview --head "$PASS_BRANCH" \
          --json headRefName,headRefOid,mergedAt \
          --jq ".[] | select(.headRefName == \"$PASS_BRANCH\" and .headRefOid == \"$PASS_SHA\" and .mergedAt != null) | .headRefOid") || return 1
        if [ "$MERGED_SHA" != "$PASS_SHA" ]; then
          echo "STOPP: varken Git-ancestry eller exakt mergad PR bevisar $PASS_BRANCH@$PASS_SHA" >&2
          return 1
        fi
      fi

      REMOTE_REF=$(git ls-remote --heads origin "refs/heads/$PASS_BRANCH") || return 1
      if [ -n "$REMOTE_REF" ]; then
        REMOTE_SHA=${REMOTE_REF%%[[:space:]]*}
        if [ "$REMOTE_SHA" != "$PASS_SHA" ]; then
          echo "STOPP: remote-tip $REMOTE_SHA skiljer sig från verifierad merge-SHA $PASS_SHA; branchen bevaras." >&2
          return 1
        fi
        SAJTMASKIN_PROVEN_REMOTE_DELETE_BRANCH="$PASS_BRANCH" \
          SAJTMASKIN_PROVEN_REMOTE_DELETE_SHA="$PASS_SHA" \
          git push --force-with-lease="refs/heads/$PASS_BRANCH:$PASS_SHA" \
            origin ":refs/heads/$PASS_BRANCH" || return 1
      fi
    }
    if ! cleanup_pass_remote; then
      echo "STOPP: pass-branchen bevaras." >&2
      return 1 2>/dev/null || exit 1
    fi
    unset -f cleanup_pass_remote

Remote-delete sker bara när branchen finns, dess live-tip är exakt den
verifierade head-SHA:n och Git-ancestry eller en mergad GitHub-PR med samma
branch/head-SHA är bevisad. `--force-with-lease` låser racet mellan kontroll och
delete: en ny remote-commit bevaras och stoppar cleanup. GitHub kan redan ha
raderat branchen; ett tomt eller felande GitHub-svar är stopp. Den lokala
branchen lämnas till appens teardown.

Flytta state till cleanup först efter denna verifiering. State återläser PR, ren
registrerad worktree på exakt PR-head och lyckad `ls-remote` utan pass-ref vid
cleanup och complete, och GitHub-ancestry måste binda mergecommiten till aktuell
preview; rewind/divergence eller API-/Git-fel är stopp. Complete verifierar bara
att worktreet är redo för app-handoff. Vid dirty/omergad branch eller
permanent/current-path-risk: pausa och bevara.
