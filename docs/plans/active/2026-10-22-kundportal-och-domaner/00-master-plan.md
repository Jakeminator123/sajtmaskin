# Kundportal, GitHub-plattform och domäner

Status: **etapp 1 och etapp 2 (kod) byggda lokalt 2026-10-22** på branch
`feat/kundportal-foretagsuppgifter` (företagsuppgifter, SEO-status,
GitHub-exportfix, GitHub App + org-backup bakom flagga). Etapp 2 aktiveras av
Jakob via runbooken; etapp 3–4 kräver ägarbeslut nedan.
Avläst mot `preview` `6da0a0d66`. Portalgrunden ägs av
[`2026-09-14-kundens-adress-och-portal`](../../avklarat/2026-09-14-kundens-adress-och-portal/00-master-plan.md);
domänflaggorna av [`2026-09-16-branded-runtime-aktivering`](../2026-09-16-branded-runtime-aktivering/00-master-plan.md).

## Etapp 1 — levererat i kod

| Del | Vad | Ägare | Test |
|---|---|---|---|
| Företagsuppgifter | Standardiserade öppettider (per veckodag i 30-min-steg, dygnet runt, enligt överenskommelse, visa inte) + telefon, e-post, orgnr, adress. Sparas i `project_data.meta.business`. | [`business-facts-schema.ts`](../../../../src/lib/projects/business-facts-schema.ts) | `business-facts-schema.test.ts` |
| → prompt | `## Business Facts` som `required` block i init, follow-up och plan. Modellen får exakt modulinnehåll att emittera. | [`sections/business-facts.ts`](../../../../src/lib/gen/system-prompt/sections/business-facts.ts) | `business-facts.test.ts` |
| → sajt utan omgenerering | `lib/business-facts.ts` skrivs om från meta vid varje publicering. "Publicera om" räcker. | [`business-facts-module.ts`](../../../../src/lib/projects/business-facts-module.ts), deploy-routen | `business-facts-module.test.ts` (kompilerar modulen med tsc) |
| → portal | Sektion "Företagsuppgifter" på `/projects/[id]`. Bara standardval, ingen fritext för tider. Deployen registrerar om den publicerade sajten bär modulen (`meta.businessFactsSupport`); portalen lovar "publicera om räcker" bara då, annars hänvisas till en engångsuppdatering i byggaren. | [`BusinessFactsSection.tsx`](../../../../src/components/projects/BusinessFactsSection.tsx) | `BusinessFactsSection.test.tsx` |
| SEO-status | Senaste publiceringens SEO-pass sparas i `meta.seoStatus` efter att Vercel accepterat deployen; portalen visar poäng, fixat, öppna punkter. | [`seo-status.ts`](../../../../src/lib/projects/seo-status.ts), [`SeoStatusSection.tsx`](../../../../src/components/projects/SeoStatusSection.tsx) | `seo-status.test.ts`, `SeoStatusSection.test.tsx` |
| GitHub-export | Tomt/nytt repo seedas via Contents API i stället för 409 på första blob. | [`export/route.ts`](../../../../src/app/api/github/export/route.ts) | `route.test.ts` "seeds a brand-new empty repository" |
| GitHub App | Installation-token-klient + env + `FEATURES.useGitHubSitesOrg`. | [`app-installation-token.ts`](../../../../src/lib/github/app-installation-token.ts), [runbook](../../../runbooks/github-sites-org.md) | `app-installation-token.test.ts` |
| Git-Data-bibliotek | Export-routen och backupen delar en ägare; `inline`-läge = ett tree-anrop per sajt (klarar GitHubs 500/timme). | [`git-data-export.ts`](../../../../src/lib/github/git-data-export.ts) | `git-data-export.test.ts` |
| Org-backup vid publicering (etapp 2) | `after()`-hook i deploy bakom flaggan → `site-<projectId>`; får exakt de publicerade filerna (ingen omläsning som kan racea en portaländring); tidpunkt i portalen. Aktiv först när Jakob skapat org + App (runbook). | [`sites-backup.ts`](../../../../src/lib/github/sites-backup.ts) | `sites-backup.test.ts` |

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
