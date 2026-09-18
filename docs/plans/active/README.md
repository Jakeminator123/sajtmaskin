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

| Spår | Vad | Styrdokument |
|---|---|---|
| Publik `/analys` via audit | Lead magnet: återanvänd website-audit (scrape → scores → PDF) som publik granskning. Plan under uppbyggnad; ingen kod än. | [`2026-09-18-analys-audit-leadmagnet/00-master-plan.md`](2026-09-18-analys-audit-leadmagnet/00-master-plan.md) |
| GitHub/ZIP-import rester | PR2 bilder/fonts i extractorn (forward-port av #1446 mot dagens preview). Idempotens och privat live-smoke är residualer. Rör inte latch/SSRF/auth. | [`2026-09-17-github-zip-import-rester/00-master-plan.md`](2026-09-17-github-zip-import-rester/00-master-plan.md) |
| SEO-landningssidor | Organisk kanal via vanliga App Router-sidor. Alla tio poster är `ready` i registret på preview `13843edc` (#1437, #1443, #1448–#1457). Det är inte Production eller indexering. Copy på `/skapa-hemsida-med-ai` säger fortfarande att syskonguiderna inte är färdiga — SEO-ägarens rest. Beställ inte borttagning av Relaterat-länkar till mål som nu är färdiga. Ingen promote. | [`2026-09-16-seo-landningssidor/00-master-plan.md`](2026-09-16-seo-landningssidor/00-master-plan.md) |
| Branded runtime-aktivering | Kod finns på preview. C2 **DONE** 2026-09-17 (`c2-test.lansera.nu`; writes-flagga av efter retest). Kvar: browser-/cookiebevis (A2, C1-smoke), A3 rollback/no-loop, en A4-pilot. Flaggor av tills respektive bevis är grönt; Production writes av tills separat rolloutbeslut. PSL och #1385 är inte detta spår. | [`2026-09-16-branded-runtime-aktivering/00-master-plan.md`](2026-09-16-branded-runtime-aktivering/00-master-plan.md) |
| MVP-säkerhet och releaseberedskap | Konto-/wizard-/kostnadsskydd, releaseidentitet och kundinformation. En samlad PR; preview och produktion fortsätter dela databas enligt ägarbeslut. | [`2026-09-09-mvp-sakerhet/00-master-plan.md`](2026-09-09-mvp-sakerhet/00-master-plan.md) |
| Bug-kö | **Start här.** Aktuella verifierade fel och deras stabila ID:n. `SM-014`, `SM-015`, `SM-018`, `SM-032`, `SM-038` och `SM-040` är arkiverade med mergebevis; `SM-007`/`SM-070` redovisas separat som flaggade releaseblockerare och `SM-071` väntar ny repro efter senare scaffoldändringar. | [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) |
| Verifieringsflöde + inspector | Kod: #1232 (sessionsrotation), #1234 (core-dump + infra-retry + Degraderad-autofix), #1237 (sanningsraden bort, öppen). Host `SM-073` = Fly v59. Kvar: prod-burst (checklista B), `SM-070`-beslut, UX-svans (checklista F). | [`2026-09-01-verifieringsflode-och-inspector/00-master-plan.md`](2026-09-01-verifieringsflode-och-inspector/00-master-plan.md) |
| Live-review `SM-070` | Grant och atomisk claim/cache landade i #1089/#1098; flaggan är av. Kvar före Preview: beständig betald attempt-budget över persistfel/abandon, overwrite-säker Blob-retry, schemalagd 7d-purge, chat-delete-hook samt omprövning och eventuell portning av godkänd relevant #1116-överlapp. #1116 behöver inte mergas. Production kräver separat ägaråtgärd. | [`2026-08-20-live-review/00-master-plan.md`](2026-08-20-live-review/00-master-plan.md) + [`01-preview-smoke.md`](2026-08-20-live-review/01-preview-smoke.md) |
| Dossier-förenkling | Produktflödet manuellt accepterat 2026-08-22. D1 landat (#1045); D2 → D3 → D4 är kvarvarande kvalitets-/arkitektursteg och körs strikt sekventiellt. D5 väntar ägarbeslut. | [`2026-08-19-dossier-forenkling/00-master-plan.md`](2026-08-19-dossier-forenkling/00-master-plan.md) |
| Kostnadsfri-kampanjflödet | Beslut och ursprunglig kod (sidantal, ingest/PII/prefill, ingen spekulativ init, konto före bygge) finns på `master` `2566eec511`. Preview-svans: admin-räkning + one-click avreg. Kvar: promote av den svansen; prewarm-flaggan är öppen fråga. `foo`/`foo-ab`-alias är inte beslutat. | [`2026-09-14-kostnadsfri-kampanjflode/00-master-plan.md`](2026-09-14-kostnadsfri-kampanjflode/00-master-plan.md) |
| Briefing + Källpaket | B4 första passet landat via K1 #1094. B5 är körbar. B6 steg 1 är körbart; steg 2 väntar N4. B7 väntar N5. N1 stängd 2026-08-20, N2 (Källpaket) stängd 2026-08-21. **Öppet ägarbeslut:** N3, N4, N5. | [`2026-08-18-briefing-och-kallpaket/00-master-plan.md`](2026-08-18-briefing-och-kallpaket/00-master-plan.md) |

Scaffold-bindning #1425 och reparationskedjans levererade steg (publiceringsgrind,
`SM-082`–`SM-084`, C1–C6 på preview) ligger i
[`../avklarat/README.md`](../avklarat/README.md). Beställ inte samma
implementationer igen. Steg 4-konsolidering är öppen ägarfråga, inte ett
aktivt arbetspaket.

Vågschemat 20 aug (#1070–#1081) är levererat — se
[`../avklarat/README.md`](../avklarat/README.md). Skicka ingen agent på de
PR:erna igen.

Nattens kodvågor 19–20 augusti (#1053–#1068) är likaså levererade.

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
ägarbeslut, plus briefing N3–N5.

## När en plan är klar

Väv in en rad i [`../avklarat/README.md`](../avklarat/README.md) och radera
detaljfilen (git = arkiv). Behåll egen fil bara om kod, contract eller
`*.stability.test.ts` citerar den. Svansar → restlistan eller backlog — aldrig
kvar som “pågående” huvudspår.
