# Nuläge och överraskningar

## Kort svar

Jakobs antagande var begripligt men stämmer inte med nuvarande runtime:
Sajtagenten kan inte läsa och redigera allt. Den är en säker, kontextmatad
assistent med några hårt avgränsade actionvägar.

## Det som överraskar mest

### 1. OpenClaw är nästan verktygslös i produktion

`infra/openclaw/generate-config.mjs` sätter för samtliga tre modellspår:

- `skills: []`
- `tools.profile: minimal`
- bootstrap av

`infra/openclaw/DEPLOY_INFO.txt` säger uttryckligen att detta tar bort
filesystem, shell, browser, messaging och subagent tools från den publika
chattytan.

Konsekvens: OpenClaw-höljet har agentfunktioner, men Sajtmaskins nuvarande
konfiguration använder dem medvetet inte.

### 2. Den ”förstår projektet” genom kontextinjektion

`POST /api/openclaw/chat` samlar serverägt material och skickar ett vanligt
Chat Completions-anrop till Render:

- builderläge och val
- senaste buildermeddelanden
- skrivbara textfält
- ägarverifierad version
- verifieringsfynd och tidslinje
- previewloggar i debug
- ibland kuraterade, read-only utdrag ur plattformsrepot

Gateway-anropet innehåller `messages` och `stream`, men ingen projektsandbox,
inget filverktyg och ingen projektspecifik jobidentitet. Den goda upplevelsen
kommer därför främst från Sajtmaskins kontextbroker, inte från att OpenClaw går
runt i projektet.

### 3. OpenClaw-chatten är inte ett varaktigt projektminne

UI:ts `messages` ligger i en Zustand-store. De töms vid scopebyte och återställs
vid reload. Hela synliga konversationen skickas om per tur. Persistens finns för
vissa grants, men inte som ett auktoritativt agentminne över projektets filer,
beslut och versioner.

Ett framtida minne måste därför vara:

- projekt- och versionsbundet
- härlett från kanonisk snapshot
- ogiltigförklarat när `filesRevision` ändras
- sammanfattande, aldrig en konkurrerande source of truth

### 4. ”Läs hela projektet” betyder inte navigera i hela projektet

Kodkontexten har fyra lägen: `none`, `light`, `manifest`, `full`.

- `light`: klientens aktuella kodsnutt, normalt max 16 000 tecken.
- `manifest`: ett begränsat filmanifest.
- `full`: alla filer sammanfogade bara om totalen ryms under 180 000 tecken.
- Om projektet är större faller fulltext bort och OpenClaw får i praktiken ett
  begränsat manifest utan möjlighet att själv öppna nästa fil.

Dessutom är namnet `fullFileLimit` missvisande i implementationen: standarden
24 skickas vidare som gräns för manifestfiler, men begränsar inte antalet filer
som fogas samman när hela projektet ryms under teckentaket. Det är en konkret
kontext- och kostnadsbugg att rätta, inte en säker filnavigator.

Det här är den tydligaste kvalitetsgränsen. En riktig agent behöver
`list_files`, `search` och `read_file`, inte ett allt-eller-inget-promptblock.

### 5. GitHub-åtkomsten är mycket smal

Genererade användarprojekt ligger inte på GitHub utan i
`engine_versions.files_json`.

Den GitHub-läsning som finns gäller Sajtmaskins eget plattformsrepo och är:

- endast i `OC_DEBUG`
- dessutom skyddad av ägartoken
- GET-only med `contents:read`
- kuraterad till ett litet antal defaultfiler
- max 60 000 byte per fil
- normalt läst från rörliga `HEAD`, inte en frusen commit-SHA
- utan search, write, commit eller PR

Det är bra för rotorsaksanalys men är inte ”OpenClaw kan läsa GitHub”.

### 6. Render-workspacet är inte användarprojektet

Render-disken på `/root/.openclaw` innehåller gatewaykonfiguration,
agentsessioner och ett gemensamt OpenClaw-workspace-seed. Den kanoniska
användarkoden finns i Postgres och materialiseras på Fly först för preview och
verifiering.

Det är lätt att se ordet `workspace` och tro att projektet är monterat där. Det
är det inte.

### 7. OpenClaw skriver inte filer direkt

Nuvarande editlägen är:

- **Armerad autonomi:** fyller builderns promptfält och klickar skicka en tur i
  taget. Den vanliga own-engine-pipelinen gör ändringen.
- **Quick edit:** max fem små operationer och totalt 40 000 tecken mot
  befintliga säkra filer. Ingen `package.json`, ny dependency, ny fil eller ny
  route. Användaren godkänner varje kort.
- **Live review:** ett grant till granskningsytan. Själva multimodala kritikern
  ligger i verifieringsflödet; det är inte en fri OpenClaw-browserloop.

Det här är säkrare än direkt agent-write, men också skälet till att OpenClaw
inte kan arbeta som Codex i ett repo.

### 8. Nuvarande LLM-flöde är redan halvagentiskt

Pipelinen gör flera separata bedömningar:

1. Deep/Snapshot/Delta Brief beroende på läge.
2. Deterministisk orkestrering och BuildSpec.
3. Codegen.
4. Autofix, syntax, import repair och eventuell RepairGate.
5. Materialisering och skyddad merge.
6. Preview och kvalitetsgrindar.

En ny agent ersätter alltså inte en enkel prompt→modell-kedja. Den måste
samverka med ett redan rikt kontrollplan.

## Det som redan är riktigt bra

- Filkontext kräver ägarverifierad chat/version och failar stängt.
- `OC_EDIT` och användarens grant måste båda vara aktiva.
- Quick edits binds till exakt buildermål och valideras igen server-side.
- OpenClaw kan inte skriva direkt till Fly eller plattformsrepot.
- Modellvalen ägs på Render; klienten väljer bara intern lane.
- Preview och verify använder separata arbetskopior.
- Version och filrevision kan användas för compare-and-swap.

Dessa egenskaper ska kopieras till Builder-agenten, inte ”förenklas bort”.

## Förbättringar av OpenClaw redan före Builder-projektet

### P0 — sanningsenlig kapabilitets-UX

- Visa aktiv `chatId`, `versionId`, `filesRevision` och kontextläge i en intern
  diagnostikrad.
- Visa om OpenClaw fått full kod, manifest eller bara en kodsnutt.
- Byt missvisande kommentaren ”site the agent gets broad read access to” för
  `SAJTAGENT_TARGET_SITE_URL`; värdet används för allowed origin, inte browser.
- Säg tydligt i UI att ”läs hela projektet” kan vara avkortat.

### P0 — read-only projektverktyg

Ge en separat agentidentitet dessa servermedierade verktyg:

- lista filer
- läs en namngiven fil
- sök sträng/symbol i aktuell snapshot
- läs BuildSpec/source receipt
- läs previewstatus och avgränsade loggar
- hämta en serverskapad previewscreenshot

Detta ger den största kvalitetsvinsten med liten riskökning.

### P0 — korrekt session- och revisionsidentitet

Varje tur bör bära en serverägd nyckel med tenant, project, chat, version och
revision. Minnet ska resetta eller rebaseras vid versionsbyte och aldrig kunna
återanvändas mellan tenants.

### P1 — dela chattgateway och byggworker

Lägg inte shell/filsystem på nuvarande gemensamma Sajtagenten-service. Skapa en
separat `openclaw-builder` med annan token, annan workspace-policy, annan
nätverkspolicy och per-jobb-sandbox.

### P1 — byt långlivad shared bearer mot jobbtoken

Buildern bör använda kortlivade, audience-bundna tokens med projekt-, jobb- och
verktygsscope. En läckt token ska inte kunna läsa nästa projekt eller användas
mot Control UI.

### P1 — observerbar verktygsloop

Logga varje verktygsanrop med jobb, version, revision, latens, kostnad,
resultatklass och policybeslut. Visa användaren fasnamn, men exponera inte rå
chain-of-thought.

### P2 — intern canvas

En canvas kan visualisera plan, verktygsanrop, previewvarv och gates. Den ska
vara en kontroll-/observationsyta ovanpå jobb-API:t, inte lagra kod eller vara
den som avgör versionens sanning.
