---
id: 2026-06-17-repo-tvatt
status: active
created: 2026-06-17
linear: null
parent: null
supersedes: null
---

# Repo-tvätt: terminologi + kontraktsägarskap (omstart Sajtmaskin)

> Paraply-/router-plan. Detta gäller **`Jakeminator123/sajtmaskin`** (master). `sajtbyggaren` (Desktop) används **endast som referens** för governance-idéer — inga ändringar görs där.

## I klartext (vad vi gör)

Appen fungerar. Vi ska **inte bygga om den** och **inte flytta mappar i stor skala**. Vi gör tre saker, i ordning:

1. **Bestäm betydelse + ägare.** Varje förvirrande ord (`scaffold`, `variant`, `dossier`, `lane`, `stream`, `F2/F3`, `sandbox`, `dashboard`…) ska betyda **en** sak och ägas av **en** plats i koden. Skriv ner det.
2. **Sätt en automatisk vakt.** Ett litet skript som säger ifrån när någon återinför ett förbjudet/dubblerat ord (mekanisk enforcement → regression-skydd).
3. **Fixa riktiga buggar tryggt bakom vakten.** Klassen "ser grönt ut men är trasigt" (false-green) + död kod.

Allt görs av **builder-agenter på egna grenar**; Jake + orchestrator granskar och mergar.

## Grundtes

Namnöverlappning är **symptom**, inte grundfel. Grundfelet: flera ord blandar produktnivå / pipeline-nivå / UI-nivå / runtime-nivå / legacy. Repot har redan router + ordlista + signal-ägarmatris — men de är inte **mekaniskt enforced**. Vi gör dem det.

**En regel att styra efter:** *Varje domänterm har exakt en owner, ett syfte, ett input-kontrakt och ett output-kontrakt.*

## Icke-mål

- Ingen stor omskrivning eller bred mappflytt (`src/lib/gen/` är redan uppdelat efter OMTAG 2026-04-23).
- Inte göra `sajtbyggaren` till ny bas — ta dess **governance-light**, inte dess runtime-arkitektur.
- Ingen bred rename i ett svep (high churn). Renames rider med i filer vi ändå rör, bakom vakten.

## Arbetssätt (operating model)

```
Scout (read-only)  ─►  term/kontrakt-karta  ─►  VI godkänner PR-prompt
        │                                              │
        └──────────── foundation för PR0/PR1 ──────────┘
                                                        ▼
   Builder-agent per PR ─► egen branch/worktree ─► GATE ─► PR → master
                                                        ▼
                                              Jake + orchestrator granskar → merge
```

**Isolering (obligatorisk):** varje builder kör på egen branch/`git worktree` — aldrig dela HEAD (se [`agent-worktree.mdc`](../../../.cursor/rules/agent-worktree.mdc)). Ingen builder öppnar `/builder` eller engine-endpoints under aktiv gen-session (se [`builder-coexistence.mdc`](../../../.cursor/rules/builder-coexistence.mdc)).

## Gate-definition (per PR innan merge)

| Check | Krav |
|---|---|
| `npm run typecheck` | 0 fel |
| `npm run lint` | 0 fel |
| `npx vitest run` | befintliga gröna |
| `check-term-coverage` (efter PR1) | inga nya förbjudna alias |
| Deterministisk eval (för beteende-PR) | ingen regression mot baseline |

Beteende-neutrala PR (PR0–PR3) kan köras långa/autonoma i cloud. Beteende-ändrande (PR4–PR5) får tightast granskning.

## PR-kö

| PR | Mål | Typ | Risk | Befintligt spår |
|---|---|---|---|---|
| **PR0** | `docs/architecture/terms-and-owners.md` (term → ägare → input/output-kontrakt → förbjudna alias) | Docs | Låg | nytt |
| **PR1** | `naming-dictionary.json` + `scripts/dev/check-term-coverage.mjs` + koppla in i preflight/CI | Verktyg | Låg · **keystone** | nytt |
| **PR2** | `FollowUpContract`-typ (samlar snapshot-brief, låst scaffold/variant, route-freeze → kompileringsgaranti för init↔follow-up) | Struktur | Låg–medel | relaterar till [O `…startlinje.md`](./2026-04-28-llm-flode-startlinje.md) |
| **PR3** | UI/docs-term-pass ("Variant" ej "Scaffold Variant"; "Design Preview"/"Integration Build" för F2/F3; `backoffice` ej `dashboard`) | UI/docs | Låg | **fortsätt** [Q `…f2-f3-ux-copy…`](./2026-05-01-f2-f3-ux-copy-konsolidering.md) |
| **PR4** | "lane" begränsas till fixer/repair (verifiera serialiserade `FixLane`-värden först) | Kod | Medel | **fortsätt** [N `…lane-collision.md`](./2026-04-27-followup-vs-autorepair-lane-collision.md) |
| **PR5** | Bugg-härdning false-green: dossier-stubbar, F2 product-postcheck/warm-verify fail-closed, F3 readiness — gated av deterministisk eval | Beteende | Medel | [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #11 + [R-incident](./2026-05-02-builder-followup-preview-incident.md) |

## Regression-tester (ja — egen track, vävs in)

Regression-skydd är **förutsättningen** som gör resten trygg, inte ett sidospår. Tre konkreta delar (lättviktigt — undvik `sajtbyggaren`s "för många"-fälla):

| Del | Vad | Var |
|---|---|---|
| **Term-coverage** | Mekanisk vakt mot namnskuggor (PR1) | `scripts/dev/check-term-coverage.mjs` |
| **Deterministisk golden-path-eval** | 3–4 branschcases, nyckelfri, baseline-json — billig CI-gate för scaffold/route/copy + follow-up-läckage (port från sajtbyggaren) | nytt, t.ex. `npm run eval:deterministic` |
| **Riktade router/follow-up-regressioner** | ~30–50 prompt→förväntat intent + `core`-testlane + `docs/testing.md` | Vitest, befintlig svit (~279 filer) |

Plus en kort `docs/delivery-bias.md` (nytt test bara vid kontrakt/ersättning/konsolidering) för att inte återskapa test-svällen.

## Relation till befintliga aktiva spår

Denna plan **äger inte** LLM-flödet — den lägger en *terminologi/kontrakt-lins* ovanpå och dirigerar mot:

- [O `2026-04-28-llm-flode-startlinje.md`](./2026-04-28-llm-flode-startlinje.md) — LLM-masterplan (läs först vid LLM-flöde-arbete). PR2/PR5 matar in här.
- [N `2026-04-27-followup-vs-autorepair-lane-collision.md`](./2026-04-27-followup-vs-autorepair-lane-collision.md) — "lane" → PR4.
- [Q `2026-05-01-f2-f3-ux-copy-konsolidering.md`](./2026-05-01-f2-f3-ux-copy-konsolidering.md) — F2/F3-copy → PR3.
- [`Kvarvarande-uppgifter.md`](./Kvarvarande-uppgifter.md) #11 (event-bus UI-flip) + #9 (orchestrate-split) → PR5 / städ.

> `active/` har >8 filer. Del av PR0-hygienen: re-triage `BUG-SWARM-BACKLOG.md` (~50% arkiv) och stäng/slå ihop stale spår — färre planfiler, inte fler.

## Status / nästa beslut

- [x] Scout (read-only) startad: term → ägare → kontrakt-karta + forbidden-alias-seed.
- [ ] **Beslut Jake:** godkänn PR-kö + gate-modell (eller ändra ordning/scope).
- [ ] **Beslut Jake:** efter scout — skriv builder-prompt för **PR0+PR1 ihop** (beteende-neutral) för signoff innan körning.
- [ ] Kör gated builder per godkänd PR → PR → granska → merge.
