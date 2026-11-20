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
planstorlek. Antalet rader är inte ett tak — live GitHub avgör vilka spår
som faktiskt är aktiva.

| Spår | Vad | Styrdokument |
|---|---|---|
| MVP-säkerhet / `SM-080` | **Viktigast.** SM-078/079 och kontolås är byggda. SM-080:s nät-/tenantacceptans och unik browser-origin kvarstår; antecknat maskinläge är inte E2E-bevis. Pågår 2026-11-11: paket A (gäst förstörs efter 25 min inaktivitet, mindre kontrollplan) och paket B (egen origin per chatt, M03). DEV/Preview→DEV, Production→PROD ägs av db-targets. Reservation/tak och andra uttryckliga releasekrav bevaras. | [`2026-09-09-mvp-sakerhet/00-master-plan.md`](2026-09-09-mvp-sakerhet/00-master-plan.md) |
| Riktad upprensning | Tydligare ansvar i sex stora filer utan beteendeändring. A0 baslinje/planstatus: delvis klar (planstädningen 2026-11-11). A1 Backoffice-IO: etapp 1 klar (#1666), resten uppskjuten. A2 publicering (`post.ts`): görs nästa gång filen ändras. A3 typat verifieringsutfall: riktad upprensning klar i #1726 (typat utfall, 4 moduler); uppskjutet: `repair-loop.ts` och uppdelning av `verifyVersionUnderLease`. A4 orkestrering/builder: uppskjuten. A5 struken; testreglerna gäller i varje PR. | Ägarens lokala paket `sajtmaskin-riktad-upprensning` (2026-10-22, inte i repo); kärnansvar samordnas med [`llm-kedja`](2026-10-11-llm-kedja-och-legacy/00-master-plan.md) |
| LLM-kedja och legacy | Grundimplementation mergad i #1593: typat byggunderlag, gemensam kandidat/eval och serverägda efterkontroller. Kvar: separat schemaläggning utan öppen builder, representativ runtimeacceptans och full billingavstämning inklusive brief. Versionspollens begränsade serverväckning är aktiv kod och ska behållas; en accepterad väckning är inte PASS. | [`2026-10-11-llm-kedja-och-legacy/00-master-plan.md`](2026-10-11-llm-kedja-och-legacy/00-master-plan.md) |
| Kundportal, GitHub-plattform och domäner | Etapp 1 och etapp 2-kod levererade i #1665: företagsuppgifter, SEO-status, GitHub-export/App och org-backup bakom flagga. Org-/runtimeaktivering och etapp 3–4 kräver sina beslut. Planen äger också parkerade PSL- och abonnemangskrav D2/D3/C3e2 från portalgrunden; pris, credits, rollover och 7/90 dagar är inte ratificerade. Adressaktivering ägs av branded-runtimeplanen. | [`2026-10-22-kundportal-och-domaner/00-master-plan.md`](2026-10-22-kundportal-och-domaner/00-master-plan.md) |
| Branded runtime-aktivering | Kod på preview. C2 **DONE** 2026-09-17 (`c2-test.lansera.nu`; writes-flagga av efter retest). Kvar: browser-/cookiebevis (A2, C1-smoke), A3 rollback/no-loop, en A4-pilot. Flaggor av tills respektive bevis är grönt. PSL och #1385 är inte detta spår. | [`2026-09-16-branded-runtime-aktivering/00-master-plan.md`](2026-09-16-branded-runtime-aktivering/00-master-plan.md) |
| Bug-kö | **Start här** när inget namngivet spår ovan är tilldelat. `SM-007`/`SM-070` är flaggade releaseblockerare, inte vanliga produktbuggar. | [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) |

## Inte längre aktiva

De här styr inte nya ändringar. Beställ inte om leveransen.

| Spår | Vart | Residual |
|---|---|---|
| En chatt: Sajtagenten i buildern | [`../avklarat/2026-10-22-en-chatt-sajtagenten/00-master-plan.md`](../avklarat/2026-10-22-en-chatt-sajtagenten/00-master-plan.md) | Klar 2026-11-11: #1670 i produktion. Creditmodell per agentuppdrag, sajtägarens agent och avatar i chatten är obeställda följduppdrag. |
| Armerad autonomi + generationskort | [`../avklarat/README.md`](../avklarat/README.md) | Klar 2026-11-11 (#1495–#1498). D1/SM-072 i backloggen. |
| Verifieringsflöde + inspector | [`../avklarat/README.md`](../avklarat/README.md) | Klar 2026-11-11. Burst/unga profiler i `SM-072`; inspector-hover, hibernation-smoke och UX-rester i `SM-073`. |
| Superprompt: avgränsad acceptans | [`../avklarat/README.md`](../avklarat/README.md) | Klar 2026-11-11 (#1637). |
| Publik `/analys` + kundanskaffning | [`../avklarat/README.md`](../avklarat/README.md) | Klar 2026-11-11 (#1471/#1479). B2 och B4 är ägarbeslut i backloggen; K1 A/B-experiment ej kört (utskick ägs av `JakobScrape`). |
| Källkvitto, Quality Bar, addenda | [`../archived/2026-09-17-inspiration-kvitto-och-komposition.md`](../archived/2026-09-17-inspiration-kvitto-och-komposition.md) | Parkerad 2026-11-11. A0 (#1472) levererad; A-mätning och B–D är inte beställda. |
| Test- och kontrollförenkling | [`../archived/2026-10-04-test-och-kontrollforenkling.md`](../archived/2026-10-04-test-och-kontrollforenkling.md) | Parkerad 2026-11-11. #1553–#1584 levererade (#1580 är mergad). Testreglerna gäller i varje PR via pr-workflow. |
| SEO-landningssidor | [`../avklarat/README.md`](../avklarat/README.md) | Tio sidor i Production via #1459. #1467-copy och #1477-klustret på preview. Search Console efter nästa promote. Öppna hardening-PR:ar (#1481/#1483) är residualer, inte ett femte långlivat active-spår. |
| Kostnadsfri-kampanjflödet | [`../avklarat/README.md`](../avklarat/README.md) | `unsubscribe.ts` / `analytics-paths.ts` identiska master↔preview. Prewarm och `foo`/`foo-ab` (#1402) är egna beslut. |
| GitHub/ZIP-import PR2 | [`../avklarat/README.md`](../avklarat/README.md) | Server-idempotens, privat-repo-smoke, och host-total-taket som kan passeras när kontrollen bara slår när en binär övervägs och senare text driver totalen över taket. Inte latch/SSRF/auth. Implementera inte ZIP-fixen här. |
| Live-review `SM-070` | [`../archived/2026-08-20-live-review.md`](../archived/2026-08-20-live-review.md) | Flaggan av. PARK tills live review ska aktiveras. |
| Dossier-planen från augusti | [`../archived/2026-08-19-dossier-forenkling.md`](../archived/2026-08-19-dossier-forenkling.md) | Historisk plan, inte aktuell runtime-vägledning. Levererad förenkling finns i avklarat-indexet; stabil semantik ägs av dossierkontraktet. Fri add/remove i Backoffice är fortfarande ett separat ägarbeslut. |
| Briefing + Källpaket | [`../archived/2026-08-18-briefing-och-kallpaket.md`](../archived/2026-08-18-briefing-och-kallpaket.md) | B1–B4 + B8–B11 avklarat. B7 (variantens auktoritetsordning) angränsar till kvalitetsplanens C; B5 (shadcnblocks-mätning) och B6 (Ändringsbrief) är parkerade och ligger **inte** i A0–D. N3–N5 stannar som ägarbeslut. |
| Inloggad Audit-nivåer | [`../avklarat/2026-09-18-audit-nivaer/00-master-plan.md`](../avklarat/2026-09-18-audit-nivaer/00-master-plan.md) | Levererad i #1479. Recon #1478 är superseded. |

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
