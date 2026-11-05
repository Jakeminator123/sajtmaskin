# Publik `/analys`: kvarvarande beslut och kundanskaffning

> **Status 2026-11-05:** A1–A4 levererades i #1471. Implementationsplanerna
> har konsoliderats; tidigare instruktioner och körkvitton finns i Git.
> Planen är aktiv för B2/B4 och kundanskaffning, inte för att bygga
> `/analys` igen. Kod och manifest äger aktuellt runtimebeteende.

## Kvarvarande arbete

| Del | Nästa steg och avslutskrav |
|---|---|
| **B2: indexering/sitemap** | Separat ägarbeslut innan `noindex` ändras eller `/analys` läggs i sitemap. Kontrollera copy, gästpolicy och API; behåll unik H1, egen metadata och canonical mot `/analys`. Ratificera i [beslutsindexet](../../../decisions/README.md). |
| **B4: partneringång** | Separat ägarbeslut om `/?mode=audit` ska flyttas till `/analys`; tills dess oförändrad partneringång. Partner-QA vid eventuell flytt. |
| **K1: inline-bild i mejl/DM** | [A/B-protokollet](aktiviteter/K1-inline-bild-ab-test.md) finns, experimentet är inte kört. Skriv verkligt utfall: vinst, förlust eller `INCONCLUSIVE`. Utskick/leadhantering ägs av `Jakeminator123/JakobScrape`. |
| **PRV T-1** | Beställ datatillgänglighetsstudie enligt [restlistan](resterande-fyra-spar.md); ingen automation före bevisat signalvärde. |
| **Nyemission** | Beställ ett litet manuellt premiumexperiment efter PRV-studien, enligt restlistan. |
| **DNS/nameserver-byte** | PARK tills Radar v1 finns. |

Org.nr-prefill, URL-resultatcache, cold outreach och masskörning ingår inte.
Annonsspåret är separat paid intent. Den ursprungliga fem-listan och
restlistan har olika numrering; använd spårens namn.

**Avslut:** arkivera inte mappen för att K1 har ett protokoll. K1 behöver
faktiskt utfall och indexbeslutet en mottagare; B4 och övriga beställningar
måste avslutas eller få uttrycklig hemvist. Därefter räcker en rad i
[historikindexet](../../avklarat/README.md), med restlista/protokoll
bevarade där deras fortsatta ägare finns.

## Levererat och aktuella ägare

| Yta | Källa |
|---|---|
| A1: egen publik route och rapport-UI | [page.tsx](../../../../src/app/analys/page.tsx), [analys-content.tsx](../../../../src/app/analys/analys-content.tsx), [analys-tool.tsx](../../../../src/components/analys/analys-tool.tsx), [analys-report.tsx](../../../../src/components/analys/analys-report.tsx) |
| A2/A3: gästpolicy, kvot och försökstak | [publik API-route](../../../../src/app/api/analys/route.ts), [public-analys-quota.ts](../../../../src/lib/audit/public-analys-quota.ts), [rate-limit.ts](../../../../src/lib/rate-limit.ts) |
| Auditmotor och nivåval | [run-website-audit.ts](../../../../src/lib/audit/run-website-audit.ts), [audit-tier.ts](../../../../src/lib/audit/audit-tier.ts), [modellmanifest](../../../../config/ai_models/manifest.json) |
| Publik projektion och validering | [public-report.ts](../../../../src/lib/audit/public-report.ts), [analysis.ts](../../../../src/app/api/audit/modules/analysis.ts), [ssrf-guard.ts](../../../../src/lib/ssrf-guard.ts) |
| A4: copy, konto-CTA och handoff | [entry-modal.tsx](../../../../src/components/modals/entry-modal.tsx), [audit-handoff-client.ts](../../../../src/lib/builder/audit-handoff-client.ts), [audit-handoff.ts](../../../../src/lib/builder/audit-handoff.ts), [prompt-API](../../../../src/app/api/prompts/route.ts) |
| Inloggad audit och credits | [handler.ts](../../../../src/app/api/audit/modules/handler.ts), [pricing.ts](../../../../src/lib/credits/pricing.ts), [credits/server.ts](../../../../src/lib/credits/server.ts) |
| Indexering, internlänkar och miljö | [sitemap.ts](../../../../src/app/sitemap.ts), [landing-navbar](../../../../src/components/landing-v2/navbar.tsx), [landing-footer](../../../../src/components/landing-v2/landing-footer.tsx), [db-targets.json](../../../../config/db-targets.json) |

B1/B3/B5/B6 är beslutade och byggda: gästpolicy, nav/footer-länk, ingen
Advanced för gäst och separat inloggad startsidesväg. Nivåsplitten för
inloggade levererades i #1479; [historikindexet](../../avklarat/README.md)
behåller produktmätning före prisändring och Expert PARK.
Kodleverans bevisar inte att lead magneten drar kunder.

## Gränser som ska bestå

- Gäst: en levererad basic-rapport per klient och Stockholmsdygn; separat
  `analys:public:attempt` (3/10 min). Bara serverbekräftad leverans
  förbrukar kvoten; fel släpper reservationen. Redisfel ska stänga vägen,
  inte ersättas av processminne som produktionstak. Cookie/klientheader
  får inte bli identitet som återställer kvoten.
- Validering/SSRF-förkontroll före kvotförbrukning. Publik projektion
  begränsar strängar/listor och lämnar inte internt payload, budget eller
  kostnad. Gästsvar är `no-store` och `noindex`; modell-id är inte publik
  produktionsinformation. Processlokal in-flight-Map är inte klusterlås.
- Konto för PDF/spara/handoff. Inga anonyma `user_audits`-rader eller
  serveråterupplivning av gästrapporter. Ingen automatisk generationsstart
  från lead magnet eller utskick.
- Handoff återanvänder payload och beständigt användarbundet attempt-id.
  Projekt/prompt skapas atomiskt; retry efter tappat svar återanvänder
  resultatet. Bekräftat raderat projekt hanteras under Web Lock; nätfel
  eller vanlig 409 roterar inte id. Ingen blind DELETE.
- Betalda audits behåller auth/credits. Nollställ inte `AUDIT_COSTS`;
  använd inte free-generation eller kampanj-entitlement som genväg.
  Ingen ny scrape-, prompt- eller betalningspipeline ingår.
- `/analys` har eget rapport-UI; ingen rewrite till startsidan eller post
  i `SEO_LANDING_PAGES`. `/audits`, wizard-läget `analyserad` och
  källkods-SEO i `src/lib/seo/audit.ts` är andra ytor.
- Development/Preview använder DEV och Production PROD enligt
  `config/db-targets.json`. Äldre påståenden om delad databas är
  inaktuella. Kontrollera faktisk miljö före driftprov.

## Verifiering vid framtida ändringar

Följ `npm run verify:pr -- --plan` och berörda ägare: publik projektion,
routevalidering före kvot, parallella reservationer/fel/retry, separata
409/429-koder, auth/credits och idempotent handoff. Prova metadata/sitemap
och gästernas konto-CTA när de ändras. Gamla test-/livekvitton från #1471
är historik, inte ett nytt driftgodkännande.

Ingen ny produktacceptans, prisändring, indexering, DB-apply eller
produktionsrelease ingår i konsolideringen.
