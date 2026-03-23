# MeritMind-flöde för byggvägar

## Syfte
Detta dokument visar hur Sajtmaskins buildflöden faktiskt delar upp sig mellan
egna motorn, v0-fallback, planläge, post-checks, autofix och deploy. Fokus
ligger på vilka vägar som finns, vad som händer i varje väg, och hur valet
görs.

## Viktig skillnad
Alla saker som leder in till buildern är inte egna genereringsmotorer.

- `wizard`, `category`, `audit`, `freeform`, `kostnadsfri` är ingångssätt till
  buildern.
- `plan-mode` och `own-engine` är runtime-vägar inne i genereringsflödet.
  (`v0-fallback` är historisk och inte längre en aktiv runtime-väg.)
- `post-checks`, `autofix`, `quality-gate` och `deploy` är eftersteg eller
  sidoflöden, inte primära genereringsmotorer.

## Överblick

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
    G2 --> G3{Blockers eller frågor?}
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
    I4 -->|Ja| I5[Version sparas för diagnostik<br/>preview blockeras]
    I4 -->|Nej| I6[Preview kan exponeras]
    I5 --> K[Post-checks]
    I6 --> K

    K --> L{Autofix-behov?}
    L -->|Ja| M[useAutoFix -> ny follow-up message]
    M --> D
    L -->|Nej| N[Quality gate i sandbox]

    N --> O{Godkänd?}
    O -->|Ja| P[Promoted own-engine-version]
    O -->|Nej| Q[Failed own-engine-version]

    J --> J1[v0 Platform API create/send]
    J1 --> J2[Resultat mappas tillbaka till intern modell]
    J2 --> J3[v0 demoUrl / versionshistorik]

    P --> R[Deploy-flöde]
    Q --> S[Versionspanel + diagnostics]
    J3 --> R
    J3 --> S
```

## Hur valet sker

### 1. Ingång till buildern
Användaren kan komma in via flera metoder:

- `wizard`
- `category`
- `audit`
- `freeform`
- `kostnadsfri`

De påverkar hur prompten och metadata ser ut, men de väljer inte ensam vilken
genereringsmotor som kör.

### 2. Plan-mode
`planMode=true` styr requesten in i planner-vägen. Den kör fortfarande på
egna motorns infrastruktur, men stoppar före kodgenerering om blockerare eller
oklara beslut finns.

Praktiskt:

- bra när du vill få en plan eller review-kort först
- kan returnera `awaitingInput`
- leder normalt vidare till samma chat som sedan byggs i follow-up-flödet

### 3. Own-engine
Detta är standardvägen i dagens setup.

Den används som normal huvudväg i dagens runtime. Historiskt styrdes delar av
detta via `V0_FALLBACK_BUILDER`, men den variabeln ska nu läsas som legacy-drift
och inte som den aktiva huvudbrytaren för own-engine.

Lokal `npm run dev` ligger i praktiken på own-engine som huvudväg.

### 4. v0-fallback
v0 är inte defaultmotor i din nuvarande lokala setup. De kvarvarande v0-spåren
är legacy-vägar och hjälprutter snarare än den normala buildermotorn.

1. requestens metadata uttryckligen pekar mot ett legacy-v0-spår
2. eller follow-up-requesten egentligen tillhör en redan mappad v0-chat

Det betyder:

- kvarvarande v0-användning är explicit och legacy-bunden
- own-engine är den praktiska standardvägen för normal builderkörning

## Vad som händer i varje väg

### A. Plan-mode lane

Huvudsteg:

1. `prepareGenerationContext()`
2. planner-prompt byggs
3. modellen får använda agentverktyg
4. `emitPlanArtifact` kan returneras
5. blockerare kan stoppa flödet tills användaren svarar

Bra för:

- komplexa builds
- integrationsfrågor
- behov av godkännande innan riktig kodgenerering

### B. Own-engine lane

Huvudsteg:

1. prompten optimeras
2. scaffold väljs eller återanvänds
3. systemprompt byggs
4. `createGenerationPipeline()` kör modellen
5. `finalizeAndSaveVersion()` parser, reparerar, merger och sparar
6. preflight avgör om preview ska blockeras
7. klienten kör `post-checks`
8. `useAutoFix` kan skicka en ny repair-prompt
9. `quality-gate` bygger och verifierar
10. versionen markeras som `promoted` eller `failed`

Bra för:

- normal lokal utveckling
- den egna motorns scaffold-drivna flöde
- planläge + build i samma ekosystem

### C. v0-fallback lane

Huvudsteg:

1. samma förberedande kontextlager används
2. requesten skickas till v0 Platform API
3. v0 returnerar kod/version/demoUrl
4. resultatet mappas tillbaka till intern modell
5. buildern visar versionshistorik och preview via v0:s demoUrl

Bra för:

- explicit fallback-testning
- flows där en chat redan är v0-baserad
- kompatibilitet med äldre v0-stigar

### D. Post-checks och autofix

Detta är inte en separat genereringsmotor, men det är en verklig andra fas.

Den:

- kollar preview, routes, images, sanity, SEO och quality-gate-status
- persisterar fel mot versionsloggen
- kan skapa nya follow-up-meddelanden för reparation

Det är den vanligaste förklaringen till att en generation ser ut att skapa flera
meddelanden eller flera versioner i samma chat.

### E. Deploy-lane

När en version valts för deploy:

1. filer hämtas
2. bilder/materialisering justeras vid behov
3. Vercel deploy triggas
4. buildern visar deploystatus, readiness och domänflöde

Deploy är alltså en separat lane efter generation, inte ett alternativ till
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
- plus fjärrtillstånd i v0-projekt/chat/version

## Vad användaren faktiskt väljer

Som användare väljer du i praktiken fyra olika saker, men de ligger på olika
nivåer:

### 1. Ingångssätt
Du väljer hur du startar buildern:

- wizard
- category
- audit
- freeform
- kostnadsfri

### 2. Byggtyp
Du väljer implicit eller explicit vad som ska byggas:

- `website`
- `app`
- `template`

Detta påverkar promptstrategi, scaffold och kontext.

### 3. Plan eller bygg direkt
Om `planMode` är aktivt går du först via planner-vägen.

### 4. Motorval
Detta val ligger mest i miljöflaggor och metadata, inte som ett fristående
slutligt UI-val i varje request:

- lokal standard idag: own-engine
- explicit fallback-test: v0-fallback
- befintlig v0-chat i follow-up: v0-fallback

## MeritMind-sammanfattning

Den kortaste korrekta modellen är:

1. Flera ingångar leder in till samma builder.
2. Buildern har ett gemensamt prompt- och kontextlager.
3. Därifrån väljs plan-mode, own-engine eller v0-fallback.
4. Efter generation kommer post-checks, autofix, quality-gate och deploy som
   separata eftersteg.
5. Own-engine är idag din normala lokala huvudväg, medan v0 är en fallback- eller
   arvsväg som måste aktiveras uttryckligare.
