---
status: active
owner: unassigned
created: 2026-07-25
topic: Integrationstrohet — en namngiven integration ska leda till dossiern eller till ett tydligt "senare", aldrig till frihandsbyggd eller låtsad kod. Täcker F1, F2, F6, F7.
source: Observationssession 2026-07-25 (`.cursor/logg-internet/runs/2026-07-25_0302.md`). Kodverifierat mot master `57416834`.
parent: 00-master-plan.md
---

# Spår 01 — Integrationstrohet

## TL;DR

F2-mute tar bort integrations-dossiern ur prompten men **hindrar ingen modell
från att bygga samma integration för hand.** Det inträffade två gånger i samma
session, med två olika utfall och samma rot:

| Prompt sa | Dossier som fanns | Vad som hände i stället | Utfall |
|---|---|---|---|
| kontaktformulär | `resend-contact-form` | frihands `components/contact-form.tsx` | formuläret **låtsas** skicka |
| "Mailchimp" (namngivet) | `mailchimp-newsletter` | frihands `app/api/mailchimp/route.ts`, 198 rader | previewen **blockerades helt** |

Muten skyddar alltså inte. Den byter ut ett fungerande demoläge mot något sämre,
och användaren får ingen signal om att det hände.

Samtidigt rapporterar UI-lagret integrationer som inte finns (F2, F7), vilket
gör att användaren inte kan upptäcka problemet själv.

## Rotorsaker

### F6 + F1 — muten har ingen motinstruktion

Kedjan är avsiktlig ända fram till sista steget:

| Steg | Var | Vad |
|---|---|---|
| 1 | `src/lib/builder/follow-up-capability-vocabulary.ts:321-324` | `nyhetsbrev` och `mailchimp` matchar → `newsletter-subscribe`. Detektionen fungerar. |
| 2 | `data/dossiers/hard/mailchimp-newsletter/manifest.json` | dossiern finns, `defaultForCapability: true`, `mock: "success"` → degraderar snällt utan nycklar |
| 3 | `src/lib/gen/dossiers/registry.ts:250` `getF3RequiredCapabilities()` | `newsletter-subscribe` räknas som F3 eftersom manifestet har en `role: "server"`-fil |
| 4 | `src/lib/gen/orchestrate/capability-prompt-filter.ts:87-92` | capability filtreras bort när `previewPolicy !== "fidelity3"` |
| 5 | **saknas** | inget säger till modellen att den *inte* ska bygga integrationen själv |

Steg 4 har en utförlig kommentar (rad 77–86) om varför resend-undantaget togs
bort: den verbatim-route som muten släppte in fick sina importer strippade av
F2:s deny-list och shippade ett trasigt `/api/contact`. Beslutet är alltså
välmotiverat — men det löste bara halva problemet. Modellen fyller tomrummet.

Kommentaren säger också att *"F2 renders the form as a visual mockup (see the F2
contract's Forms guidance in `session-contracts.ts`)"*. Sessionen visar att den
vägledningen inte håller: modellen byggde **server-routes** i F2.

### F2 — `dashboard-charts` är alltid "kopplad"

`data/dossiers/soft/dashboard-charts/manifest.json` deklarerar
`components/lib/utils.ts`, som mappas till `lib/utils.ts`. Ingen annan dossier
deklarerar den sökvägen, så den blir **distinctive** enligt
`src/lib/gen/dossiers/version-presence.ts:87-90`. Dossiern har inga
server-filer, och då räcker en enda distinctive fil (rad 98).

`lib/utils.ts` finns i praktiskt taget varje scaffold. Alltså: varje sajt
rapporteras innehålla `dashboard-charts`.

Det förklarar också "Capabilities: Charts" i slutstegen för en sajt utan ett
enda diagram.

### F7 — kontraktspanelen lovar det ingen fil infriar

Reparationsvarvet visade `Auth: NextAuth / Auth.js`, `Databas: SQLite`,
`Data mode: persisted` och `Kontrakt env vars: AUTH_SECRET, NEXTAUTH_URL,
DATABASE_URL`. Den sparade versionen innehåller varken NextAuth eller någon
databas — `app/api/personal-auth/route.ts` jämför ett env-lösenord och sätter en
cookie för hand.

Två fel i ett: kontraktet härleds från kontraktslagret utan att jämföras mot
filerna, och prompt-frasen "bara personalen" tolkades som en full
auth-capability i F2, där auth ska vara mutat.

## Sekvens

Stegen är sekventiella inom spåret. Steg 1 är ett ägarbeslut och blockerar 2–3.

### Steg 1 — ägarbeslut B1: vad ska en namngiven integration i F2 ge?

Tre vägar. Välj en; de utesluter varandra.

| Alt | Beteende | Fördel | Kostnad |
|---|---|---|---|
| **A** | Släpp in dossiern i F2 i **demoläge** (`mock`-fältet), med deny-listen justerad så dossierns egna importer inte strippas | användaren får något som fungerar direkt; dossiern är byggd för detta (`mock: "success"`) | kräver att F2:s SDK-deny-list får ett undantag per dossier — exakt det som gick fel förra gången |
| **B** | Generera **ingen** integrationskod, och säg det i chatten: "Mailchimp kopplas in när du går till nästa steg" | ärligast, minst kod, ingen ny F2-risk | användaren får ett formulär utan funktion — men märkt som sådant |
| **C** | Låt en namngiven hard-integration **höja** rundan till F3 | ger riktig funktion | flyttar env-krav och byggtid in i en runda användaren tror är design |

Rekommendation: **B nu, A som uppföljning.** B är en ren
prompt/instruktionsändring och kan levereras utan att röra deny-listen. A kräver
att dossierns verbatim-filer skyddas mot F2-strippning, vilket är samma
arbete som spår 02 steg 2 gör för `next/headers`.

### Steg 2 — motinstruktion i F2-kontraktet (efter B1)

- Lägg till en explicit regel i F2-kontraktet (`session-contracts.ts`, Forms/
  Integrations-avsnittet): när en muted capability upptäcks i prompten, får
  modellen **inte** skapa `app/api/**`-routes eller importera integrationens
  SDK. Den ska rendera ytan och inget mer.
- Skicka med **vilka** capabilities som mutades i rundan, så instruktionen är
  konkret: "nyhetsbrev är planerat men kopplas in senare — bygg formuläret,
  inte routen".
- Ny test: en F2-prompt med `mailchimp` producerar noll filer under `app/api/`.

### Steg 3 — synlig förklaring till användaren

- När `filterDossierCapabilitiesForPrompt` tar bort en capability: bevara listan
  i orkestreringens snapshot som `mutedCapabilities`.
- Visa den i slutstegen och i Byggblock-panelen som **Planerad — kopplas in i
  nästa steg**, inte som saknad eller kopplad.
- Detta är förutsättningen för att F1/F6 ska bli upptäckbara i stället för tysta.

### Steg 4 — F2: sluta använda delade scaffold-filer som bevis

Två delar, båda små:

1. Ta bort `components/lib/utils.ts` ur `dashboard-charts`-manifestets
   `files`-lista. Filen är en scaffold-baslinje, inte dossierns leverans.
2. Hårdare regel i `version-presence.ts`: en sökväg som ingår i
   **scaffold-baslinjen** får aldrig räknas som distinctive, oavsett hur många
   dossiers deklarerar den. Baslinjen är känd via scaffold-systemet.

Del 2 är den som gör att felet inte kan återuppstå för nästa manifest.

- Ny test: en version som bara innehåller scaffold-baslinjen ger noll
  närvarande dossiers.

### Steg 5 — F7: kontraktsrader måste kunna härledas

- Kontraktspanelens rader (`Auth`, `Databas`, `Data mode`, `Kontrakt env vars`)
  ska renderas från samma källa som Byggblock-panelen, dvs.
  `resolveSelectedDossiersWithVersionPresence`, inte från kontraktslagrets
  förslag.
- Rader utan filbevis märks **Planerad**, aldrig som vald (`chosen`).
- Separat: "bara personalen"-formuleringar ska inte kunna slå på `auth` +
  `database` i F2. Verifiera mot
  `src/lib/builder/follow-up-capability-detection.test.ts` och lägg till fallet.

## Definition of done

| # | Krav | Bevis |
|---|---|---|
| 1 | B1 är beslutat och dokumenterat i denna fil | ägarens rad nedan |
| 2 | F2-prompt med `mailchimp`/`resend` ger noll filer under `app/api/` | nytt test |
| 3 | Mutade capabilities syns för användaren som "Planerad" | manuell körning + snapshot-test |
| 4 | En scaffold-only version ger noll närvarande dossiers | nytt test i `version-presence` |
| 5 | `dashboard-charts` visas inte som kopplad i en sajt utan diagram | acceptanskörningen |
| 6 | Varje kontraktsrad i slutstegen har filbevis eller är märkt Planerad | manuell körning |
| 7 | "bara personalen" slår inte på `auth`/`database` i F2 | nytt test |

### Bevis (steg 2–5 implementerade 2026-07-26)

| # | Status | Bevis |
|---|---|---|
| 2 | Klart | `src/lib/gen/orchestrate/capability-prompt-filter.test.ts` — "selects no dossier that would deliver a file under app/api/" + "tells the model to render the surface without a route or an SDK import" |
| 3 | Klart (kod + test; manuell körning kvarstår) | `orchestration-snapshot.test.ts` → "deferred integrations (mutedCapabilities)", `helpers.test.ts` → "lists deferred integrations as planned for the next step", dossiers-route-test "surfaces a deferred follow-up capability as planned" |
| 4 | Klart | `version-presence.test.ts` — "returns [] for a version containing only the scaffold baseline" (+ scaffold-filvarianten) |
| 5 | Kod klar (acceptanskörning kvarstår) | `components/lib/utils.ts` borttagen ur `dashboard-charts` + baseline-regeln i `version-presence.ts` |
| 6 | Klart (kod + test; manuell körning kvarstår) | `helpers.test.ts` → "marks contract rows without file evidence as planned" |
| 7 | Klart | `follow-up-capability-detection.test.ts` → "does not switch on auth or database for 'bara personalen'" |

## Risker

| Risk | Hantering |
|---|---|
| Alt A återskapar den trasiga `/api/contact` som kommentaren i `capability-prompt-filter.ts` varnar för | välj B först; A kräver att verbatim-filer undantas från strippning (spår 02 steg 2) |
| Att ta bort `lib/utils.ts` ur manifestet gör `dashboard-charts` osynlig även när den *är* byggd | kontrollera att manifestet har minst en egen distinctive fil kvar innan raden tas bort |
| "Planerad"-märkningen blir ett nytt statusbegrepp | återanvänd befintlig vokabulär från `dossier-overview.ts`; inför inte ett fjärde tillstånd utan att uppdatera glossaryn |

## Ägarbeslut

- **B1:** **Alternativ B** — beslutat 2026-07-26. En namngiven integration i F2 ger
  **noll integrationskod** plus en synlig förklaring i chatten och i
  Byggblock-panelen ("Planerad — kopplas in i nästa steg"). Alternativ A
  (dossierns demoläge i F2) är uppföljning och kräver att verbatim-filer undantas
  från F2:s strippning; det arbetet överlappar spår 02 steg 2 och tas separat.
  Motivering: B kan levereras som en ren kontrakts- och presentationsändring utan
  att röra SDK-deny-listen, dvs. utan att återskapa den trasiga `/api/contact`
  som `capability-prompt-filter.ts` varnar för.
