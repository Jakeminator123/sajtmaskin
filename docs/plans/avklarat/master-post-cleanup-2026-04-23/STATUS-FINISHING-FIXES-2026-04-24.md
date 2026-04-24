# Sekventiell omplanering — post-cleanup master

Det här paketet är **den tredje omskrivningen**, men den är inte en total omstart. Den tar föregående rework-paket och justerar det mot den nyaste state du gav:

- `master` är i sync med `origin/master`
- `c7798dce5` var tidigare låst state
- därefter finns en liten cleanup-våg på `master` med fyra viktiga effekter:
  - F2/design-preview-lane har slimats
  - preview-host har fått HMR-handshake-fix
  - docs/schema/planer har synkats mot det nya F2/F3-språket
  - en del äldre planpunkter är inte längre akuta kodjobb

Det gör att de gamla planerna inte ska kastas, men de ska **krympas, byta ordning och delvis byta fokus**.

## Vad som ändrats mot föregående zip

1. **Ops före kod.** Ny plan 01 tvingar först fram deploy/env/smoke så du inte gör onödigt kodarbete för problem som redan är lösta men inte utrullade.
2. **F2/F3-kontraktet är omskrivet.** Det gamla pre-VM-spåret är nu en mer exakt plan om runtime-truth och versionsmodal, eftersom F2-gaten verkar ha ändrats i aktuell HEAD.
3. **HMR-spåret är inte längre ett stort kodspår.** Det är nu främst rollout/verifiering, inte en ny stor fixplan.
4. **Deep Brief och follow-up har fått en renare plan.** Fokus ligger nu på delta-semantik, inte ännu en bred docs-övning.
5. **3D-spåret är kvar högt.** Ditt pizza/three-fiber-scenario är fortfarande ett av de tydligaste verklighetstesten.
6. **Senare arkitekturpass finns kvar men sist.** Unified repair call och PromptKit är fortfarande bra mål, men inte först.

## Rekommenderad standardordning

Kör i denna ordning om du vill ha säkrast väg med minst mergefriktion:

0. `00-head-lock-post-cleanup.md`
1. `01-manual-rollout-and-smoke-baseline.md`
2. `02-f2-f3-runtime-truth-and-version-modal.md`
3. `03-followup-technical-skip-reason-and-verifier-truth.md`
4. `04-fixer-surface-and-trigger-matrix.md`
5. `05-single-fixer-entrypoint-and-lane-collapse.md`
6. `06-deep-brief-and-followup-delta-contract.md`
7. `07-3d-capability-injection-and-three-fiber-hardening.md`
8. `08-core-simplification-orchestrate-route-plan.md`
9. `09-legacy-ripout-and-config-pruning.md`
10. `10-latency-budgets-and-safe-skip-rules.md`
11. `11-unified-repair-call.md`
12. `12-prompt-kit-canonical-composer.md`

## Om du vill få mest effekt snabbast

Om du bara vill köra den viktigaste halvan först:

- 00
- 01
- 02
- 03
- 06
- 07

Det är den kortaste vägen till:
- sannare versionsmodal
- mindre verifieringsförvirring
- bättre follow-up-beteende
- bättre chans att 3D/rich visuals faktiskt fungerar igen

## Vad som sannolikt blir `short` eller `skip`

Efter plan 00 och 01 kan vissa planer kortas:

- **Plan 02** blir kort om falska fel i modalen nästan försvinner efter deploy + env + smoke.
- **Plan 03** blir kort om `followup_technical` bara har dålig signalering och inte verkligt fel beteende.
- **Plan 06** blir kort om AI-assist redan är praktiskt död och det bara behövs tombstones + tests.
- **Plan 09** blir kort om stora delar av legacy redan är bortrensade i senaste cleanup-vågen.

## Vad du inte ska göra

- Kör inte alla planer i parallella worktrees.
- Kör inte 02 och 03 samtidigt.
- Kör inte 06 och 08 samtidigt.
- Kör inte 07 parallellt med stora runtime/statusändringar.

Använd i stället `WORKTREE-RUNBOOK.md` för begränsad parallellkörning.

## Extra filer i paketet

- `WORLD-CLASS-LLM-FLOW.md` — en ren, instruerande målbild för init/follow-up i tre faser
- `WORKTREE-RUNBOOK.md` — hur du kör detta med Cursor Cloud Agents / worktrees utan att skapa onödiga konflikter
- `DIFF-FROM-PREVIOUS-ZIP.md` — vad som faktiskt ändrats jämfört med förra paketet
