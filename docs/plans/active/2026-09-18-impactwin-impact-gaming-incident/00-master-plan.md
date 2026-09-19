# ImpactWin / Impact Gaming — tre produktionsfel (2026-09-18)

> **Status: aktivt incidentspår.** Tre avgränsade fel i kundflödet. Ingen
> kod här. Ingen ny generation, reparation eller publicering mot de
> drabbade chattarna. Rör inte #1483/#1385 eller deras runtimefiler.

**Skapad:** 2026-09-18.
**Miljö:** Production (`sajtmaskin` / `master` /
`0fc9a6a9d52dd0b31291a1fe31e8b291e27af979`, promote #1459).
**Utlöst av:** `/logg` 2026-09-18 plus coachens read-only-återläsning
samma dag. Desktopkvitto (utanför git):
`C:\Users\jakem\Desktop\impactwin_impact_gaming_incident_2026-09-18.md`.
**Bevis i repo:** [`01-bevis.md`](01-bevis.md).

## Syfte

Få kundflödet att sluta leverera fel verksamhet, sluta visa preview som
publiceringsklar när installträdet är inkompatibelt, och sluta lämna
användaren i `repairing` efter en hård Vercel-timeout.

## Tre fel, tre ägare

| # | Fel | Kundutfall | Aktivitet |
|---|---|---|---|
| 1 | Wizard/prompt/brief styrde restaurang trots spel-/lotteriverksamhet | Fel leverans, gröna tekniska kontroller | [`A-verksamhetsbrief.md`](aktiviteter/A-verksamhetsbrief.md) |
| 2 | Importerad v0-mall: `next@14.2.25` + `react@^19`. Preview räddas med `--legacy-peer-deps`; Vercel ERESOLVE | Publicering dör före `next build` | [`B-import-pakettrad.md`](aktiviteter/B-import-pakettrad.md) |
| 3 | `POST /api/v0/deployments/repair` timeoutade efter 950 s (HTTP 504) | Version hänger i `repairing`, ingen `repair_available` | [`C-repair-timeout.md`](aktiviteter/C-repair-timeout.md) |

Det är **inte** ett fel. En restaurangsida som passerar quality gate är
fortfarande fel leverans. En preview som startar är inte bevis för att
publicering kan installera.

## Bedömning av coachens rapport

Håller med om huvudbilden. Avvikelserna är nyans, inte motbevis.

| Påstående | Bedömning |
|---|---|
| Tre separata problem | **Enig.** Samma konto, två projekt, tre owners. |
| Restaurangen fanns i den sammanställda beställningen före codegen | **Enig.** `prompt_original` vid `create_chat` 14:53:21Z börjar med `Restaurang/Bar` och sidlistan Meny/Boka bord, samtidigt som spel-/lotteribeskrivningen. |
| `prompt_original` är appens prompt, inte att kunden skrev restaurang | **Enig.** `buildPromptFromWizardData()` bygger meningen. |
| Kampanj `industry = null` defaultar inte till restaurant | **Enig.** `prefillMiniWizardFromCompanyData` + tester: null/okänd → `""`. |
| Branschfältet styr första meningen och `INDUSTRY_PAGES`; beskrivningen läggs dit utan konfliktcheck | **Enig.** Läst i `src/lib/kostnadsfri/index.ts` på current checkout; samma kontrakt fanns på prod-revisionen enligt coachen. |
| Briefen (`domainProfile=restaurant`, CTA «Boka bord») förenade motstridiga instruktioner | **Enig om utfallet.** Sparad brief och startsida är restaurang med liveavatarer som dekoration. Att brief-modellen *medvetet försökte förena* är tolkning, inte klick-/modellkvitto. |
| Ursprung till `industry=restaurant` i sessionen är obevisat | **Enig.** Inget MiniWizard-snapshot, inget klickspår. Inget `prompt_logs`-event för branschföljdfråga i chatten — bara `create_chat` + två AUTO-FIX. A0 ska ge nästa incident det kvittot, men A1–A2 väntar inte på det. |
| Impact Gaming v2 blev faktiskt spelstudio | **Enig, med coachen som filbevis.** `/logg` såg follow-up-texten; coachen läste sparad `app/page.tsx` i v2. Inte samma restauranginnehåll. |
| ERESOLVE är `react@19.3.0` vs `next@14.2.25` peer `^18.2.0`; samma träd i v1 och v2 | **Enig.** |
| Preview `--legacy-peer-deps` är inte kompatibilitet | **Enig.** Fly-loggen 15:02:25Z. npm avråder från flaggan som generell lösning. |
| Verbatim-import bevarar mallens paket | **Enig.** `build-exportable-project.ts` `verbatimRepo`. |
| «Chattspecifikt» räcker inte som policyslut | **Rättelse mot `/logg`.** Ett observerat projekt säger utbredning i datan, inte att import-/verify-policyn saknar återanvändbart glapp. |
| Repair timeoutade 504 efter 950 s | **Enig, starkare än `/logg`.** `/logg` såg status `0` ~15:24Z medan requesten fortfarande levde; timeouten infaller ~15:26Z. Coachens senare runtime-rad är den terminala. |
| Knappen ska inte auto-deploya (Ö3) | **Enig.** Ändra inte det här. Felet är att ingen `repair_available` sparades och statusen inte blev terminal. |
| Höj inte bara `maxDuration` | **Enig.** Koden *avser* redan att `REPAIR_LOOP_BUDGET_MS` ska sluta före platform-kill och släppa leasen. Här slog 504 ändå, och `catch` i repair-route körs inte vid isolate-kill. |
| Vilket internt await åt 950 s är obevisat | **Enig.** Tillägg: Fly patchade 2 filer 15:11:16Z på samma version — loopen startade, sen väntade den ~14 minuter. Inte en no-op. |
| Eftervård parallellt, inte runtime; #1483/#1385 ifred | **Enig, och utanför den här mappen.** Det här spåret implementerar de tre felen. Eftervård dokumenterar/länkar, tar inte över. |

## Inte detta spår

| Utanför | Varför |
|---|---|
| #1483 / #1385 och deras brancher | Egen byggagent. Rör inte deras runtimefiler. |
| Eftervård SEO/CRO/Ads, showcase, billing | Eget spår. Slutkontroll efter att #1483 landat, inte här. |
| Köra om ImpactWin/Impact Gaming i prod | Inget nytt generate/repair/publish mot de chattarna. |
| `--force` / `--legacy-peer-deps` som publiceringsfix | Döljer kontraktet. B ska göra trädet sammanhängande och verifiera *strict* install. |
| Blind React 18-sänkning utan övriga peers | Otillräckligt. Beslut i B efter kartläggning. |
| Auto-redeploy efter repair | Låst Ö3. |
| Påstå att restaurangvalet var användarfel eller automatisk default | Obevisat. |
| Chromium/`/tmp`-dumpar | Plattform, annat spår (`SM-072` / verifieringsplanen). Inte orsaken här. |

## Ordning

1. **C** kan landa smalt först: timeout → terminal `failed` + synlig copy. Det är avbrott/återhämtning, inte en ny tidsgräns.
2. **B** därefter eller parallellt i egen PR: import- och publiceringsinstall utan legacy-peer-deps-förbikoppling.
3. **A** parallellt i egen PR: konflikt mellan branschfält och verksamhetsbeskrivning ska inte bli en tyst hybrid-restaurang.

En PR per bokstav. Stage bara den bokstavens filer. SM-id tas när implementationen startar, inte här.

## Klart när

- A: en motstridig kostnadsfri-beställning stoppas eller tvingar omval *före* codegen; tester låser att `industry=null` fortfarande inte blir restaurant.
- B: importerad mall med Next 14 + React 19 fångas före/vid publicering; preview-success med legacy-fallback är inte publish-ready; strict install (utan `--legacy-peer-deps`) är en grind.
- C: en hård 504/isolate-kill lämnar inte `verification_state=repairing`. Användaren ser att reparationen dog, inte att den «pågår».

Flytta mappen till `avklarat/` när A–C är mergade och bevisade. Residualer → backlog, inte kvar som evigt active-spår.
