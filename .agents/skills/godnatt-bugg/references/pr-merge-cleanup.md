# PR-, review-, merge- och cleanup-gate

Den kanoniska källan är repots aktuella .cursor/rules/pr-merge.mdc tillsammans
med git.mdc, workflow.mdc, agent-worktree.mdc och BUG-SWARM-BACKLOG.md. Läs dem
på nytt vid varje pass. Den här referensen är ett körprotokoll, inte en ersättare
för reglerna.

## Före PR

1. Verifiera full diff inklusive ospårade filer.
2. Kör fokuserade regressionstester, countertest och tillämpliga quality-,
   backoffice-, schema- och buildkontroller.
3. Kör oberoende bugggranskning på hela diffen; ett fullgott separat
   reviewer-agentpass räcker. Kör inte en identisk extra procedur.
4. Commitera med begriplig scope, kontrollera git status och pusha worker-
   branchen.
5. Skapa draft-PR mot preview och spara PR-nummer/head-SHA.
6. Uppdatera backloggrad och PR-body enligt backloggens same-PR-regel. Om detta
   skapar ny commit måste oberoende bugggranskning och SHA-känsliga kontroller köras om.

## Läs hela PR-tillståndet

Använd gh eller GitHub-connectorn för att läsa minst:

    gh pr view PR --json number,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,createdAt,labels,reviews,reviewDecision,statusCheckRollup,url
    gh pr checks PR
    gh api repos/OWNER/REPO/pulls/PR/comments --paginate
    gh api repos/OWNER/REPO/issues/PR/comments --paginate
    gh api repos/OWNER/REPO/pulls/PR/reviews --paginate

Verifiera att kommentarer/reviews gäller aktuell head-SHA. En budget-/usage-
limit-kommentar är inte en review och utlöser lokal fallback.

## Reviewordning

Kräv en oberoende readonly-granskare för aktuell diff/head, och triagera även
GitHub-Bugbot/Codex-fynd när de finns. En quota-/neutral-check är inte review.
Ingen automatisk betald API-review eller kontofallback ska startas.

GitHubs required checks är verifieringsgrind, inte bevis för review. Ny head
eller flyttad integrationsbas gör äldre resultat stale enligt rulesetet. Vänta
icke-blockerande och gör en färsk helhetsavläsning före merge.

Efter ett reviewfynd:

1. Triagera mot faktisk kod och hela branchdiffen.
2. Fixa P0/P1 eller pausa.
3. Kör regression/countertest och berörda gates igen.
4. Commitera/pusha och betrakta tidigare bugggranskning och SHA-känsliga
   resultat som stale.

Godnatt-bugg tillåter högst tre sådana korrigeringsvarv. Taket är en
eskaleringsgräns, aldrig tillåtelse att merga kvarvarande fel.

## Mandat

Merge kräver batchens uttryckliga eller förhandsvillkorade preview-mandat. Ett
villkorat mandat behöver inte frågas om igen när GitHubs angivna native villkor
är uppfyllda. Ett vanligt fixuppdrag är inte mergemandat.

## Full merge-gate

Merga endast när allt är sant:

- PR är ej draft, base är preview och mergeable.
- GitHubs required checks är gröna för aktuell head och integrationsbas.
- Vercel är grön eller saknas enligt reporegeln.
- Inga requested changes, blockerande trådar eller öppna P0/P1 finns.
- Labels do-not-merge, agent:needs-human, risk:4 eller risk:5 saknas eller har
  uttryckligt ägarbeslut enligt regeln.
- Oberoende bugggranskning och triage gäller exakt head- och live preview-base-SHA.
- PR-body och backloggändring beskriver det som faktiskt ska mergeas.

Använd GitHubs vanliga mergefunktion enligt `pr-merge.mdc`. Ingen admin-bypass.
Känsliga ytor kräver ownerbeslut i PR:n; okända effekter mot delad
produktions-DB är stopp.
Detta pass promoterar eller mergar aldrig master.

## Cleanup-handoff

Godnatt-bugg använder appens current worktree som pass-worktree. Agenten får
aldrig köra worktree:remove eller rå git worktree remove på det. Desktop äger
worktree-teardown och håller retentionen bounded.

Efter verifierad merge:

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

Remote-delete körs bara när branchen fortfarande finns, dess live-tip fortfarande
är exakt den verifierade head-SHA:n och antingen Git-ancestry eller en mergad
GitHub-PR med samma branch/head-SHA är bevisad. `--force-with-lease` låser även
racet mellan kontroll och delete; en ny remote-commit bevaras och stoppar
cleanup. GitHub kan redan ha raderat branchen. Ett tomt/felande GitHub-svar är
stopp. Den utcheckade lokala branchen lämnas till appens teardown. Flytta state
till cleanup först efter denna verifiering. State återläser PR, ren registrerad
worktree på exakt PR-head och framgångsrik `ls-remote` utan pass-ref både vid
cleanup och complete. GitHub-ancestry måste binda registrerad mergecommit till
aktuell preview (identical/ahead med exakt merge-base); rewind/divergence eller
API-/Git-fel är stopp. Complete verifierar endast att
worktreet är redo för app-handoff, inte att Desktop redan utfört teardown.
Vid dirty/omergad branch eller
permanent/current-path-risk: pausa och bevara.
