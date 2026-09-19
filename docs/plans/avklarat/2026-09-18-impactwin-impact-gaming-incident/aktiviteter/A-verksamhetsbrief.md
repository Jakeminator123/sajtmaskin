# A — verksamhetsbrief: sluta bygga restaurang av en spelbeställning

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: DONE via #1485.
Typ: **kontraktsfix i kostnadsfri-promptkedjan**, inte ny wizard.

## Problemet (observation)

Kampanjraden hade `industry=null` och beskrivning om lotteri-/spelplattformar.
Den sparade `create_chat`-prompten sa ändå `Restaurang/Bar` och prioriterade
Meny / Boka bord. Briefen följde med `domainProfile=restaurant`. Genereringen
gjorde en restaurang med liveavatarer som dekoration.

`buildPromptFromWizardData()` skriver branschfältet i första meningen och
väljer `INDUSTRY_PAGES`. `restaurant` → Meny, Kontakt, Boka bord, Om oss.
Verksamhetsbeskrivningen fogas sedan in som separat stycke. Ingen avstämning
om de motsäger varandra.

Prefill från `industry=null` blir `""`, inte restaurant. Det är låst i
`wizard-prefill.test.ts`. Ursprunget till `industry=restaurant` *i den här
sessionen* är obevisat (knappklick eller bekräftat följdsvar). A0 mäter nästa
gång; A1–A2 väntar inte.

## Redan på plats

- Taxonomi-ägaren: `src/lib/builder/wizard-taxonomy.ts`.
- Prefill läser inte `businessDescription` som bransch.
- Follow-ups frågar efter saknad bransch; `industryId` bara vid allowlist-träff.
- Sidantalet ägs inte av prompttexten (`meta.pageCountHint`).

## Gör

### A0 — sessionskvitto (read-path, litet)

Persistera enough MiniWizard-utdata + ev. follow-up-svar *bredvid*
`prompt_original` så nästa incident kan visa om `restaurant` kom från klick
eller `applyFollowupAnswer`. Inte en full event-stream. Fail-closed: PII-fält
som redan är redigerade i kampanjraden ska inte plötsligt loggas råa.

### A1 — konflikt före codegen

När branschfältet styr sidlista/första mening *och* `description` / USP
uppenbart hör till ett annat fack (spel/lotteri/plattform vs restoransidor):
stoppa eller tvinga omval. Tyst hybrid («spelinriktad restaurang») är felet.

Kontraktet ska sitta i `buildPromptFromWizardData` / follow-up-applicering,
inte i brief-modellen som efterhandstolkning. Briefen ska inte vara sista
chansen att rädda en motstridig beställning.

### A2 — tester

- `industry=null` + spelbeskrivning → inte restaurant-sidlista, inte
  «Restaurang/Bar» i första meningen.
- `industry=restaurant` + lotteri-/spelbeskrivning → konflikt, inte hybridprompt.
- Befintliga prefill-tester för null/alias ska fortsätta vara gröna.

## Inte A

- Inferera automatiskt ett nytt fack «gaming» från fritext (ägarbeslut 2026-09-14:
  bransch från dashen är hint, inget nytt fack utan taxonomi-ägare).
- Skylla på användaren utan A0-kvitto.
- Köra om ImpactWin i prod.
