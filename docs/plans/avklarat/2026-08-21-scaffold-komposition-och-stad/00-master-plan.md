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

## Belagt nuläge (verifierat mot kod + prod **före** K1–K4)

Analysbas: `master` @ `0c13d9226` + prod-telemetri 11–19 aug. Tabellen är
bakgrunden till vågorna, inte slutläget.

| Fynd | Bevis | Efter K1–K4 |
|---|---|---|
| Tre webbscaffolds hårdkodar samma split-hero | `landing-page`/`saas-landing`/`portfolio` `files/app/page.tsx` | **K2 #1093:** tre olika fil-hero (split / centrerad produkt-scen / bilddominant) |
| Varianter muterar aldrig filer; default-varianter beskrev splitten | `config/scaffold-variants/landing-page/*.json` | **K2:** default-`layouts` speglar filen |
| Variantinspiration (stillbild + utdrag) var init-only | `finalize-prompts.ts` | **K3 #1092:** init + `clear-redesign` |
| `scaffold-scoring.ts` saknade anropare | knip-undantag | **K4 #1091:** raderad; Backoffice läser `scripts/db/scaffold-scores.mjs` |
| Research-merge av legacy template-library | `registry.ts` | **K4:** merge behålls för `qualityChecklist`/`upgradeTargets`; `referenceTemplates` borta via #1087 |
| Manifest-`tags` vs keyword-banks | embeddings vs matcher | **K4:** `tags` dokumenterade som embeddings-only |
| Prod: `app-shell` **0 %** preview-OK av 5 | `generation_telemetry` 11–19 aug | **K5:** spårad som `SM-071` — ingen fix här |

«App-scaffolds blir bättre» handlar alltså om **rumsgrammatik** (sidebar,
KPI, tabeller = annan komposition), inte teknik eller tokens.

## Levererade PR:er

| PR | Vad | Status |
|---|---|---|
| #1088 | Ecommerce-cart funktionell | Mergad |
| #1087 | Brief-rankad mallval | Mergad |
| #1084 | Next-pin 16.3.1 | Mergad |
| #1094 | K1 registerförening (ersatte #1090) | Mergad |
| #1093 | K2 hero-variation | Mergad |
| #1092 | K3 redesign-inspiration | Mergad |
| #1091 | K4 död logik | Mergad |
| #1095 | K5 housekeeping och sanningssynk | Mergad |

## Ägarbeslut som K1 applicerade

#1087 markerade 9 addenda `reviewed` (säkerhetskriterium: ofarliga utdrag).
#1090 stängde 5 av dem `disabled` (B4:s likformighetskriterium: generiska).
Registret kan bara ha ett värde. **disabled vann** — B4:s syfte är att döda
likformigheten, och utdragen kan vara ofarliga och ändå skadliga för
variationen. Applicerat i #1094.

| Mall | #1087 | #1090 | Dom |
|---|---|---|---|
| MindSpace `8QhCJAwn16K` | reviewed | disabled | **disabled** |
| Flowly `8Y9E0cStKrW` | reviewed | disabled | **disabled** |
| Marketing Website `sV0OtrkXM6x` | reviewed | disabled | **disabled** |
| Shadcn Dashboard `Pf7lw1nypu5` | reviewed | disabled | **disabled** |
| Pixar-portfolio `E3xFlIXCZi4` | reviewed | disabled | **disabled** |

Domarna satta 2026-08-21 enligt rekommendationen ovan, på ägarens delegering
(«DU får merga») i arbetsledningschatten.

## Slutläge 2026-08-22 (K5)

K1–K5 är mergade. K5 (#1095, `2a0544c8`) sanningssynkade scheman,
control-plane, genererade docs, embeddings, handskrivna kontrakt,
Backoffice-paritet, `SM-071` och planhygien.

Aktivitetsfilerna K1–K4 är raderade — git + PR-tabellen ovan är arkivet.
Kvar är bara Selection Rationale-stickprov (en sajt per webbscaffold med olika
hero), inte mer kod i det här spåret.

## Aktiviteter och vågordning

| Våg | Aktivitet | PR | Status |
|---|---|---|---|
| 0 | Merga #1088 → #1087; fyll i dom-kolumnen | #1088, #1087 | Mergad |
| 1 | K1 — registerförening + #1090-rebase | #1094 | Mergad (aktivitetsfil raderad) |
| 2 | K2 — hero-variation i filer | #1093 | Mergad (aktivitetsfil raderad) |
| 2 | K3 — redesign-follow-up får variantinspirationen | #1092 | Mergad (aktivitetsfil raderad) |
| 2 | K4 — död logik: scoring, research-merge, tags | #1091 | Mergad (aktivitetsfil raderad) |
| 3 | K5 — housekeeping | #1095 | Mergad |

## Utanför scope

- Buggkön, SM-035, SM-070/live-review, domänköp (egna spår).
- Det äldre `app-shell`-utfallet — `SM-071` väntar ny repro i `BUG-SWARM-BACKLOG.md`; åtgärdas inte här.
- Nya produktytor, nya scaffolds, ny UI (MVP-bias).
- Byte av interna namn (`addendum`/`addenda`, kodidentifierare) — Källpaket är
  produktordet, koden behåller sina namn (`terminology.mdc`).

## Klart när

K1–K5 är mergade och K5:s svep var grönt i CI. Residual, inte kod: verifiera
olika hero-komposition med en genererad sajt per webbscaffold i Selection
Rationale-stickprov.
