# Scaffold-komposition och städ — master plan

**Skapad:** 2026-08-21. **Ägare:** Jakob + arbetsledande agent (Builder A).
**Bas för analysen:** `master` @ `0c13d9226` + prod-telemetri 11–19 aug.

## Målbild

1. Webboutput får **verklig kompositionsvariation** — inte tre scaffolds som
   hårdkodar samma split-hero och varianter som bara byter färg.
2. **En sanning per yta** i kedjan scaffold → variant → mall → addendum →
   prompt: död och dubbel logik bort.
3. Housekeeping grönt: tester, strikta scheman, control-plane-register,
   genererade docs och embeddings speglar koden efter ändringarna.

Detta är kvalitetsförbättring av **befintliga** kontrakt (MVP-bias: inga nya
produktytor, inga nya lager).

## Belagt nuläge (verifierat mot kod + prod)

| Fynd | Bevis |
|---|---|
| Tre webbscaffolds hårdkodar samma split-hero (text vänster + Card höger) | `landing-page/files/app/page.tsx:29`, `saas-landing/.../page.tsx:50`, `portfolio/.../page.tsx:44,99`; saas-manifestet befaller höger produktkort |
| Varianter muterar aldrig filer — bara tokens/promptrader; 6/10 landing-varianter beskriver själva splitten | `config/scaffold-variants/landing-page/*.json`, `scaffold-stack.ts:95–131` |
| Variantens `layouts` når init **och** `clear-redesign` (compact stängs av: `build-dynamic-context.ts:157–161`); vanliga follow-ups får 2 anti-patterns by design. **Variantinspirationen (stillbild + utdrag) är däremot init-only** (`finalize-prompts.ts:147–152`) — redesign får mindre visuell grundning än init | `scaffold-stack.ts:36–55`, `build-dynamic-context.ts:157–161`, `finalize-prompts.ts:147–152` |
| Addendum (prio 84) och UI Recipes (80) prunas före required scaffold/variant/brief (90–94) | `system-prompt/budget.ts:19–104` |
| `scaffold-scoring.ts` (`getScaffoldBoost`, `computeScaffoldScores`) saknar anropare; skyddas från dead-code-checken via `knip.json` | grep 2026-08-21; CLI-spegeln `scripts/db/scaffold-scores.mjs` är Backoffice-ytans datakälla och ska vara kvar |
| `registry.ts:82–98` mergar fortfarande research-overrides (legacy `template-library`) | läst 2026-08-21 |
| Manifest-`tags` når bara embeddings; matchern använder hårdkodade keyword-banks | `scaffold-embeddings-core.ts:37` vs `matcher.ts:130–160` |
| Prod: webb bootar bäst (landing 98 % preview-OK av 48), `app-shell` **0 %** av 5 | `generation_telemetry` 11–19 aug |

«App-scaffolds blir bättre» handlar alltså om **rumsgrammatik** (sidebar,
KPI, tabeller = annan komposition), inte teknik eller tokens.

## Beroenden till öppna PR:er — merge-ordning först

| PR | Vad | Relation |
|---|---|---|
| [#1088](https://github.com/Jakeminator123/sajtmaskin/pull/1088) | Ecommerce-cart funktionell | Oberoende — landa när som helst |
| [#1087](https://github.com/Jakeminator123/sajtmaskin/pull/1087) | Brief-rankad mallval, `referenceTemplates`/`templateRecommendations` bort | **Landa före allt i denna plan** — rör alla manifest, plan-flödet och registerfilen |
| [#1090](https://github.com/Jakeminator123/sajtmaskin/pull/1090) | B4-kuration (19 addendum-beslut) | Rebasas ovanpå #1087 i [K1](aktiviteter/K1-registerforening-och-1090-rebase.md) |
| [#1084](https://github.com/Jakeminator123/sajtmaskin/pull/1084) | Next-pin 16.3.1 i export-baslinjen | Oberoende; bekräftar central Next-ägare |

## Ägarbeslut som blockerar K1

#1087 markerade 9 addenda `reviewed` (säkerhetskriterium: ofarliga utdrag).
#1090 stängde 5 av dem `disabled` (B4:s likformighetskriterium: generiska).
Registret kan bara ha ett värde. Rekommendation: **disabled vinner** — B4:s
syfte är att döda likformigheten, och utdragen kan vara ofarliga och ändå
skadliga för variationen.

| Mall | #1087 | #1090 | Dom |
|---|---|---|---|
| MindSpace `8QhCJAwn16K` | reviewed | disabled | **disabled** |
| Flowly `8Y9E0cStKrW` | reviewed | disabled | **disabled** |
| Marketing Website `sV0OtrkXM6x` | reviewed | disabled | **disabled** |
| Shadcn Dashboard `Pf7lw1nypu5` | reviewed | disabled | **disabled** |
| Pixar-portfolio `E3xFlIXCZi4` | reviewed | disabled | **disabled** |

Domarna satta 2026-08-21 enligt rekommendationen ovan, på ägarens delegering
(«DU får merga») i arbetsledningschatten. Ägaren kan riva upp enskilda domar i
K1-PR:ens granskning.

## Aktiviteter och vågordning

| Våg | Aktivitet | Kan köras parallellt med | Blockeras av |
|---|---|---|---|
| 0 | Ägare: merga #1088 → #1087; fyll i dom-kolumnen ovan | — | — |
| 1 | [K1 — registerförening + #1090-rebase](aktiviteter/K1-registerforening-och-1090-rebase.md) | inget (äger registerfilen) | Våg 0 |
| 2 | [K2 — hero-variation i filer](aktiviteter/K2-hero-variation-i-filer.md) | K3, K4 | #1087 mergad |
| 2 | [K3 — redesign-follow-up får variantinspirationen](aktiviteter/K3-redesign-follow-up-far-layouts.md) | K2, K4 | #1087 mergad |
| 2 | [K4 — död logik: scoring, research-merge, tags](aktiviteter/K4-dod-logik-scoring-research-tags.md) | K2, K3 | #1087 mergad |
| 3 | [K5 — housekeeping: scheman, policys, docs, embeddings](aktiviteter/K5-housekeeping-scheman-policys-docs.md) | inget (svepet ska se slutläget) | K1–K4 mergade |

K2/K3/K4 rör disjunkta filytor (scaffold-`files/`+variant-JSON respektive
prompt-renderaren respektive scoring/registry) och kan köras av parallella
agenter. Färdiga prompter: [`cloud-prompts.md`](cloud-prompts.md).

## Utanför scope

- Buggkön, SM-035, SM-070/live-review, domänköp (egna spår).
- `app-shell` 0 % preview-OK — rapporterad till `BUG-SWARM-BACKLOG.md` av K5,
  åtgärdas inte här.
- Nya produktytor, nya scaffolds, ny UI (MVP-bias).
- Byte av interna namn (`addendum`/`addenda`, kodidentifierare) — Källpaket är
  produktordet, koden behåller sina namn (`terminology.mdc`).

## Klart när

Alla fem aktiviteter mergade, K5:s svep grönt i CI, och en genererad sajt per
webbscaffold uppvisar olika hero-komposition i Selection Rationale-stickprov.
