# Kundportal, GitHub-plattform och domäner

Status: **etapp 1 och etapp 2 (kod) levererade i PR #1665** (branch
`feat/kundportal-foretagsuppgifter`; oberoende review i tre rundor + extern
granskning). Etapp 2 aktiveras av Jakob via runbooken; etapp 3–4 kräver
ägarbeslut nedan.
Historisk kodavläsning: `preview` `6da0a0d66`. Portalgrunden är levererad —
se [avklarat-indexet](../../avklarat/README.md). Kvarvarande portal- och
abonnemangskrav finns nedan; adressaktivering och dess bevis ägs av
[`branded-runtime-aktivering`](../2026-09-16-branded-runtime-aktivering/00-master-plan.md).

## Etapp 1 — levererat i kod

| Del | Vad | Ägare | Test |
|---|---|---|---|
| Företagsuppgifter | Standardiserade öppettider (per veckodag i 30-min-steg, dygnet runt, enligt överenskommelse, visa inte) + telefon, e-post, orgnr, adress. Sparas i `project_data.meta.business`. | [`business-facts-schema.ts`](../../../../src/lib/projects/business-facts-schema.ts) | `business-facts-schema.test.ts` |
| → prompt | `## Business Facts` som `required` block i init, follow-up och plan. Modellen får exakt modulinnehåll att emittera. | [`sections/business-facts.ts`](../../../../src/lib/gen/system-prompt/sections/business-facts.ts) | `business-facts.test.ts` |
| → sajt utan omgenerering | `lib/business-facts.ts` skrivs om från meta vid varje publicering. "Publicera om" räcker. | [`business-facts-module.ts`](../../../../src/lib/projects/business-facts-module.ts), deploy-routen | `business-facts-module.test.ts` (kompilerar modulen med tsc) |
| → portal | Sektion "Företagsuppgifter" på `/projects/[id]`. Bara standardval, ingen fritext för tider (30-min-steg; sparade kvartsvärden visas som de är). Produktionsdeployen registrerar per version (`meta.portalStatusByVersion`, de 5 senaste) om de publicerade filerna har en markerad modul **som någon fil importerar**. Portalen lovar "publicera om räcker" bara för `supported`; `unsupported` → engångsuppdatering i byggaren; `imported` → ändra i byggaren; `unknown` → neutralt. | [`BusinessFactsSection.tsx`](../../../../src/components/projects/BusinessFactsSection.tsx), [`portal-status.ts`](../../../../src/lib/projects/portal-status.ts) | `BusinessFactsSection.test.tsx`, `portal-status.test.ts` |
| SEO-status | Produktionspubliceringens SEO-pass sparas per version i `meta.portalStatusByVersion`; portalen visar posten för den attesterat live versionen (aldrig preview, gammal eller misslyckad build — och en misslyckad nyare build döljer inte live-versionens status). | [`seo-status.ts`](../../../../src/lib/projects/seo-status.ts), [`SeoStatusSection.tsx`](../../../../src/components/projects/SeoStatusSection.tsx), [`portal-status.ts`](../../../../src/lib/projects/portal-status.ts) | `seo-status.test.ts`, `SeoStatusSection.test.tsx`, `portal-status.test.ts` |
| GitHub-export | Tomt/nytt repo seedas via Contents API i stället för 409 på första blob. | [`export/route.ts`](../../../../src/app/api/github/export/route.ts) | `route.test.ts` "seeds a brand-new empty repository" |
| GitHub App | Installation-token-klient + env + `FEATURES.useGitHubSitesOrg`. | [`app-installation-token.ts`](../../../../src/lib/github/app-installation-token.ts), [runbook](../../../runbooks/github-sites-org.md) | `app-installation-token.test.ts` |
| Git-Data-bibliotek | Export-routen och backupen delar en ägare; `inline`-läge = ett tree-anrop per sajt (klarar GitHubs 500/timme). | [`git-data-export.ts`](../../../../src/lib/github/git-data-export.ts) | `git-data-export.test.ts` |
| Org-backup vid publicering (etapp 2) | `after()`-hook i deploy bakom flaggan → `site-<projectId>`; bara production, först när Vercel rapporterar READY; exakt de publicerade filerna; flyttad gren → retry utan force; tidpunkt i portalen. Aktiv först när Jakob skapat org + App (runbook). | [`sites-backup.ts`](../../../../src/lib/github/sites-backup.ts), [`wait-for-deployment-ready.ts`](../../../../src/lib/vercel/wait-for-deployment-ready.ts) | `sites-backup.test.ts`, `git-data-export.test.ts`, `wait-for-deployment-ready.test.ts` |

Kvar efter merge (inte blockerande, loggat i PR #1665): Business Facts-blockets
prioritet 89 ligger över några required-block med prioritet 84–88 (mät vid låg
budget innan den ändras); livetest av backup mot riktig org (runbook steg 1).

DB-effekt: **ingen.** Allt ligger i befintliga JSONB-kolumnen `project_data.meta`.
Env: fyra nya valfria nycklar (`GITHUB_APP_*`, `GITHUB_SITES_ORG`), default av.

## Beslut som väntar på Jakob

| # | Fråga | Rekommendation | Varför |
|---|---|---|---|
| B1 | Besöksstatistik: Vercel Web Analytics, egen beacon eller Plausible? | **Egen beacon** (etapp 3) | Du vill bort från Vercel; cookiefri aggregat är GDPR-lätt; kräver DB-migration (separat mandat) |
| B2 | Domänregistrar för .se/.nu | **Openprovider** (alt. Realtime Register) | Kunden blir innehavare, REST-API, vi äger fakturering. Vercel saknar .se/.nu. Loopia API-avtal lägger domänen i vårt konto |
| B3 | GitHub-org: en eller två? | **Två**: `sajtmaskin` (plattform, senare) + `sajtmaskin-sites` (kundbackup) | App installerad bara i sites-orgen; läckt token når inte plattformskoden |
| B4 | Slå på `SAJTMASKIN_CUSTOMER_DOMAIN_WRITES` i prod | **Ja, efter ett kort prodprov** | C2 bevisad på preview 2026-09-17; inget mer väntar i kod |
| B5 | Ska "Publicera om" efter ändrade företagsuppgifter kosta credits? | **Nej, gratis när bara `lib/business-facts.ts` ändrats** | Annars betalar kunden för att rätta en öppettid; kräver liten ändring i deploy-routens kreditlogik |

## Etapp 2 — GitHub-plattform (efter B3)

| Steg | Arbete | Storlek |
|---|---|---|
| 2.1 | Jakob: skapa org + App enligt runbook, lägg env i Vercel (Jakob har idag ingen GitHub-org; repot ligger under `Jakeminator123`) | 30 min |
| 2.2 | ✅ Git-Data-logik i `src/lib/github/git-data-export.ts`; inline `content` i tree | klar |
| 2.3 | ✅ `sites-backup.ts` + `after()`-hook i deploy bakom `useGitHubSitesOrg`; repo `site-<projectId>` | klar |
| 2.4 | Första livekörning på preview mot org:en; verifiera inkrementellt commit | S |
| 2.5 | Överlämning till kundens GitHub (repo transfer) via backoffice | S |
| 2.6 | Flytta `sajtmaskin`-repot till org `sajtmaskin`: inventera Vercel git-koppling, rulesets, secrets, Dependabot, `OC_REPO_SLUG` | M, egen PR |

## Etapp 3 — besöksstatistik (efter B1)

| Alternativ | Kostnad | Vercel-fri | DB-migration | Tid | Risk |
|---|---|---|---|---|---|
| Vercel Web Analytics API | Per event över planens gräns, per kundprojekt | Nej | Nej | 1 v | Billing växer med kundantal |
| **Egen beacon** → `site_page_views(project_id, day, path, count)` | Serverless + Postgres-rader | Ja | **Ja** | 2 v | Botfilter och dedupe måste byggas |
| Plausible (self-host/cloud) | Från ~9 €/mån per 10k sidvisningar | Ja | Nej | 1–2 v | Extra leverantör, per-site-nycklar |

Beacon-designen i korthet: `<script>` injiceras vid deploy (som SEO-filerna),
`POST sajtmaskin.se/api/public/beacon` med `projectId` + path + referrer-domän,
inga cookies, hash av IP+UA per dag för unika, daglig aggregattabell, portalen
visar 30 dagar med Recharts (`chart.tsx` finns redan).

## Etapp 4 — domäner (efter B2)

| Steg | Arbete |
|---|---|
| 4.1 | Registrantformulär i kassan: namn, orgnr/personnr (IIS kräver), e-post, adress, policy-kryssruta (IIS 2025-09-16), ångerrättssamtycke |
| 4.2 | `RegistrarProvider` för Openprovider (`canRegister()` true för .se/.nu/.com/.eu), ersätter `/v5/domains/buy` |
| 4.3 | Avstämning efter registreringsanrop (SM-007-luckan: återbetalning trots köpt domän) |
| 4.4 | Förnyelse: cron läser `domain_orders`, fakturerar via Stripe, förnyar hos registrar |
| 4.5 | Automatisk DNS för BYOD: Entri ($249/mån) täcker One.com, Gandi, Cloudflare, Vercel — **inte Loopia/Binero**. Vänta tills volym motiverar |

Egen domän (BYOD) är klar och väntar bara på B4. Guider per svensk leverantör
(Loopia, One.com, Binero, Websupport) är copy, inte kod.

## Parkerade portal- och abonnemangskrav

Kvarvarande krav från portalplanen 2026-09-14. Detta är ett koncentrat, inte
ett mandat att aktivera betalning, flytta DNS, applicera migrationer eller
ratificera nya produktvillkor. Aktuellt DB-mål ägs av
[`config/db-targets.json`](../../../../config/db-targets.json).

| Spår | Kvar | Ägare |
|---|---|---|
| PSL / bred branded-utrullning | PARK. Förbered sanningsenligt underlag mot då aktuella PSL-riktlinjer när volym motiverar det. Godkännande/propagation är inte portalens cookiebevis eller en automatisk aktiveringsgrind. Skalad DNS kräver rätt projektalias och HTTPS för minst två projekt; flytta inte rotzon eller e-postposter. | [Adressrunbooken](../../../runbooks/branded-user-urls.md), särskilt PSL och DNS. A2/A3/A4 ligger i den separata runtimeplanen. |
| Extern kundpilot | Bedöm tillämpliga leverantörs-/kontovillkor före första externa kundpilot, även gratis. Dokumentation eller ett tekniskt stöd är inte ett avtalsbesked. Ingen automatisk leverantörskontakt eller krav på nytt partnerbrev för intern utveckling följer av planen. | Jakobs avgränsade pilotbeslut. |
| D1 grundschema | Levererad policyneutral grund. Bevara owner-/modebindning, högst ett öppet claim per projekt/läge, unik periodförmån, beständiga jobb och separata önskade/faktiska hostingtillstånd. | [schema.ts](../../../../src/lib/db/schema.ts), D1-migrationerna och [billing-retention-guard.ts](../../../../src/lib/db/billing-retention-guard.ts). Retentiongrinden är reader, inte en framtida billing-writer. |
| D2 + C3 etapp 2 | Parkerad implementation och acceptans enligt nedan. Nuvarande checkout är hårdstängd, webhooken avskiljer subscription-events; Billing Portal och full livscykel följer inte av dessa stängsel. | [site-subscription-offer.ts](../../../../src/lib/billing/site-subscription-offer.ts), [checkout-routen](../../../../src/app/api/stripe/site-subscription/checkout/route.ts), [webhook-routen](../../../../src/app/api/stripe/webhook/route.ts), [kontosidan](../../../../src/app/konto/page.tsx). |
| D3 faktisk paus/återställning | Parkerad. Ett statusfält räcker inte; konkret provideråtgärd och HTTPS måste bekräfta rätt kundprojekt/version. Hostingadaptern saknas i nuvarande kod. | Framtida D3-adapter och tidsstyrd avstämning efter D2; grundmodellens jobb och hostingtillstånd i schema.ts. |

### Abonnemang: beslut och föreslagna villkor

Per publicerad sajt (`app_projects.id`), inkluderad publicering och credits
som kvot plus påfyllnad är beslutad riktning — inte en ny beslutsfråga.
Ett konto kan ha flera sajter; alias och ompublicering skapar inte fler
abonnemang. `users.tier` avgör inte projektets publiceringsrätt.
Se [beslutsloggen](../../../decisions/README.md), 2026-09-11.

Pris, inkluderad creditmängd, kvotens rollover och följande D3-policy är
fortfarande **förslag**. Enkel kostnadskalkyl och uttryckligt fastställande
krävs före betalstart; sälj inte obegränsad trafik eller AI. Köpta credits
får inte nollställas och ingen utgångstid lovas utan stöd i ledgern.

| Föreslagen D3-policy | Utfall att fastställa före kundaktivering |
|---|---|
| Första betalning misslyckas | Ingen ny betald publicering; nytt checkoutförsök. |
| Förnyelse misslyckas | 7 dagar fortsatt live, portalbesked och ägarpåminnelse; betalning under respit fortsätter utan avbrott. |
| Uppsägning | Fungerar till betald periods slut. |
| Rättighet upphör | Neutral pausad sida utan offentlig betalningsorsak; domän/slug, konto, redigering inom egna credits och export kvar. |
| Ny betalning efter paus | Ägaren kan återställa senaste fungerande publicerade versionen, aldrig senaste utkastet. |
| Bevarande | Minst 90 dagar från faktisk paus; ingen automatisk radering i MVP. Eventuell senare operatörsgallring föregås av minst 14 dagars besked och exportmöjlighet. Bokföring bevaras. |
| Domänexit | Återanvänd inte sluggar och släpp inte alias som kundens DNS fortfarande pekar mot utan definierat avslut. Innehållsbevarande är inte en automatisk aliasdeadline. |
| SEO | Kort 503/Retry-After, högst cirka två dagar i förslaget; därefter medvetet neutral långpaus, exempelvis 200/noindex. Lång paus kan skada synlighet. |

### D2/C3e2: återstående implementation och acceptans

- Serverägt pris/läge och fryst erbjudandesnapshot för ett ägt projekt.
  Beständigt claim hanterar samtidiga, återupptagna, utgångna och avbrutna
  checkouts. En generell katalogtjänst är inget krav.
- Verifierade subscription-/invoice-events binds till rätt ägare, projekt,
  läge och period; browser-success ger ingen rättighet. Avskilj fortsatt
  credit-/domänköp. Tåla dubbletter, omkastad ordning och retry; gamla fel
  får inte pausa en senare betald period.
- Event-idempotens och förmån per period är separata skydd. Live-grant och
  ledgerbokning är atomiska; proration/flera fakturor ger inte automatiskt
  fler månadscredits. Test simuleras separat och påverkar inte live-saldo,
  publiceringsrätt eller provider. Använd inte riktiga kundkonton i Stripe-test.
- Egen Billing Portal-session i servervalt läge samt per-sajtstatus, nästa
  period, uppsägning/respit på `/konto`. Fritt planbyte är utanför MVP.
- Servergrind per projekt: giltigt abonnemang inkluderar publicering;
  AI-arbetets credits kvarstår. Ingen sajt låser upp en annan. Tidsstyrd
  avstämning och beständiga driftjobb krävs; en dag-0-webhook utför inte
  dag-7-arbete av sig själv.
- Äldre sajter kräver uttrycklig övergång, information och startdatum.
  Saknad abonnemangsrad pausar inte befintliga sajter; gamla betalmetoder
  debiteras inte utan korrekt köpflöde. Projekt-/kontoradering samordnas med
  uppsägning och domänexit; bevara retentiongrinden tills hela flödet finns.
- Acceptans i isolerat Stripe-test täcker första köp, samtidighet, förnyelse,
  dubbletter/ordningsfel, provider-/DB-fel och retry, uppsägning och portallänk.
  Test/live och två sajter på samma konto ska bevisas separata. D3 fungerar
  före betalstart. D1:s migrering bevisar inte D2; det historiska paketnamnet
  #1385 är varken aktuell PR-status eller bevis för DB-apply.

### D3: bevis före betalstart

Paus/restore binder samma kundprojekt och bevarade alias till senast fungerande
publicerade artefakt. Önskat läge blir faktiskt först efter provider- och
HTTP-bekräftelse. Beständiga jobb klarar fel efter provideranrop, retry och
sena jobb utan att skriva över senare betalning/återaktivering.
Inventera även gamla deployment-URL:ers åtkomst och kostnadsdrivande API:er;
huvuddomänens neutrala HTML är inte bevis för stoppad drift. Ingen ny delad
trafikproxy krävs för en begränsad pilot.

Klockstyrda prov täcker respitens slut, periodslut, utebliven webhook,
providerfel, lyckat retry och rätt restore-version på en riktig testhost.
Export av kod/media förblir åtkomlig under paus; externa databaser, registrar,
tredjepartskonton, hemligheter och exklusiva rättigheter ingår inte i
kodexporten. Exportägaren är
[`owner-transfer-package.ts`](../../../../src/lib/gen/export/owner-transfer-package.ts).

## Research 2026-10-22 (källor i agentrapport, osäkert markerat)

| Leverantör | .se/.nu | API | Kunden som innehavare | Kommentar |
|---|---|---|---|---|
| Openprovider | Ja | REST | Ja | ~22/35 USD år 1/förnyelse (obekräftat) |
| Realtime Register | Ja | REST | Ja | GO!ORANGE 5 €/mån till kostpris (om .se ingår obekräftat) |
| Name SRS (Name ISP) | Ja | JSON + webhooks | Ja | Reseller-ansökan; pris ej publikt |
| Loopia | Ja | XML-RPC | Bara med återförsäljaravtal | API-avtal: domän i vårt konto; Loopia kan stänga API utan orsak |
| Vercel Registrar | **Nej** | REST | — | .com 11,25 USD; .se/.nu/.eu saknas (verifierat via API) |
| Entri / Domain Connect | — | — | — | Ingen svensk DNS-leverantör stöds |

Juridik: 25 % moms; konsumenters ångerrätt kräver uttryckligt samtycke till
omedelbart utförande (distansavtalslagen 2 kap. 11 §); IIS kräver korrekt
innehavare med person-/orgnr. Registrera aldrig i Sajtmaskins namn.
