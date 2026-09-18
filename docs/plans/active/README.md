# Aktiva planer

Router till arbete som fortfarande kan styra nya ändringar. Levererat →
[`../avklarat/`](../avklarat/); parkerat → [`../archived/`](../archived/);
full historik → git. Livscykel:
[`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).
Buggar/beslut → [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) —
kopiera inte kön hit.

**Oassignerat buggarbete startar här:**
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).
Vågschemat 20 aug är avklarat. Ta en rad ur `## Aktiv kö`, inte en planmapp,
när inget pågående spår har tilldelats uttryckligen. En agent som har fått ett
namngivet initiativ följer i stället styrdokumentet på motsvarande rad nedan.

## Pågående spår

Rangordning: lanseringspåverkan × kvarvarande arbete. Inte ålder eller
planstorlek.

| Spår | Vad | Styrdokument |
|---|---|---|
| MVP-säkerhet / `SM-080` | **Viktigast.** Wizard-RLS, Google-koppling och kontolås är byggda; gör inte om dem. Kvar som lanseringsspärr: verklig projektisolering (`SM-080`). Preview och produktion delar databas enligt ägarbeslut. | [`2026-09-09-mvp-sakerhet/00-master-plan.md`](2026-09-09-mvp-sakerhet/00-master-plan.md) |
| Branded runtime-aktivering | Kod på preview. C2 **DONE** 2026-09-17 (`c2-test.lansera.nu`; writes-flagga av efter retest). Kvar: browser-/cookiebevis (A2, C1-smoke), A3 rollback/no-loop, en A4-pilot. Flaggor av tills respektive bevis är grönt. PSL och #1385 är inte detta spår. | [`2026-09-16-branded-runtime-aktivering/00-master-plan.md`](2026-09-16-branded-runtime-aktivering/00-master-plan.md) |
| Verifieringsflöde + inspector | Kod landad. Kvar: riktiga smokes (burst/capture, inspector-hover) och sedan stäng planen. Vercel 24h visar två historiska Chromium core-dumps i product-postcheck på äldre preview-deploy, inte aktuell production. | [`2026-09-01-verifieringsflode-och-inspector/00-master-plan.md`](2026-09-01-verifieringsflode-och-inspector/00-master-plan.md) |
| Källkvitto, Quality Bar, addenda | Nästa produktkvalitetsspår. Ordning: **A0** emittera separata kvittosignaler → **A** mät nya rader → **B** dynamiska recept → **C** variantkomposition → **D** addenda-urval. «Mät först» gäller beteendefixarna B–D, inte A0: befintlig telemetri kan inte besvara bild-kontra-utdrag retroaktivt. Statisk 03 är **landad** i #1464. Öppna inte disabled addenda. | [`2026-09-17-inspiration-kvitto-och-komposition/00-master-plan.md`](2026-09-17-inspiration-kvitto-och-komposition/00-master-plan.md) |
| Bug-kö | **Start här** när inget namngivet spår ovan är tilldelat. `SM-007`/`SM-070` är flaggade releaseblockerare, inte vanliga produktbuggar. | [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) |

## Inte längre aktiva

De här styr inte nya ändringar. Beställ inte om leveransen.

| Spår | Vart | Residual |
|---|---|---|
| SEO-landningssidor | [`../avklarat/README.md`](../avklarat/README.md) | Tio sidor i Production via #1459. #1467-copy på preview. Search Console efter nästa promote. |
| Kostnadsfri-kampanjflödet | [`../avklarat/README.md`](../avklarat/README.md) | `unsubscribe.ts` / `analytics-paths.ts` identiska master↔preview. Prewarm och `foo`/`foo-ab` (#1402) är egna beslut. |
| GitHub/ZIP-import PR2 | [`../avklarat/README.md`](../avklarat/README.md) | Server-idempotens och privat-repo-smoke. Inte latch/SSRF/auth. |
| Live-review `SM-070` | [`../archived/2026-08-20-live-review.md`](../archived/2026-08-20-live-review.md) | Flaggan av. PARK tills live review ska aktiveras. |
| Dossier D2–D5 | [`../archived/2026-08-19-dossier-forenkling.md`](../archived/2026-08-19-dossier-forenkling.md) | D1 levererat. D2–D4 är arkitekturskuld, inte produktblockerare. |
| Briefing + Källpaket | [`../archived/2026-08-18-briefing-och-kallpaket.md`](../archived/2026-08-18-briefing-och-kallpaket.md) | B1–B4 + B8–B11 avklarat. B7 (variantens auktoritetsordning) angränsar till kvalitetsplanens C; B5 (shadcnblocks-mätning) och B6 (Ändringsbrief) är parkerade och ligger **inte** i någon aktiv plan. N3–N5 stannar som ägarbeslut. |

**Agent Bridge #1469** är ett separat tooling-spår, inte en produktplan och inte
parkerat: PR:en är aktiv Draft och rörde sig senast 2026-09-18. Klassificera den
inte som superseded härifrån. Driftstatus, rollmodell och vad som är bevisat
avgörs i #1469, inte i planhygienen.

Scaffold-bindning #1425 och reparationskedjans levererade steg (publiceringsgrind,
`SM-082`–`SM-084`, C1–C6 på preview) ligger i
[`../avklarat/README.md`](../avklarat/README.md). Beställ inte samma
implementationer igen. Steg 4-konsolidering är öppen ägarfråga, inte ett
aktivt arbetspaket.

Vågschemat 20 aug (#1070–#1081) och nattens kodvågor 19–20 augusti
(#1053–#1068) är levererade.

Två poster ur #1045:s «utanför scope»-lista är **avgjorda mot** och ska inte
byggas: knappen «Bygg integrationer» stannar, och 480-teckenkapningen är ett
skydd mot att «Avoid» svälts — inte en defekt. Se
[`docs/decisions/README.md`](../../decisions/README.md).

Välj nästa konkreta defekt, repro, ägarbeslut eller skuld ur
[`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) och skapa först då en
smal aktiv plan om arbetet behöver mer än backloggraden.

## Ägarbeslut

Fattade: [`docs/decisions/README.md`](../../decisions/README.md).
Öppna: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) § Väntar på
ägarbeslut. Briefing N3–N5 och dossier D5 ligger kvar där, inte som aktiva
spår.

## När en plan är klar

Väv in en rad i [`../avklarat/README.md`](../avklarat/README.md) och radera
detaljfilen (git = arkiv). Behåll egen fil bara om kod, contract eller
`*.stability.test.ts` citerar den. Svansar → restlistan eller backlog — aldrig
kvar som “pågående” huvudspår.
