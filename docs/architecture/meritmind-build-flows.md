# MeritMind-flode for buildvagar

## Syfte
Detta dokument visar hur Sajtmaskins buildfloden faktiskt delar upp sig mellan
egna motorn, v0-fallback, planlage, post-checks, autofix och deploy. Fokus
ligger pa vilka vagar som finns, vad som hander i varje vag, och hur valet
gors.

## Viktig skillnad
Alla saker som leder in till buildern ar inte egna genereringsmotorer.

- `wizard`, `category`, `audit`, `freeform`, `kostnadsfri` ar ingangssatt till
  buildern.
- `plan-mode`, `own-engine` och `v0-fallback` ar runtime-vagar inne i
  genereringsflodet.
- `post-checks`, `autofix`, `quality-gate` och `deploy` ar eftersteg eller
  sidofloden, inte primara genereringsmotorer.

## Overblick

```mermaid
flowchart TD
    A[In i buildern<br/>wizard / category / audit / freeform / kostnadsfri] --> B{Ny chat eller follow-up?}

    B -->|Ny chat| C[POST /api/v0/chats/stream]
    B -->|Follow-up| D[POST /api/v0/chats/[chatId]/stream]

    C --> E[Prompt orchestration + model selection + metadata]
    D --> E

    E --> F{planMode=true?}

    F -->|Ja| G[Plan-mode lane]
    F -->|Nej| H{v0 fallback explicit?}

    G --> G1[prepareGenerationContext()]
    G1 --> G2[Planner prompt + own-engine model]
    G2 --> G3{Blockers eller fragor?}
    G3 -->|Ja| G4[awaitingInput]
    G3 -->|Nej| G5[Plan artifact klar]
    G4 --> D
    G5 --> D

    H -->|Nej| I[Own-engine lane]
    H -->|Ja| J[v0-fallback lane]

    I --> I1[prepareGenerationContext()]
    I1 --> I2[createGenerationPipeline() via AI SDK]
    I2 --> I3[finalizeAndSaveVersion()]
    I3 --> I4{Blocking preflight?}
    I4 -->|Ja| I5[Version sparas for diagnostik<br/>preview blockeras]
    I4 -->|Nej| I6[Preview kan exponeras]
    I5 --> K[Post-checks]
    I6 --> K

    K --> L{Autofix-behov?}
    L -->|Ja| M[useAutoFix -> ny follow-up message]
    M --> D
    L -->|Nej| N[Quality gate i sandbox]

    N --> O{Godkand?}
    O -->|Ja| P[Promoted own-engine-version]
    O -->|Nej| Q[Failed own-engine-version]

    J --> J1[v0 Platform API create/send]
    J1 --> J2[Resultat mappas tillbaka till intern modell]
    J2 --> J3[v0 demoUrl / versionshistorik]

    P --> R[Deploy-flode]
    Q --> S[Versionspanel + diagnostics]
    J3 --> R
    J3 --> S
```

## Hur valet sker

### 1. Ingang till buildern
Anvandaren kan komma in via flera metoder:

- `wizard`
- `category`
- `audit`
- `freeform`
- `kostnadsfri`

De paverkar hur prompten och metadata ser ut, men de valjer inte ensam vilken
genereringsmotor som kor.

### 2. Plan-mode
`planMode=true` styr requesten in i planner-vagen. Den kor fortfarande pa
egna motorns infrastruktur, men stoppar fore kodgenerering om blockerare eller
oklara beslut finns.

Praktiskt:

- bra nar du vill fa en plan eller review-kort forst
- kan returnera `awaitingInput`
- leder normalt vidare till samma chat som sedan byggs i follow-up-flodet

### 3. Own-engine
Detta ar standardvagen i dagens setup.

Den anvands nar:

- `V0_FALLBACK_BUILDER` inte ar aktivt satt till sant
- eller fallback inte uttryckligen begars i metadatan

I din lokala `.env.local` ar `V0_FALLBACK_BUILDER=false`, sa lokal `npm run dev`
ligger i praktiken pa own-engine som huvudvag.

### 4. v0-fallback
v0 ar inte defaultmotor i din nuvarande lokala setup. Den anvands bara nar tva
villkor samtidigt ar uppfyllda:

1. fallback ar aktiverad via `V0_FALLBACK_BUILDER`
2. requestens metadata uttryckligen pekar mot fallback, t.ex. via `enginePath`
   eller nar follow-up-requesten egentligen tillhor en redan mappad v0-chat

Det betyder:

- `V0_FALLBACK_BUILDER=true` ensam ar inte hela valet
- buildern behover ocksa explicit metadata eller en befintlig v0-chatmappning

## Vad som hander i varje vag

### A. Plan-mode lane

Huvudsteg:

1. `prepareGenerationContext()`
2. planner-prompt byggs
3. modellen far anvanda agentverktyg
4. `emitPlanArtifact` kan returneras
5. blockerare kan stoppa flodet tills anvandaren svarar

Bra for:

- komplexa builds
- integrationsfragor
- behov av godkannande innan riktig kodgenerering

### B. Own-engine lane

Huvudsteg:

1. prompten optimeras
2. scaffold valjs eller ateranvands
3. systemprompt byggs
4. `createGenerationPipeline()` kor modellen
5. `finalizeAndSaveVersion()` parser, reparerar, merger och sparar
6. preflight avgor om preview ska blockeras
7. klienten kor `post-checks`
8. `useAutoFix` kan skicka en ny repair-prompt
9. `quality-gate` bygger och verifierar
10. versionen markeras som `promoted` eller `failed`

Bra for:

- normal lokal utveckling
- den egna motorns scaffold-drivna flode
- planlage + build i samma ekosystem

### C. v0-fallback lane

Huvudsteg:

1. samma forberedande kontextlager anvands
2. requesten skickas till v0 Platform API
3. v0 returnerar kod/version/demoUrl
4. resultatet mappas tillbaka till intern modell
5. buildern visar versionshistorik och preview via v0:s demoUrl

Bra for:

- explicit fallback-testning
- flows dar en chat redan ar v0-baserad
- kompatibilitet med äldre v0-stigar

### D. Post-checks och autofix

Detta ar inte en separat genereringsmotor, men det ar en verklig andra fas.

Den:

- kollar preview, routes, images, sanity, SEO och quality-gate-status
- persisterar fel mot versionsloggen
- kan skapa nya follow-up-meddelanden for reparation

Det ar den vanligaste forklaringen till att en generation ser ut att skapa flera
meddelanden eller flera versioner i samma chat.

### E. Deploy-lane

Nar en version valts for deploy:

1. filer hamtas
2. bilder/materialisering justeras vid behov
3. Vercel deploy triggas
4. buildern visar deploystatus, readiness och domanflode

Deploy ar alltsa en separat lane efter generation, inte ett alternativ till
own-engine eller v0.

## Var data sparas

### Own-engine

- `engine_chats`
- `engine_messages`
- `engine_versions`
- `engine_generation_logs`
- `engine_version_error_logs`

### v0-fallback

- `chats`
- `versions`
- `version_error_logs`
- plus fjarrtillstand i v0-projekt/chat/version

## Vad anvandaren faktiskt valjer

Som anvandare valjer du i praktiken fyra olika saker, men de ligger pa olika
nivaer:

### 1. Ingangsatt
Du valjer hur du startar buildern:

- wizard
- category
- audit
- freeform
- kostnadsfri

### 2. Byggtyp
Du valjer implicit eller explicit vad som ska byggas:

- `website`
- `app`
- `template`

Detta paverkar promptstrategi, scaffold och kontext.

### 3. Plan eller bygg direkt
Om `planMode` ar aktivt gar du forst via planner-vagen.

### 4. Motorval
Detta val ligger mest i miljoflaggor och metadata, inte som ett fristaende
slutligt UI-val i varje request:

- lokal standard idag: own-engine
- explicit fallback-test: v0-fallback
- befintlig v0-chat i follow-up: v0-fallback

## MeritMind-sammanfattning

Den kortaste korrekta modellen ar:

1. Flera ingangar leder in till samma builder.
2. Buildern har ett gemensamt prompt- och kontextlager.
3. Darifran valjs plan-mode, own-engine eller v0-fallback.
4. Efter generation kommer post-checks, autofix, quality-gate och deploy som
   separata eftersteg.
5. Own-engine ar idag din normala lokala huvudvag, medan v0 ar en fallback- eller
   arvsvag som maste aktiveras uttryckligare.
