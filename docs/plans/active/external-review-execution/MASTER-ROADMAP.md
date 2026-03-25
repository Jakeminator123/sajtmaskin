# MASTER ROADMAP — External review execution

**Sanning (% , Done-lista, commit):** [external-review-remediation-progress.md](../external-review-remediation-progress.md)  
**W1–W5 översikt:** [orchestrator-workloads-external-review.md](../orchestrator-workloads-external-review.md)

---

## Snabbnavigering — spår

| Spår | Fil | Typisk parallell med |
|------|-----|----------------------|
| W3 Own-engine | [track-w3-own-engine.md](./track-w3-own-engine.md) | W4 (olika träd) |
| W4 Scripts | [track-w4-scripts.md](./track-w4-scripts.md) | W3 |
| W2 Hardening (valfritt) | [track-w2-deploy-hardening.md](./track-w2-deploy-hardening.md) | W4 om deploy-kod inte krockar |
| W1 Follow-ups (valfritt) | [track-w1-landing-followups.md](./track-w1-landing-followups.md) | W4, **inte** W3 stream-routes |

---

## Fas-checklista (rollup)

Bocka här när **hela spåret** uppfyller exit-kriteriet i respektive track-fil, eller när orchestratorn fryser en milestone.

### Fas 0 — Redan levererat (referens)

- [x] W1 kärna: `LandingBackground`, landningsdata/hooks, hero/footer split (se progress-doc Done)
- [x] W2 kärna: registry, manifest i version, deployReadiness (se progress-doc Done)
- [x] W3 delmängd: contract-gate SSE, finalize/rollback, generation-pipeline-namn, generation-meta i session (se [track-w3](./track-w3-own-engine.md) `[x]`)

### Fas A — Pågående huvudfokus (hög hastighet)

- [ ] **W3** — Own-engine session + transaktioner/golden enligt [track-w3-own-engine.md](./track-w3-own-engine.md) (alla `[ ]` under *Återstår* bockade)
- [ ] **W4** — Scripts/README/lab enligt [track-w4-scripts.md](./track-w4-scripts.md) (alla `[ ]` under *Återstår* bockade)

### Fas B — Valfri hårdning

- [ ] **W2** — Deploy/auto-fix enligt [track-w2-deploy-hardening.md](./track-w2-deploy-hardening.md)
- [ ] **W1** — Små UX-followups enligt [track-w1-landing-followups.md](./track-w1-landing-followups.md)
- [ ] **W5** — Kör kritik-lista som regressionspass (ingen kodändring nödvändig): `.j_to_agent/structure_bugs_and_parralells/kritik/`

---

## Parallellisering (orchestrator-beslut)

| Våg | Samtidiga workers | Villkor |
|-----|-------------------|---------|
| A1 | W3 + W4 | Max **en** W3-worker som rör `src/app/api/v0/chats/**/stream/route.ts` per merge; W4 håller sig till `scripts/**` + dokumentation som pekar på scripts |
| A2 | Endast W3 | Om W3 behöver **två** ändringar i samma stream-filer — kör **sekventiellt** |
| B | W2 + W4 | OK om filöverlapp saknas; annars sekventiellt |

---

## Orchestrator / verifiering

| Datum | Branch | Verifierat | Anteckning |
|-------|--------|------------|--------------|
| 2026-03-25 | master | typecheck + vitest | W3: `buildOwnEngineGenerationStreamMeta` (se progress-doc) |

*Nya rader läggs överst av orchestrator eller avslutande worker efter `npm run typecheck && npx vitest run`.*

---

## Agent som får detta som uppdrag

Kopiera minimalt:

```
Läs docs/plans/active/external-review-execution/README.md och docs/plans/active/external-review-execution/MASTER-ROADMAP.md.
Arbeta enligt docs/plans/active/external-review-execution/<track-fil>.md — bocka av [x] för det du levererar i den filen.
Kör npm run typecheck && npx vitest run. Uppdatera external-review-remediation-progress.md om % ändras. Commit enligt rutinen där.
```

Byt ut `<track-fil>` mot t.ex. `track-w3-own-engine.md` eller `track-w4-scripts.md`.
